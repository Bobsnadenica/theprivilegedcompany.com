import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/providers/locale_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../models/choice.dart';
import '../models/game_session.dart';

// ─────────────────────────────────────────────────────────────────────────────
// AnswerButton — one of the four answer tiles.
//
// Reads [localeProvider] to display choice text in the selected language
// (English or Bulgarian) automatically.
//
// Visual states (driven by GamePhase + selectedChoiceId from GameSession):
//
//   idle           → deep-blue bg, gold border
//   correct        → green gradient  (the choice the player tapped WAS right)
//   wrong          → red gradient    (the choice the player tapped WAS wrong)
//   revealCorrect  → green gradient  (the right answer, revealed after a miss)
//   disabled       → muted, no tap   (the other untouched choices after reveal)
// ─────────────────────────────────────────────────────────────────────────────

enum _BtnVisual { idle, correct, wrong, revealCorrect, disabled }

class AnswerButton extends ConsumerStatefulWidget {
  const AnswerButton({
    super.key,
    required this.choice,
    required this.label,
    required this.session,
    required this.onTap,
  });

  final Choice choice;

  /// A / B / C / D
  final String label;

  final GameSession session;
  final VoidCallback? onTap;

  @override
  ConsumerState<AnswerButton> createState() => _AnswerButtonState();
}

class _AnswerButtonState extends ConsumerState<AnswerButton>
    with SingleTickerProviderStateMixin {
  late final AnimationController _scaleCtrl;
  late final Animation<double> _scaleAnim;

  @override
  void initState() {
    super.initState();
    _scaleCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 120),
      reverseDuration: const Duration(milliseconds: 180),
      value: 1.0,
    );
    _scaleAnim = Tween<double>(begin: 0.93, end: 1.0).animate(
      CurvedAnimation(parent: _scaleCtrl, curve: Curves.easeOut),
    );
  }

  @override
  void dispose() {
    _scaleCtrl.dispose();
    super.dispose();
  }

  // ── State resolution ───────────────────────────────────────────────────────

  _BtnVisual get _visual {
    final phase = widget.session.phase;
    final selectedId = widget.session.selectedChoiceId;
    final thisId = widget.choice.id;
    final correctId = widget.session.currentQuestion?.correctChoice.id;

    if (phase == GamePhase.playing) return _BtnVisual.idle;
    if (phase == GamePhase.answerRevealed || widget.session.isTerminal) {
      if (thisId == selectedId) {
        return widget.choice.isCorrect ? _BtnVisual.correct : _BtnVisual.wrong;
      }
      // Highlight the right answer when the player chose something else.
      if (thisId == correctId && selectedId != null && selectedId != thisId) {
        return _BtnVisual.revealCorrect;
      }
      return _BtnVisual.disabled;
    }
    return _BtnVisual.idle;
  }

  bool get _isEnabled =>
      widget.session.phase == GamePhase.playing && widget.onTap != null;

  // ── Colors ─────────────────────────────────────────────────────────────────

  Color get _idleAccent {
    return switch (widget.label) {
      'A' => const Color(0xFF67E8F9),
      'B' => const Color(0xFFF9A8D4),
      'C' => const Color(0xFFFDE68A),
      _ => const Color(0xFF86EFAC),
    };
  }

  Gradient get _gradient {
    return switch (_visual) {
      _BtnVisual.correct => AppTheme.correctGradient,
      _BtnVisual.wrong => AppTheme.wrongGradient,
      _BtnVisual.revealCorrect => AppTheme.correctGradient,
      _BtnVisual.disabled =>
        const LinearGradient(colors: [Color(0xFF0E0D3A), Color(0xFF0E0D3A)]),
      _BtnVisual.idle => LinearGradient(
          colors: [
            Color.lerp(AppTheme.bgCard, _idleAccent, 0.20)!,
            Color.lerp(AppTheme.bgSurface, _idleAccent, 0.10)!,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
    };
  }

  Color get _borderColor {
    return switch (_visual) {
      _BtnVisual.correct => AppTheme.correct,
      _BtnVisual.wrong => AppTheme.wrong,
      _BtnVisual.revealCorrect => AppTheme.correct,
      _BtnVisual.disabled => AppTheme.bgSurface,
      _BtnVisual.idle => _idleAccent.withValues(alpha: 0.95),
    };
  }

  Color get _labelChipColor {
    return switch (_visual) {
      _BtnVisual.correct => Colors.white.withValues(alpha: 0.25),
      _BtnVisual.wrong => Colors.white.withValues(alpha: 0.20),
      _BtnVisual.revealCorrect => Colors.white.withValues(alpha: 0.25),
      _BtnVisual.disabled => AppTheme.bgSurface,
      _BtnVisual.idle => _idleAccent.withValues(alpha: 0.28),
    };
  }

  // ── Tap handling ───────────────────────────────────────────────────────────

  Future<void> _handleTap() async {
    if (!_isEnabled) return;
    HapticFeedback.mediumImpact();
    _scaleCtrl.reverse().then((_) => _scaleCtrl.forward());
    widget.onTap?.call();
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final lang = ref.watch(localeProvider);
    final choiceText = widget.choice.localizedText(lang);

    return ScaleTransition(
      scale: _scaleAnim,
      child: GestureDetector(
        onTapDown: _isEnabled ? (_) => _scaleCtrl.reverse() : null,
        onTapUp: _isEnabled ? (_) => _handleTap() : null,
        onTapCancel: _isEnabled ? () => _scaleCtrl.forward() : null,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeOutCubic,
          height: 72,
          decoration: BoxDecoration(
            gradient: _gradient,
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: _borderColor, width: 2),
            boxShadow: _visual == _BtnVisual.correct ||
                    _visual == _BtnVisual.revealCorrect
                ? [
                    BoxShadow(
                      color: AppTheme.correct.withValues(alpha: 0.4),
                      blurRadius: 12,
                      spreadRadius: 1,
                    )
                  ]
                : _visual == _BtnVisual.wrong
                    ? [
                        BoxShadow(
                          color: AppTheme.wrong.withValues(alpha: 0.4),
                          blurRadius: 12,
                          spreadRadius: 1,
                        )
                      ]
                    : [
                        BoxShadow(
                          color: _idleAccent.withValues(alpha: 0.24),
                          blurRadius: 10,
                          spreadRadius: 0.5,
                        ),
                      ],
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Row(
              children: [
                // ── Label chip (A / B / C / D) ──────────────────────
                AnimatedContainer(
                  duration: const Duration(milliseconds: 280),
                  width: 32,
                  height: 32,
                  decoration: BoxDecoration(
                    color: _labelChipColor,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Center(
                    child: Text(
                      widget.label,
                      style: GoogleFonts.boogaloo(
                        fontSize: 17,
                        color: _visual == _BtnVisual.disabled
                            ? AppTheme.textMuted
                            : AppTheme.textWhite,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: 10),

                // ── Choice text (localised) ──────────────────────────
                Expanded(
                  child: Text(
                    choiceText,
                    style: AppTheme.answerStyle.copyWith(
                      fontSize: 18,
                      color: _visual == _BtnVisual.disabled
                          ? AppTheme.textMuted
                          : AppTheme.textWhite,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),

                // ── Result icon ──────────────────────────────────────
                if (_visual == _BtnVisual.correct ||
                    _visual == _BtnVisual.revealCorrect)
                  const Icon(Icons.check_circle, color: Colors.white, size: 22)
                else if (_visual == _BtnVisual.wrong)
                  const Icon(Icons.cancel, color: Colors.white, size: 22),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
