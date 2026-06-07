import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/database/database_helper.dart';
import '../../../core/enums/app_language.dart';
import '../../../core/providers/audio_prefs_provider.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/providers/session_provider.dart';
import '../../../core/services/audio_service.dart';
import '../../../core/services/tts_service.dart';
import '../../classroom/models/score.dart';
import '../models/game_session.dart';
import '../models/question.dart';
import '../services/question_loader.dart';

// ─────────────────────────────────────────────────────────────────────────────
// GameNotifier — the heart of the game engine.
//
// State machine:
//   null  ──startGame()──►  playing
//   playing  ──selectAnswer()──►  answerRevealed  ──(delay)──►  playing
//                                                               └──►  gameOver / complete
//
// Improvements in this revision:
//   • _advancing flag prevents double-tap race conditions at the provider level.
//   • speakQuestion() reads the question text AND all four choices aloud.
//   • Answer feedback narration is awaited (with timeout) before advancing.
//   • All TTS calls use the current locale from localeProvider.
// ─────────────────────────────────────────────────────────────────────────────
class GameNotifier extends Notifier<GameSession?> {
  // Reveal timeline:
  //   350 ms gap to let the jingle begin cleanly
  //   up to 4 200 ms for spoken result (soft timeout)
  //   1 300 ms pause after result speech before the next question
  static const _revealGap = Duration(milliseconds: 350);
  static const _postResultPause = Duration(milliseconds: 1300);
  static const _sideEffectTimeout = Duration(milliseconds: 1200);
  static const _answerSpeechTimeout = Duration(milliseconds: 4200);

  /// Prevents a second selectAnswer() call while one is still in-flight.
  bool _advancing = false;

  @override
  GameSession? build() => null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  AppLanguage get _lang => ref.read(localeProvider);
  bool get _isMuted => ref.read(audioPrefsProvider);

  Future<void> _awaitSideEffect<T>(
    Future<T> future,
    String label, {
    Duration? timeout,
  }) async {
    final waitFor = timeout ?? _sideEffectTimeout;
    try {
      await future.timeout(waitFor);
    } on TimeoutException {
      debugPrint(
        '[Game] $label timed out after '
        '${waitFor.inMilliseconds}ms',
      );
    } catch (e) {
      debugPrint('[Game] $label failed: $e');
    }
  }

  /// Reads a question + its 4 choices using the current locale.
  Future<void> _readQuestion(Question question) async {
    if (_isMuted) return;
    final lang = _lang;
    final questionText = question.localizedText(lang);
    final choiceTexts =
        question.choices.map((c) => c.localizedText(lang)).toList();
    await TtsService.instance.speakQuestion(questionText, choiceTexts);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  Future<void> startGame() async {
    final session = ref.read(sessionProvider);
    final player = session.currentPlayer;
    final classProfile = session.selectedClass;

    if (player == null || classProfile == null) return;

    state = null; // show loading spinner

    final questions = await QuestionLoader.loadAndShuffle();

    state = GameSession(
      questions: questions,
      player: player,
      classProfile: classProfile,
      phase: GamePhase.playing,
    );

    // Fire-and-forget: TTS is a side-effect, not part of the state machine.
    // Awaiting here would hold up startGame() for the full reading duration
    // (question + 4 choices ≈ 12-15 s), making the game appear frozen.
    // ignore: discarded_futures
    _readQuestion(questions.first);
  }

  // ── Answer selection ───────────────────────────────────────────────────────

  Future<void> selectAnswer(String choiceId) async {
    // Double-tap / race guard — the entire flow must complete before accepting
    // another answer, even if the user hammers the screen.
    if (_advancing) return;
    final session = state;
    if (session == null) return;
    if (session.phase != GamePhase.playing) return;

    _advancing = true;
    try {
      final question = session.currentQuestion;
      if (question == null) return;

      final isCorrect = question.correctChoice.id == choiceId;
      final newLives = isCorrect ? session.lives : session.lives - 1;

      // 1. Immediately reflect the selection in the UI.
      state = session.copyWith(
        selectedChoiceId: choiceId,
        phase: GamePhase.answerRevealed,
        score: isCorrect
            ? session.score + AppConstants.pointsPerCorrect
            : session.score,
        lives: newLives,
        correctAnswered:
            isCorrect ? session.correctAnswered + 1 : session.correctAnswered,
        lastAnswerWasCorrect: isCorrect,
      );

      // 2. Stop any ongoing question narration immediately.
      await _awaitSideEffect(
        TtsService.instance.stopAndClear(),
        'TTS stop before answer reveal',
      );

      // 3. Play audio feedback jingle.
      if (!_isMuted) {
        if (isCorrect) {
          await _awaitSideEffect(
            AudioService.instance.playCorrect(),
            'playCorrect',
          );
        } else {
          await _awaitSideEffect(
            AudioService.instance.playWrong(),
            'playWrong',
          );
        }
      }

      // 4. Short gap, then read the result line.
      await Future<void>.delayed(_revealGap);
      if (!_isMuted) {
        await _awaitSideEffect(
          TtsService.instance.speakAnswerResult(
            isCorrect: isCorrect,
            correctText: question.correctChoice.localizedText(_lang),
            locale: _lang.locale,
          ),
          'speakAnswerResult',
          timeout: _answerSpeechTimeout,
        );
      }

      // 5. Small breathing room after spoken feedback before next question.
      await Future<void>.delayed(_postResultPause);

      // 6. Advance the state machine.
      await _advance(newLives: newLives);
    } finally {
      _advancing = false;
    }
  }

  // ── Internal transitions ───────────────────────────────────────────────────

  Future<void> _advance({required int newLives}) async {
    final session = state;
    if (session == null) return;

    if (newLives <= 0) {
      await _endGame(GamePhase.gameOver);
    } else if (session.correctAnswered >= AppConstants.targetCorrectToWin) {
      await _endGame(GamePhase.complete);
    } else if (session.isLastQuestion) {
      // Ran out of questions before reaching the win target.
      await _endGame(GamePhase.gameOver);
    } else {
      final nextIndex = session.currentIndex + 1;
      state = session.copyWith(
        currentIndex: nextIndex,
        phase: GamePhase.playing,
        clearSelectedChoice: true,
        clearLastAnswer: true,
      );

      // Fire-and-forget: same reasoning as startGame() — awaiting this would
      // hold _advancing = true for the full reading duration (~12-15 s),
      // silently dropping every tap on the newly-rendered answer buttons.
      // ignore: discarded_futures
      _readQuestion(state!.questions[nextIndex]);

      // ── Race-condition guard ────────────────────────────────────────────
      // Keep _advancing = true for the full AnimatedSwitcher transition so
      // that any residual touch from the previous question (e.g. the user's
      // finger still resting on the screen when the new question slides in)
      // cannot fire selectAnswer() before Q2's buttons have animated in.
      //
      // Without this delay, the sequence is:
      //   1. state → Q2 playing   (this line above)
      //   2. _advance() returns immediately
      //   3. finally: _advancing = false          ← window opens here
      //   4. ref.listen fires → _isTransitioning  ← window closes here (next frame)
      //   residual touch in the window ⇒ selectAnswer() called on Q2 ⇒ Q2 skipped
      //
      // Holding _advancing = true for mediumAnim + 150 ms closes the window
      // completely — _advancing = false only after the animation settles.
      await Future<void>.delayed(
        AppConstants.mediumAnim + const Duration(milliseconds: 150),
      );
    }
  }

  Future<void> _endGame(GamePhase phase) async {
    final session = state;
    if (session == null) return;

    // Stop any result narration before the end screen.
    await _awaitSideEffect(
      TtsService.instance.stopAndClear(),
      'TTS stop before end game',
    );

    final bonus = phase == GamePhase.complete
        ? session.lives * AppConstants.bonusPerLife
        : 0;
    final finalScore = session.score + bonus;

    state = session.copyWith(
      phase: phase,
      score: finalScore,
    );

    // Persist the score.
    if (session.player.id != null && session.classProfile.id != null) {
      await _awaitSideEffect(
        DatabaseHelper.instance.insertScore(
          Score(
            playerId: session.player.id!,
            classId: session.classProfile.id!,
            points: finalScore,
            questionsCorrect: session.correctAnswered,
            questionsTotal: session.totalQuestions,
            playedAt: DateTime.now(),
            packId: AppConstants.basePackId,
          ),
        ),
        'insert score',
      );
    }

    if (!_isMuted) {
      if (phase == GamePhase.complete) {
        await _awaitSideEffect(
          AudioService.instance.playComplete(),
          'playComplete',
        );
      } else {
        await _awaitSideEffect(
          AudioService.instance.playGameOver(),
          'playGameOver',
        );
      }
    }
  }

  // ── TTS replay ─────────────────────────────────────────────────────────────

  /// Re-reads the current question + choices. Called when the player taps 🔊.
  Future<void> replayQuestion() async {
    if (_isMuted) return;
    final question = state?.currentQuestion;
    if (question == null) return;
    await _readQuestion(question);
  }

  // ── Reset ──────────────────────────────────────────────────────────────────

  void reset() {
    _advancing = false;
    TtsService.instance.stopAndClear();
    state = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────

final gameProvider = NotifierProvider<GameNotifier, GameSession?>(
  GameNotifier.new,
);
