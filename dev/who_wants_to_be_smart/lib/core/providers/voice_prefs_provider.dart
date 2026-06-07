import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/voice_settings.dart';
import '../services/tts_service.dart';

// ─────────────────────────────────────────────────────────────────────────────
// VoicePrefsNotifier — persistent kid narration settings.
//
// Controls:
//   • preset (Gentle / Calm / Story)
//   • speed scale
//   • pause before choices
//
// Every update is applied immediately to TTS so gameplay reflects changes live.
// ─────────────────────────────────────────────────────────────────────────────
class VoicePrefsNotifier extends Notifier<VoiceSettingsState> {
  static const _presetKey = 'voice_preset';
  static const _speedKey = 'voice_speed_scale';
  static const _pauseKey = 'voice_pause_before_answers_ms';

  bool _restored = false;

  @override
  VoiceSettingsState build() {
    // ignore: discarded_futures
    ensureLoaded();
    // ignore: discarded_futures
    _applyToTts(VoiceSettingsState.defaults);
    return VoiceSettingsState.defaults;
  }

  Future<void> ensureLoaded() async {
    if (_restored) return;
    _restored = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final presetName = prefs.getString(_presetKey);
      final speedScale = prefs.getDouble(_speedKey);
      final pauseMs = prefs.getInt(_pauseKey);

      final preset = _presetFromString(presetName) ?? state.preset;
      final resolvedSpeed = (speedScale ?? state.speedScale).clamp(0.85, 1.2);
      final resolvedPause = (pauseMs ?? state.pauseBeforeAnswersMs);

      state = state.copyWith(
        preset: preset,
        speedScale: resolvedSpeed.toDouble(),
        pauseBeforeAnswersMs: resolvedPause,
      );
      await _applyToTts(state);
    } catch (_) {
      // Restore failure is non-fatal.
      await _applyToTts(state);
    }
  }

  Future<void> setPreset(VoiceNarrationPreset preset) async {
    if (state.preset == preset) return;
    state = state.copyWith(preset: preset);
    await _applyToTts(state);
    await _saveState();
  }

  Future<void> setSpeedScale(double speedScale, {bool persist = true}) async {
    final clamped = speedScale.clamp(0.85, 1.2).toDouble();
    state = state.copyWith(speedScale: clamped);
    await _applyToTts(state);
    if (persist) {
      await _saveState();
    }
  }

  Future<void> setPauseBeforeAnswers(
    int pauseMs, {
    bool persist = true,
  }) async {
    final clamped = pauseMs.clamp(1000, 2600);
    state = state.copyWith(pauseBeforeAnswersMs: clamped);
    await _applyToTts(state);
    if (persist) {
      await _saveState();
    }
  }

  Future<void> _applyToTts(VoiceSettingsState settings) {
    return TtsService.instance.updateNarrationConfig(
      speechRate: settings.speechRate,
      speechPitch: settings.speechPitch,
      speechVolume: settings.speechVolume,
      pauseBeforeChoices: settings.pauseBeforeChoices,
      pauseBetweenChoices: settings.pauseBetweenChoices,
    );
  }

  Future<void> _saveState() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_presetKey, state.preset.name);
      await prefs.setDouble(_speedKey, state.speedScale);
      await prefs.setInt(_pauseKey, state.pauseBeforeAnswersMs);
    } catch (_) {
      // Persist failure is non-fatal.
    }
  }

  VoiceNarrationPreset? _presetFromString(String? name) {
    if (name == null || name.isEmpty) return null;
    try {
      return VoiceNarrationPreset.values.byName(name);
    } catch (_) {
      return null;
    }
  }
}

final voicePrefsProvider =
    NotifierProvider<VoicePrefsNotifier, VoiceSettingsState>(
  VoicePrefsNotifier.new,
);
