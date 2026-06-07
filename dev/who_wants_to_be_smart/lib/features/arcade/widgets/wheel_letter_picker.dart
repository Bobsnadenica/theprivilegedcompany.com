import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/theme/app_theme.dart';

// ─────────────────────────────────────────────────────────────────────────────
// A single cylindrical letter wheel — one per character in the 3-letter name.
// Uses ListWheelScrollView with a glass-strip selection highlight and haptic
// feedback on every item change.
// ─────────────────────────────────────────────────────────────────────────────
class WheelLetterPicker extends StatelessWidget {
  const WheelLetterPicker({
    super.key,
    required this.controller,
    required this.onChanged,
    this.isHighlighted = false,
  });

  final FixedExtentScrollController controller;
  final ValueChanged<String> onChanged;

  /// Pulses the border gold when this wheel is the "active" one.
  final bool isHighlighted;

  static const double _itemExtent = 64.0;
  static const double _containerHeight = 224.0;
  static const double _containerWidth = 76.0;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: AppConstants.shortAnim,
      width: _containerWidth,
      height: _containerHeight,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isHighlighted ? AppTheme.gold : AppTheme.bgSurface,
          width: 2.5,
        ),
        gradient: const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [
            Color(0xCC0A0A2E),
            Color(0xFF16155A),
            Color(0xCC0A0A2E),
          ],
          stops: [0.0, 0.5, 1.0],
        ),
        boxShadow: isHighlighted ? AppTheme.goldGlow : AppTheme.cardShadow,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(14),
        child: Stack(
          children: [
            // ── The actual scroll wheel ──────────────────────────────────
            ListWheelScrollView.useDelegate(
              controller: controller,
              itemExtent: _itemExtent,
              perspective: 0.004,
              diameterRatio: 1.6,
              squeeze: 1.1,
              physics: const FixedExtentScrollPhysics(),
              onSelectedItemChanged: (index) {
                HapticFeedback.selectionClick();
                onChanged(AppConstants.alphabet[index]);
              },
              childDelegate: ListWheelChildBuilderDelegate(
                childCount: AppConstants.alphabet.length,
                builder: (context, index) =>
                    _LetterItem(letter: AppConstants.alphabet[index]),
              ),
            ),

            // ── Top fade ────────────────────────────────────────────────
            Positioned(
              top: 0,
              left: 0,
              right: 0,
              height: _itemExtent,
              child: IgnorePointer(
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Color(0xDD0A0A2E), Colors.transparent],
                    ),
                  ),
                ),
              ),
            ),

            // ── Bottom fade ──────────────────────────────────────────────
            Positioned(
              bottom: 0,
              left: 0,
              right: 0,
              height: _itemExtent,
              child: IgnorePointer(
                child: Container(
                  decoration: const BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.bottomCenter,
                      end: Alignment.topCenter,
                      colors: [Color(0xDD0A0A2E), Colors.transparent],
                    ),
                  ),
                ),
              ),
            ),

            // ── Selected-item gold highlight strip ───────────────────────
            IgnorePointer(
              child: Center(
                child: Container(
                  height: _itemExtent,
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  decoration: BoxDecoration(
                    color: AppTheme.wheelHighlight,
                    borderRadius: BorderRadius.circular(8),
                    border: const Border(
                      top: BorderSide(color: AppTheme.gold, width: 1.5),
                      bottom: BorderSide(color: AppTheme.gold, width: 1.5),
                    ),
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

// ─────────────────────────────────────────────────────────────────────────────
// Individual letter cell — animated brightness based on scroll proximity
// is handled automatically by the ListWheelScrollView's cylindrical render.
// ─────────────────────────────────────────────────────────────────────────────
class _LetterItem extends StatelessWidget {
  const _LetterItem({required this.letter});

  final String letter;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Text(
        letter,
        style: AppTheme.wheelLetterStyle,
      ),
    );
  }
}
