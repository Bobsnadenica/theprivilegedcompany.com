import '../../../core/enums/app_language.dart';

// ─────────────────────────────────────────────────────────────────────────────
// One answer option inside a Question.
// Supports text, optional Bulgarian text, an optional image and an optional
// sound to play on tap.
// ─────────────────────────────────────────────────────────────────────────────
class Choice {
  const Choice({
    required this.id,
    required this.text,
    this.textBg,
    this.imagePath,
    this.audioPath,
    required this.isCorrect,
  });

  /// Unique within its question (e.g. "q001_c1").
  final String id;

  /// Display label in English — e.g. "Moo", "3", "Paris".
  final String text;

  /// Bulgarian translation — optional; falls back to [text] if null.
  final String? textBg;

  /// Relative path inside the DLC pack — e.g. "images/cow.png". Nullable.
  final String? imagePath;

  /// Relative path for the "answer sound" — e.g. "audio/moo.mp3". Nullable.
  final String? audioPath;

  final bool isCorrect;

  // ── Localisation ──────────────────────────────────────────────────────────

  /// Returns the choice text for the given language, falling back to English.
  String localizedText(AppLanguage lang) {
    if (lang == AppLanguage.bulgarian && textBg != null && textBg!.isNotEmpty) {
      return textBg!;
    }
    return text;
  }

  // ── Convenience ───────────────────────────────────────────────────────────

  bool get hasImage => imagePath != null && imagePath!.isNotEmpty;
  bool get hasAudio => audioPath != null && audioPath!.isNotEmpty;

  Choice copyWith({
    String? id,
    String? text,
    String? textBg,
    String? imagePath,
    String? audioPath,
    bool? isCorrect,
  }) =>
      Choice(
        id: id ?? this.id,
        text: text ?? this.text,
        textBg: textBg ?? this.textBg,
        imagePath: imagePath ?? this.imagePath,
        audioPath: audioPath ?? this.audioPath,
        isCorrect: isCorrect ?? this.isCorrect,
      );

  // ── Serialisation ─────────────────────────────────────────────────────────

  factory Choice.fromJson(Map<String, dynamic> json) => Choice(
        id: json['id'] as String,
        text: json['text'] as String,
        textBg: json['text_bg'] as String?,
        imagePath: json['image_path'] as String?,
        audioPath: json['audio_path'] as String?,
        isCorrect: json['is_correct'] as bool,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'text': text,
        if (textBg != null) 'text_bg': textBg,
        if (imagePath != null) 'image_path': imagePath,
        if (audioPath != null) 'audio_path': audioPath,
        'is_correct': isCorrect,
      };

  @override
  String toString() => 'Choice($text, correct: $isCorrect)';
}
