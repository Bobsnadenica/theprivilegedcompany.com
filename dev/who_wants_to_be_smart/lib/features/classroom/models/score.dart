// ─────────────────────────────────────────────────────────────────────────────
// One completed game session. Stored in the `scores` table.
// playerName is populated via JOIN – not stored in the DB column.
// ─────────────────────────────────────────────────────────────────────────────
class Score {
  const Score({
    this.id,
    required this.playerId,
    required this.classId,
    required this.points,
    required this.questionsCorrect,
    required this.questionsTotal,
    required this.playedAt,
    this.packId,
    this.playerName,
    this.className,
  });

  final int? id;
  final int playerId;
  final int classId;
  final int points;
  final int questionsCorrect;
  final int questionsTotal;
  final DateTime playedAt;

  /// Which DLC pack was played (null = base pack).
  final String? packId;

  /// Populated via JOIN — not persisted as a column.
  final String? playerName;

  /// Populated via JOIN for global leaderboard rows.
  final String? className;

  // ── Derived ───────────────────────────────────────────────────────────────

  double get accuracy =>
      questionsTotal == 0 ? 0.0 : questionsCorrect / questionsTotal;

  String get accuracyLabel => '${(accuracy * 100).toStringAsFixed(0)}%';

  // ── Convenience ───────────────────────────────────────────────────────────

  Score copyWith({
    int? id,
    int? playerId,
    int? classId,
    int? points,
    int? questionsCorrect,
    int? questionsTotal,
    DateTime? playedAt,
    String? packId,
    String? playerName,
    String? className,
  }) =>
      Score(
        id: id ?? this.id,
        playerId: playerId ?? this.playerId,
        classId: classId ?? this.classId,
        points: points ?? this.points,
        questionsCorrect: questionsCorrect ?? this.questionsCorrect,
        questionsTotal: questionsTotal ?? this.questionsTotal,
        playedAt: playedAt ?? this.playedAt,
        packId: packId ?? this.packId,
        playerName: playerName ?? this.playerName,
        className: className ?? this.className,
      );

  // ── Persistence ───────────────────────────────────────────────────────────

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'player_id': playerId,
        'class_id': classId,
        'points': points,
        'questions_correct': questionsCorrect,
        'questions_total': questionsTotal,
        'played_at': playedAt.millisecondsSinceEpoch,
        if (packId != null) 'pack_id': packId,
      };

  factory Score.fromMap(Map<String, dynamic> map) => Score(
        id: map['id'] as int?,
        playerId: map['player_id'] as int,
        classId: map['class_id'] as int,
        points: map['points'] as int,
        questionsCorrect: map['questions_correct'] as int,
        questionsTotal: map['questions_total'] as int,
        playedAt: DateTime.fromMillisecondsSinceEpoch(
          map['played_at'] as int,
        ),
        packId: map['pack_id'] as String?,
        playerName: map['player_name'] as String?,
        className: map['class_name'] as String?,
      );

  @override
  String toString() =>
      'Score(player: $playerName, points: $points, accuracy: $accuracyLabel)';
}
