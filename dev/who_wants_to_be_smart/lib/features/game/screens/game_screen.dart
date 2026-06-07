import 'dart:async';
import 'dart:math';

import 'package:confetti/confetti.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lottie/lottie.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/enums/app_language.dart';
import '../../../core/providers/audio_prefs_provider.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/providers/voice_prefs_provider.dart';
import '../../../core/services/tts_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/joyful_kids_background.dart';
import '../models/game_session.dart';
import '../providers/game_provider.dart';
import '../widgets/answer_button.dart';
import '../widgets/host_widget.dart';
import '../widgets/lives_indicator.dart';
import '../widgets/question_card.dart';
import 'game_over_screen.dart';

// ─────────────────────────────────────────────────────────────────────────────
// GameScreen — the main Millionaire-for-Kids layout.
//
// Touch-protection strategy (single layer, provider level):
//   _advancing in GameNotifier is the sole guard against unwanted taps.
//   It stays true during the entire selectAnswer() → reveal → _advance() →
//   AnimatedSwitcher transition window, so residual touches from the previous
//   question can never fire selectAnswer() on the newly-loaded question.
//
//   The old _isTransitioning / Timer approach has been removed — it had a
//   race condition between _advancing = false and the setState() call that
//   set _isTransitioning = true, allowing exactly one residual-touch event
//   to slip through and auto-answer Q2 before the user could see it.
// ─────────────────────────────────────────────────────────────────────────────
class GameScreen extends ConsumerStatefulWidget {
  const GameScreen({super.key});
  static const routeName = '/game';

  @override
  ConsumerState<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends ConsumerState<GameScreen> {
  static const _yesLottiePath = 'assets/lottie/yes.json';
  static const _noLottiePath = 'assets/lottie/no.json';
  static const _reactionHold = Duration(milliseconds: 1200);

  late final ConfettiController _confettiCtrl;
  ProviderSubscription<GameSession?>? _gameSub;
  String? _reactionAssetPath;
  int _reactionToken = 0;

  void _playReaction(String assetPath) {
    final token = ++_reactionToken;
    setState(() => _reactionAssetPath = assetPath);

    // ignore: discarded_futures
    Future<void>.delayed(_reactionHold).then((_) {
      if (!mounted || token != _reactionToken) return;
      setState(() => _reactionAssetPath = null);
    });
  }

  @override
  void initState() {
    super.initState();
    _confettiCtrl = ConfettiController(
      duration: const Duration(milliseconds: 900),
    );

    _gameSub = ref.listenManual<GameSession?>(gameProvider, (prev, next) {
      if (!mounted) return;

      // Fire celebration effects on each answer reveal.
      if (next?.phase == GamePhase.answerRevealed &&
          prev?.phase == GamePhase.playing) {
        final correct = next?.lastAnswerWasCorrect == true;
        if (correct) {
          _confettiCtrl.play();
        }
        _playReaction(correct ? _yesLottiePath : _noLottiePath);
      }

      // Navigate away when the session ends.
      if (next?.isTerminal == true && prev?.isTerminal != true) {
        Navigator.of(context).pushReplacementNamed(GameOverScreen.routeName);
      }
    });

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      await ref.read(audioPrefsProvider.notifier).ensureLoaded();
      await ref.read(voicePrefsProvider.notifier).ensureLoaded();
      if (!mounted) return;
      await ref.read(gameProvider.notifier).startGame();
    });
  }

  @override
  void dispose() {
    _reactionToken++;
    _gameSub?.close();
    _confettiCtrl.dispose();
    TtsService.instance.stopAndClear();
    super.dispose();
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(gameProvider);

    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: JoyfulKidsBackground()),
          Container(
            decoration: const BoxDecoration(gradient: AppTheme.bgGradient),
            child: SafeArea(
              child: session == null
                  ? const _LoadingView()
                  : _GameView(session: session),
            ),
          ),

          // Confetti (top-centre, downward explosion).
          Align(
            alignment: Alignment.topCenter,
            child: IgnorePointer(
              ignoring: true,
              child: ConfettiWidget(
                confettiController: _confettiCtrl,
                blastDirectionality: BlastDirectionality.explosive,
                blastDirection: pi / 2,
                gravity: 0.35,
                numberOfParticles: 28,
                emissionFrequency: 0.06,
                maxBlastForce: 22,
                minBlastForce: 8,
                colors: const [
                  AppTheme.gold,
                  AppTheme.correct,
                  Color(0xFF40C4FF),
                  Color(0xFFFF80AB),
                  Color(0xFFB2FF59),
                  Color(0xFFFFD740),
                ],
              ),
            ),
          ),

          if (_reactionAssetPath != null)
            Positioned.fill(
              child: _AnswerReactionOverlay(assetPath: _reactionAssetPath!),
            ),

          if (kDebugMode && session != null)
            Positioned(
              left: 10,
              bottom: 10,
              child: IgnorePointer(
                ignoring: true,
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: Colors.black.withValues(alpha: 0.62),
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                      color: AppTheme.gold.withValues(alpha: 0.45),
                    ),
                  ),
                  child: Text(
                    'idx:${session.currentIndex}  '
                    'phase:${session.phase.name}  '
                    'sel:${session.selectedChoiceId ?? '-'}',
                    style: const TextStyle(
                      color: Colors.white,
                      fontSize: 11,
                      height: 1.2,
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _AnswerReactionOverlay extends StatelessWidget {
  const _AnswerReactionOverlay({required this.assetPath});

  final String assetPath;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      ignoring: true,
      child: Align(
        alignment: const Alignment(0, -0.20),
        child: SizedBox(
          width: 170,
          height: 170,
          child: Lottie.asset(
            assetPath,
            key: ValueKey(assetPath),
            repeat: false,
            fit: BoxFit.contain,
            errorBuilder: (_, __, ___) => const SizedBox.shrink(),
          ),
        ),
      ),
    );
  }
}

class _PlayfulBackdrop extends StatefulWidget {
  const _PlayfulBackdrop();

  @override
  State<_PlayfulBackdrop> createState() => _PlayfulBackdropState();
}

class _PlayfulBackdropState extends State<_PlayfulBackdrop>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 14),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      ignoring: true,
      child: AnimatedBuilder(
        animation: _ctrl,
        builder: (_, __) {
          final t = _ctrl.value;
          final driftA = sin(t * pi * 2) * 14;
          final driftB = cos(t * pi * 2) * 18;
          final driftC = sin((t + 0.35) * pi * 2) * 10;

          return Stack(
            children: [
              Positioned(
                left: -30 + driftA,
                top: 24,
                child: _Blob(
                  size: 160,
                  color: const Color(0xFF67E8F9).withValues(alpha: 0.23),
                ),
              ),
              Positioned(
                right: -35 + driftB,
                top: 180,
                child: _Blob(
                  size: 190,
                  color: const Color(0xFFF9A8D4).withValues(alpha: 0.22),
                ),
              ),
              Positioned(
                left: 70 + driftC,
                bottom: -18,
                child: _Blob(
                  size: 220,
                  color: const Color(0xFFFDE68A).withValues(alpha: 0.15),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

class _Blob extends StatelessWidget {
  const _Blob({required this.size, required this.color});

  final double size;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: color,
        boxShadow: [
          BoxShadow(
            color: color.withValues(alpha: 0.45),
            blurRadius: 44,
            spreadRadius: 10,
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// _LoadingView
// ─────────────────────────────────────────────────────────────────────────────
class _LoadingView extends StatelessWidget {
  const _LoadingView();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(color: AppTheme.gold),
          const SizedBox(height: 20),
          Text('Getting ready…', style: AppTheme.mutedStyle),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// _GameView — active game layout
// ─────────────────────────────────────────────────────────────────────────────
class _GameView extends ConsumerWidget {
  const _GameView({required this.session});

  final GameSession session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Column(
      children: [
        _TopBar(session: session),
        _ClimbQuestBanner(session: session),
        const SizedBox(height: 6),
        const SizedBox(height: 10),
        HostWidget(
          phase: session.phase,
          lastAnswerWasCorrect: session.lastAnswerWasCorrect,
        ),
        const SizedBox(height: 10),
        Expanded(
          child: Column(
            children: [
              // Question card — kept in a scroll view so long texts never push
              // answers off-screen.
              Expanded(
                child: session.currentQuestion != null
                    ? SingleChildScrollView(
                        key: ValueKey('question_${session.currentIndex}'),
                        padding: const EdgeInsets.only(bottom: 10),
                        child: QuestionCard(
                          question: session.currentQuestion!,
                          onReplay: () =>
                              ref.read(gameProvider.notifier).replayQuestion(),
                        ),
                      )
                    : const SizedBox.shrink(),
              ),

              // Answer grid — keyed by question index so each round starts clean.
              if (session.currentQuestion != null)
                KeyedSubtree(
                  key: ValueKey('answers_${session.currentIndex}'),
                  child: _AnswerGrid(session: session),
                ),

              const SizedBox(height: 16),
            ],
          ),
        ),
      ],
    );
  }
}

class _ClimbQuestBanner extends StatelessWidget {
  const _ClimbQuestBanner({required this.session});

  final GameSession session;

  @override
  Widget build(BuildContext context) {
    final target = AppConstants.targetCorrectToWin;
    final correct =
        session.correctAnswered > target ? target : session.correctAnswered;
    final remaining = target - correct;
    const trackHeight = 122.0;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Container(
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
        decoration: BoxDecoration(
          color: Colors.white.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: Colors.white.withValues(alpha: 0.24)),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 56,
              height: trackHeight,
              child: Stack(
                children: [
                  for (int i = 0; i < target; i++)
                    Positioned(
                      left: i.isOdd ? 30 : 4,
                      bottom: 8 + (trackHeight - 22) * (i / (target - 1)),
                      child: Container(
                        width: 22,
                        height: 8,
                        decoration: BoxDecoration(
                          color: i < correct
                              ? const Color(0xFF67E8F9)
                              : Colors.white.withValues(alpha: 0.20),
                          borderRadius: BorderRadius.circular(99),
                        ),
                      ),
                    ),
                  TweenAnimationBuilder<double>(
                    tween: Tween<double>(end: session.winProgress),
                    duration: const Duration(milliseconds: 360),
                    curve: Curves.easeOutBack,
                    builder: (context, progress, _) {
                      final stepIndex = (progress * (target - 1)).round();
                      final left = stepIndex.isOdd ? 26.0 : 0.0;
                      final bottom = 2 + progress * (trackHeight - 28);
                      return Positioned(
                        left: left,
                        bottom: bottom,
                        child: const Text('🧒', style: TextStyle(fontSize: 26)),
                      );
                    },
                  ),
                ],
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    'Climb to $target',
                    style: GoogleFonts.boogaloo(
                      fontSize: 24,
                      color: AppTheme.goldLight,
                      letterSpacing: 0.8,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    remaining <= 0
                        ? 'Top reached! Party time!'
                        : '$remaining more correct answers to win',
                    style: AppTheme.mutedStyle.copyWith(
                      color: AppTheme.textWhite,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  ClipRRect(
                    borderRadius: BorderRadius.circular(99),
                    child: LinearProgressIndicator(
                      value: session.winProgress,
                      minHeight: 10,
                      backgroundColor: Colors.white.withValues(alpha: 0.14),
                      valueColor: const AlwaysStoppedAnimation<Color>(
                        Color(0xFFFFD740),
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TopBar extends ConsumerWidget {
  const _TopBar({required this.session});

  final GameSession session;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final muted = ref.watch(audioPrefsProvider);
    final lang = ref.watch(localeProvider);
    final progress = session.totalQuestions == 0
        ? 0.0
        : session.questionNumber / session.totalQuestions;

    final muteTooltip = switch (lang) {
      AppLanguage.bulgarian => muted ? 'Включи звук' : 'Спри звук',
      _ => muted ? 'Unmute' : 'Mute',
    };

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 0),
      child: Column(
        children: [
          Row(
            children: [
              _PillFrame(
                child: SizedBox(
                  height: 34,
                  child: Center(child: LivesIndicator(lives: session.lives)),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: _ProgressPill(
                  current: session.questionNumber,
                  total: session.totalQuestions,
                  progress: progress.clamp(0.0, 1.0).toDouble(),
                ),
              ),
              const SizedBox(width: 8),
              _PillFrame(
                child: SizedBox(
                  height: 34,
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Icon(Icons.star_rounded,
                          color: AppTheme.goldLight, size: 18),
                      const SizedBox(width: 4),
                      Text(
                        '${session.score}',
                        style: GoogleFonts.nunito(
                          color: AppTheme.textWhite,
                          fontWeight: FontWeight.w900,
                          fontSize: 16,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Tooltip(
                message: muteTooltip,
                child: _MuteButton(session: session, muted: muted),
              ),
            ],
          ),
          const SizedBox(height: 8),
          const _TopBarGlowLine(),
        ],
      ),
    );
  }
}

class _ProgressPill extends StatelessWidget {
  const _ProgressPill({
    required this.current,
    required this.total,
    required this.progress,
  });

  final int current;
  final int total;
  final double progress;

  @override
  Widget build(BuildContext context) {
    return _PillFrame(
      child: SizedBox(
        height: 34,
        child: Row(
          children: [
            Text(
              '$current/$total',
              style: GoogleFonts.nunito(
                color: AppTheme.textWhite,
                fontWeight: FontWeight.w800,
                fontSize: 14,
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: LinearProgressIndicator(
                  value: progress,
                  minHeight: 8,
                  backgroundColor: Colors.white.withValues(alpha: 0.16),
                  valueColor: const AlwaysStoppedAnimation<Color>(
                    Color(0xFF67E8F9),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MuteButton extends ConsumerWidget {
  const _MuteButton({required this.session, required this.muted});

  final GameSession session;
  final bool muted;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return _PillFrame(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () async {
          final wasMuted = ref.read(audioPrefsProvider);
          await ref.read(audioPrefsProvider.notifier).toggleMuted();
          final isMuted = ref.read(audioPrefsProvider);

          if (wasMuted && !isMuted && session.phase == GamePhase.playing) {
            // ignore: discarded_futures
            ref.read(gameProvider.notifier).replayQuestion();
          }
        },
        child: Icon(
          muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
          color: muted ? AppTheme.textMuted : AppTheme.textWhite,
          size: 20,
        ),
      ),
    );
  }
}

class _PillFrame extends StatelessWidget {
  const _PillFrame({
    required this.child,
    this.padding = const EdgeInsets.symmetric(horizontal: 10, vertical: 0),
  });

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: Colors.white.withValues(alpha: 0.10),
        border: Border.all(color: Colors.white.withValues(alpha: 0.24)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF57C6FF).withValues(alpha: 0.12),
            blurRadius: 14,
            spreadRadius: 1,
          ),
        ],
      ),
      child: child,
    );
  }
}

class _TopBarGlowLine extends StatelessWidget {
  const _TopBarGlowLine();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 2,
      margin: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(999),
        gradient: LinearGradient(
          colors: [
            Colors.transparent,
            const Color(0xFF67E8F9).withValues(alpha: 0.8),
            const Color(0xFFF9A8D4).withValues(alpha: 0.8),
            Colors.transparent,
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// _AnswerGrid — 2 × 2 answer tiles
// ─────────────────────────────────────────────────────────────────────────────
class _AnswerGrid extends ConsumerWidget {
  const _AnswerGrid({required this.session});

  final GameSession session;

  static const _labels = ['A', 'B', 'C', 'D'];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final question = session.currentQuestion!;
    final choices = question.choices;

    // Taps are only accepted when the session is in the playing phase.
    // The _advancing flag inside GameNotifier provides the actual race-condition
    // guard — selectAnswer() returns immediately if _advancing is true, so
    // residual touches during the question transition are safely dropped at
    // the provider level without any UI-level timer needed.
    final canTap = session.phase == GamePhase.playing;

    VoidCallback? tap(int i) => canTap
        ? () => ref.read(gameProvider.notifier).selectAnswer(choices[i].id)
        : null;

    Widget btn(int i) => AnswerButton(
          // Keyed by question ID + choice ID so Flutter creates a fresh
          // _AnswerButtonState (and fresh scale animation) for every question.
          key: ValueKey('${question.id}_${choices[i].id}'),
          choice: choices[i],
          label: _labels[i],
          session: session,
          onTap: tap(i),
        );

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14),
      child: Column(
        children: [
          Row(children: [
            Expanded(child: btn(0)),
            const SizedBox(width: 10),
            Expanded(child: btn(1)),
          ]),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: btn(2)),
            const SizedBox(width: 10),
            Expanded(child: btn(3)),
          ]),
        ],
      ),
    );
  }
}
