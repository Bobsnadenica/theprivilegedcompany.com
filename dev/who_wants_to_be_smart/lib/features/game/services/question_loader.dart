import 'dart:convert';

import 'package:flutter/services.dart';

import '../../../core/constants/app_constants.dart';
import '../models/question.dart';

// ─────────────────────────────────────────────────────────────────────────────
// QuestionLoader — reads bundled + DLC question packs from disk.
//
// Phase 2: loads from assets/data/base_questions.json only.
// Phase 3: DlcService will call loadFromFile() for downloaded packs.
// ─────────────────────────────────────────────────────────────────────────────
class QuestionLoader {
  QuestionLoader._();

  // ── Base pack (bundled asset) ──────────────────────────────────────────────

  static Future<List<Question>> loadBaseQuestions() async {
    final jsonStr =
        await rootBundle.loadString('assets/data/base_questions.json');
    return _parseQuestionsJson(jsonStr, packId: AppConstants.basePackId);
  }

  /// Returns a shuffled subset of [count] questions, ready for one game session.
  static Future<List<Question>> loadAndShuffle({
    int count = AppConstants.questionsPerGame,
  }) async {
    final all = await loadBaseQuestions();
    all.shuffle();
    final selected = all.length > count ? all.sublist(0, count) : all;

    // Randomize answer order per game so the correct option is not always "A".
    return selected.map((q) {
      final shuffledChoices = [...q.choices]..shuffle();
      return q.copyWith(choices: shuffledChoices);
    }).toList();
  }

  // ── DLC packs (Phase 3) ────────────────────────────────────────────────────

  /// Load questions from an absolute path on disk (extracted DLC zip).
  static Future<List<Question>> loadFromFile(
    String absolutePath, {
    required String packId,
  }) async {
    // Deferred to Phase 3 — DlcService will call this.
    throw UnimplementedError('DLC loading is implemented in Phase 3');
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  static List<Question> _parseQuestionsJson(String raw,
      {required String packId}) {
    final json = jsonDecode(raw) as Map<String, dynamic>;
    final resolvedPackId = json['pack_id'] as String? ?? packId;
    final list = json['questions'] as List<dynamic>;
    return list
        .map((q) => Question.fromJson(
              q as Map<String, dynamic>,
              packId: resolvedPackId,
            ))
        .toList();
  }
}
