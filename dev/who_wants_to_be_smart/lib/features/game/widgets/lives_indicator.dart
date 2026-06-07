import 'package:flutter/material.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────────────────────
// LivesIndicator — a row of heart icons representing remaining lives.
// Lost lives are shown as broken hearts with a fade animation.
// ─────────────────────────────────────────────────────────────────────────────
class LivesIndicator extends StatelessWidget {
  const LivesIndicator({super.key, required this.lives});

  final int lives;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: List.generate(AppConstants.maxLives, (i) {
        final isAlive = i < lives;
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 2),
          child: AnimatedSwitcher(
            duration: AppConstants.mediumAnim,
            transitionBuilder: (child, animation) => ScaleTransition(
              scale: animation,
              child: child,
            ),
            child: Container(
              key: ValueKey('heart_${i}_$isAlive'),
              width: 28,
              height: 28,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: Colors.white.withValues(alpha: 0.12),
              ),
              child: Icon(
                isAlive ? Icons.favorite : Icons.favorite_border,
                color: isAlive ? AppTheme.wrong : AppTheme.textMuted,
                size: 18,
                shadows: isAlive
                    ? [
                        Shadow(
                          color: AppTheme.wrong.withValues(alpha: 0.75),
                          blurRadius: 7,
                        )
                      ]
                    : null,
              ),
            ),
          ),
        );
      }),
    );
  }
}
