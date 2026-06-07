import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/theme/app_theme.dart';
import '../models/player_progress.dart';
import '../models/score.dart';
import '../providers/classroom_providers.dart';

class PlayerProfileScreen extends ConsumerWidget {
  const PlayerProfileScreen({super.key, required this.playerId});
  static const routeName = '/player-profile';

  final int playerId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final progressAsync = ref.watch(playerProgressProvider(playerId));
    final scoresAsync = ref.watch(playerScoresProvider(playerId));

    return Scaffold(
      body: Container(
        decoration: const BoxDecoration(gradient: AppTheme.bgGradient),
        child: SafeArea(
          child: Column(
            children: [
              const _ProfileHeader(),
              Expanded(
                child: progressAsync.when(
                  loading: () => const Center(
                    child: CircularProgressIndicator(color: AppTheme.gold),
                  ),
                  error: (e, _) => Center(
                    child: Text('Error: $e', style: AppTheme.bodyStyle),
                  ),
                  data: (progress) {
                    if (progress == null) {
                      return const _EmptyProfile();
                    }
                    final scores = scoresAsync.valueOrNull ?? const <Score>[];
                    return _ProfileBody(progress: progress, scores: scores);
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProfileHeader extends StatelessWidget {
  const _ProfileHeader();

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Row(
        children: [
          _BackBtn(onTap: () => Navigator.of(context).pop()),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'My Profile',
              style: AppTheme.titleStyle.copyWith(fontSize: 28),
            ),
          ),
          const Icon(Icons.person_rounded, color: AppTheme.gold, size: 30),
        ],
      ),
    );
  }
}

class _ProfileBody extends StatelessWidget {
  const _ProfileBody({required this.progress, required this.scores});

  final PlayerProgress progress;
  final List<Score> scores;

  @override
  Widget build(BuildContext context) {
    final topRuns = [...scores]..sort((a, b) {
        final byPoints = b.points.compareTo(a.points);
        if (byPoints != 0) return byPoints;
        return b.playedAt.compareTo(a.playedAt);
      });
    final bestRuns = topRuns.take(5).toList();

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _HeroCard(progress: progress),
          const SizedBox(height: 14),
          _StatGrid(progress: progress),
          const SizedBox(height: 14),
          _BadgesSection(progress: progress),
          const SizedBox(height: 14),
          _TopRunsSection(runs: bestRuns),
        ],
      ),
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({required this.progress});

  final PlayerProgress progress;

  @override
  Widget build(BuildContext context) {
    final levelProgress = progress.levelProgress.clamp(0.0, 1.0).toDouble();
    final target = progress.nextLevelTarget;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        color: AppTheme.bgCard,
        border: Border.all(color: AppTheme.gold.withValues(alpha: 0.4)),
        boxShadow: AppTheme.cardShadow,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              const Text('🌟', style: TextStyle(fontSize: 28)),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      progress.playerName,
                      style: AppTheme.headlineStyle.copyWith(fontSize: 24),
                    ),
                    Text(
                      '${progress.className} • ${progress.learningLevel}',
                      style: AppTheme.mutedStyle,
                    ),
                  ],
                ),
              ),
              _RankPill(
                label: 'Class',
                value: '#${progress.classRank}',
              ),
              const SizedBox(width: 8),
              _RankPill(
                label: 'Global',
                value: '#${progress.globalRank}',
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(
            'Learning progress',
            style: AppTheme.mutedStyle.copyWith(color: AppTheme.textWhite),
          ),
          const SizedBox(height: 6),
          ClipRRect(
            borderRadius: BorderRadius.circular(99),
            child: LinearProgressIndicator(
              value: levelProgress,
              minHeight: 10,
              backgroundColor: Colors.white.withValues(alpha: 0.15),
              valueColor:
                  const AlwaysStoppedAnimation<Color>(Color(0xFF67E8F9)),
            ),
          ),
          const SizedBox(height: 6),
          Text(
            target == progress.totalCorrect
                ? 'Top level reached'
                : '${progress.totalCorrect}/$target correct answers to next level',
            style: AppTheme.mutedStyle.copyWith(fontSize: 12),
          ),
        ],
      ),
    );
  }
}

class _RankPill extends StatelessWidget {
  const _RankPill({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      decoration: BoxDecoration(
        color: AppTheme.bgSurface,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppTheme.gold.withValues(alpha: 0.35)),
      ),
      child: Column(
        children: [
          Text(
            label,
            style: AppTheme.mutedStyle.copyWith(fontSize: 11),
          ),
          Text(
            value,
            style: GoogleFonts.boogaloo(
              fontSize: 20,
              color: AppTheme.gold,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatGrid extends StatelessWidget {
  const _StatGrid({required this.progress});

  final PlayerProgress progress;

  @override
  Widget build(BuildContext context) {
    final items = <({String label, String value, IconData icon})>[
      (
        label: 'Games',
        value: '${progress.gamesPlayed}',
        icon: Icons.sports_esports_rounded
      ),
      (
        label: 'Best Score',
        value: '${progress.bestScore}',
        icon: Icons.bolt_rounded
      ),
      (
        label: 'Correct',
        value: '${progress.totalCorrect}',
        icon: Icons.check_circle_rounded
      ),
      (
        label: 'Accuracy',
        value: progress.accuracyLabel,
        icon: Icons.track_changes_rounded
      ),
      (
        label: 'Wins',
        value: '${progress.wins}',
        icon: Icons.emoji_events_rounded
      ),
      (
        label: 'Badges',
        value: '${progress.badgesEarned}',
        icon: Icons.workspace_premium_rounded
      ),
    ];

    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: items
          .map(
            (it) => SizedBox(
              width: (MediaQuery.of(context).size.width - 42) / 2,
              child: _StatCard(
                label: it.label,
                value: it.value,
                icon: it.icon,
              ),
            ),
          )
          .toList(),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({
    required this.label,
    required this.value,
    required this.icon,
  });

  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.bgSurface),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: AppTheme.gold, size: 18),
          const SizedBox(height: 10),
          Text(value, style: AppTheme.headlineStyle.copyWith(fontSize: 24)),
          const SizedBox(height: 2),
          Text(label, style: AppTheme.mutedStyle),
        ],
      ),
    );
  }
}

class _BadgesSection extends StatelessWidget {
  const _BadgesSection({required this.progress});

  final PlayerProgress progress;

  @override
  Widget build(BuildContext context) {
    final badges = progress.badges;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.bgSurface),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Badges', style: AppTheme.headlineStyle.copyWith(fontSize: 22)),
          const SizedBox(height: 10),
          if (badges.isEmpty)
            Text(
              'Play your first game to unlock badges.',
              style: AppTheme.mutedStyle,
            )
          else
            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: badges
                  .map(
                    (badge) => Tooltip(
                      message: badge.description,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 10,
                          vertical: 8,
                        ),
                        decoration: BoxDecoration(
                          color: AppTheme.bgSurface,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(
                            color: AppTheme.gold.withValues(alpha: 0.28),
                          ),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(badge.emoji,
                                style: const TextStyle(fontSize: 16)),
                            const SizedBox(width: 6),
                            Text(
                              badge.title,
                              style: AppTheme.bodyStyle.copyWith(fontSize: 13),
                            ),
                          ],
                        ),
                      ),
                    ),
                  )
                  .toList(),
            ),
        ],
      ),
    );
  }
}

class _TopRunsSection extends StatelessWidget {
  const _TopRunsSection({required this.runs});

  final List<Score> runs;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppTheme.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppTheme.bgSurface),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Personal Leaderboard',
            style: AppTheme.headlineStyle.copyWith(fontSize: 22),
          ),
          const SizedBox(height: 10),
          if (runs.isEmpty)
            Text(
              'No game history yet.',
              style: AppTheme.mutedStyle,
            )
          else
            ...runs.asMap().entries.map(
              (entry) {
                final rank = entry.key + 1;
                final run = entry.value;
                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: AppTheme.bgSurface.withValues(alpha: 0.55),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Row(
                      children: [
                        SizedBox(
                          width: 28,
                          child: Text(
                            '#$rank',
                            style: AppTheme.mutedStyle,
                            textAlign: TextAlign.center,
                          ),
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            _dateLabel(run.playedAt),
                            style: AppTheme.bodyStyle.copyWith(fontSize: 13),
                          ),
                        ),
                        Text(
                          '${run.points} pts',
                          style: GoogleFonts.boogaloo(
                            fontSize: 20,
                            color: AppTheme.gold,
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
        ],
      ),
    );
  }

  String _dateLabel(DateTime dt) {
    final mm = dt.month.toString().padLeft(2, '0');
    final dd = dt.day.toString().padLeft(2, '0');
    return '${dt.year}-$mm-$dd';
  }
}

class _EmptyProfile extends StatelessWidget {
  const _EmptyProfile();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('🧒', style: TextStyle(fontSize: 64)),
            const SizedBox(height: 12),
            Text(
              'No profile data yet',
              style: AppTheme.headlineStyle,
            ),
            const SizedBox(height: 6),
            Text(
              'Finish at least one game to start building your profile.',
              textAlign: TextAlign.center,
              style: AppTheme.mutedStyle,
            ),
          ],
        ),
      ),
    );
  }
}

class _BackBtn extends StatelessWidget {
  const _BackBtn({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 40,
        decoration: BoxDecoration(
          color: AppTheme.bgSurface,
          shape: BoxShape.circle,
          border: Border.all(color: AppTheme.gold.withValues(alpha: 0.5)),
        ),
        child: const Icon(Icons.arrow_back_ios_new,
            color: AppTheme.gold, size: 18),
      ),
    );
  }
}
