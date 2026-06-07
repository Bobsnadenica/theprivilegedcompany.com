import '../../../core/enums/app_language.dart';
import 'choice.dart';

// ─────────────────────────────────────────────────────────────────────────────
// A single trivia question loaded from a pack (JSON).
// All media paths are relative to the pack's extracted directory.
// Supports bilingual text via optional [textBg] (Bulgarian).
// ─────────────────────────────────────────────────────────────────────────────
class Question {
  const Question({
    required this.id,
    required this.packId,
    required this.text,
    this.textBg,
    this.imagePath,
    this.audioPath,
    required this.choices,
    this.difficulty = 1,
    this.category,
  }) : assert(choices.length == 4, 'Every question must have exactly 4 choices');

  /// Unique across the whole app — e.g. "base_q001".
  final String id;

  /// Which pack this came from — matches DlcPack.id.
  final String packId;

  /// The question text in English — read aloud by TTS.
  final String text;

  /// Bulgarian translation — optional; falls back to [text] if null.
  final String? textBg;

  /// Optional illustration shown above the question.
  final String? imagePath;

  /// Optional ambient audio played while the question is shown.
  final String? audioPath;

  /// Always exactly 4 choices.
  final List<Choice> choices;

  /// 1 = easiest (Kindergarten), 5 = hardest. Used for difficulty scaling.
  final int difficulty;

  /// E.g. "Animals", "Colors", "Numbers".
  final String? category;

  // ── Localisation ──────────────────────────────────────────────────────────

  /// Returns the question text for the given language, falling back to English.
  String localizedText(AppLanguage lang) {
    if (lang == AppLanguage.bulgarian && textBg != null && textBg!.isNotEmpty) {
      return textBg!;
    }
    return text;
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  Choice get correctChoice => choices.firstWhere((c) => c.isCorrect);

  bool get hasImage => imagePath != null && imagePath!.isNotEmpty;
  bool get hasAudio => audioPath != null && audioPath!.isNotEmpty;

  // ── Convenience ───────────────────────────────────────────────────────────

  Question copyWith({
    String? id,
    String? packId,
    String? text,
    String? textBg,
    String? imagePath,
    String? audioPath,
    List<Choice>? choices,
    int? difficulty,
    String? category,
  }) =>
      Question(
        id: id ?? this.id,
        packId: packId ?? this.packId,
        text: text ?? this.text,
        textBg: textBg ?? this.textBg,
        imagePath: imagePath ?? this.imagePath,
        audioPath: audioPath ?? this.audioPath,
        choices: choices ?? this.choices,
        difficulty: difficulty ?? this.difficulty,
        category: category ?? this.category,
      );

  // ── Serialisation ─────────────────────────────────────────────────────────

  factory Question.fromJson(Map<String, dynamic> json, {String? packId}) =>
      Question(
        id: json['id'] as String,
        packId: packId ?? json['pack_id'] as String? ?? 'base',
        text: json['text'] as String,
        textBg: json['text_bg'] as String?,
        imagePath: json['image_path'] as String?,
        audioPath: json['audio_path'] as String?,
        choices: (json['choices'] as List<dynamic>)
            .map((c) => Choice.fromJson(c as Map<String, dynamic>))
            .toList(),
        difficulty: json['difficulty'] as int? ?? 1,
        category: json['category'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'pack_id': packId,
        'text': text,
        if (textBg != null) 'text_bg': textBg,
        if (imagePath != null) 'image_path': imagePath,
        if (audioPath != null) 'audio_path': audioPath,
        'choices': choices.map((c) => c.toJson()).toList(),
        'difficulty': difficulty,
        if (category != null) 'category': category,
      };

  @override
  String toString() => 'Question($id: $text)';
}
