// ─────────────────────────────────────────────────────────────────────────────
// AppLanguage — the two supported UI / TTS languages.
//
// Defined as a standalone enum so it can be imported by:
//   • models (Question, Choice) for localizedText()
//   • services (TtsService) for locale-aware speech
//   • providers (LocaleNotifier) as the state type
//   • screens (LanguageSelectionScreen) for display
// ─────────────────────────────────────────────────────────────────────────────
enum AppLanguage {
  english('en-US', 'English', '🇬🇧'),
  bulgarian('bg-BG', 'Български', '🇧🇬');

  const AppLanguage(this.locale, this.displayName, this.flag);

  /// BCP-47 locale tag used for flutter_tts and SharedPreferences persistence.
  final String locale;

  /// Human-readable name shown in the language selector.
  final String displayName;

  /// Flag emoji shown alongside the language name.
  final String flag;

  /// Convenience — restore from a stored locale string.
  static AppLanguage fromLocale(String locale) => AppLanguage.values.firstWhere(
        (l) => l.locale == locale,
        orElse: () => AppLanguage.english,
      );
}
