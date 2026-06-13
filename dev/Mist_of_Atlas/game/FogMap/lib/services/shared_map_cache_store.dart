import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../cloud/models/shared_viewport_models.dart';

class SharedMapCacheStore {
  Future<SharedViewportCacheSnapshot?> load({
    required String worldId,
    required Duration maxAge,
  }) async {
    final file = await _cacheFile(worldId: worldId);
    if (!await file.exists()) {
      return null;
    }

    try {
      final raw = await file.readAsString();
      final jsonMap = jsonDecode(raw) as Map<String, dynamic>;
      final snapshot = SharedViewportCacheSnapshot.fromJson(jsonMap);
      final savedAt = DateTime.tryParse(snapshot.savedAtIso)?.toUtc();
      if (savedAt == null) {
        return null;
      }
      if (DateTime.now().toUtc().difference(savedAt) > maxAge) {
        return null;
      }
      return snapshot;
    } catch (_) {
      return null;
    }
  }

  Future<void> save(SharedViewportCacheSnapshot snapshot) async {
    final file = await _cacheFile(worldId: snapshot.worldId);
    final encoder = const JsonEncoder.withIndent('  ');
    await file.writeAsString(
      encoder.convert(snapshot.toJson()),
      flush: true,
    );
  }

  Future<File> _cacheFile({required String worldId}) async {
    final dir = await getApplicationDocumentsDirectory();
    final safeWorldId = worldId.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
    return File('${dir.path}/shared_map_cache_$safeWorldId.json');
  }
}
