import base64
import math
import zlib

BITMAP_VERSION = 1
PACKED_STORAGE_KIND = "packed_tile"


def parse_tile_id(tile_id):
    parts = str(tile_id).split("/")
    if len(parts) != 3:
        raise ValueError(f"Invalid tile id: {tile_id}")
    return int(parts[0][1:]), int(parts[1][1:]), int(parts[2][1:])


def tile_bounds(tile_id):
    z, x, y = parse_tile_id(tile_id)
    n = 2 ** z
    west_lon = (x / n) * 360.0 - 180.0
    east_lon = ((x + 1) / n) * 360.0 - 180.0
    north_lat = math.degrees(math.atan(math.sinh(math.pi * (1 - (2 * y / n)))))
    south_lat = math.degrees(
        math.atan(math.sinh(math.pi * (1 - (2 * (y + 1) / n))))
    )
    return south_lat, north_lat, west_lon, east_lon


def cell_center(cell_id, cell_degrees):
    lat_index, lon_index = cell_indexes(cell_id)
    return (
        (lat_index * cell_degrees) - 90.0 + (cell_degrees / 2),
        (lon_index * cell_degrees) - 180.0 + (cell_degrees / 2),
    )


def cell_indexes(cell_id):
    parts = str(cell_id).split(":")
    if len(parts) != 2:
        raise ValueError(f"Invalid cell id: {cell_id}")
    return int(parts[0]), int(parts[1])


def tile_grid_spec(tile_id, cell_degrees):
    south_lat, north_lat, west_lon, east_lon = tile_bounds(tile_id)
    epsilon = 1e-12
    lat_start = int(math.floor((south_lat + 90.0) / cell_degrees))
    lat_end = int(math.floor(((north_lat + 90.0) - epsilon) / cell_degrees))
    lon_start = int(math.floor((west_lon + 180.0) / cell_degrees))
    lon_end = int(math.floor(((east_lon + 180.0) - epsilon) / cell_degrees))
    rows = max(0, lat_end - lat_start + 1)
    cols = max(0, lon_end - lon_start + 1)
    return {
        "latStart": lat_start,
        "latEnd": lat_end,
        "lonStart": lon_start,
        "lonEnd": lon_end,
        "rows": rows,
        "cols": cols,
    }


def packed_item_sort_key(world_id, tile_id):
    normalized_world_id = str(world_id or "global").strip().lower()
    return f"WORLD#{normalized_world_id}#TILE#{tile_id}"


def packed_shared_sort_key():
    return "META#PACKED"


def is_packed_tile_item(item):
    if not item:
        return False
    if item.get("storageKind") == PACKED_STORAGE_KIND:
        return True
    sk = str(item.get("sk") or "")
    return (
        sk.startswith("TILE#")
        or sk.startswith("WORLD#")
        or sk == packed_shared_sort_key()
    )


def unpack_packed_sort_key(sk):
    clean_sk = str(sk or "")
    if clean_sk.startswith("WORLD#") and "#TILE#" in clean_sk:
        world_id, tile_id = clean_sk.split("#TILE#", 1)
        return world_id.replace("WORLD#", "", 1), tile_id
    if clean_sk.startswith("TILE#"):
        return None, clean_sk.replace("TILE#", "", 1)
    return None, None


def encode_bitmap(raw_bytes):
    compressed = zlib.compress(bytes(raw_bytes), level=9)
    return base64.b64encode(compressed).decode("ascii")


def decode_bitmap(encoded, expected_byte_length):
    if not encoded:
        return bytearray(expected_byte_length)
    raw = zlib.decompress(base64.b64decode(encoded))
    if len(raw) != expected_byte_length:
        raise ValueError("Packed tile bitmap length does not match tile grid.")
    return bytearray(raw)


def _bit_is_set(raw_bytes, bit_index):
    byte_index = bit_index // 8
    bit_mask = 1 << (bit_index % 8)
    return (raw_bytes[byte_index] & bit_mask) != 0


def _set_bit(raw_bytes, bit_index):
    byte_index = bit_index // 8
    bit_mask = 1 << (bit_index % 8)
    raw_bytes[byte_index] |= bit_mask


def local_bit_index(tile_id, cell_id, cell_degrees):
    spec = tile_grid_spec(tile_id, cell_degrees)
    lat_index, lon_index = cell_indexes(cell_id)
    if (
        lat_index < spec["latStart"]
        or lat_index > spec["latEnd"]
        or lon_index < spec["lonStart"]
        or lon_index > spec["lonEnd"]
    ):
        return None
    row = lat_index - spec["latStart"]
    col = lon_index - spec["lonStart"]
    return (row * spec["cols"]) + col


def merge_tile_cells(existing_item, tile_id, world_id, cell_degrees, cell_ids, now_iso):
    spec = tile_grid_spec(tile_id, cell_degrees)
    total_bits = spec["rows"] * spec["cols"]
    byte_length = (total_bits + 7) // 8
    current_version = int(existing_item.get("version", 0)) if existing_item else 0
    current_count = int(existing_item.get("discoveredCellCount", 0)) if existing_item else 0
    raw = decode_bitmap(existing_item.get("cellBitmap"), byte_length) if existing_item else bytearray(byte_length)

    added_count = 0
    for cell_id in sorted({str(cell_id) for cell_id in cell_ids}):
        bit_index = local_bit_index(tile_id, cell_id, cell_degrees)
        if bit_index is None:
            continue
        if _bit_is_set(raw, bit_index):
            continue
        _set_bit(raw, bit_index)
        added_count += 1

    if added_count == 0 and existing_item:
        return None, 0, current_version

    item = {
        "worldId": world_id,
        "tileId": tile_id,
        "storageKind": PACKED_STORAGE_KIND,
        "bitmapVersion": BITMAP_VERSION,
        "cellDegrees": str(cell_degrees),
        "cellBitmap": encode_bitmap(raw),
        "discoveredCellCount": current_count + added_count,
        "updatedAt": now_iso,
        "version": current_version + 1,
    }
    return item, added_count, current_version


def packed_item_cells(item, fallback_tile_id=None, default_cell_degrees=0.00018):
    tile_id = item.get("tileId") or fallback_tile_id
    if not tile_id:
        sk = str(item.get("sk") or "")
        _, packed_tile_id = unpack_packed_sort_key(sk)
        if packed_tile_id:
            tile_id = packed_tile_id
    if not tile_id:
        raise ValueError("Packed tile item is missing tile id.")

    cell_degrees = float(item.get("cellDegrees") or default_cell_degrees)
    spec = tile_grid_spec(tile_id, cell_degrees)
    total_bits = spec["rows"] * spec["cols"]
    byte_length = (total_bits + 7) // 8
    raw = decode_bitmap(item.get("cellBitmap"), byte_length)

    cells = []
    for bit_index in range(total_bits):
        if not _bit_is_set(raw, bit_index):
            continue
        row = bit_index // spec["cols"]
        col = bit_index % spec["cols"]
        lat_index = spec["latStart"] + row
        lon_index = spec["lonStart"] + col
        cell_id = f"{lat_index}:{lon_index}"
        lat, lon = cell_center(cell_id, cell_degrees)
        cells.append(
            {
                "cellId": cell_id,
                "lat": lat,
                "lon": lon,
            }
        )
    return cells


def item_cells(item, fallback_tile_id=None, default_cell_degrees=0.00018):
    sk = str(item.get("sk") or "")
    if sk.startswith("CELL#"):
        cell_id = sk.replace("CELL#", "", 1)
        lat, lon = cell_center(cell_id, default_cell_degrees)
        return [
            {
                "cellId": cell_id,
                "lat": float(item.get("lat", lat)),
                "lon": float(item.get("lon", lon)),
            }
        ]

    if is_packed_tile_item(item):
        return packed_item_cells(
            item,
            fallback_tile_id=fallback_tile_id,
            default_cell_degrees=default_cell_degrees,
        )

    return []
