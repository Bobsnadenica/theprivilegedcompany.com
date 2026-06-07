import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/enums/app_language.dart';
import '../../../core/providers/audio_prefs_provider.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../models/question.dart';

// ─────────────────────────────────────────────────────────────────────────────
// QuestionCard — displays the current question text (and optional image).
//
// Reads [localeProvider] so it automatically shows the correct language
// (English or Bulgarian) without any extra plumbing from the parent.
//
// A small speaker button lets the player replay the TTS reading.
// When muted, the button shows a clear "sound is muted" state.
// ─────────────────────────────────────────────────────────────────────────────
class QuestionCard extends ConsumerWidget {
  const QuestionCard({
    super.key,
    required this.question,
    required this.onReplay,
  });

  final Question question;
  final VoidCallback onReplay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final lang = ref.watch(localeProvider);
    final muted = ref.watch(audioPrefsProvider);
    final questionText = question.localizedText(lang);
    final replayLabel =
        lang == AppLanguage.bulgarian ? 'Чети пак' : 'Read again';
    final mutedLabel =
        lang == AppLanguage.bulgarian ? 'Звукът е изключен' : 'Sound is muted';
    final categoryText = question.category ?? '';

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16),
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Colors.white.withValues(alpha: 0.16),
            Colors.white.withValues(alpha: 0.10),
          ],
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: Colors.white.withValues(alpha: 0.30),
          width: 1.5,
        ),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF67E8F9).withValues(alpha: 0.20),
            blurRadius: 18,
            spreadRadius: 1,
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (categoryText.isNotEmpty)
            Container(
              margin: const EdgeInsets.only(bottom: 10),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: 0.16),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                categoryText.toUpperCase(),
                style: GoogleFonts.nunito(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: AppTheme.textWhite,
                  letterSpacing: 0.7,
                ),
              ),
            ),

          // ── Optional image ───────────────────────────────────────────
          if (question.hasImage)
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.asset(
                question.imagePath!,
                height: 120,
                fit: BoxFit.contain,
                errorBuilder: (_, __, ___) => const SizedBox.shrink(),
              ),
            ),

          if (question.hasImage) const SizedBox(height: 12),

          // ── Question text (localised) ────────────────────────────────
          Text(
            questionText,
            style: AppTheme.questionStyle,
            textAlign: TextAlign.center,
          ),

          const SizedBox(height: 12),

          // ── Replay TTS button (localised label) ──────────────────────
          GestureDetector(
            onTap: muted ? null : onReplay,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: Colors.white.withValues(alpha: muted ? 0.08 : 0.16),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: Colors.white.withValues(alpha: muted ? 0.20 : 0.32),
                ),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(
                    muted ? Icons.volume_off_rounded : Icons.volume_up_rounded,
                    color: muted ? AppTheme.textMuted : AppTheme.goldLight,
                    size: 18,
                  ),
                  const SizedBox(width: 6),
                  Text(
                    muted ? mutedLabel : replayLabel,
                    style: GoogleFonts.nunito(
                      fontSize: 13,
                      color: muted ? AppTheme.textMuted : AppTheme.textWhite,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
