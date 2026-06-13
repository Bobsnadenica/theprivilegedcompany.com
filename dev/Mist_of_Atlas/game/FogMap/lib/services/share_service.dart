import 'dart:convert';

import 'package:share_plus/share_plus.dart';

import '../core/constants/app_constants.dart';
import '../data/models/player_profile.dart';

class ShareService {
  Future<void> shareProfile(PlayerProfile profile) async {
    final jsonText =
        const JsonEncoder.withIndent('  ').convert(profile.toJson());

    await SharePlus.instance.share(
      ShareParams(
        text: 'My ${AppConstants.appName} world progress export',
        files: [
          XFile.fromData(
            utf8.encode(jsonText),
            mimeType: 'application/json',
          ),
        ],
        fileNameOverrides: const ['mist_of_atlas_profile.json'],
        subject: '${AppConstants.appName} profile export',
        title: 'Share your world map',
      ),
    );
  }
}
