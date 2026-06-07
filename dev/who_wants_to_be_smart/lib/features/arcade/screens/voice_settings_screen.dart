import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/localization/simple_text.dart';
import '../../../core/models/voice_settings.dart';
import '../../../core/providers/audio_prefs_provider.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/providers/voice_prefs_provider.dart';
import '../../../core/services/tts_service.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/joyful_kids_background.dart';

class VoiceSettingsScreen extends ConsumerStatefulWidget {
  const VoiceSettingsScreen({super.key});
  static const routeName = '/voice-settings';

  @override
  ConsumerState<VoiceSettingsScreen> createState() =>
      _VoiceSettingsScreenState();
}

class _VoiceSettingsScreenState extends ConsumerState<VoiceSettingsScreen> {
  bool _previewing = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      // ignore: discarded_futures
      ref.read(voicePrefsProvider.notifier).ensureLoaded();
    });
  }

  @override
  void dispose() {
    TtsService.instance.stopAndClear();
    super.dispose();
  }

  Future<void> _previewVoice() async {
    if (_previewing) return;
    final muted = ref.read(audioPrefsProvider);
    if (muted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            tr(
              ref.read(localeProvider),
              'Unmute audio to preview narration.',
              'Включи звука, за да чуеш гласовата проба.',
            ),
          ),
        ),
      );
      return;
    }

    final lang = ref.read(localeProvider);
    setState(() => _previewing = true);
    try {
      await TtsService.instance.speakPreview(locale: lang.locale);
    } finally {
      if (mounted) setState(() => _previewing = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final voice = ref.watch(voicePrefsProvider);
    final notifier = ref.read(voicePrefsProvider.notifier);
    final lang = ref.watch(localeProvider);

    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: JoyfulKidsBackground()),
          Container(
            decoration: const BoxDecoration(gradient: AppTheme.bgGradient),
            child: SafeArea(
              child: Column(
                children: [
                  _Header(
                    title: tr(lang, 'Voice Settings', 'Настройки на гласа'),
                    onBack: () => Navigator.of(context).pop(),
                  ),
                  Expanded(
                    child: SingleChildScrollView(
                      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          _SectionTitle(
                            title: tr(lang, 'Narration style', 'Стил на гласа'),
                            subtitle: tr(
                              lang,
                              'Choose the overall voice feeling.',
                              'Избери общото звучене на гласа.',
                            ),
                          ),
                          const SizedBox(height: 10),
                          ...VoiceNarrationPreset.values.map(
                            (preset) => Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: _PresetTile(
                                preset: preset,
                                selected: preset == voice.preset,
                                onTap: () => notifier.setPreset(preset),
                              ),
                            ),
                          ),
                          const SizedBox(height: 14),
                          _SectionTitle(
                            title:
                                tr(lang, 'Narration speed', 'Скорост на гласа'),
                            subtitle:
                                '${(voice.speedScale * 100).toStringAsFixed(0)}%',
                          ),
                          _SliderCard(
                            child: Slider(
                              value: voice.speedScale,
                              min: 0.85,
                              max: 1.20,
                              divisions: 7,
                              label:
                                  '${(voice.speedScale * 100).toStringAsFixed(0)}%',
                              onChanged: (v) =>
                                  notifier.setSpeedScale(v, persist: false),
                              onChangeEnd: (v) =>
                                  notifier.setSpeedScale(v, persist: true),
                            ),
                          ),
                          const SizedBox(height: 12),
                          _SectionTitle(
                            title: tr(lang, 'Pause before answers',
                                'Пауза преди отговорите'),
                            subtitle:
                                '${voice.pauseBeforeChoices.inMilliseconds} ms',
                          ),
                          _SliderCard(
                            child: Slider(
                              value: voice.pauseBeforeChoices.inMilliseconds
                                  .toDouble(),
                              min: 1000,
                              max: 2600,
                              divisions: 16,
                              label:
                                  '${voice.pauseBeforeChoices.inMilliseconds} ms',
                              onChanged: (v) => notifier.setPauseBeforeAnswers(
                                v.round(),
                                persist: false,
                              ),
                              onChangeEnd: (v) =>
                                  notifier.setPauseBeforeAnswers(
                                v.round(),
                                persist: true,
                              ),
                            ),
                          ),
                          const SizedBox(height: 16),
                          GestureDetector(
                            onTap: _previewing ? null : _previewVoice,
                            child: Container(
                              width: double.infinity,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              decoration: BoxDecoration(
                                gradient: AppTheme.goldGradient,
                                borderRadius: BorderRadius.circular(16),
                                boxShadow: AppTheme.goldGlow,
                              ),
                              child: Center(
                                child: _previewing
                                    ? SizedBox(
                                        width: 22,
                                        height: 22,
                                        child: CircularProgressIndicator(
                                          color: AppTheme.bgDark
                                              .withValues(alpha: 0.85),
                                          strokeWidth: 2.4,
                                        ),
                                      )
                                    : Text(
                                        tr(lang, 'Preview Voice',
                                            'Проба на гласа'),
                                        style: GoogleFonts.boogaloo(
                                          fontSize: 24,
                                          color: AppTheme.bgDark,
                                          letterSpacing: 0.8,
                                        ),
                                      ),
                              ),
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            tr(
                              lang,
                              'Preview reads a short sample question and answers.',
                              'Пробата прочита кратък въпрос и отговорите.',
                            ),
                            style: AppTheme.mutedStyle,
                          ),
                        ],
                      ),
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

class _Header extends StatelessWidget {
  const _Header({required this.onBack, required this.title});

  final VoidCallback onBack;
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Row(
        children: [
          GestureDetector(
            onTap: onBack,
            child: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: AppTheme.bgSurface,
                shape: BoxShape.circle,
                border: Border.all(color: AppTheme.gold.withValues(alpha: 0.5)),
              ),
              child: const Icon(
                Icons.arrow_back_ios_new,
                color: AppTheme.gold,
                size: 18,
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              title,
              style: AppTheme.titleStyle.copyWith(fontSize: 26),
            ),
          ),
          const Text('🎙️', style: TextStyle(fontSize: 28)),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle({required this.title, required this.subtitle});

  final String title;
  final String subtitle;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: AppTheme.headlineStyle.copyWith(fontSize: 22)),
        const SizedBox(height: 2),
        Text(subtitle, style: AppTheme.mutedStyle),
      ],
    );
  }
}

class _PresetTile extends StatelessWidget {
  const _PresetTile({
    required this.preset,
    required this.selected,
    required this.onTap,
  });

  final VoiceNarrationPreset preset;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 220),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          color: selected ? AppTheme.bgSurface : AppTheme.bgCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
            color: selected
                ? AppTheme.gold.withValues(alpha: 0.8)
                : AppTheme.bgSurface,
          ),
        ),
        child: Row(
          children: [
            Text(preset.emoji, style: const TextStyle(fontSize: 20)),
            const SizedBox(width: 10),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    preset.label,
                    style: AppTheme.bodyStyle.copyWith(
                      fontWeight: FontWeight.w800,
                      color: selected ? AppTheme.goldLight : AppTheme.textWhite,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    preset.subtitle,
                    style: AppTheme.mutedStyle.copyWith(fontSize: 12),
                  ),
                ],
              ),
            ),
            if (selected)
              const Icon(Icons.check_circle_rounded,
                  color: AppTheme.gold, size: 18),
          ],
        ),
      ),
    );
  }
}

class _SliderCard extends StatelessWidget {
  const _SliderCard({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.bgSurface),
      ),
      child: child,
    );
  }
}
