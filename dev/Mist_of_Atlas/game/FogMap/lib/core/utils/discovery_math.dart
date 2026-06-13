import 'dart:math' as math;

import 'package:latlong2/latlong.dart';

import '../constants/app_constants.dart';
import '../../data/models/cloud_discovery_cell.dart';

class DiscoveryMath {
  static const Distance _distance = Distance();

  static int aggregateSharedTileZoom(int mapZoom) {
    if (mapZoom <= 5) return 5;
    if (mapZoom <= 8) return 8;
    if (mapZoom <= 11) return 11;
    if (mapZoom <= 14) return 13;
    return 14;
  }

  static String cellIdFromLatLng(LatLng point, double cellDegrees) {
    final latIndex = ((point.latitude + 90.0) / cellDegrees).floor();
    final lonIndex = ((point.longitude + 180.0) / cellDegrees).floor();
    return '$latIndex:$lonIndex';
  }

  static LatLng cellCenterFromId(String cellId, double cellDegrees) {
    final parts = cellId.split(':');
    final latIndex = int.parse(parts[0]);
    final lonIndex = int.parse(parts[1]);
    return LatLng(
      (latIndex * cellDegrees) - 90.0 + (cellDegrees / 2),
      (lonIndex * cellDegrees) - 180.0 + (cellDegrees / 2),
    );
  }

  static Set<String> cellsForReveal({
    required LatLng point,
    required double radiusMeters,
    required double cellDegrees,
  }) {
    return cellsForRevealData(
      point: point,
      radiusMeters: radiusMeters,
      cellDegrees: cellDegrees,
    ).map((e) => e.cellId).toSet();
  }

  static Set<CloudDiscoveryCell> cellsForRevealData({
    required LatLng point,
    required double radiusMeters,
    required double cellDegrees,
  }) {
    final latDelta = radiusMeters / 111320.0;
    var cosLat = math.cos(point.latitude * math.pi / 180.0).abs();
    if (cosLat < 0.15) cosLat = 0.15;
    final lonDelta = radiusMeters / (111320.0 * cosLat);

    final minLat = point.latitude - latDelta;
    final maxLat = point.latitude + latDelta;
    final minLon = point.longitude - lonDelta;
    final maxLon = point.longitude + lonDelta;

    final latStart =
        (((minLat + 90.0) / cellDegrees).floor() * cellDegrees) - 90.0;
    final lonStart =
        (((minLon + 180.0) / cellDegrees).floor() * cellDegrees) - 180.0;

    final cells = <CloudDiscoveryCell>{};
    final containingCellId = cellIdFromLatLng(point, cellDegrees);
    final containingCellCenter =
        cellCenterFromId(containingCellId, cellDegrees);

    // Always reveal the cell the player is physically inside, even when a
    // small discovery radius would miss that cell's center point.
    cells.add(
      CloudDiscoveryCell(
        cellId: containingCellId,
        latitude: containingCellCenter.latitude,
        longitude: containingCellCenter.longitude,
      ),
    );

    for (double lat = latStart; lat <= maxLat; lat += cellDegrees) {
      for (double lon = lonStart; lon <= maxLon; lon += cellDegrees) {
        final center = LatLng(lat + cellDegrees / 2, lon + cellDegrees / 2);
        final meters = _distance(point, center);
        if (meters <= radiusMeters) {
          cells.add(
            CloudDiscoveryCell(
              cellId: cellIdFromLatLng(center, cellDegrees),
              latitude: center.latitude,
              longitude: center.longitude,
            ),
          );
        }
      }
    }

    return cells;
  }

  static CloudDiscoveryCell cellForPointData({
    required LatLng point,
    required double cellDegrees,
  }) {
    final cellId = cellIdFromLatLng(point, cellDegrees);
    final center = cellCenterFromId(cellId, cellDegrees);
    return CloudDiscoveryCell(
      cellId: cellId,
      latitude: center.latitude,
      longitude: center.longitude,
    );
  }

  static Set<CloudDiscoveryCell> cellsForPathSegmentData({
    required LatLng start,
    required LatLng end,
    required double radiusMeters,
    required double cellDegrees,
  }) {
    final totalMeters = _distance(start, end);
    final stepMeters = math.max(1.0, radiusMeters * 0.5);
    final steps = math.max(1, (totalMeters / stepMeters).ceil());
    final cells = <CloudDiscoveryCell>{};

    for (var index = 0; index <= steps; index++) {
      final progress = index / steps;
      final point = LatLng(
        start.latitude + ((end.latitude - start.latitude) * progress),
        start.longitude + ((end.longitude - start.longitude) * progress),
      );
      cells.add(
        cellForPointData(
          point: point,
          cellDegrees: cellDegrees,
        ),
      );
    }

    return cells;
  }

  static double metersPerPixel(double latitude, double zoom) {
    final latRad = latitude * math.pi / 180.0;
    return 156543.03392 * math.cos(latRad) / math.pow(2.0, zoom);
  }

  static bool shouldBridgeReveals({
    required LatLng start,
    required DateTime? startTimestamp,
    required LatLng end,
    required DateTime? endTimestamp,
  }) {
    if (startTimestamp == null || endTimestamp == null) {
      return false;
    }

    final gapSeconds = endTimestamp.difference(startTimestamp).inSeconds;
    if (gapSeconds <= 0) {
      return true;
    }

    if (gapSeconds > AppConstants.maxRevealBridgeGapSeconds) {
      return false;
    }

    return _distance(start, end) <= AppConstants.maxRevealBridgeDistanceMeters;
  }

  static String sharedViewportCacheKey({
    required double minLat,
    required double maxLat,
    required double minLon,
    required double maxLon,
    required int mapZoom,
  }) {
    final northWest = _slippyTile(maxLat, minLon, mapZoom);
    final southEast = _slippyTile(minLat, maxLon, mapZoom);
    final minX = math.min(northWest.x, southEast.x);
    final maxX = math.max(northWest.x, southEast.x);
    final minY = math.min(northWest.y, southEast.y);
    final maxY = math.max(northWest.y, southEast.y);

    return 'z${northWest.z}/x$minX-$maxX/y$minY-$maxY';
  }

  static List<String> sharedTileIdsForBounds({
    required double minLat,
    required double maxLat,
    required double minLon,
    required double maxLon,
    required int mapZoom,
    int? maxTileCount,
  }) {
    final northWest = _slippyTile(maxLat, minLon, mapZoom);
    final southEast = _slippyTile(minLat, maxLon, mapZoom);
    final minX = math.min(northWest.x, southEast.x);
    final maxX = math.max(northWest.x, southEast.x);
    final minY = math.min(northWest.y, southEast.y);
    final maxY = math.max(northWest.y, southEast.y);

    final tileCount = (maxX - minX + 1) * (maxY - minY + 1);
    if (maxTileCount != null && tileCount > maxTileCount) {
      return const <String>[];
    }

    final ids = <String>[];
    for (var x = minX; x <= maxX; x++) {
      for (var y = minY; y <= maxY; y++) {
        ids.add('z${northWest.z}/x$x/y$y');
      }
    }
    return ids;
  }

  static String sharedRegionIdForTileId(
    String tileId, {
    int tilesPerRegion = 4,
  }) {
    final parts = tileId.split('/');
    if (parts.length != 3) {
      throw FormatException('Invalid shared tile id: $tileId');
    }

    final z = int.parse(parts[0].substring(1));
    final x = int.parse(parts[1].substring(1));
    final y = int.parse(parts[2].substring(1));
    return 'z$z/rx${x ~/ tilesPerRegion}/ry${y ~/ tilesPerRegion}';
  }

  static List<String> sharedRegionIdsForTileIds(
    Iterable<String> tileIds, {
    int tilesPerRegion = 4,
  }) {
    final ids = tileIds
        .map(
          (tileId) => sharedRegionIdForTileId(
            tileId,
            tilesPerRegion: tilesPerRegion,
          ),
        )
        .toSet()
        .toList(growable: false)
      ..sort();
    return ids;
  }

  static String sharedRegionIdForPoint(
    LatLng point, {
    required int mapZoom,
    int tilesPerRegion = 4,
  }) {
    final tile = _slippyTile(point.latitude, point.longitude, mapZoom);
    return 'z${tile.z}/rx${tile.x ~/ tilesPerRegion}/ry${tile.y ~/ tilesPerRegion}';
  }

  static List<String> sharedRegionIdsForBounds({
    required double minLat,
    required double maxLat,
    required double minLon,
    required double maxLon,
    required int mapZoom,
    int tilesPerRegion = 4,
    int? maxRegionCount,
  }) {
    final northWest = _slippyTile(maxLat, minLon, mapZoom);
    final southEast = _slippyTile(minLat, maxLon, mapZoom);
    final minX = math.min(northWest.x, southEast.x);
    final maxX = math.max(northWest.x, southEast.x);
    final minY = math.min(northWest.y, southEast.y);
    final maxY = math.max(northWest.y, southEast.y);

    final minRx = minX ~/ tilesPerRegion;
    final maxRx = maxX ~/ tilesPerRegion;
    final minRy = minY ~/ tilesPerRegion;
    final maxRy = maxY ~/ tilesPerRegion;
    final regionCount = (maxRx - minRx + 1) * (maxRy - minRy + 1);
    if (maxRegionCount != null && regionCount > maxRegionCount) {
      return const <String>[];
    }

    final ids = <String>[];
    for (var rx = minRx; rx <= maxRx; rx++) {
      for (var ry = minRy; ry <= maxRy; ry++) {
        ids.add('z${northWest.z}/rx$rx/ry$ry');
      }
    }
    return ids;
  }

  static List<LatLng> sharedRegionOutlinePoints(
    String regionId, {
    int tilesPerRegion = 4,
  }) {
    final parts = regionId.split('/');
    if (parts.length != 3) {
      throw FormatException('Invalid shared region id: $regionId');
    }

    final z = int.parse(parts[0].substring(1));
    final rx = int.parse(parts[1].substring(2));
    final ry = int.parse(parts[2].substring(2));
    final minX = rx * tilesPerRegion;
    final minY = ry * tilesPerRegion;
    final maxX = minX + tilesPerRegion;
    final maxY = minY + tilesPerRegion;

    final northWest = _tileCornerToLatLng(x: minX, y: minY, z: z);
    final northEast = _tileCornerToLatLng(x: maxX, y: minY, z: z);
    final southEast = _tileCornerToLatLng(x: maxX, y: maxY, z: z);
    final southWest = _tileCornerToLatLng(x: minX, y: maxY, z: z);

    return <LatLng>[
      northWest,
      northEast,
      southEast,
      southWest,
    ];
  }

  static List<String> sharedTileIdsForRegion(
    String regionId, {
    int tilesPerRegion = 4,
  }) {
    final parts = regionId.split('/');
    if (parts.length != 3) {
      throw FormatException('Invalid shared region id: $regionId');
    }

    final z = int.parse(parts[0].substring(1));
    final rx = int.parse(parts[1].substring(2));
    final ry = int.parse(parts[2].substring(2));
    final minX = rx * tilesPerRegion;
    final minY = ry * tilesPerRegion;

    final tileIds = <String>[];
    for (var x = minX; x < minX + tilesPerRegion; x++) {
      for (var y = minY; y < minY + tilesPerRegion; y++) {
        tileIds.add('z$z/x$x/y$y');
      }
    }
    return tileIds;
  }

  static ({double minLat, double maxLat, double minLon, double maxLon})
      boundsAroundPoint({
    required LatLng point,
    required double radiusMeters,
  }) {
    final latDelta = radiusMeters / 111320.0;
    var cosLat = math.cos(point.latitude * math.pi / 180.0).abs();
    if (cosLat < 0.15) cosLat = 0.15;
    final lonDelta = radiusMeters / (111320.0 * cosLat);

    return (
      minLat: point.latitude - latDelta,
      maxLat: point.latitude + latDelta,
      minLon: point.longitude - lonDelta,
      maxLon: point.longitude + lonDelta,
    );
  }

  static double coveragePercent({
    required int discoveredCells,
    required double cellDegrees,
  }) {
    final totalCells = (360 / cellDegrees) * (180 / cellDegrees);
    return (discoveredCells / totalCells) * 100.0;
  }

  static _SharedTileAddress _slippyTile(double lat, double lon, int mapZoom) {
    final z = aggregateSharedTileZoom(mapZoom);
    final clampedLat = lat.clamp(-85.05112878, 85.05112878);
    final normalizedLon = lon.clamp(-180.0, 180.0 - 1e-9);
    final n = math.pow(2.0, z).toDouble();
    final x = (((normalizedLon + 180.0) / 360.0) * n).floor();
    final latRad = clampedLat * math.pi / 180.0;
    final mercator = math.log(math.tan(latRad) + (1 / math.cos(latRad)));
    final y = (((1.0 - (mercator / math.pi)) / 2.0) * n).floor();

    return _SharedTileAddress(
      x: x.clamp(0, n.toInt() - 1),
      y: y.clamp(0, n.toInt() - 1),
      z: z,
    );
  }

  static LatLng _tileCornerToLatLng({
    required int x,
    required int y,
    required int z,
  }) {
    final n = math.pow(2.0, z).toDouble();
    final lon = (x / n) * 360.0 - 180.0;
    final mercator = math.pi * (1 - (2 * y) / n);
    final sinhValue = (math.exp(mercator) - math.exp(-mercator)) / 2.0;
    final latRad = math.atan(sinhValue);
    final lat = latRad * 180.0 / math.pi;
    return LatLng(lat, lon);
  }
}

class _SharedTileAddress {
  const _SharedTileAddress({
    required this.x,
    required this.y,
    required this.z,
  });

  final int x;
  final int y;
  final int z;
}
