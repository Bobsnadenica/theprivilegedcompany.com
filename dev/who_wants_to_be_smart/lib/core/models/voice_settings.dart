// ─────────────────────────────────────────────────────────────────────────────
// Voice settings model used by the in-app narration controls.
// ─────────────────────────────────────────────────────────────────────────────

enum VoiceNarrationPreset { gentle, calm, story }

extension VoiceNarrationPresetX on VoiceNarrationPreset {
  String get label => switch (this) {
        VoiceNarrationPreset.gentle => 'Gentle',
        VoiceNarrationPreset.calm => 'Calm',
        VoiceNarrationPreset.story => 'Story',
      };

  String get subtitle => switch (this) {
        VoiceNarrationPreset.gentle => 'Balanced and soft for daily play',
        VoiceNarrationPreset.calm => 'Extra soft and slower pace',
        VoiceNarrationPreset.story => 'A bit brighter and more expressive',
      };

  String get emoji => switch (this) {
        VoiceNarrationPreset.gentle => '🌼',
        VoiceNarrationPreset.calm => '🌙',
        VoiceNarrationPreset.story => '📖',
      };

  double get baseRate => switch (this) {
        VoiceNarrationPreset.gentle => 0.18,
        VoiceNarrationPreset.calm => 0.16,
        VoiceNarrationPreset.story => 0.20,
      };

  double get basePitch => switch (this) {
        VoiceNarrationPreset.gentle => 1.08,
        VoiceNarrationPreset.calm => 1.00,
        VoiceNarrationPreset.story => 1.13,
      };

  double get baseVolume => switch (this) {
        VoiceNarrationPreset.gentle => 0.82,
        VoiceNarrationPreset.calm => 0.80,
        VoiceNarrationPreset.story => 0.86,
      };
}

class VoiceSettingsState {
  const VoiceSettingsState({
    this.preset = VoiceNarrationPreset.gentle,
    this.speedScale = 1.0,
    this.pauseBeforeAnswersMs = 1650,
  });

  final VoiceNarrationPreset preset;
  final double speedScale;
  final int pauseBeforeAnswersMs;

  static const defaults = VoiceSettingsState();

  double get speechRate =>
      (preset.baseRate * speedScale).clamp(0.14, 0.28).toDouble();
  double get speechPitch => preset.basePitch.clamp(0.9, 1.2).toDouble();
  double get speechVolume => preset.baseVolume.clamp(0.65, 0.95).toDouble();

  Duration get pauseBeforeChoices => Duration(
        milliseconds: pauseBeforeAnswersMs.clamp(1000, 2600),
      );

  Duration get pauseBetweenChoices {
    final ms = (pauseBeforeChoices.inMilliseconds * 0.38).round();
    return Duration(milliseconds: ms.clamp(420, 920));
  }

  VoiceSettingsState copyWith({
    VoiceNarrationPreset? preset,
    double? speedScale,
    int? pauseBeforeAnswersMs,
  }) =>
      VoiceSettingsState(
        preset: preset ?? this.preset,
        speedScale: speedScale ?? this.speedScale,
        pauseBeforeAnswersMs: pauseBeforeAnswersMs ?? this.pauseBeforeAnswersMs,
      );
}
