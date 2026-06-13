import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../../core/constants/app_constants.dart';
import '../../core/utils/discovery_math.dart';
import '../backend_config.dart';
import '../models/shared_viewport_models.dart';

class SharedTileService {
  SharedTileService({http.Client? client})
      : _client = client ?? http.Client(),
        _ownsClient = client == null;

  final http.Client _client;
  final bool _ownsClient;
  final Map<String, _RegionManifestCacheEntry> _regionManifestCache = {};
  bool _disposed = false;

  bool get isConfigured =>
      BackendConfig.cloudFrontSharedTilesDomain.trim().isNotEmpty;

  Future<SharedTileFetchResult> getRegions({
    required String worldId,
    required Iterable<String> regionIds,
    Map<String, String> knownTileVersions = const <String, String>{},
    void Function(int completed, int total)? onProgress,
  }) async {
    if (!isConfigured) {
      throw StateError('Shared tile CDN is not configured.');
    }

    final normalizedRegionIds = regionIds.toSet().toList(growable: false)
      ..sort();
    if (normalizedRegionIds.isEmpty) {
      return SharedTileFetchResult.empty(worldId: worldId);
    }

    var completed = 0;
    var total = normalizedRegionIds.length;
    onProgress?.call(completed, total);

    final manifests = await _runBatched<_SharedRegionManifest?>(
      normalizedRegionIds,
      AppConstants.sharedManifestFetchBatchSize,
      (regionId) async => _fetchRegionManifest(
        worldId: worldId,
        regionId: regionId,
      ),
      onItemDone: () {
        completed += 1;
        onProgress?.call(completed, total);
      },
    );

    final manifestsByRegion = <String, _SharedRegionManifest?>{
      for (var i = 0; i < normalizedRegionIds.length; i++)
        normalizedRegionIds[i]: manifests[i],
    };

    final visibleTileVersions = <String, String>{};
    final tilesToFetch = <String>{};
    for (final regionId in normalizedRegionIds) {
      final manifest = manifestsByRegion[regionId];
      if (manifest == null) {
        tilesToFetch.addAll(
          DiscoveryMath.sharedTileIdsForRegion(
            regionId,
            tilesPerRegion: AppConstants.sharedTilesPerRegionSide,
          ),
        );
        continue;
      }

      for (final entry in manifest.tileVersions.entries) {
        visibleTileVersions[entry.key] = entry.value;
        if (knownTileVersions[entry.key] != entry.value) {
          tilesToFetch.add(entry.key);
        }
      }
    }

    total += tilesToFetch.length;
    onProgress?.call(completed, total);

    final tileSnapshots = (await _runBatched<_SharedTilePayload?>(
      tilesToFetch.toList(growable: false),
      AppConstants.sharedTileFetchBatchSize,
      (tileId) async => _fetchTile(worldId: worldId, tileId: tileId),
      onItemDone: () {
        completed += 1;
        onProgress?.call(completed, total);
      },
    ))
        .whereType<_SharedTilePayload>()
        .toList(growable: false);

    var generatedAt = '';
    for (final snapshot in tileSnapshots) {
      visibleTileVersions[snapshot.tileId] = snapshot.generatedAt;
      if (snapshot.generatedAt.compareTo(generatedAt) > 0) {
        generatedAt = snapshot.generatedAt;
      }
    }

    if (generatedAt.isEmpty && visibleTileVersions.isNotEmpty) {
      generatedAt = visibleTileVersions.values.reduce(
        (a, b) => a.compareTo(b) >= 0 ? a : b,
      );
    }

    return SharedTileFetchResult(
      worldId: worldId,
      regionIds: normalizedRegionIds,
      generatedAt: generatedAt,
      tileVersions: visibleTileVersions,
      tileSnapshots: tileSnapshots
          .map(
            (snapshot) => SharedTileSnapshot(
              worldId: snapshot.worldId,
              tileId: snapshot.tileId,
              generatedAt: snapshot.generatedAt,
              cells: snapshot.cells,
              landmarks: snapshot.landmarks,
            ),
          )
          .toList(growable: false),
    );
  }

  Future<_SharedRegionManifest?> _fetchRegionManifest({
    required String worldId,
    required String regionId,
  }) async {
    if (_disposed) {
      throw StateError('SharedTileService has been disposed.');
    }

    final now = DateTime.now().toUtc();
    final cacheKey = '$worldId|$regionId';
    final cached = _regionManifestCache[cacheKey];
    if (cached != null &&
        now.difference(cached.fetchedAt).inSeconds <
            AppConstants.sharedRegionManifestCacheTtlSeconds) {
      return cached.manifest;
    }

    final uri = Uri.https(
      BackendConfig.cloudFrontSharedTilesDomain,
      '/shared-regions/v1/$worldId/$regionId.json',
    );

    final response =
        await _client.get(uri).timeout(const Duration(seconds: 10));

    if (response.statusCode == 404 || response.statusCode == 403) {
      _regionManifestCache[cacheKey] = _RegionManifestCacheEntry(
        manifest: null,
        fetchedAt: now,
      );
      return null;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        'Shared region manifest request failed (${response.statusCode}) for $regionId.',
      );
    }

    final manifest = _SharedRegionManifest.fromJson(
      jsonDecode(response.body) as Map<String, dynamic>,
    );
    _regionManifestCache[cacheKey] = _RegionManifestCacheEntry(
      manifest: manifest,
      fetchedAt: now,
    );
    return manifest;
  }

  Future<_SharedTilePayload?> _fetchTile({
    required String worldId,
    required String tileId,
  }) async {
    if (_disposed) {
      throw StateError('SharedTileService has been disposed.');
    }

    final uri = Uri.https(
      BackendConfig.cloudFrontSharedTilesDomain,
      '/shared-tiles/v1/$worldId/$tileId.json',
    );

    final response =
        await _client.get(uri).timeout(const Duration(seconds: 10));

    if (response.statusCode == 404 || response.statusCode == 403) {
      return null;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(
        'Shared tile request failed (${response.statusCode}) for $tileId.',
      );
    }

    final decoded = jsonDecode(response.body) as Map<String, dynamic>;
    return _SharedTilePayload.fromJson(decoded);
  }

  Future<List<T>> _runBatched<T>(
    List<String> keys,
    int batchSize,
    Future<T> Function(String key) task, {
    void Function()? onItemDone,
  }) async {
    final results = <T>[];
    for (var index = 0; index < keys.length; index += batchSize) {
      final batchKeys = keys.skip(index).take(batchSize);
      final batchResults = await Future.wait(
        batchKeys.map((key) async {
          final result = await task(key);
          onItemDone?.call();
          return result;
        }),
      );
      results.addAll(batchResults);
    }
    return results;
  }

  void dispose() {
    if (_disposed) return;
    if (_ownsClient) {
      _client.close();
    }
    _disposed = true;
  }
}

class SharedTileFetchResult {
  const SharedTileFetchResult({
    required this.worldId,
    required this.regionIds,
    required this.generatedAt,
    required this.tileVersions,
    required this.tileSnapshots,
  });

  final String worldId;
  final List<String> regionIds;
  final String generatedAt;
  final Map<String, String> tileVersions;
  final List<SharedTileSnapshot> tileSnapshots;

  factory SharedTileFetchResult.empty({required String worldId}) {
    return SharedTileFetchResult(
      worldId: worldId,
      regionIds: const <String>[],
      generatedAt: '',
      tileVersions: const <String, String>{},
      tileSnapshots: const <SharedTileSnapshot>[],
    );
  }
}

class _SharedRegionManifest {
  const _SharedRegionManifest({
    required this.worldId,
    required this.regionId,
    required this.generatedAt,
    required this.tileVersions,
  });

  final String worldId;
  final String regionId;
  final String generatedAt;
  final Map<String, String> tileVersions;

  factory _SharedRegionManifest.fromJson(Map<String, dynamic> json) {
    return _SharedRegionManifest(
      worldId: json['worldId'] as String? ?? 'global',
      regionId: json['regionId'] as String? ?? '',
      generatedAt: json['generatedAt'] as String? ?? '',
      tileVersions:
          ((json['tileVersions'] as Map?) ?? const <String, dynamic>{})
              .map((key, value) => MapEntry(key as String, value as String)),
    );
  }
}

class _RegionManifestCacheEntry {
  const _RegionManifestCacheEntry({
    required this.manifest,
    required this.fetchedAt,
  });

  final _SharedRegionManifest? manifest;
  final DateTime fetchedAt;
}

class _SharedTilePayload {
  const _SharedTilePayload({
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

  factory _SharedTilePayload.fromJson(Map<String, dynamic> json) {
    return _SharedTilePayload(
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
}
