import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:archive/archive.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:path_provider/path_provider.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/database/database_helper.dart';
import '../../game/models/question.dart';
import '../models/dlc_manifest.dart';

// ─────────────────────────────────────────────────────────────────────────────
// DlcService — download / extract / manage DLC question packs.
//
// Pack layout on disk (inside app documents directory):
//   dlc_packs/
//     {packId}/
//       questions.json
//       images/    (optional)
//       audio/     (optional)
//
// Download flow:
//   1. GET  {DlcPack.downloadUrl}  → save to temp dir as {packId}_v{n}.zip
//   2. ZipDecoder.decodeBytes()    → extract to dlc_packs/{packId}/
//   3. DatabaseHelper.markPackInstalled()
//   4. Delete temp zip
//   Stream<double> emits 0.0 → 1.0 progress throughout.
// ─────────────────────────────────────────────────────────────────────────────
class DlcService {
  DlcService._();
  static final DlcService instance = DlcService._();

  final Dio _dio = Dio(
    BaseOptions(
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(minutes: 10),
    ),
  );

  static const List<DlcPack> _comingSoonPacks = [
    DlcPack(
      id: 'dlc_space_adventure',
      name: 'Space Adventure',
      description: 'Rockets, planets, and stars',
      version: 1,
      downloadUrl: '',
      iconEmoji: '🚀',
      questionCount: 365,
      isComingSoon: true,
      priceEur: 0.99,
    ),
    DlcPack(
      id: 'dlc_dino_party',
      name: 'Dino Party',
      description: 'Friendly dinosaurs and fun facts',
      version: 1,
      downloadUrl: '',
      iconEmoji: '🦖',
      questionCount: 365,
      isComingSoon: true,
      priceEur: 0.99,
    ),
    DlcPack(
      id: 'dlc_ocean_world',
      name: 'Ocean World',
      description: 'Sea animals and underwater sounds',
      version: 1,
      downloadUrl: '',
      iconEmoji: '🐠',
      questionCount: 365,
      isComingSoon: true,
      priceEur: 0.99,
    ),
    DlcPack(
      id: 'dlc_fairy_forest',
      name: 'Fairy Forest',
      description: 'Magic creatures, plants, and nature wonders',
      version: 1,
      downloadUrl: '',
      iconEmoji: '🧚',
      questionCount: 365,
      isComingSoon: true,
      priceEur: 0.99,
    ),
    DlcPack(
      id: 'dlc_math_mission',
      name: 'Math Mission',
      description: 'Counting, patterns, and playful number puzzles',
      version: 1,
      downloadUrl: '',
      iconEmoji: '➕',
      questionCount: 365,
      isComingSoon: true,
      priceEur: 0.99,
    ),
    DlcPack(
      id: 'dlc_world_trip',
      name: 'World Trip',
      description: 'Landmarks, maps, cultures, and kid geography',
      version: 1,
      downloadUrl: '',
      iconEmoji: '🗺️',
      questionCount: 365,
      isComingSoon: true,
      priceEur: 0.99,
    ),
  ];

  // ── Directory helpers ──────────────────────────────────────────────────────

  Future<Directory> _packDir(String packId) async {
    final root = await getApplicationDocumentsDirectory();
    final dir = Directory('${root.path}/${AppConstants.dlcLocalDir}/$packId');
    if (!dir.existsSync()) await dir.create(recursive: true);
    return dir;
  }

  Future<Directory> _tempDir() => getTemporaryDirectory();

  // ── Manifest ───────────────────────────────────────────────────────────────

  /// Fetches the remote manifest and merges in local install state.
  /// Throws on network failure — callers should handle and show an error.
  Future<List<DlcPack>> fetchAndMergePacks() async {
    final response = await _dio.get<Map<String, dynamic>>(
      AppConstants.dlcManifestUrl,
    );
    final manifest = DlcManifest.fromJson(response.data!);
    final installedMap = await DatabaseHelper.instance.getInstalledPacksMap();

    final source = [...manifest.packs];

    // Ensure starter pack always appears even if absent from remote manifest.
    if (!source.any((p) => p.id == AppConstants.basePackId)) {
      source.add(
        const DlcPack(
          id: AppConstants.basePackId,
          name: AppConstants.basePackName,
          description: 'Built-in starter questions',
          version: 1,
          downloadUrl: '',
          iconEmoji: '⭐',
          questionCount: AppConstants.basePackQuestionCount,
          isInstalled: true,
        ),
      );
    }

    // Append local "coming soon" cards.
    for (final pack in _comingSoonPacks) {
      if (!source.any((p) => p.id == pack.id)) source.add(pack);
    }

    return source
        .map((pack) => _applyInstalledState(pack, installedMap))
        .toList()
      ..sort(_packSort);
  }

  /// Offline fallback: returns only locally installed packs from the DB.
  Future<List<DlcPack>> getInstalledPacks() async {
    final rows = await DatabaseHelper.instance.getInstalledPacksMap();
    final packs = rows.values.map(_dlcPackFromDbRow).toList();

    // Offline fallback still shows starter + placeholders in the store.
    if (!packs.any((p) => p.id == AppConstants.basePackId)) {
      packs.add(
        const DlcPack(
          id: AppConstants.basePackId,
          name: AppConstants.basePackName,
          description: 'Built-in starter questions',
          version: 1,
          downloadUrl: '',
          iconEmoji: '⭐',
          questionCount: AppConstants.basePackQuestionCount,
          isInstalled: true,
        ),
      );
    }
    packs.addAll(
        _comingSoonPacks.where((soon) => !packs.any((p) => p.id == soon.id)));
    packs.sort(_packSort);
    return packs;
  }

  int _packSort(DlcPack a, DlcPack b) {
    if (a.id == AppConstants.basePackId) return -1;
    if (b.id == AppConstants.basePackId) return 1;
    if (a.isComingSoon != b.isComingSoon) return a.isComingSoon ? 1 : -1;
    return a.name.compareTo(b.name);
  }

  DlcPack _applyInstalledState(
    DlcPack pack,
    Map<String, Map<String, dynamic>> installedMap,
  ) {
    final installed = installedMap[pack.id];
    if (installed == null) {
      // Ensure starter pack count is always accurate.
      if (pack.id == AppConstants.basePackId && pack.questionCount <= 0) {
        return pack.copyWith(questionCount: AppConstants.basePackQuestionCount);
      }
      return pack;
    }

    final dbCount = installed['question_count'] as int? ?? 0;
    final mergedCount = pack.questionCount > 0 ? pack.questionCount : dbCount;
    final resolvedCount = pack.id == AppConstants.basePackId && mergedCount <= 0
        ? AppConstants.basePackQuestionCount
        : mergedCount;

    return pack.copyWith(
      questionCount: resolvedCount,
      isInstalled: (installed['is_installed'] as int?) == 1,
      installedVersion: installed['version'] as int?,
      installedAt: installed['installed_at'] != null
          ? DateTime.fromMillisecondsSinceEpoch(
              installed['installed_at'] as int)
          : null,
    );
  }

  DlcPack _dlcPackFromDbRow(Map<String, dynamic> row) => DlcPack(
        id: row['id'] as String,
        name: row['name'] as String,
        description: row['description'] as String?,
        version: row['version'] as int? ?? 1,
        downloadUrl: '',
        iconEmoji: row['icon_emoji'] as String? ?? '📚',
        questionCount: row['id'] == AppConstants.basePackId
            ? AppConstants.basePackQuestionCount
            : (row['question_count'] as int? ?? 0),
        isInstalled: (row['is_installed'] as int?) == 1,
        installedVersion: row['version'] as int?,
        installedAt: row['installed_at'] != null
            ? DateTime.fromMillisecondsSinceEpoch(row['installed_at'] as int)
            : null,
      );

  // ── Download ───────────────────────────────────────────────────────────────

  /// Downloads, extracts, and installs a pack.
  /// Emits progress values [0.0, 1.0] then closes.
  /// Emits an error and closes on failure.
  Stream<double> downloadPack(DlcPack pack) {
    final ctrl = StreamController<double>();
    _runDownload(pack, ctrl);
    return ctrl.stream;
  }

  Future<void> _runDownload(
    DlcPack pack,
    StreamController<double> ctrl,
  ) async {
    try {
      final tempDir = await _tempDir();
      final zipPath = '${tempDir.path}/${pack.id}_v${pack.version}.zip';

      // ── 1. Download zip (0 → 80%) ──────────────────────────────────────
      await _dio.download(
        pack.downloadUrl,
        zipPath,
        onReceiveProgress: (received, total) {
          if (total > 0) ctrl.add((received / total) * 0.80);
        },
      );

      ctrl.add(0.82);

      // ── 2. Extract (80 → 95%) ──────────────────────────────────────────
      final destDir = await _packDir(pack.id);
      await compute(_extractZipIsolate, _ExtractArgs(zipPath, destDir.path));

      ctrl.add(0.95);

      // ── 3. Register in DB ──────────────────────────────────────────────
      await DatabaseHelper.instance.markPackInstalled(pack.id, pack.version);
      await DatabaseHelper.instance.upsertPack({
        'id': pack.id,
        'name': pack.name,
        'description': pack.description,
        'version': pack.version,
        'is_installed': 1,
        'installed_at': DateTime.now().millisecondsSinceEpoch,
        'icon_emoji': pack.iconEmoji,
        'question_count': pack.questionCount,
      });

      // ── 4. Cleanup ────────────────────────────────────────────────────
      try {
        await File(zipPath).delete();
      } catch (_) {}

      ctrl.add(1.0);
      ctrl.close();
    } catch (e, st) {
      debugPrint('[DLC] download failed: $e\n$st');
      ctrl.addError(e);
      ctrl.close();
    }
  }

  // ── Question loading ───────────────────────────────────────────────────────

  /// Reads `questions.json` from an installed pack directory.
  Future<List<Question>> loadPackQuestions(String packId) async {
    final dir = await _packDir(packId);
    final file = File('${dir.path}/questions.json');

    if (!file.existsSync()) {
      throw StateError(
          'Pack "$packId" is marked installed but questions.json is missing.');
    }

    final raw = await file.readAsString();
    final json = jsonDecode(raw) as Map<String, dynamic>;
    final list = json['questions'] as List<dynamic>;

    return list
        .map(
            (q) => Question.fromJson(q as Map<String, dynamic>, packId: packId))
        .toList();
  }

  /// Whether the pack directory + questions.json exist on disk.
  Future<bool> isPackOnDisk(String packId) async {
    final root = await getApplicationDocumentsDirectory();
    final file =
        File('${root.path}/${AppConstants.dlcLocalDir}/$packId/questions.json');
    return file.existsSync();
  }

  // ── Deletion ───────────────────────────────────────────────────────────────

  Future<void> deletePack(String packId) async {
    final root = await getApplicationDocumentsDirectory();
    final dir = Directory('${root.path}/${AppConstants.dlcLocalDir}/$packId');
    if (dir.existsSync()) await dir.delete(recursive: true);

    await DatabaseHelper.instance.upsertPack({
      'id': packId,
      'name': packId,
      'version': 0,
      'is_installed': 0,
      'installed_at': null,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Isolate helper — unzips on a background thread to keep UI smooth.
// ─────────────────────────────────────────────────────────────────────────────
class _ExtractArgs {
  const _ExtractArgs(this.zipPath, this.destPath);
  final String zipPath;
  final String destPath;
}

Future<void> _extractZipIsolate(_ExtractArgs args) async {
  final bytes = await File(args.zipPath).readAsBytes();
  final archive = ZipDecoder().decodeBytes(bytes);

  for (final entry in archive) {
    final target = '${args.destPath}/${entry.name}';
    if (entry.isFile) {
      final file = File(target);
      await file.create(recursive: true);
      await file.writeAsBytes(entry.content as List<int>);
    } else {
      await Directory(target).create(recursive: true);
    }
  }
}
