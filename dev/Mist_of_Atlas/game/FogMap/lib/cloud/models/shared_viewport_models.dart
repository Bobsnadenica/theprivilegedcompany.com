import 'package:latlong2/latlong.dart';

class SharedCell {
  const SharedCell({
    required this.cellId,
    required this.lat,
    required this.lon,
    required this.discovererCount,
    required this.tileId,
    required this.lastDiscoveredAt,
  });

  final String cellId;
  final double lat;
  final double lon;
  final int discovererCount;
  final String tileId;
  final String lastDiscoveredAt;

  factory SharedCell.fromJson(Map<String, dynamic> json) {
    return SharedCell(
      cellId: json['cellId'] as String,
      lat: (json['lat'] as num).toDouble(),
      lon: (json['lon'] as num).toDouble(),
      discovererCount: json['discovererCount'] as int? ?? 1,
      tileId: json['tileId'] as String? ?? '',
      lastDiscoveredAt: json['lastDiscoveredAt'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'cellId': cellId,
        'lat': lat,
        'lon': lon,
        'discovererCount': discovererCount,
        'tileId': tileId,
        'lastDiscoveredAt': lastDiscoveredAt,
      };
}

class SharedPlayer {
  const SharedPlayer({
    required this.userId,
    required this.displayName,
    required this.profileIcon,
    required this.lat,
    required this.lon,
    required this.lastSeenAt,
  });

  final String userId;
  final String displayName;
  final String profileIcon;
  final double lat;
  final double lon;
  final String lastSeenAt;

  factory SharedPlayer.fromJson(Map<String, dynamic> json) {
    return SharedPlayer(
      userId: json['userId'] as String,
      displayName: json['displayName'] as String? ?? 'Explorer',
      profileIcon: json['profileIcon'] as String? ?? '🛡️',
      lat: (json['lat'] as num).toDouble(),
      lon: (json['lon'] as num).toDouble(),
      lastSeenAt: json['lastSeenAt'] as String? ?? '',
    );
  }

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'displayName': displayName,
        'profileIcon': profileIcon,
        'lat': lat,
        'lon': lon,
        'lastSeenAt': lastSeenAt,
      };
}

class SharedLandmark {
  const SharedLandmark({
    required this.landmarkId,
    required this.title,
    required this.description,
    required this.category,
    required this.lat,
    required this.lon,
    required this.tileId,
    required this.status,
    this.approvedObjectKey,
    this.createdAt,
  });

  final String landmarkId;
  final String title;
  final String description;
  final String category;
  final double lat;
  final double lon;
  final String tileId;
  final String status;
  final String? approvedObjectKey;
  final String? createdAt;

  factory SharedLandmark.fromJson(Map<String, dynamic> json) {
    return SharedLandmark(
      landmarkId: json['landmarkId'] as String,
      title: json['title'] as String? ?? '',
      description: json['description'] as String? ?? '',
      category: json['category'] as String? ?? '',
      lat: (json['lat'] as num).toDouble(),
      lon: (json['lon'] as num).toDouble(),
      tileId: json['tileId'] as String? ?? '',
      status: json['status'] as String? ?? 'UNKNOWN',
      approvedObjectKey: json['approvedObjectKey'] as String?,
      createdAt: json['createdAt'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'landmarkId': landmarkId,
        'title': title,
        'description': description,
        'category': category,
        'lat': lat,
        'lon': lon,
        'tileId': tileId,
        'status': status,
        'approvedObjectKey': approvedObjectKey,
        'createdAt': createdAt,
      };
}

class SharedTileSnapshot {
  const SharedTileSnapshot({
    required this.worldId,
    required this.tileId,
    required this.generatedAt,
    required this.cells,
    required this.landmarks,
  });

  final String worldId;
  final String tileId;
  final String generatedAt;
  final List<SharedCell> cells;
  final List<SharedLandmark> landmarks;

  factory SharedTileSnapshot.fromJson(Map<String, dynamic> json) {
    return SharedTileSnapshot(
      worldId: json['worldId'] as String? ?? 'global',
      tileId: json['tileId'] as String? ?? '',
      generatedAt: json['generatedAt'] as String? ?? '',
      cells: ((json['cells'] as List?) ?? const [])
          .map((e) => SharedCell.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(growable: false),
      landmarks: ((json['landmarks'] as List?) ?? const [])
          .map(
            (e) => SharedLandmark.fromJson(Map<String, dynamic>.from(e as Map)),
          )
          .toList(growable: false),
    );
  }

  Map<String, dynamic> toJson() => {
        'worldId': worldId,
        'tileId': tileId,
        'generatedAt': generatedAt,
        'cells': cells.map((cell) => cell.toJson()).toList(growable: false),
        'landmarks': landmarks
            .map((landmark) => landmark.toJson())
            .toList(growable: false),
      };
}

class SharedViewportResponse {
  const SharedViewportResponse({
    required this.worldId,
    required this.cells,
    required this.players,
    required this.landmarks,
    required this.generatedAt,
    this.hasTilePayload = true,
    this.tileVersions = const <String, String>{},
    this.tileSnapshots = const <SharedTileSnapshot>[],
  });

  final String worldId;
  final List<SharedCell> cells;
  final List<SharedPlayer> players;
  final List<SharedLandmark> landmarks;
  final String generatedAt;
  final bool hasTilePayload;
  final Map<String, String> tileVersions;
  final List<SharedTileSnapshot> tileSnapshots;

  factory SharedViewportResponse.empty() {
    return const SharedViewportResponse(
      worldId: 'global',
      cells: <SharedCell>[],
      players: <SharedPlayer>[],
      landmarks: <SharedLandmark>[],
      generatedAt: '',
      hasTilePayload: false,
      tileVersions: <String, String>{},
      tileSnapshots: <SharedTileSnapshot>[],
    );
  }

  factory SharedViewportResponse.fromJson(Map<String, dynamic> json) {
    return SharedViewportResponse(
      worldId: json['worldId'] as String? ?? 'global',
      cells: ((json['cells'] as List?) ?? const [])
          .map((e) => SharedCell.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      players: ((json['players'] as List?) ?? const [])
          .map(
              (e) => SharedPlayer.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      landmarks: ((json['landmarks'] as List?) ?? const [])
          .map((e) =>
              SharedLandmark.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(),
      generatedAt: json['generatedAt'] as String? ?? '',
      hasTilePayload: true,
      tileVersions: const <String, String>{},
      tileSnapshots: const <SharedTileSnapshot>[],
    );
  }

  SharedViewportResponse copyWithMetadata({
    bool? hasTilePayload,
    Map<String, String>? tileVersions,
    List<SharedTileSnapshot>? tileSnapshots,
  }) {
    return SharedViewportResponse(
      worldId: worldId,
      cells: cells,
      players: players,
      landmarks: landmarks,
      generatedAt: generatedAt,
      hasTilePayload: hasTilePayload ?? this.hasTilePayload,
      tileVersions: tileVersions ?? this.tileVersions,
      tileSnapshots: tileSnapshots ?? this.tileSnapshots,
    );
  }

  Map<String, dynamic> toJson() => {
        'worldId': worldId,
        'cells': cells.map((cell) => cell.toJson()).toList(growable: false),
        'players':
            players.map((player) => player.toJson()).toList(growable: false),
        'landmarks': landmarks
            .map((landmark) => landmark.toJson())
            .toList(growable: false),
        'generatedAt': generatedAt,
        'tileVersions': tileVersions,
        'tileSnapshots': tileSnapshots
            .map((snapshot) => snapshot.toJson())
            .toList(growable: false),
      };
}

class SharedViewportCacheSnapshot {
  const SharedViewportCacheSnapshot({
    required this.worldId,
    required this.savedAtIso,
    required this.generatedAt,
    required this.cells,
    required this.landmarks,
    required this.tileVersions,
    required this.syncedRegionIds,
  });

  final String worldId;
  final String savedAtIso;
  final String generatedAt;
  final List<SharedCell> cells;
  final List<SharedLandmark> landmarks;
  final Map<String, String> tileVersions;
  final List<String> syncedRegionIds;

  factory SharedViewportCacheSnapshot.empty({String worldId = 'global'}) {
    return SharedViewportCacheSnapshot(
      worldId: worldId,
      savedAtIso: '',
      generatedAt: '',
      cells: const <SharedCell>[],
      landmarks: const <SharedLandmark>[],
      tileVersions: const <String, String>{},
      syncedRegionIds: const <String>[],
    );
  }

  factory SharedViewportCacheSnapshot.fromJson(Map<String, dynamic> json) {
    return SharedViewportCacheSnapshot(
      worldId: json['worldId'] as String? ?? 'global',
      savedAtIso: json['savedAtIso'] as String? ?? '',
      generatedAt: json['generatedAt'] as String? ?? '',
      cells: ((json['cells'] as List?) ?? const [])
          .map((e) => SharedCell.fromJson(Map<String, dynamic>.from(e as Map)))
          .toList(growable: false),
      landmarks: ((json['landmarks'] as List?) ?? const [])
          .map(
            (e) => SharedLandmark.fromJson(Map<String, dynamic>.from(e as Map)),
          )
          .toList(growable: false),
      tileVersions:
          ((json['tileVersions'] as Map?) ?? const <String, dynamic>{})
              .map((key, value) => MapEntry(key as String, value as String)),
      syncedRegionIds: ((json['syncedRegionIds'] as List?) ?? const [])
          .map((regionId) => regionId as String)
          .toList(growable: false),
    );
  }

  Map<String, dynamic> toJson() => {
        'worldId': worldId,
        'savedAtIso': savedAtIso,
        'generatedAt': generatedAt,
        'cells': cells.map((cell) => cell.toJson()).toList(growable: false),
        'landmarks': landmarks
            .map((landmark) => landmark.toJson())
            .toList(growable: false),
        'tileVersions': tileVersions,
        'syncedRegionIds': syncedRegionIds,
      };
}

enum SharedRegionStatus {
  available,
  syncing,
  synced,
}

class SharedRegionOutline {
  const SharedRegionOutline({
    required this.regionId,
    required this.points,
    required this.status,
  });

  final String regionId;
  final List<LatLng> points;
  final SharedRegionStatus status;
}
