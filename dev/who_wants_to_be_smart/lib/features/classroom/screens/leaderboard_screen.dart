import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/enums/app_language.dart';
import '../../../core/localization/simple_text.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/joyful_kids_background.dart';
import '../models/class_profile.dart';
import '../models/score.dart';
import '../providers/classroom_providers.dart';

enum _LeaderboardMode { classroom, global }

class LeaderboardScreen extends ConsumerStatefulWidget {
  const LeaderboardScreen({super.key, this.classProfile});
  static const routeName = '/leaderboard';

  final ClassProfile? classProfile;

  @override
  ConsumerState<LeaderboardScreen> createState() => _LeaderboardScreenState();
}

class _LeaderboardScreenState extends ConsumerState<LeaderboardScreen> {
  late _LeaderboardMode _mode;

  @override
  void initState() {
    super.initState();
    _mode = widget.classProfile == null
        ? _LeaderboardMode.global
        : _LeaderboardMode.classroom;
  }

  @override
  Widget build(BuildContext context) {
    final hasClass = widget.classProfile?.id != null;
    final lang = ref.watch(localeProvider);
    final scoresAsync = _mode == _LeaderboardMode.classroom && hasClass
        ? ref.watch(leaderboardProvider(widget.classProfile!.id!))
        : ref.watch(globalLeaderboardProvider);

    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: JoyfulKidsBackground()),
          Container(
            decoration: const BoxDecoration(gradient: AppTheme.bgGradient),
            child: SafeArea(
              child: Column(
                children: [
                  _Header(
                    lang: lang,
                    mode: _mode,
                    classProfile: widget.classProfile,
                    onModeChanged: hasClass
                        ? (mode) => setState(() => _mode = mode)
                        : null,
                  ),
                  Expanded(
                    child: scoresAsync.when(
                      loading: () => const Center(
                        child: CircularProgressIndicator(color: AppTheme.gold),
                      ),
                      error: (e, _) => Center(
                        child: Text('Error: $e', style: AppTheme.bodyStyle),
                      ),
                      data: (scores) => scores.isEmpty
                          ? _EmptyState(lang: lang)
                          : _Leaderboard(
                              scores: scores,
                              showClassName: _mode == _LeaderboardMode.global,
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({
    required this.lang,
    required this.mode,
    required this.classProfile,
    required this.onModeChanged,
  });

  final AppLanguage lang;
  final _LeaderboardMode mode;
  final ClassProfile? classProfile;
  final ValueChanged<_LeaderboardMode>? onModeChanged;

  @override
  Widget build(BuildContext context) {
    final title = mode == _LeaderboardMode.global
        ? tr(lang, 'Global Leaderboard', 'Глобална класация')
        : (classProfile?.name ??
            tr(lang, 'Class Leaderboard', 'Класация на класа'));
    final subtitle = mode == _LeaderboardMode.global
        ? tr(lang, 'All classes', 'Всички класове')
        : tr(lang, 'Class ranking', 'Класиране в класа');
    final icon = mode == _LeaderboardMode.global
        ? '🌍'
        : (classProfile?.avatarEmoji ?? '🏫');

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      child: Column(
        children: [
          Row(
            children: [
              _BackBtn(onTap: () => Navigator.of(context).pop()),
              const SizedBox(width: 12),
              Text(icon, style: const TextStyle(fontSize: 28)),
              const SizedBox(width: 8),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title,
                        style: AppTheme.titleStyle.copyWith(fontSize: 22)),
                    Text(subtitle, style: AppTheme.mutedStyle),
                  ],
                ),
              ),
              const Icon(Icons.emoji_events, color: AppTheme.gold, size: 32),
            ],
          ),
          if (onModeChanged != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: AppTheme.bgSurface.withValues(alpha: 0.5),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppTheme.gold.withValues(alpha: 0.3)),
              ),
              child: SegmentedButton<_LeaderboardMode>(
                showSelectedIcon: false,
                style: ButtonStyle(
                  backgroundColor: WidgetStateProperty.resolveWith((states) {
                    if (states.contains(WidgetState.selected)) {
                      return AppTheme.gold.withValues(alpha: 0.22);
                    }
                    return Colors.transparent;
                  }),
                  foregroundColor:
                      const WidgetStatePropertyAll(AppTheme.textWhite),
                  textStyle: WidgetStatePropertyAll(
                    AppTheme.bodyStyle.copyWith(fontWeight: FontWeight.w700),
                  ),
                  side: const WidgetStatePropertyAll(BorderSide.none),
                ),
                segments: [
                  ButtonSegment(
                    value: _LeaderboardMode.classroom,
                    label: Text(tr(lang, 'Class', 'Клас')),
                    icon: const Icon(Icons.school_rounded),
                  ),
                  ButtonSegment(
                    value: _LeaderboardMode.global,
                    label: Text(tr(lang, 'Global', 'Глобално')),
                    icon: const Icon(Icons.public_rounded),
                  ),
                ],
                selected: {mode},
                onSelectionChanged: (selected) {
                  if (selected.isEmpty) return;
                  onModeChanged!(selected.first);
                },
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Leaderboard extends StatelessWidget {
  const _Leaderboard({
    required this.scores,
    required this.showClassName,
  });

  final List<Score> scores;
  final bool showClassName;

  @override
  Widget build(BuildContext context) {
    final top3 = scores.take(3).toList();
    final rest = scores.length > 3 ? scores.sublist(3) : <Score>[];

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
      child: Column(
        children: [
          _Podium(top3: top3, showClassName: showClassName),
          if (rest.isNotEmpty) ...[
            const SizedBox(height: 20),
            ...rest.asMap().entries.map((entry) {
              final rank = entry.key + 4;
              return _ScoreRow(
                rank: rank,
                score: entry.value,
                showClassName: showClassName,
              );
            }),
          ],
        ],
      ),
    );
  }
}

class _Podium extends StatelessWidget {
  const _Podium({
    required this.top3,
    required this.showClassName,
  });

  final List<Score> top3;
  final bool showClassName;

  @override
  Widget build(BuildContext context) {
    final second = top3.length > 1 ? top3[1] : null;
    final first = top3.isNotEmpty ? top3[0] : null;
    final third = top3.length > 2 ? top3[2] : null;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: _PodiumColumn(
            score: second,
            rank: 2,
            medal: '🥈',
            height: 90,
            showClassName: showClassName,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _PodiumColumn(
            score: first,
            rank: 1,
            medal: '🥇',
            height: 120,
            showClassName: showClassName,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: _PodiumColumn(
            score: third,
            rank: 3,
            medal: '🥉',
            height: 70,
            showClassName: showClassName,
          ),
        ),
      ],
    );
  }
}

class _PodiumColumn extends StatelessWidget {
  const _PodiumColumn({
    required this.score,
    required this.rank,
    required this.medal,
    required this.height,
    required this.showClassName,
  });

  final Score? score;
  final int rank;
  final String medal;
  final double height;
  final bool showClassName;

  @override
  Widget build(BuildContext context) {
    if (score == null) {
      return SizedBox(
        height: height,
        child: Container(
          decoration: BoxDecoration(
            color: AppTheme.bgSurface.withValues(alpha: 0.4),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
          ),
        ),
      );
    }

    final borderColor = rank == 1
        ? AppTheme.gold
        : rank == 2
            ? const Color(0xFFC0C0C0)
            : const Color(0xFFCD7F32);

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(medal, style: const TextStyle(fontSize: 28)),
        const SizedBox(height: 2),
        Text(
          score!.playerName ?? '???',
          style:
              AppTheme.headlineStyle.copyWith(fontSize: 16, letterSpacing: 1.5),
          overflow: TextOverflow.ellipsis,
        ),
        if (showClassName && (score!.className?.isNotEmpty ?? false))
          Text(
            score!.className!,
            style: AppTheme.mutedStyle.copyWith(fontSize: 11),
            overflow: TextOverflow.ellipsis,
          ),
        Text(
          '${score!.points}',
          style: GoogleFonts.boogaloo(fontSize: 20, color: AppTheme.gold),
        ),
        const SizedBox(height: 4),
        Container(
          height: height,
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
              colors: [AppTheme.bgSurface, AppTheme.bgCard],
            ),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(8)),
            border: Border.all(color: borderColor.withValues(alpha: 0.5)),
          ),
          child: Center(
            child: Text(
              '#$rank',
              style: GoogleFonts.boogaloo(fontSize: 28, color: borderColor),
            ),
          ),
        ),
      ],
    );
  }
}

class _ScoreRow extends StatelessWidget {
  const _ScoreRow({
    required this.rank,
    required this.score,
    required this.showClassName,
  });

  final int rank;
  final Score score;
  final bool showClassName;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: AppTheme.bgCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppTheme.bgSurface, width: 1),
        ),
        child: Row(
          children: [
            SizedBox(
              width: 32,
              child: Text(
                '#$rank',
                style: AppTheme.mutedStyle.copyWith(fontSize: 15),
                textAlign: TextAlign.center,
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    score.playerName ?? '???',
                    style: AppTheme.headlineStyle.copyWith(
                      fontSize: 18,
                      letterSpacing: 1.5,
                    ),
                  ),
                  if (showClassName && (score.className?.isNotEmpty ?? false))
                    Text(
                      score.className!,
                      style: AppTheme.mutedStyle.copyWith(fontSize: 12),
                    ),
                ],
              ),
            ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  '${score.points} pts',
                  style:
                      GoogleFonts.boogaloo(fontSize: 18, color: AppTheme.gold),
                ),
                Text(
                  score.accuracyLabel,
                  style: AppTheme.mutedStyle.copyWith(fontSize: 12),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.lang});

  final AppLanguage lang;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('🏆', style: TextStyle(fontSize: 64)),
          const SizedBox(height: 16),
          Text(
            tr(lang, 'No scores yet!', 'Все още няма резултати!'),
            style: AppTheme.headlineStyle,
          ),
          const SizedBox(height: 8),
          Text(
            tr(
              lang,
              'Play a game to get on the board.',
              'Изиграй една игра, за да влезеш в класацията.',
            ),
            style: AppTheme.mutedStyle,
          ),
        ],
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
