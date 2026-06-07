import '../../../core/constants/app_constants.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Represents a teacher-created classroom. Stored in the `classes` table.
// ─────────────────────────────────────────────────────────────────────────────
class ClassProfile {
  const ClassProfile({
    this.id,
    required this.name,
    required this.createdAt,
    this.avatarEmoji = '🌟',
  });

  final int? id;
  final String name;
  final DateTime createdAt;
  final String avatarEmoji;

  // ── Convenience ───────────────────────────────────────────────────────────

  ClassProfile copyWith({
    int? id,
    String? name,
    DateTime? createdAt,
    String? avatarEmoji,
  }) =>
      ClassProfile(
        id: id ?? this.id,
        name: name ?? this.name,
        createdAt: createdAt ?? this.createdAt,
        avatarEmoji: avatarEmoji ?? this.avatarEmoji,
      );

  // ── Persistence ───────────────────────────────────────────────────────────

  Map<String, dynamic> toMap() => {
        if (id != null) 'id': id,
        'name': name,
        'created_at': createdAt.millisecondsSinceEpoch,
        'avatar_emoji': avatarEmoji,
      };

  factory ClassProfile.fromMap(Map<String, dynamic> map) => ClassProfile(
        id: map['id'] as int?,
        name: map['name'] as String,
        createdAt: DateTime.fromMillisecondsSinceEpoch(
          map['created_at'] as int,
        ),
        avatarEmoji:
            map['avatar_emoji'] as String? ?? AppConstants.classEmojis.first,
      );

  @override
  String toString() => 'ClassProfile(id: $id, name: $name)';

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ClassProfile &&
          runtimeType == other.runtimeType &&
          id == other.id;

  @override
  int get hashCode => id.hashCode;
}
