// ─────────────────────────────────────────────────────────────────────────────
// A player identified by a 3-letter arcade name within a classroom.
// ─────────────────────────────────────────────────────────────────────────────
class Player {
  const Player({
    this.id,
    required this.name,
    required this.classId,
    this.avatarIndex = 0,
  });

  /// Auto-increment PK.
  final int? id;

  /// Exactly 3 uppercase letters — e.g. "CAT", "ZOE", "MAX".
  final String name;

  final int classId;

  /// Index into the emoji/avatar list displayed during gameplay.
  final int avatarIndex;

  // ── Derived ───────────────────────────────────────────────────────────────

  static const List<String> avatars = [
    '🐱', '🐶', '🐸', '🦊', '🐼', '🐨', '🐯', '🦁',
    '🐺', '🦋', '🐧', '🦉',
  ];

  String get avatar => avatars[avatarIndex % avatars.length];

  // ── Convenience ───────────────────────────────────────────────────────────

  Player copyWith({
    int? id,
    String? name,
    int? classId,
    int? avatarIndex,
  }) =>
      Player(
        id: id ?? this.id,
        name: name ?? this.name,
        classId: classId ?? this.classId,
        avatarIndex: avatarIndex ?? this.avatarIndex,
      );

  // ── Persistence ───────────────────────────────────────────────────────────

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'name': name,
        'class_id': classId,
        'avatar_index': avatarIndex,
      };

  factory Player.fromMap(Map<String, dynamic> map) => Player(
        id: map['id'] as int?,
        name: map['name'] as String,
        classId: map['class_id'] as int,
        avatarIndex: map['avatar_index'] as int? ?? 0,
      );

  @override
  String toString() => 'Player(id: $id, name: $name, classId: $classId)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is Player && runtimeType == other.runtimeType && id == other.id;

  @override
  int get hashCode => id.hashCode;
}
