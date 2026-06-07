// ─────────────────────────────────────────────────────────────────────────────
// App-wide constants. Single source of truth for magic strings and numbers.
// ─────────────────────────────────────────────────────────────────────────────

class AppConstants {
  AppConstants._();

  // ── Database ───────────────────────────────────────────────────────────────
  static const String dbName = 'wwtbs.db';
  static const int dbVersion = 1;

  static const String tableClasses = 'classes';
  static const String tablePlayers = 'players';
  static const String tableScores = 'scores';
  static const String tableQuestionPacks = 'question_packs';

  // ── DLC ───────────────────────────────────────────────────────────────────
  /// Update this to your deployed GitHub Pages / Netlify URL before shipping.
  /// See dlc_website/README.md for deployment instructions.
  static const String dlcManifestUrl =
      'https://YOUR_USERNAME.github.io/wwtbs-dlc/manifest.json';
  static const String dlcLocalDir = 'dlc_packs';

  static const String basePackId = 'base';
  static const String basePackName = 'Starter Pack';
  static const int basePackQuestionCount = 50;

  // ── Game ──────────────────────────────────────────────────────────────────
  static const int maxLives = 3;
  static const int questionsPerGame = 20;
  static const int targetCorrectToWin = 15;
  static const int pointsPerCorrect = 100;
  static const int bonusPerLife = 50;

  // ── Arcade Name Entry ─────────────────────────────────────────────────────
  static const int nameLength = 3;
  static const List<String> alphabet = [
    'A',
    'B',
    'C',
    'D',
    'E',
    'F',
    'G',
    'H',
    'I',
    'J',
    'K',
    'L',
    'M',
    'N',
    'O',
    'P',
    'Q',
    'R',
    'S',
    'T',
    'U',
    'V',
    'W',
    'X',
    'Y',
    'Z',
  ];

  // ── Classroom ─────────────────────────────────────────────────────────────
  static const List<String> classEmojis = [
    '🌟',
    '🦁',
    '🐘',
    '🦊',
    '🐧',
    '🌈',
    '🚀',
    '🎨',
    '🎵',
    '⚽',
    '🦋',
    '🌺',
    '🐬',
    '🦄',
    '🍎',
    '🎯',
  ];

  // ── Leaderboard ───────────────────────────────────────────────────────────
  static const int leaderboardSize = 10;

  // ── Solo / Quick Play ─────────────────────────────────────────────────────
  static const String quickPlayClassName = 'Quick Play';
  static const String quickPlayClassEmoji = '🎮';

  // ── Animation durations ───────────────────────────────────────────────────
  static const Duration shortAnim = Duration(milliseconds: 250);
  static const Duration mediumAnim = Duration(milliseconds: 500);
  static const Duration longAnim = Duration(milliseconds: 800);
}
