import '../../../core/constants/app_constants.dart';
import '../../../features/classroom/models/class_profile.dart';
import '../../../features/classroom/models/player.dart';
import 'question.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Immutable snapshot of the game engine state.
// The GameNotifier produces a new GameSession on every transition.
// ─────────────────────────────────────────────────────────────────────────────

enum GamePhase {
  /// Questions are being loaded from disk.
  loading,

  /// Waiting for the player to tap an answer.
  playing,

  /// An answer has been tapped — reveal animation in progress.
  answerRevealed,

  /// Ran out of lives before finishing all questions.
  gameOver,

  /// Reached the win target (15 correct answers by default).
  complete,
}

// ─────────────────────────────────────────────────────────────────────────────

class GameSession {
  const GameSession({
    required this.questions,
    required this.player,
    required this.classProfile,
    this.currentIndex = 0,
    this.score = 0,
    this.lives = AppConstants.maxLives,
    this.phase = GamePhase.loading,
    this.selectedChoiceId,
    this.correctAnswered = 0,
    this.lastAnswerWasCorrect,
  });

  final List<Question> questions;
  final Player player;
  final ClassProfile classProfile;
  final int currentIndex;
  final int score;
  final int lives;
  final GamePhase phase;

  /// The choiceId tapped by the player this round (null if not yet answered).
  final String? selectedChoiceId;

  final int correctAnswered;

  /// Set during [GamePhase.answerRevealed] so widgets can react.
  final bool? lastAnswerWasCorrect;

  // ── Derived ───────────────────────────────────────────────────────────────

  Question? get currentQuestion =>
      currentIndex < questions.length ? questions[currentIndex] : null;

  int get totalQuestions => questions.length;
  int get questionNumber => currentIndex + 1; // 1-based for display
  bool get isLastQuestion => currentIndex >= questions.length - 1;
  bool get isTerminal =>
      phase == GamePhase.gameOver || phase == GamePhase.complete;

  int get targetCorrectToWin => AppConstants.targetCorrectToWin;

  int get remainingToWin {
    final left = targetCorrectToWin - correctAnswered;
    return left <= 0 ? 0 : left;
  }

  double get winProgress {
    if (targetCorrectToWin <= 0) return 0;
    final ratio = correctAnswered / targetCorrectToWin;
    if (ratio < 0) return 0;
    if (ratio > 1) return 1;
    return ratio;
  }

  double get accuracy =>
      totalQuestions == 0 ? 0 : correctAnswered / totalQuestions;

  /// 0–3 stars awarded at game end.
  int get stars {
    if (correctAnswered == 0) return 0;
    if (accuracy >= 0.80) return 3;
    if (accuracy >= 0.50) return 2;
    return 1;
  }

  // ── Convenience ───────────────────────────────────────────────────────────

  GameSession copyWith({
    List<Question>? questions,
    Player? player,
    ClassProfile? classProfile,
    int? currentIndex,
    int? score,
    int? lives,
    GamePhase? phase,
    String? selectedChoiceId,
    bool clearSelectedChoice = false,
    int? correctAnswered,
    bool? lastAnswerWasCorrect,
    bool clearLastAnswer = false,
  }) =>
      GameSession(
        questions: questions ?? this.questions,
        player: player ?? this.player,
        classProfile: classProfile ?? this.classProfile,
        currentIndex: currentIndex ?? this.currentIndex,
        score: score ?? this.score,
        lives: lives ?? this.lives,
        phase: phase ?? this.phase,
        selectedChoiceId: clearSelectedChoice
            ? null
            : (selectedChoiceId ?? this.selectedChoiceId),
        correctAnswered: correctAnswered ?? this.correctAnswered,
        lastAnswerWasCorrect: clearLastAnswer
            ? null
            : (lastAnswerWasCorrect ?? this.lastAnswerWasCorrect),
      );

  @override
  String toString() =>
      'GameSession(q: $questionNumber/$totalQuestions, score: $score, '
      'lives: $lives, phase: $phase)';
}
