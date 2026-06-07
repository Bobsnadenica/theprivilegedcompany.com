import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/dlc_manifest.dart';
import '../services/dlc_service.dart';

// ─────────────────────────────────────────────────────────────────────────────
// DlcStoreNotifier — manages the list of available/installed packs.
//
// Download progress is intentionally left as local widget state inside
// DlcScreen (via StreamSubscription) so the provider stays focused on
// persistent install state and doesn't need to manage ephemeral UI.
// ─────────────────────────────────────────────────────────────────────────────
class DlcStoreNotifier extends AsyncNotifier<List<DlcPack>> {
  @override
  Future<List<DlcPack>> build() async {
    try {
      return await DlcService.instance.fetchAndMergePacks();
    } catch (_) {
      // Offline: fall back to locally installed packs only.
      return DlcService.instance.getInstalledPacks();
    }
  }

  /// Re-fetches the manifest and re-merges install state.
  Future<void> refresh() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(() async {
      try {
        return await DlcService.instance.fetchAndMergePacks();
      } catch (_) {
        return DlcService.instance.getInstalledPacks();
      }
    });
  }

  /// Removes a pack from disk and DB, then refreshes the list.
  Future<void> deletePack(String packId) async {
    await DlcService.instance.deletePack(packId);
    await refresh();
  }
}

final dlcStoreProvider =
    AsyncNotifierProvider<DlcStoreNotifier, List<DlcPack>>(
  DlcStoreNotifier.new,
);
