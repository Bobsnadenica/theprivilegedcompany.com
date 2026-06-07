import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../enums/app_language.dart';
import '../services/tts_service.dart';

// ─────────────────────────────────────────────────────────────────────────────
// LocaleNotifier — persists the user's chosen language across launches.
//
// Usage:
//   • At app start, call ref.read(localeProvider.notifier).init() from
//     LanguageSelectionScreen.initState() to restore the saved choice.
//   • During the selection screen, call setLanguage(lang) on user tap.
//   • Any screen that reads question text or drives TTS should watch this
//     provider and use question.localizedText(lang) / choice.localizedText(lang).
// ─────────────────────────────────────────────────────────────────────────────

class LocaleNotifier extends Notifier<AppLanguage> {
  static const _prefKey = 'selected_language';

  @override
  AppLanguage build() => AppLanguage.english;

  /// Restores the saved language from SharedPreferences.
  /// Should be called once from the language selection screen's [initState].
  Future<AppLanguage> init() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final saved = prefs.getString(_prefKey);
      if (saved != null) {
        final lang = AppLanguage.fromLocale(saved);
        state = lang;
        await TtsService.instance.setLocale(lang.locale);
        return lang;
      }
    } catch (e) {
      // SharedPreferences unavailable — use the default.
    }
    return state;
  }

  /// Persists the selection and updates the TTS locale immediately.
  Future<void> setLanguage(AppLanguage lang) async {
    state = lang;
    try {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_prefKey, lang.locale);
      await TtsService.instance.setLocale(lang.locale);
    } catch (e) {
      // Persist failure is non-fatal — the in-memory state is still updated.
    }
  }
}

final localeProvider = NotifierProvider<LocaleNotifier, AppLanguage>(
  LocaleNotifier.new,
);
