import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/audio_service.dart';
import '../services/tts_service.dart';

// ─────────────────────────────────────────────────────────────────────────────
// AudioPrefsNotifier — persistent mute toggle for gameplay narration + SFX.
//
// Behavior:
//   • Restores mute state from SharedPreferences.
//   • setMuted(true) immediately stops active TTS and audio.
//   • GameNotifier reads this provider before playing narration/jingles.
// ─────────────────────────────────────────────────────────────────────────────
class AudioPrefsNotifier extends Notifier<bool> {
  static const _prefKey = 'audio_muted';
  bool _restored = false;

  @override
  bool build() {
    // ignore: discarded_futures
    ensureLoaded();
    return false;
  }

  Future<void> ensureLoaded() async {
    if (_restored) return;
    _restored = true;
    try {
      final prefs = await SharedPreferences.getInstance();
      final savedMuted = prefs.getBool(_prefKey) ?? false;
      if (state != savedMuted) {
        state = savedMuted;
      }
      if (savedMuted) {
        await _silenceNow();
      }
    } catch (_) {
      // Preference restore failure is non-fatal.
    }
  }

  Future<void> toggleMuted() => setMuted(!state);

  Future<void> setMuted(bool muted) async {
    if (state == muted) return;
    state = muted;
    if (muted) {
      await _silenceNow();
    }
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setBool(_prefKey, muted);
    } catch (_) {
      // Persist failure is non-fatal; in-memory state is still applied.
    }
  }

  Future<void> _silenceNow() async {
    await TtsService.instance.stopAndClear();
    await AudioService.instance.stopAll();
  }
}

final audioPrefsProvider = NotifierProvider<AudioPrefsNotifier, bool>(
  AudioPrefsNotifier.new,
);
