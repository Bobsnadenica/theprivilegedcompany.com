import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../constants/app_constants.dart';
import '../../features/classroom/models/class_profile.dart';
import '../../features/classroom/models/player.dart';
import '../../core/database/database_helper.dart';

// ─────────────────────────────────────────────────────────────────────────────
// SessionState — ephemeral data for the current play session.
// Resets between sessions; never persisted to the DB here.
// ─────────────────────────────────────────────────────────────────────────────
class SessionState {
  const SessionState({
    this.selectedClass,
    this.pendingName = 'AAA',
    this.currentPlayer,
    this.isConfirming = false,
  });

  final ClassProfile? selectedClass;

  /// The 3-letter name being typed in the arcade wheel picker.
  final String pendingName;

  /// Set once the player taps PLAY and findOrCreatePlayer resolves.
  final Player? currentPlayer;

  /// True while the DB call is in flight.
  final bool isConfirming;

  bool get isReady => selectedClass != null && currentPlayer != null;

  SessionState copyWith({
    ClassProfile? selectedClass,
    String? pendingName,
    Player? currentPlayer,
    bool? isConfirming,
    bool clearPlayer = false,
  }) =>
      SessionState(
        selectedClass: selectedClass ?? this.selectedClass,
        pendingName: pendingName ?? this.pendingName,
        currentPlayer:
            clearPlayer ? null : (currentPlayer ?? this.currentPlayer),
        isConfirming: isConfirming ?? this.isConfirming,
      );

  @override
  String toString() =>
      'Session(class: ${selectedClass?.name}, name: $pendingName, '
      'player: ${currentPlayer?.name})';
}

// ─────────────────────────────────────────────────────────────────────────────

class SessionNotifier extends Notifier<SessionState> {
  @override
  SessionState build() => const SessionState();

  void selectClass(ClassProfile cls) {
    state = state.copyWith(
      selectedClass: cls,
      pendingName: 'AAA',
      clearPlayer: true,
    );
  }

  /// Quick Play path for home use: silently uses a shared local class profile
  /// so the game works without requiring classroom setup.
  Future<void> selectQuickPlayClass() async {
    final cls = await DatabaseHelper.instance.findOrCreateClass(
      name: AppConstants.quickPlayClassName,
      emoji: AppConstants.quickPlayClassEmoji,
    );
    selectClass(cls);
  }

  /// Called by the WheelLetterPicker on each scroll stop.
  void updateNameAt(int position, String letter) {
    final chars = state.pendingName.padRight(3, 'A').split('');
    chars[position] = letter;
    state = state.copyWith(pendingName: chars.join());
  }

  /// Resolves (or creates) the player from DB, then marks the session ready.
  Future<void> confirmPlayer() async {
    final cls = state.selectedClass;
    if (cls?.id == null) return;

    state = state.copyWith(isConfirming: true);
    try {
      final player = await DatabaseHelper.instance.findOrCreatePlayer(
        state.pendingName,
        cls!.id!,
      );
      state = state.copyWith(currentPlayer: player, isConfirming: false);
    } catch (_) {
      state = state.copyWith(isConfirming: false);
      rethrow;
    }
  }

  void reset() => state = const SessionState();
}

final sessionProvider = NotifierProvider<SessionNotifier, SessionState>(
  SessionNotifier.new,
);
