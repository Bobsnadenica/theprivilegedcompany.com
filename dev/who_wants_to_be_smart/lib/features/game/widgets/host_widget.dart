import 'package:flutter/material.dart';
import 'package:lottie/lottie.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_theme.dart';
import '../models/game_session.dart';

// ─────────────────────────────────────────────────────────────────────────────
// HostWidget — the animated game-show host character.
//
// Tries to load a Lottie JSON asset for each phase:
//   assets/animations/host_idle.json       → playing
//   assets/animations/host_celebrate.json  → correct answer / complete
//   assets/animations/host_sad.json        → wrong answer / game over
//
// If the asset does not exist (e.g. during development), the widget falls
// back to the _EmojiFallback implementation automatically via errorBuilder.
//
// To add a real character: drop the .json files into assets/animations/
// and re-run the app — no code changes required.
// ─────────────────────────────────────────────────────────────────────────────
class HostWidget extends StatefulWidget {
  const HostWidget({
    super.key,
    required this.phase,
    this.lastAnswerWasCorrect,
  });

  final GamePhase phase;
  final bool? lastAnswerWasCorrect;

  @override
  State<HostWidget> createState() => _HostWidgetState();
}

class _HostWidgetState extends State<HostWidget>
    with SingleTickerProviderStateMixin {
  late final AnimationController _lottieCtrl;

  @override
  void initState() {
    super.initState();
    _lottieCtrl = AnimationController(vsync: this);
  }

  @override
  void dispose() {
    _lottieCtrl.dispose();
    super.dispose();
  }

  // ── Lottie asset key ───────────────────────────────────────────────────────

  String get _animKey {
    if (widget.phase == GamePhase.answerRevealed) {
      return (widget.lastAnswerWasCorrect ?? false)
          ? 'celebrate'
          : 'sad';
    }
    return switch (widget.phase) {
      GamePhase.complete => 'celebrate',
      GamePhase.gameOver => 'sad',
      _ => 'idle',
    };
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return AnimatedSwitcher(
      duration: AppConstants.mediumAnim,
      child: KeyedSubtree(
        key: ValueKey(_animKey),
        child: Lottie.asset(
          'assets/animations/host_$_animKey.json',
          controller: _lottieCtrl,
          width: 90,
          height: 90,
          fit: BoxFit.contain,
          onLoaded: (composition) {
            _lottieCtrl
              ..duration = composition.duration
              ..repeat();
          },
          // Graceful fallback when .json file is not present.
          errorBuilder: (_, __, ___) =>
              _EmojiFallback(phase: widget.phase, animKey: _animKey),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// _EmojiFallback — bouncing emoji used until Lottie assets are provided.
// ─────────────────────────────────────────────────────────────────────────────
class _EmojiFallback extends StatefulWidget {
  const _EmojiFallback({required this.phase, required this.animKey});

  final GamePhase phase;
  final String animKey;

  @override
  State<_EmojiFallback> createState() => _EmojiFallbackState();
}

class _EmojiFallbackState extends State<_EmojiFallback>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    final isRevealed = widget.animKey != 'idle';
    _ctrl = AnimationController(
      vsync: this,
      duration: Duration(milliseconds: isRevealed ? 300 : 700),
    )..repeat(reverse: true);
    _anim = Tween<double>(begin: -4, end: 4).animate(
      CurvedAnimation(parent: _ctrl, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  String get _emoji => switch (widget.animKey) {
        'celebrate' => '🥳',
        'sad' => '😢',
        _ => '🎤',
      };

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _anim,
      builder: (_, child) =>
          Transform.translate(offset: Offset(0, _anim.value), child: child),
      child: Container(
        width: 80,
        height: 80,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: AppTheme.bgSurface,
          boxShadow: [
            BoxShadow(
              color: AppTheme.gold.withValues(alpha: 0.3),
              blurRadius: 16,
              spreadRadius: 2,
            ),
          ],
        ),
        child: Center(
          child: Text(_emoji, style: const TextStyle(fontSize: 40)),
        ),
      ),
    );
  }
}
