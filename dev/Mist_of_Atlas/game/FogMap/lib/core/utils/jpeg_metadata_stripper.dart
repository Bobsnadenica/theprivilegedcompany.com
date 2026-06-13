import 'dart:typed_data';

/// Strips identifying metadata segments from a JPEG byte stream.
///
/// JPEG metadata lives in `APPn` markers (`FFE0`–`FFEF`) between the SOI
/// (`FFD8`) and the start-of-scan (`FFDA`). We keep `APP0` (the JFIF block,
/// which renderers can rely on) and drop the rest — that removes EXIF (`APP1`),
/// XMP (`APP1` second flavour), Photoshop IRB (`APP13`), ICC profiles
/// (`APP2`), and any other vendor-stamped data, including GPS coordinates
/// embedded by the camera app.
///
/// PNG/WEBP inputs are passed through untouched — they rarely carry GPS in
/// practice for the camera-capture flow, and the upload pipeline already
/// converts to JPEG via image_picker `imageQuality<100`.
class JpegMetadataStripper {
  const JpegMetadataStripper._();

  static Uint8List strip(Uint8List bytes) {
    if (bytes.length < 4) return bytes;
    if (bytes[0] != 0xFF || bytes[1] != 0xD8) {
      // Not a JPEG (no SOI marker) — return unchanged.
      return bytes;
    }

    final out = BytesBuilder(copy: false)
      ..addByte(0xFF)
      ..addByte(0xD8);
    var i = 2;

    while (i < bytes.length - 1) {
      // All segment markers begin with 0xFF; padding 0xFF bytes are legal.
      if (bytes[i] != 0xFF) {
        // Malformed input — stop trying to parse and append the rest verbatim
        // so the upload still succeeds visually.
        out.add(bytes.sublist(i));
        return out.toBytes();
      }

      // Skip 0xFF padding.
      var markerOffset = i + 1;
      while (markerOffset < bytes.length && bytes[markerOffset] == 0xFF) {
        markerOffset++;
      }
      if (markerOffset >= bytes.length) break;
      final marker = bytes[markerOffset];

      // Markers without a payload: SOI (D8), EOI (D9), TEM (01), RST0–7 (D0–D7).
      if (marker == 0xD8 ||
          marker == 0xD9 ||
          marker == 0x01 ||
          (marker >= 0xD0 && marker <= 0xD7)) {
        out.addByte(0xFF);
        out.addByte(marker);
        i = markerOffset + 1;
        if (marker == 0xD9) {
          return out.toBytes();
        }
        continue;
      }

      // Start of scan: copy compressed image data verbatim through to EOI.
      if (marker == 0xDA) {
        out.add(bytes.sublist(i));
        return out.toBytes();
      }

      if (markerOffset + 2 >= bytes.length) break;
      final segLen = (bytes[markerOffset + 1] << 8) | bytes[markerOffset + 2];
      if (segLen < 2) break;
      final segEnd = markerOffset + 1 + segLen;
      if (segEnd > bytes.length) break;

      // Drop APP1–APP15 (metadata containers). Keep APP0 because some
      // renderers expect the JFIF identifier; it carries no GPS data.
      final isAppN = marker >= 0xE0 && marker <= 0xEF;
      final isMetadataApp = isAppN && marker != 0xE0;
      // COM (FE) is a free-text comment block — also drop.
      final isComment = marker == 0xFE;

      if (!isMetadataApp && !isComment) {
        out.add(bytes.sublist(i, segEnd));
      }
      i = segEnd;
    }

    return out.toBytes();
  }
}
