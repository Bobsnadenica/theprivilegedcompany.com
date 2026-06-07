import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_tts/flutter_tts.dart';

// ─────────────────────────────────────────────────────────────────────────────
// TtsService — singleton wrapper around flutter_tts.
//
// Kid-optimised voice settings:
//   • rate   0.18  — slower for young learners
//   • pitch  1.08  — calmer feminine tone
//   • volume 0.82  — gentle but clear loudness
//
// Voice selection:
//   • Prefer locale-matching female voices.
//   • Prefer higher quality voices when reported by the platform.
//   • Avoid novelty/robotic voice variants when possible.
//
// ── Why no awaitSpeakCompletion(true) ────────────────────────────────────────
// With awaitSpeakCompletion(true), calling stop() while speak() is in-flight
// can deadlock on some platforms: stop() waits for the same native callback
// that speak() is waiting for, so neither ever resolves.
//
// Instead we use a per-utterance Completer<void>:
//   • speak() returns immediately (awaitSpeakCompletion = false)
//   • The completion / cancel / error handlers complete the Completer
//   • stopAndClear() also completes it synchronously, so the caller is
//     unblocked BEFORE the platform round-trip for stop() completes
//
// ── Cancellation ─────────────────────────────────────────────────────────────
// Call stopAndClear() to abort any in-progress speakQuestion() chain.
// A generation token invalidates stale chains between awaited steps so older
// sequences cannot continue after a newer speak call starts.
// ─────────────────────────────────────────────────────────────────────────────
class TtsService {
  TtsService._();
  static final TtsService instance = TtsService._();

  final FlutterTts _tts = FlutterTts();
  bool _initialized = false;

  /// Monotonic generation id used to cancel stale speech chains safely.
  /// Every new public speak call gets a fresh generation.
  /// [stopAndClear] also increments it, instantly making in-flight chains stale.
  int _generation = 0;

  /// Completer for the utterance currently being spoken.
  /// Resolved by platform completion / cancel / error handlers, OR immediately
  /// by [stopAndClear] to unblock any awaiting [_utterOne] without delay.
  Completer<void>? _utterCompleter;

  String _currentLocale = 'en-US';

  static const _defaultSpeechRate = 0.18;
  static const _defaultSpeechVolume = 0.82;
  static const _defaultSpeechPitch = 1.08;
  static const _defaultPauseBeforeChoices = Duration(milliseconds: 1650);
  static const _defaultPauseBetweenChoices = Duration(milliseconds: 640);

  static const _choiceLabels = ['A', 'B', 'C', 'D'];
  static const _stopTimeout = Duration(milliseconds: 900);
  double _speechRate = _defaultSpeechRate;
  double _speechVolume = _defaultSpeechVolume;
  double _speechPitch = _defaultSpeechPitch;
  Duration _pauseBeforeChoices = _defaultPauseBeforeChoices;
  Duration _pauseBetweenChoices = _defaultPauseBetweenChoices;

  static const _noveltyHints = [
    'zarvox',
    'good news',
    'bad news',
    'hysterical',
    'boing',
    'bells',
    'whisper',
    'trinoids',
    'cellos',
    'organ',
    'deranged',
  ];

  static const _maleHints = [
    'male',
    'man',
    'boy',
    'thomas',
    'daniel',
    'fred',
    'jorge',
  ];

  static const _compactHints = ['compact'];

  static const _calmHints = [
    'samantha',
    'ava',
    'allison',
    'victoria',
    'sofia',
    'karen',
    'moira',
    'emma',
    'olivia',
    'zira',
    'aria',
    'milena',
    'maria',
    'irina',
  ];

  // ── Setup ──────────────────────────────────────────────────────────────────

  Future<void> _ensureInitialized() async {
    if (_initialized) return;
    try {
      await _tts.setLanguage(_currentLocale);
      await _applySpeechProfile();

      // DO NOT use awaitSpeakCompletion(true) — see module comment above.
      await _tts.awaitSpeakCompletion(false);

      // Wire platform callbacks to our Completer.
      _tts.setCompletionHandler(_onUtteranceComplete);
      _tts.setCancelHandler(_onUtteranceComplete);
      _tts.setErrorHandler((_) => _onUtteranceComplete());

      // iOS tends to sound more consistent with a shared speech instance.
      if (defaultTargetPlatform == TargetPlatform.iOS) {
        try {
          await _tts.setSharedInstance(true);
        } catch (_) {}
        try {
          await _tts.setIosAudioCategory(
            IosTextToSpeechAudioCategory.playback,
            const [
              IosTextToSpeechAudioCategoryOptions.mixWithOthers,
              IosTextToSpeechAudioCategoryOptions.allowBluetooth,
              IosTextToSpeechAudioCategoryOptions.allowBluetoothA2DP,
            ],
          );
        } catch (_) {}
      }

      // Try to select a clear, gentle female voice for the active locale.
      await _selectVoice(_currentLocale);

      _initialized = true;
    } catch (e) {
      debugPrint('[TTS] init failed: $e');
    }
  }

  // ── Platform callback ──────────────────────────────────────────────────────

  void _onUtteranceComplete() {
    final c = _utterCompleter;
    _utterCompleter = null;
    if (c != null && !c.isCompleted) c.complete();
  }

  Future<void> _stopWithTimeout(String context) async {
    try {
      await _tts.stop().timeout(_stopTimeout);
    } on TimeoutException {
      debugPrint(
        '[TTS] stop timed out in $context after '
        '${_stopTimeout.inMilliseconds}ms',
      );
    } catch (e) {
      debugPrint('[TTS] stop failed in $context: $e');
    }
  }

  // ── Voice selection ────────────────────────────────────────────────────────

  Future<void> _applySpeechProfile() async {
    await _tts.setSpeechRate(_speechRate);
    await _tts.setVolume(_speechVolume);
    await _tts.setPitch(_speechPitch);
  }

  int _preferredNameScore(String nameLower, List<String> orderedNames) {
    final idx = orderedNames.indexWhere(nameLower.contains);
    if (idx == -1) return 0;
    // Earlier names in the list are preferred.
    return (orderedNames.length - idx) * 22;
  }

  int _voiceScore(
    Map<Object?, Object?> voice, {
    required String locale,
    required List<String> preferredNames,
  }) {
    final localeLower = locale.toLowerCase();
    final langCode = localeLower.split('-').first;

    final voiceLocale = (voice['locale']?.toString() ?? '').toLowerCase();
    final nameLower = (voice['name']?.toString() ?? '').toLowerCase();
    final idLower = (voice['identifier']?.toString() ?? '').toLowerCase();
    final genderLower = (voice['gender']?.toString() ?? '').toLowerCase();
    final qualityLower = (voice['quality']?.toString() ?? '').toLowerCase();
    final qualityNum = int.tryParse(qualityLower);
    final networkRequired = voice['network_required'] == true;
    final latencyNum = int.tryParse(voice['latency']?.toString() ?? '');

    var score = 0;

    // Locale fit is the strongest signal.
    if (voiceLocale == localeLower) {
      score += 280;
    } else if (voiceLocale.startsWith(langCode)) {
      score += 180;
    } else {
      score -= 420;
    }

    // Female voices are preferred for this game narrator style.
    final femaleByGender = genderLower.contains('female') || genderLower == 'f';
    final femaleByName = preferredNames.any(nameLower.contains) ||
        idLower.contains('siri_female');
    if (femaleByGender || femaleByName) {
      score += 170;
    }

    if (_calmHints.any(nameLower.contains)) {
      score += 80;
    }

    final maleHit = _maleHints.any(
      (h) =>
          nameLower.contains(h) ||
          idLower.contains(h) ||
          genderLower.contains(h),
    );
    if (maleHit) {
      score -= 130;
    }

    score += _preferredNameScore(nameLower, preferredNames);

    // Quality hints from iOS/macOS or Android.
    if (qualityLower.contains('premium')) {
      score += 150;
    } else if (qualityLower.contains('enhanced')) {
      score += 110;
    } else if (qualityNum != null) {
      // Android quality constants are usually 100..500.
      if (qualityNum >= 500) {
        score += 140;
      } else if (qualityNum >= 400) {
        score += 95;
      } else if (qualityNum >= 300) {
        score += 55;
      } else {
        score += (qualityNum / 30).round();
      }
    }

    if (latencyNum != null) {
      // Lower latency feels smoother in gameplay transitions.
      score += (60 - latencyNum).clamp(-60, 35).toInt();
    }

    // Avoid online-only voices to keep latency predictable in classrooms.
    if (networkRequired) score -= 180;

    final compactHit = _compactHints.any(
      (h) => idLower.contains(h) || nameLower.contains(h),
    );
    if (compactHit) score -= 90;

    // De-prioritize novelty voices that can sound harsh or robotic for kids.
    final noveltyHit = _noveltyHints.any(
      (h) => nameLower.contains(h) || idLower.contains(h),
    );
    if (noveltyHit) score -= 220;

    return score;
  }

  Future<void> _selectVoice(String locale) async {
    try {
      final rawVoices = await _tts.getVoices;
      if (rawVoices is! List || rawVoices.isEmpty) return;

      final voices = rawVoices.cast<Map>().cast<Map<Object?, Object?>>();

      // Preferred gentle female names, ordered by priority.
      const enFemale = [
        'ava',
        'samantha',
        'allison',
        'victoria',
        'sofia',
        'emma',
        'olivia',
        'moira',
        'karen',
        'tessa',
        'zira',
        'aria',
        'joanna',
        'kendra',
        'nora',
        'natasha',
        'susan',
        'siri female',
      ];
      const bgFemale = ['milena', 'daria', 'irina', 'sofia', 'maria'];
      final preferred = locale.startsWith('bg') ? bgFemale : enFemale;

      Map<Object?, Object?>? best;
      var bestScore = -1 << 30;
      for (final v in voices) {
        final score = _voiceScore(
          v,
          locale: locale,
          preferredNames: preferred,
        );
        if (score > bestScore) {
          best = v;
          bestScore = score;
        }
      }

      if (best != null) {
        final payload = <String, String>{};
        final identifier = best['identifier']?.toString() ?? '';
        final name = best['name']?.toString() ?? '';
        final voiceLocale = best['locale']?.toString() ?? '';

        if (identifier.isNotEmpty) payload['identifier'] = identifier;
        if (name.isNotEmpty) payload['name'] = name;
        if (voiceLocale.isNotEmpty) payload['locale'] = voiceLocale;

        if (payload.isNotEmpty) {
          await _tts.setVoice(payload);
          debugPrint(
            '[TTS] selected voice: '
            '${best['name'] ?? 'unknown'} '
            '(${best['locale'] ?? 'unknown'}) '
            'score=$bestScore',
          );
        }
      }
    } catch (_) {
      // Voice list unavailable on this platform — use system default.
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  int _beginGeneration() => ++_generation;
  bool _isCurrent(int generation) => generation == _generation;

  /// Speaks a single utterance and waits for it to finish (or be cancelled).
  /// Returns immediately when [generation] is stale.
  Future<void> _utterOne(String text, int generation) async {
    if (!_isCurrent(generation) || text.trim().isEmpty) return;
    try {
      final completer = Completer<void>();
      _utterCompleter = completer;
      // speak() returns immediately with awaitSpeakCompletion(false).
      await _tts.speak(text);
      if (!_isCurrent(generation)) return;
      // Await our own Completer — resolved by the platform handler or stopAndClear.
      await completer.future;
    } catch (e) {
      _onUtteranceComplete(); // ensure the Completer never hangs
      debugPrint('[TTS] utterOne failed: $e');
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /// Switches the TTS language and re-selects a matching female voice.
  /// Safe to call before or after initialisation.
  Future<void> setLocale(String locale) async {
    _currentLocale = locale;
    try {
      if (_initialized) {
        await _tts.setLanguage(locale);
        await _applySpeechProfile();
        await _selectVoice(locale);
      }
    } catch (e) {
      debugPrint('[TTS] setLocale failed: $e');
    }
  }

  /// Applies runtime narration settings from voice preferences.
  Future<void> updateNarrationConfig({
    required double speechRate,
    required double speechPitch,
    required double speechVolume,
    required Duration pauseBeforeChoices,
    required Duration pauseBetweenChoices,
  }) async {
    _speechRate = speechRate.clamp(0.12, 0.32).toDouble();
    _speechPitch = speechPitch.clamp(0.85, 1.25).toDouble();
    _speechVolume = speechVolume.clamp(0.5, 1.0).toDouble();
    _pauseBeforeChoices = pauseBeforeChoices;
    _pauseBetweenChoices = pauseBetweenChoices;

    if (!_initialized) return;
    try {
      await _applySpeechProfile();
    } catch (e) {
      debugPrint('[TTS] updateNarrationConfig failed: $e');
    }
  }

  /// Reads the question text aloud, then each lettered choice:
  ///   "A — Blue"  "B — Red"  …
  ///
  /// Pass already-localised strings — this service is locale-agnostic.
  /// Call fire-and-forget from the game notifier; use [stopAndClear] to abort.
  Future<void> speakQuestion(
    String questionText,
    List<String> choiceTexts,
  ) async {
    final generation = _beginGeneration();

    // Complete any Completer left over from a concurrent speakAnswerResult call
    // so that call exits cleanly before we start the new question chain.
    _onUtteranceComplete();

    try {
      await _ensureInitialized();
      if (!_isCurrent(generation)) return;

      // Stop any in-progress platform speech before reading the new question.
      await _stopWithTimeout('speakQuestion');
      if (!_isCurrent(generation)) return;

      // 1. Read the question.
      await _utterOne(questionText, generation);
      if (!_isCurrent(generation)) return;

      // 2. Brief pause before listing the choices.
      await Future<void>.delayed(_pauseBeforeChoices);
      if (!_isCurrent(generation)) return;

      // 3. Gentle transition before choices to make the pacing predictable.
      final intro = _currentLocale.startsWith('bg')
          ? 'Сега ще чуеш отговорите. Слушай внимателно.'
          : 'Now I will read the answers. Listen carefully.';
      await _utterOne(intro, generation);
      if (!_isCurrent(generation)) return;
      await Future<void>.delayed(const Duration(milliseconds: 250));
      if (!_isCurrent(generation)) return;

      // 4. Read each choice: "A — Square", "B — Circle", …
      for (int i = 0; i < choiceTexts.length; i++) {
        if (!_isCurrent(generation)) return;
        await _utterOne('${_choiceLabels[i]} — ${choiceTexts[i]}', generation);
        if (!_isCurrent(generation)) return;
        if (i < choiceTexts.length - 1) {
          await Future<void>.delayed(_pauseBetweenChoices);
        }
      }
    } catch (e) {
      debugPrint('[TTS] speakQuestion failed: $e');
    }
  }

  /// Spoken feedback after the answer reveal.
  /// Called fire-and-forget — runs concurrently with the reveal hold delay.
  Future<void> speakAnswerResult({
    required bool isCorrect,
    required String correctText,
    String locale = 'en-US',
  }) async {
    final generation = _beginGeneration();
    try {
      await _ensureInitialized();
      if (!_isCurrent(generation)) return;
      final String message;
      if (locale == 'bg-BG') {
        message = isCorrect
            ? 'Браво, чудесно. Справи се много добре.'
            : 'Добър опит. Верният отговор е $correctText.';
      } else {
        message = isCorrect
            ? 'Wonderful. Great job.'
            : 'Nice try. The correct answer is $correctText.';
      }
      await _utterOne(message, generation);
    } catch (e) {
      debugPrint('[TTS] speakAnswerResult failed: $e');
    }
  }

  /// Voice preview used by settings: one sample question + four choices.
  Future<void> speakPreview({required String locale}) async {
    final isBg = locale.startsWith('bg');
    final prompt = isBg
        ? 'Здравей! Това е проба на гласа.'
        : 'Hello! This is a quick voice preview.';
    final choices = isBg
        ? const [
            'Жълта звезда',
            'Синя луна',
            'Зелено дърво',
            'Червена кола',
          ]
        : const [
            'Yellow star',
            'Blue moon',
            'Green tree',
            'Red car',
          ];

    await setLocale(locale);
    await speakQuestion(prompt, choices);
  }

  /// Stops all speech and unblocks any in-progress [speakQuestion] chain.
  ///
  /// The active utterance's Completer is completed *synchronously* here, so
  /// the awaiting [_utterOne] returns before the async [_tts.stop()] platform
  /// call completes. This guarantees the caller is never blocked by TTS state.
  Future<void> stopAndClear() async {
    _beginGeneration();
    // Immediately unblock any awaiting _utterOne — no platform round-trip needed.
    _onUtteranceComplete();
    await _stopWithTimeout('stopAndClear');
  }

  /// Legacy stop — does not set the cancellation flag.
  Future<void> stop() async {
    await _stopWithTimeout('stop');
  }

  void dispose() {
    try {
      _tts.stop();
    } catch (_) {}
  }
}
