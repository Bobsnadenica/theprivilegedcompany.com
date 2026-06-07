import 'package:flutter/foundation.dart';
import 'package:just_audio/just_audio.dart';

// ─────────────────────────────────────────────────────────────────────────────
// AudioService — thin singleton around just_audio.
//
// Two players are maintained to allow overlapping feedback sounds:
//   _ui    — UI jingles (correct / wrong / game-over)
//   _choice — per-choice "answer sound" (e.g. "Moo" for a cow question)
//
// Phase 2: asset files may not exist yet; every call fails gracefully.
// Phase 3: .zip packs ship real audio files wired through _playFile().
// ─────────────────────────────────────────────────────────────────────────────
class AudioService {
  AudioService._();
  static final AudioService instance = AudioService._();

  final AudioPlayer _ui = AudioPlayer();
  final AudioPlayer _choice = AudioPlayer();

  // ── Internal helpers ───────────────────────────────────────────────────────

  Future<void> _playAsset(AudioPlayer player, String path) async {
    try {
      await player.stop();
      await player.setAsset(path);
      await player.seek(Duration.zero);
      await player.play();
    } catch (e) {
      // Asset missing in Phase 2 — fail silently.
      debugPrint('[Audio] $path not found: $e');
    }
  }

  Future<void> _playFile(AudioPlayer player, String absolutePath) async {
    try {
      await player.stop();
      await player.setFilePath(absolutePath);
      await player.seek(Duration.zero);
      await player.play();
    } catch (e) {
      debugPrint('[Audio] file $absolutePath failed: $e');
    }
  }

  // ── UI sounds ──────────────────────────────────────────────────────────────

  Future<void> playCorrect() => _playAsset(_ui, 'assets/audio/correct.wav');

  Future<void> playWrong() => _playAsset(_ui, 'assets/audio/wrong.wav');

  Future<void> playGameOver() => _playAsset(_ui, 'assets/audio/game_over.wav');

  Future<void> playComplete() => _playAsset(_ui, 'assets/audio/complete.wav');

  Future<void> playCountdown() => _playAsset(_ui, 'assets/audio/countdown.wav');

  // ── Per-choice sounds (DLC) ────────────────────────────────────────────────

  /// [localPath] is the absolute path extracted from a DLC .zip.
  Future<void> playChoiceSound(String localPath) =>
      _playFile(_choice, localPath);

  Future<void> stopChoice() async {
    try {
      await _choice.stop();
    } catch (_) {}
  }

  Future<void> stopAll() async {
    try {
      await _ui.stop();
    } catch (_) {}
    try {
      await _choice.stop();
    } catch (_) {}
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  void dispose() {
    _ui.dispose();
    _choice.dispose();
  }
}
