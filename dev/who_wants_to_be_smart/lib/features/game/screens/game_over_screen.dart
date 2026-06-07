import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:lottie/lottie.dart';

import '../../../core/enums/app_language.dart';
import '../../../core/localization/simple_text.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/providers/session_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/joyful_kids_background.dart';
import '../../arcade/screens/class_selection_screen.dart';
import '../../arcade/screens/name_entry_screen.dart';
import '../../classroom/screens/player_profile_screen.dart';
import '../models/game_session.dart';
import '../providers/game_provider.dart';

// ─────────────────────────────────────────────────────────────────────────────
// GameOverScreen — shown after every session (win or lose).
//
// Displays score, accuracy, star rating, and two action buttons.
// The score animates up from 0 using a Tween.
// ─────────────────────────────────────────────────────────────────────────────
class GameOverScreen extends ConsumerStatefulWidget {
  const GameOverScreen({super.key});
  static const routeName = '/game-over';

  @override
  ConsumerState<GameOverScreen> createState() => _GameOverScreenState();
}

class _GameOverScreenState extends ConsumerState<GameOverScreen>
    with SingleTickerProviderStateMixin {
  static const _partyLottiePath = 'assets/lottie/confetti.json';

  late final AnimationController _ctrl;
  late final Animation<int> _scoreAnim;
  late final Animation<double> _fadeAnim;
  late final Animation<double> _scaleAnim;

  GameSession? _snapshot;

  @override
  void initState() {
    super.initState();
    _snapshot = ref.read(gameProvider);

    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1200),
    );

    final finalScore = _snapshot?.score ?? 0;
    _scoreAnim = IntTween(begin: 0, end: finalScore).animate(
      CurvedAnimation(parent: _ctrl, curve: const Interval(0.2, 0.9)),
    );
    _fadeAnim = Tween<double>(begin: 0, end: 1).animate(
      CurvedAnimation(parent: _ctrl, curve: const Interval(0.0, 0.5)),
    );
    _scaleAnim = Tween<double>(begin: 0.7, end: 1.0).animate(
      CurvedAnimation(
        parent: _ctrl,
        curve: const Interval(0.0, 0.6, curve: Curves.elasticOut),
      ),
    );

    _ctrl.forward();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  void _playAgain() {
    ref.read(gameProvider.notifier).reset();
    Navigator.of(context).pushReplacementNamed(NameEntryScreen.routeName);
  }

  void _goHome() {
    ref.read(gameProvider.notifier).reset();
    ref.read(sessionProvider.notifier).reset();
    Navigator.of(context).pushNamedAndRemoveUntil(
      ClassSelectionScreen.routeName,
      (route) => false,
    );
  }

  void _viewProfile() {
    final playerId = _snapshot?.player.id;
    if (playerId == null) return;
    Navigator.of(context).pushNamed(
      PlayerProfileScreen.routeName,
      arguments: playerId,
    );
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final session = _snapshot;
    if (session == null) {
      // Safety net — should never happen.
      return const Scaffold(
        body: Center(child: CircularProgressIndicator(color: AppTheme.gold)),
      );
    }

    final isComplete = session.phase == GamePhase.complete;
    final lang = ref.watch(localeProvider);
    final heroEmoji = isComplete ? '🏆' : '💔';
    final headline = isComplete
        ? tr(lang, 'You did it!', 'Справи се чудесно!')
        : tr(
            lang, 'Better luck next time!', 'Следващия път ще е още по-добре!');

    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: JoyfulKidsBackground()),
          Container(
            decoration: const BoxDecoration(gradient: AppTheme.bgGradient),
            child: SafeArea(
              child: FadeTransition(
                opacity: _fadeAnim,
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    // ── Hero emoji ───────────────────────────────────────────
                    ScaleTransition(
                      scale: _scaleAnim,
                      child: Text(
                        heroEmoji,
                        style: const TextStyle(fontSize: 80),
                      ),
                    ),
                    const SizedBox(height: 12),

                    // ── Headline ─────────────────────────────────────────────
                    Text(headline, style: AppTheme.titleStyle),
                    const SizedBox(height: 4),
                    Text(
                      session.player.name,
                      style: AppTheme.arcadeNameStyle.copyWith(fontSize: 36),
                    ),

                    const SizedBox(height: 28),

                    // ── Score counter ────────────────────────────────────────
                    _ScoreCounter(animation: _scoreAnim, lang: lang),

                    const SizedBox(height: 20),

                    // ── Accuracy ─────────────────────────────────────────────
                    Text(
                      tr(
                        lang,
                        '${session.correctAnswered} / ${session.totalQuestions} correct',
                        '${session.correctAnswered} / ${session.totalQuestions} верни',
                      ),
                      style: AppTheme.bodyStyle
                          .copyWith(color: AppTheme.textMuted),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      tr(
                        lang,
                        'Climb: ${session.correctAnswered}/${session.targetCorrectToWin}',
                        'Изкачване: ${session.correctAnswered}/${session.targetCorrectToWin}',
                      ),
                      style: AppTheme.bodyStyle
                          .copyWith(color: AppTheme.goldLight),
                    ),

                    const SizedBox(height: 16),

                    // ── Stars ────────────────────────────────────────────────
                    _StarRating(stars: session.stars),

                    const Spacer(),

                    // ── Action buttons ────────────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 32),
                      child: Column(
                        children: [
                          _ActionButton(
                            label: tr(lang, 'Play Again', 'Играй отново'),
                            icon: Icons.replay_rounded,
                            gradient: AppTheme.goldGradient,
                            textColor: AppTheme.bgDark,
                            onTap: _playAgain,
                          ),
                          const SizedBox(height: 14),
                          _ActionButton(
                            label: tr(lang, 'My Profile', 'Моят профил'),
                            icon: Icons.person_rounded,
                            gradient: const LinearGradient(
                              colors: [Color(0xFF67E8F9), Color(0xFFF9A8D4)],
                            ),
                            textColor: AppTheme.bgDark,
                            onTap: _viewProfile,
                          ),
                          const SizedBox(height: 14),
                          _ActionButton(
                            label: tr(lang, 'Go Home', 'Към начало'),
                            icon: Icons.home_rounded,
                            gradient: const LinearGradient(
                              colors: [AppTheme.bgSurface, AppTheme.bgCard],
                            ),
                            textColor: AppTheme.textWhite,
                            onTap: _goHome,
                          ),
                        ],
                      ),
                    ),

                    const SizedBox(height: 36),
                  ],
                ),
              ),
            ),
          ),
          if (isComplete)
            Positioned.fill(
              child: IgnorePointer(
                ignoring: true,
                child: Lottie.asset(
                  _partyLottiePath,
                  repeat: true,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) => const SizedBox.shrink(),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-widgets
// ─────────────────────────────────────────────────────────────────────────────

class _ScoreCounter extends AnimatedWidget {
  const _ScoreCounter({
    required Animation<int> animation,
    required this.lang,
  }) : super(listenable: animation);

  final AppLanguage lang;

  @override
  Widget build(BuildContext context) {
    final value = (listenable as Animation<int>).value;
    return Column(
      children: [
        Text(
          tr(lang, 'SCORE', 'РЕЗУЛТАТ'),
          style: AppTheme.mutedStyle.copyWith(letterSpacing: 3),
        ),
        const SizedBox(height: 4),
        Text(
          '$value',
          style: GoogleFonts.boogaloo(
            fontSize: 64,
            color: AppTheme.gold,
            shadows: [
              Shadow(
                color: AppTheme.gold.withValues(alpha: 0.7),
                blurRadius: 20,
              )
            ],
          ),
        ),
      ],
    );
  }
}

class _StarRating extends StatelessWidget {
  const _StarRating({required this.stars});

  final int stars;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(3, (i) {
        final filled = i < stars;
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Icon(
            filled ? Icons.star_rounded : Icons.star_border_rounded,
            color: filled ? AppTheme.gold : AppTheme.textMuted,
            size: 40,
            shadows: filled
                ? [
                    Shadow(
                      color: AppTheme.gold.withValues(alpha: 0.8),
                      blurRadius: 10,
                    )
                  ]
                : null,
          ),
        );
      }),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.label,
    required this.icon,
    required this.gradient,
    required this.textColor,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final Gradient gradient;
  final Color textColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: double.infinity,
        height: 60,
        decoration: BoxDecoration(
          gradient: gradient,
          borderRadius: BorderRadius.circular(16),
          boxShadow: AppTheme.cardShadow,
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, color: textColor, size: 22),
            const SizedBox(width: 10),
            Text(
              label,
              style: GoogleFonts.boogaloo(
                fontSize: 22,
                color: textColor,
                letterSpacing: 1,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
