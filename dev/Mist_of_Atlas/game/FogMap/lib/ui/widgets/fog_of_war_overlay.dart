import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_map/flutter_map.dart';
import 'package:latlong2/latlong.dart';

import '../../core/constants/app_constants.dart';
import '../../core/utils/discovery_math.dart';
import '../../data/models/reveal_point.dart';

class FogOfWarOverlay extends StatelessWidget {
  const FogOfWarOverlay({
    super.key,
    required this.camera,
    required this.reveals,
    required this.trailSegments,
    required this.revision,
  });

  final MapCamera camera;
  final List<RevealPoint> reveals;
  final List<List<LatLng>> trailSegments;
  final int revision;

  @override
  Widget build(BuildContext context) {
    return CustomPaint(
      painter: _FogOfWarPainter(
        camera: camera,
        reveals: reveals,
        trailSegments: trailSegments,
        revision: revision,
      ),
      size: Size.infinite,
    );
  }
}

class _FogOfWarPainter extends CustomPainter {
  _FogOfWarPainter({
    required this.camera,
    required this.reveals,
    required this.trailSegments,
    required this.revision,
  })  : _revealSignature = Object.hashAll(
          reveals.map(
            (reveal) => DiscoveryMath.cellIdFromLatLng(
              LatLng(reveal.latitude, reveal.longitude),
              AppConstants.statsCellDegrees,
            ),
          ),
        ),
        _trailSignature = Object.hashAll(
          trailSegments.expand(
            (segment) => <Object>[
              '#',
              ...segment.map(
                (point) =>
                    '${point.latitude.toStringAsFixed(6)}:${point.longitude.toStringAsFixed(6)}',
              ),
            ],
          ),
        );

  final MapCamera camera;
  final List<RevealPoint> reveals;
  final List<List<LatLng>> trailSegments;
  final int revision;
  final int _revealSignature;
  final int _trailSignature;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    final trailPaths = _trailPaths();
    final trailDots = _trailDots();

    canvas.saveLayer(rect, Paint());

    canvas.drawRect(
      rect,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xEC11130F),
            Color(0xF0161916),
            Color(0xEC0E1214),
          ],
        ).createShader(rect),
    );

    canvas.drawRect(
      rect,
      Paint()
        ..shader = const RadialGradient(
          center: Alignment.topCenter,
          radius: 1.15,
          colors: [
            Color(0x08000000),
            Color(0x00000000),
            Color(0x6A000000),
          ],
          stops: [0.0, 0.58, 1.0],
        ).createShader(rect),
    );

    _paintTexture(canvas, rect);

    final stripSoftPaint = Paint()
      ..blendMode = BlendMode.dstOut
      ..style = PaintingStyle.fill
      ..color = const Color(0xD0FFFFFF)
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2.4);

    final stripCorePaint = Paint()
      ..blendMode = BlendMode.dstOut
      ..style = PaintingStyle.fill
      ..color = const Color(0xEEFFFFFF);

    for (final strip in _mergedCellStrips()) {
      final featherPath = _pathForStrip(strip, inflatePixels: 2.0);
      final corePath = _pathForStrip(strip);

      canvas.drawPath(featherPath, stripSoftPaint);
      canvas.drawPath(corePath, stripCorePaint);
    }

    if (trailPaths.isNotEmpty || trailDots.isNotEmpty) {
      final trailWidth = _trailWidthPixels();
      final trailSoftPaint = Paint()
        ..blendMode = BlendMode.dstOut
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..strokeWidth = trailWidth + 6
        ..color = const Color(0xD8FFFFFF)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2.8);

      final trailClearPaint = Paint()
        ..blendMode = BlendMode.clear
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..strokeWidth = trailWidth;

      final trailDotSoftPaint = Paint()
        ..blendMode = BlendMode.dstOut
        ..style = PaintingStyle.fill
        ..color = const Color(0xD8FFFFFF)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 2.8);

      for (final trailPath in trailPaths) {
        canvas.drawPath(trailPath, trailSoftPaint);
        canvas.drawPath(trailPath, trailClearPaint);
      }

      for (final center in trailDots) {
        canvas.drawCircle(center, (trailWidth / 2) + 3, trailDotSoftPaint);
        canvas.drawCircle(center, trailWidth / 2, trailClearPaint);
      }
    }

    canvas.restore();

    if (trailPaths.isNotEmpty) {
      final edgeGlowPaint = Paint()
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round
        ..strokeWidth = _trailWidthPixels() + 2
        ..color = const Color(0x24F5D8A2)
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4);
      for (final trailPath in trailPaths) {
        canvas.drawPath(trailPath, edgeGlowPaint);
      }
    }

    canvas.drawRect(
      rect,
      Paint()
        ..shader = const RadialGradient(
          center: Alignment.center,
          radius: 0.98,
          colors: [
            Color(0x00000000),
            Color(0x08000000),
            Color(0x22000000),
          ],
          stops: [0.55, 0.82, 1.0],
        ).createShader(rect),
    );
  }

  void _paintTexture(Canvas canvas, Rect rect) {
    final hatchPaint = Paint()
      ..color = const Color(0x0CF2E8D4)
      ..strokeWidth = 1;

    for (double x = -rect.height; x < rect.width + rect.height; x += 24) {
      canvas.drawLine(
        Offset(x, 0),
        Offset(x - rect.height, rect.height),
        hatchPaint,
      );
    }

    final contourPaint = Paint()
      ..color = const Color(0x0AF3E6CB)
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1.15;

    for (double y = rect.height * 0.12; y < rect.height; y += 78) {
      final path = ui.Path()..moveTo(-24, y);
      for (double x = 0; x <= rect.width + 48; x += 42) {
        final dx = x - 24;
        final waveY = y + math.sin((x / rect.width) * math.pi * 2.4) * 8;
        final nextX = dx + 42;
        final nextY = y + math.sin(((x + 42) / rect.width) * math.pi * 2.4) * 8;
        path.quadraticBezierTo(dx + 21, waveY, nextX, nextY);
      }
      canvas.drawPath(path, contourPaint);
    }
  }

  List<_CellStrip> _mergedCellStrips() {
    final rows = <int, Set<int>>{};

    for (final reveal in reveals) {
      final cellId = DiscoveryMath.cellIdFromLatLng(
        LatLng(reveal.latitude, reveal.longitude),
        AppConstants.statsCellDegrees,
      );
      final parts = cellId.split(':');
      final latIndex = int.parse(parts[0]);
      final lonIndex = int.parse(parts[1]);
      rows.putIfAbsent(latIndex, () => <int>{}).add(lonIndex);
    }

    final strips = <_CellStrip>[];

    for (final entry in rows.entries) {
      final sorted = entry.value.toList()..sort();
      if (sorted.isEmpty) continue;

      var start = sorted.first;
      var end = start;

      for (final lonIndex in sorted.skip(1)) {
        if (lonIndex == end + 1) {
          end = lonIndex;
          continue;
        }

        strips.add(
          _CellStrip(
            latIndex: entry.key,
            lonStart: start,
            lonEnd: end,
          ),
        );
        start = lonIndex;
        end = lonIndex;
      }

      strips.add(
        _CellStrip(
          latIndex: entry.key,
          lonStart: start,
          lonEnd: end,
        ),
      );
    }

    return strips;
  }

  ui.Path _pathForStrip(_CellStrip strip, {double inflatePixels = 0}) {
    final southLat = (strip.latIndex * AppConstants.statsCellDegrees) - 90.0;
    final northLat =
        ((strip.latIndex + 1) * AppConstants.statsCellDegrees) - 90.0;
    final westLon = (strip.lonStart * AppConstants.statsCellDegrees) - 180.0;
    final eastLon =
        ((strip.lonEnd + 1) * AppConstants.statsCellDegrees) - 180.0;

    final northWest = camera.latLngToScreenOffset(LatLng(northLat, westLon));
    final northEast = camera.latLngToScreenOffset(LatLng(northLat, eastLon));
    final southEast = camera.latLngToScreenOffset(LatLng(southLat, eastLon));
    final southWest = camera.latLngToScreenOffset(LatLng(southLat, westLon));

    if (camera.rotation.abs() < 0.001) {
      final minX = math.min(
        math.min(northWest.dx, northEast.dx),
        math.min(southWest.dx, southEast.dx),
      );
      final maxX = math.max(
        math.max(northWest.dx, northEast.dx),
        math.max(southWest.dx, southEast.dx),
      );
      final minY = math.min(
        math.min(northWest.dy, northEast.dy),
        math.min(southWest.dy, southEast.dy),
      );
      final maxY = math.max(
        math.max(northWest.dy, northEast.dy),
        math.max(southWest.dy, southEast.dy),
      );
      final rect = Rect.fromLTRB(minX, minY, maxX, maxY).inflate(inflatePixels);
      final radius = Radius.circular(
        math.min(rect.width, rect.height).clamp(0.0, 12.0).toDouble() * 0.45,
      );
      return ui.Path()..addRRect(ui.RRect.fromRectAndRadius(rect, radius));
    }

    return ui.Path()
      ..moveTo(northWest.dx, northWest.dy)
      ..lineTo(northEast.dx, northEast.dy)
      ..lineTo(southEast.dx, southEast.dy)
      ..lineTo(southWest.dx, southWest.dy)
      ..close();
  }

  List<ui.Path> _trailPaths() {
    return trailSegments.where((segment) => segment.length > 1).map((segment) {
      final offsets =
          segment.map(camera.latLngToScreenOffset).toList(growable: false);
      final path = ui.Path()..moveTo(offsets.first.dx, offsets.first.dy);

      if (offsets.length == 2) {
        path.lineTo(offsets.last.dx, offsets.last.dy);
        return path;
      }

      for (var index = 1; index < offsets.length - 1; index++) {
        final current = offsets[index];
        final next = offsets[index + 1];
        final midPoint = Offset(
          (current.dx + next.dx) / 2,
          (current.dy + next.dy) / 2,
        );
        path.quadraticBezierTo(
          current.dx,
          current.dy,
          midPoint.dx,
          midPoint.dy,
        );
      }

      final last = offsets.last;
      path.lineTo(last.dx, last.dy);

      return path;
    }).toList(growable: false);
  }

  List<Offset> _trailDots() {
    return trailSegments
        .where((segment) => segment.length == 1)
        .map((segment) => camera.latLngToScreenOffset(segment.first))
        .toList(growable: false);
  }

  double _trailWidthPixels() {
    final metersPerPixel = DiscoveryMath.metersPerPixel(
      camera.center.latitude,
      camera.zoom,
    );
    final width = (AppConstants.discoveryRadiusMeters * 1.35) / metersPerPixel;
    return width.clamp(8.0, 18.0).toDouble();
  }

  @override
  bool shouldRepaint(covariant _FogOfWarPainter oldDelegate) {
    return oldDelegate._revealSignature != _revealSignature ||
        oldDelegate._trailSignature != _trailSignature ||
        oldDelegate.revision != revision ||
        oldDelegate.camera.center != camera.center ||
        oldDelegate.camera.zoom != camera.zoom ||
        oldDelegate.camera.rotation != camera.rotation;
  }
}

class _CellStrip {
  const _CellStrip({
    required this.latIndex,
    required this.lonStart,
    required this.lonEnd,
  });

  final int latIndex;
  final int lonStart;
  final int lonEnd;
}
