// ─────────────────────────────────────────────────────────────────────────────
// PlayerProgress — aggregated personal leaderboard/profile stats.
// Built from scores table and rank queries (global + class).
// ─────────────────────────────────────────────────────────────────────────────

class ProfileBadge {
  const ProfileBadge({
    required this.emoji,
    required this.title,
    required this.description,
  });

  final String emoji;
  final String title;
  final String description;
}

class PlayerProgress {
  const PlayerProgress({
    required this.playerId,
    required this.playerName,
    required this.classId,
    required this.className,
    required this.gamesPlayed,
    required this.bestScore,
    required this.totalPoints,
    required this.totalCorrect,
    required this.totalQuestions,
    required this.wins,
    required this.bestCorrectRun,
    required this.globalRank,
    required this.classRank,
  });

  final int playerId;
  final String playerName;
  final int classId;
  final String className;
  final int gamesPlayed;
  final int bestScore;
  final int totalPoints;
  final int totalCorrect;
  final int totalQuestions;
  final int wins;
  final int bestCorrectRun;
  final int globalRank;
  final int classRank;

  double get accuracy =>
      totalQuestions == 0 ? 0 : totalCorrect / totalQuestions;

  String get accuracyLabel => '${(accuracy * 100).toStringAsFixed(0)}%';

  String get learningLevel {
    if (totalCorrect >= 220) return 'Super Scholar';
    if (totalCorrect >= 140) return 'Learning Star';
    if (totalCorrect >= 70) return 'Brain Builder';
    if (totalCorrect >= 30) return 'Curious Explorer';
    return 'First Steps';
  }

  int get nextLevelTarget {
    if (totalCorrect < 30) return 30;
    if (totalCorrect < 70) return 70;
    if (totalCorrect < 140) return 140;
    if (totalCorrect < 220) return 220;
    return totalCorrect;
  }

  double get levelProgress {
    if (totalCorrect >= 220) return 1;
    if (totalCorrect < 30) return totalCorrect / 30;
    if (totalCorrect < 70) return (totalCorrect - 30) / 40;
    if (totalCorrect < 140) return (totalCorrect - 70) / 70;
    return (totalCorrect - 140) / 80;
  }

  int get badgesEarned => badges.length;

  List<ProfileBadge> get badges {
    final items = <ProfileBadge>[];
    if (gamesPlayed > 0) {
      items.add(
        const ProfileBadge(
          emoji: '🎯',
          title: 'First Game',
          description: 'Played your first quiz game.',
        ),
      );
    }
    if (totalCorrect >= 30) {
      items.add(
        const ProfileBadge(
          emoji: '🧠',
          title: 'Curious Explorer',
          description: 'Answered 30 questions correctly.',
        ),
      );
    }
    if (totalCorrect >= 100) {
      items.add(
        const ProfileBadge(
          emoji: '📚',
          title: 'Brain Builder',
          description: 'Answered 100 questions correctly.',
        ),
      );
    }
    if (bestCorrectRun >= 10) {
      items.add(
        const ProfileBadge(
          emoji: '🧗',
          title: 'Climber',
          description: 'Reached 10 correct answers in one game.',
        ),
      );
    }
    if (wins > 0) {
      items.add(
        const ProfileBadge(
          emoji: '🏆',
          title: 'Champion',
          description: 'Won at least one full game.',
        ),
      );
    }
    if (classRank == 1 && gamesPlayed > 0) {
      items.add(
        const ProfileBadge(
          emoji: '🥇',
          title: 'Class Star',
          description: 'Top score in your class.',
        ),
      );
    }
    if (globalRank == 1 && gamesPlayed > 0) {
      items.add(
        const ProfileBadge(
          emoji: '🌍',
          title: 'Global Hero',
          description: 'Top score across all players.',
        ),
      );
    }
    return items;
  }
}
