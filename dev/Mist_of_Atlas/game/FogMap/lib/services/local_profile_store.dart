import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../core/constants/app_constants.dart';
import '../data/models/player_profile.dart';

class LocalProfileStore {
  static const String guestProfileKey = 'guest';

  Future<File> _profileFile({required String profileKey}) async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/${_fileNameForKey(profileKey)}');
  }

  Future<PlayerProfile> load({
    String profileKey = guestProfileKey,
    String? profileId,
    String? defaultDisplayName,
  }) async {
    final file = await _profileFile(profileKey: profileKey);
    if (!await file.exists()) {
      final empty = PlayerProfile.createEmpty(
        id: profileId ?? 'local-player',
        displayName: defaultDisplayName ?? 'Adventurer',
      );
      await save(empty, profileKey: profileKey);
      return empty;
    }

    try {
      final raw = await file.readAsString();
      final jsonMap = jsonDecode(raw) as Map<String, dynamic>;
      return PlayerProfile.fromJson(jsonMap);
    } catch (_) {
      final backupPath =
          '${file.path}.corrupt-${DateTime.now().millisecondsSinceEpoch}';
      await file.copy(backupPath);
      final empty = PlayerProfile.createEmpty(
        id: profileId ?? 'local-player',
        displayName: defaultDisplayName ?? 'Adventurer',
      );
      await save(empty, profileKey: profileKey);
      return empty;
    }
  }

  Future<void> save(
    PlayerProfile profile, {
    String profileKey = guestProfileKey,
  }) async {
    final file = await _profileFile(profileKey: profileKey);
    final encoder = const JsonEncoder.withIndent('  ');
    await file.writeAsString(
      encoder.convert(profile.toJson()),
      flush: true,
    );
  }

  String _fileNameForKey(String profileKey) {
    final safeKey = _safeProfileKey(profileKey);
    if (safeKey == guestProfileKey) {
      return AppConstants.profileFileName;
    }
    return 'player_profile_$safeKey.json';
  }

  String _safeProfileKey(String value) {
    final sanitized = value.replaceAll(RegExp(r'[^A-Za-z0-9._-]'), '_');
    if (sanitized.isEmpty) {
      return guestProfileKey;
    }
    return sanitized;
  }
}
