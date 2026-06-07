import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/database/database_helper.dart';
import '../models/class_profile.dart';
import '../models/player_progress.dart';
import '../models/score.dart';

// ─────────────────────────────────────────────────────────────────────────────
// ClassesNotifier — CRUD for ClassProfile list.
// ─────────────────────────────────────────────────────────────────────────────
class ClassesNotifier extends AsyncNotifier<List<ClassProfile>> {
  @override
  Future<List<ClassProfile>> build() => DatabaseHelper.instance.getAllClasses();

  Future<ClassProfile> addClass({
    required String name,
    required String emoji,
  }) async {
    state = const AsyncLoading();
    final id = await DatabaseHelper.instance.insertClass(
      ClassProfile(
        name: name,
        createdAt: DateTime.now(),
        avatarEmoji: emoji,
      ),
    );
    await _reload();
    final cls = state.requireValue.firstWhere((c) => c.id == id);
    return cls;
  }

  Future<void> renameClass(int id, String newName) async {
    final cls = state.requireValue.firstWhere((c) => c.id == id);
    await DatabaseHelper.instance.updateClass(cls.copyWith(name: newName));
    await _reload();
  }

  Future<void> removeClass(int id) async {
    await DatabaseHelper.instance.deleteClass(id);
    await _reload();
  }

  Future<void> _reload() async {
    state = const AsyncLoading();
    state = await AsyncValue.guard(DatabaseHelper.instance.getAllClasses);
  }
}

final classesProvider =
    AsyncNotifierProvider<ClassesNotifier, List<ClassProfile>>(
  ClassesNotifier.new,
);

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard for a specific class (refreshes when class changes).
// ─────────────────────────────────────────────────────────────────────────────
final leaderboardProvider =
    FutureProvider.family<List<Score>, int>((ref, classId) {
  return DatabaseHelper.instance.getLeaderboardForClass(classId);
});

final globalLeaderboardProvider = FutureProvider<List<Score>>((ref) {
  return DatabaseHelper.instance.getGlobalLeaderboard();
});

final playerProgressProvider =
    FutureProvider.family<PlayerProgress?, int>((ref, playerId) {
  return DatabaseHelper.instance.getPlayerProgress(playerId);
});

final playerScoresProvider =
    FutureProvider.family<List<Score>, int>((ref, playerId) {
  return DatabaseHelper.instance.getScoresForPlayer(playerId);
});
