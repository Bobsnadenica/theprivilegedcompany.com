import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/database/database_helper.dart';
import '../../../core/enums/app_language.dart';
import '../../../core/localization/simple_text.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/providers/session_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/joyful_kids_background.dart';
import '../../classroom/models/class_profile.dart';
import '../../classroom/providers/classroom_providers.dart';
import '../../classroom/screens/leaderboard_screen.dart';
import '../../classroom/screens/player_profile_screen.dart';
import '../../dlc/screens/dlc_screen.dart';
import 'name_entry_screen.dart';
import 'voice_settings_screen.dart';

// ─────────────────────────────────────────────────────────────────────────────
// ClassSelectionScreen
//
// First screen the user sees. Teachers select (or create) a Class Profile;
// the selection is stored in SessionNotifier before navigating onward.
// ─────────────────────────────────────────────────────────────────────────────
class ClassSelectionScreen extends ConsumerWidget {
  const ClassSelectionScreen({super.key});

  static const routeName = '/';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final classesAsync = ref.watch(classesProvider);
    final lang = ref.watch(localeProvider);

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
                    onQuickPlay: () => _onQuickPlay(context, ref),
                    onGlobalLeaderboard: () => _onGlobalLeaderboard(context),
                    onProfile: () => _onProfile(context, ref),
                    onVoiceSettings: () => _onVoiceSettings(context),
                    lang: lang,
                  ),
                  Expanded(
                    child: classesAsync.when(
                      loading: () => const Center(
                        child: CircularProgressIndicator(color: AppTheme.gold),
                      ),
                      error: (e, _) => _ErrorView(error: e.toString()),
                      data: (classes) => classes.isEmpty
                          ? _EmptyState(
                              lang: lang,
                              onAdd: () => _showCreateDialog(context, ref),
                            )
                          : _ClassList(
                              classes: classes,
                              onSelect: (cls) =>
                                  _onClassSelected(context, ref, cls),
                              onLongPress: (cls) =>
                                  _onClassLongPressed(context, ref, cls),
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: classesAsync.maybeWhen(
        data: (classes) => classes.isNotEmpty
            ? _AddButton(
                label: tr(lang, 'Add Class', 'Добави клас'),
                onTap: () => _showCreateDialog(context, ref),
              )
            : null,
        orElse: () => null,
      ),
    );
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  void _onClassSelected(
    BuildContext context,
    WidgetRef ref,
    ClassProfile cls,
  ) {
    ref.read(sessionProvider.notifier).selectClass(cls);
    Navigator.of(context).pushNamed(NameEntryScreen.routeName);
  }

  Future<void> _onQuickPlay(BuildContext context, WidgetRef ref) async {
    final lang = ref.read(localeProvider);
    try {
      await ref.read(sessionProvider.notifier).selectQuickPlayClass();
      if (!context.mounted) return;
      Navigator.of(context).pushNamed(NameEntryScreen.routeName);
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            tr(
              lang,
              'Could not start Quick Play: $e',
              'Неуспешно стартиране на Бърза игра: $e',
            ),
          ),
          backgroundColor: AppTheme.wrong,
        ),
      );
    }
  }

  void _onGlobalLeaderboard(BuildContext context) {
    Navigator.of(context).pushNamed(LeaderboardScreen.routeName);
  }

  void _onVoiceSettings(BuildContext context) {
    Navigator.of(context).pushNamed(VoiceSettingsScreen.routeName);
  }

  Future<void> _onProfile(BuildContext context, WidgetRef ref) async {
    final lang = ref.read(localeProvider);
    final sessionPlayer = ref.read(sessionProvider).currentPlayer;
    final sessionPlayerId = sessionPlayer?.id;
    int? playerId = sessionPlayerId;

    if (playerId == null) {
      final recent = await DatabaseHelper.instance.getMostRecentPlayer();
      playerId = recent?.id;
    }

    if (!context.mounted) return;

    if (playerId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            tr(
              lang,
              'Play one game first to unlock your profile.',
              'Изиграй първо една игра, за да отключиш профила си.',
            ),
          ),
        ),
      );
      return;
    }

    Navigator.of(context).pushNamed(
      PlayerProfileScreen.routeName,
      arguments: playerId,
    );
  }

  void _onClassLongPressed(
    BuildContext context,
    WidgetRef ref,
    ClassProfile cls,
  ) {
    final lang = ref.read(localeProvider);
    showModalBottomSheet<void>(
      context: context,
      backgroundColor: AppTheme.bgCard,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 8),
            Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: AppTheme.textMuted,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            Text(
              '${cls.avatarEmoji}  ${cls.name}',
              style: AppTheme.headlineStyle,
            ),
            const SizedBox(height: 16),
            ListTile(
              leading: const Icon(Icons.emoji_events, color: AppTheme.gold),
              title: Text(
                tr(lang, 'View Leaderboard', 'Виж класация'),
                style: AppTheme.bodyStyle,
              ),
              onTap: () {
                Navigator.pop(ctx);
                Navigator.of(context).pushNamed(
                  LeaderboardScreen.routeName,
                  arguments: cls,
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.delete_outline, color: AppTheme.wrong),
              title: Text(
                tr(lang, 'Delete Class', 'Изтрий клас'),
                style: AppTheme.bodyStyle,
              ),
              onTap: () {
                Navigator.pop(ctx);
                _confirmDelete(context, ref, cls);
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  // ── Dialogs ────────────────────────────────────────────────────────────────

  Future<void> _showCreateDialog(BuildContext context, WidgetRef ref) async {
    final lang = ref.read(localeProvider);
    final nameCtrl = TextEditingController();
    String selectedEmoji = AppConstants.classEmojis.first;

    await showDialog<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setState) => AlertDialog(
          backgroundColor: AppTheme.bgCard,
          title: Text(
            tr(lang, 'New Class', 'Нов клас'),
            style: GoogleFonts.boogaloo(color: AppTheme.gold, fontSize: 24),
          ),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Name field ───────────────────────────────────────────
              TextField(
                controller: nameCtrl,
                autofocus: true,
                style: AppTheme.bodyStyle,
                textCapitalization: TextCapitalization.words,
                decoration: const InputDecoration(
                  hintText: 'e.g. Class Kiwi',
                  prefixIcon: Icon(Icons.school, color: AppTheme.gold),
                ),
              ),
              const SizedBox(height: 20),

              // ── Emoji picker ─────────────────────────────────────────
              Text(
                tr(lang, 'Pick an icon', 'Избери икона'),
                style: AppTheme.mutedStyle,
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: AppConstants.classEmojis.map((emoji) {
                  final isSelected = emoji == selectedEmoji;
                  return GestureDetector(
                    onTap: () => setState(() => selectedEmoji = emoji),
                    child: AnimatedContainer(
                      duration: AppConstants.shortAnim,
                      padding: const EdgeInsets.all(6),
                      decoration: BoxDecoration(
                        color: isSelected
                            ? AppTheme.gold.withValues(alpha: 0.2)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color:
                              isSelected ? AppTheme.gold : Colors.transparent,
                          width: 2,
                        ),
                      ),
                      child: Text(emoji, style: const TextStyle(fontSize: 26)),
                    ),
                  );
                }).toList(),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: Text(tr(lang, 'Cancel', 'Отказ'),
                  style:
                      AppTheme.bodyStyle.copyWith(color: AppTheme.textMuted)),
            ),
            ElevatedButton(
              onPressed: () async {
                final name = nameCtrl.text.trim();
                if (name.isEmpty) return;
                await ref.read(classesProvider.notifier).addClass(
                      name: name,
                      emoji: selectedEmoji,
                    );
                if (ctx.mounted) Navigator.pop(ctx);
              },
              child: Text(tr(lang, 'Create', 'Създай')),
            ),
          ],
        ),
      ),
    );

    nameCtrl.dispose();
  }

  Future<void> _confirmDelete(
    BuildContext context,
    WidgetRef ref,
    ClassProfile cls,
  ) async {
    final lang = ref.read(localeProvider);
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.bgCard,
        title: Text(
          tr(lang, 'Delete ${cls.name}?', 'Изтрий ${cls.name}?'),
          style: GoogleFonts.boogaloo(color: AppTheme.wrong, fontSize: 22),
        ),
        content: Text(
          tr(
            lang,
            'All players and scores for this class will be deleted. This cannot be undone.',
            'Всички играчи и резултати за този клас ще бъдат изтрити. Това действие е необратимо.',
          ),
          style: AppTheme.bodyStyle.copyWith(color: AppTheme.textMuted),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(tr(lang, 'Cancel', 'Отказ')),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppTheme.wrong),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(tr(lang, 'Delete', 'Изтрий')),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await ref.read(classesProvider.notifier).removeClass(cls.id!);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-widgets
// ─────────────────────────────────────────────────────────────────────────────

class _Header extends StatelessWidget {
  const _Header({
    required this.onQuickPlay,
    required this.onGlobalLeaderboard,
    required this.onProfile,
    required this.onVoiceSettings,
    required this.lang,
  });

  final VoidCallback onQuickPlay;
  final VoidCallback onGlobalLeaderboard;
  final VoidCallback onProfile;
  final VoidCallback onVoiceSettings;
  final AppLanguage lang;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 8),
      child: Column(
        children: [
          // DLC store icon — top right
          Align(
            alignment: Alignment.centerRight,
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _TopActionChip(
                    label: tr(lang, 'Store', 'Магазин'),
                    icon: Icons.store_rounded,
                    onTap: () =>
                        Navigator.of(context).pushNamed(DlcScreen.routeName),
                  ),
                  const SizedBox(width: 8),
                  _TopActionChip(
                    label: tr(lang, 'Global', 'Глобално'),
                    icon: Icons.public_rounded,
                    onTap: onGlobalLeaderboard,
                  ),
                  const SizedBox(width: 8),
                  _TopActionChip(
                    label: tr(lang, 'Profile', 'Профил'),
                    icon: Icons.person_rounded,
                    onTap: onProfile,
                  ),
                  const SizedBox(width: 8),
                  _TopActionChip(
                    label: tr(lang, 'Voice', 'Глас'),
                    icon: Icons.record_voice_over_rounded,
                    onTap: onVoiceSettings,
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 8),
          // Star row
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(
              5,
              (i) => const Padding(
                padding: EdgeInsets.symmetric(horizontal: 2),
                child: Icon(Icons.star, color: AppTheme.gold, size: 18),
              ),
            ),
          ),
          const SizedBox(height: 8),
          Text('WHO WANTS TO BE',
              style: AppTheme.titleStyle.copyWith(fontSize: 22)),
          Text('SMART?', style: AppTheme.titleStyle.copyWith(fontSize: 36)),
          const SizedBox(height: 4),
          Text(
            tr(
              lang,
              'Select a class or jump into Quick Play',
              'Избери клас или започни Бърза игра',
            ),
            style: AppTheme.mutedStyle,
          ),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: onQuickPlay,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF67E8F9), Color(0xFFF9A8D4)],
                ),
                borderRadius: BorderRadius.circular(16),
                boxShadow: AppTheme.cardShadow,
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('🎮', style: TextStyle(fontSize: 18)),
                  const SizedBox(width: 8),
                  Text(
                    tr(lang, 'Quick Play', 'Бърза игра'),
                    style: GoogleFonts.boogaloo(
                      fontSize: 20,
                      color: AppTheme.bgDark,
                      letterSpacing: 0.7,
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

class _TopActionChip extends StatelessWidget {
  const _TopActionChip({
    required this.label,
    required this.icon,
    required this.onTap,
  });

  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: label,
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(
            color: AppTheme.bgSurface,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: AppTheme.gold.withValues(alpha: 0.4)),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, color: AppTheme.gold, size: 16),
              const SizedBox(width: 6),
              Text(
                label,
                style: AppTheme.mutedStyle
                    .copyWith(color: AppTheme.gold, fontSize: 12),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ClassList extends StatelessWidget {
  const _ClassList({
    required this.classes,
    required this.onSelect,
    required this.onLongPress,
  });

  final List<ClassProfile> classes;
  final ValueChanged<ClassProfile> onSelect;
  final ValueChanged<ClassProfile> onLongPress;

  @override
  Widget build(BuildContext context) {
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(20, 12, 20, 100),
      itemCount: classes.length,
      itemBuilder: (context, index) => _ClassCard(
        profile: classes[index],
        onTap: () => onSelect(classes[index]),
        onLongPress: () => onLongPress(classes[index]),
      ),
    );
  }
}

class _ClassCard extends StatelessWidget {
  const _ClassCard({
    required this.profile,
    required this.onTap,
    required this.onLongPress,
  });

  final ClassProfile profile;
  final VoidCallback onTap;
  final VoidCallback onLongPress;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          onLongPress: onLongPress,
          borderRadius: BorderRadius.circular(20),
          child: Ink(
            decoration: BoxDecoration(
              color: AppTheme.bgCard,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(
                color: AppTheme.bgSurface,
                width: 1.5,
              ),
              boxShadow: AppTheme.cardShadow,
            ),
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 18),
              child: Row(
                children: [
                  // Emoji avatar
                  Container(
                    width: 56,
                    height: 56,
                    decoration: BoxDecoration(
                      color: AppTheme.bgSurface,
                      borderRadius: BorderRadius.circular(14),
                    ),
                    child: Center(
                      child: Text(
                        profile.avatarEmoji,
                        style: const TextStyle(fontSize: 28),
                      ),
                    ),
                  ),
                  const SizedBox(width: 16),
                  // Class name
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          profile.name,
                          style: AppTheme.headlineStyle.copyWith(fontSize: 22),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Hold for options',
                          style: AppTheme.mutedStyle.copyWith(fontSize: 11),
                        ),
                      ],
                    ),
                  ),
                  const Icon(
                    Icons.arrow_forward_ios,
                    color: AppTheme.gold,
                    size: 18,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.onAdd, required this.lang});

  final VoidCallback onAdd;
  final AppLanguage lang;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('🏫', style: TextStyle(fontSize: 64)),
          const SizedBox(height: 16),
          Text(
            tr(lang, 'No classes yet!', 'Все още няма класове!'),
            style: AppTheme.headlineStyle,
          ),
          const SizedBox(height: 8),
          Text(
            tr(
              lang,
              'Tap the button below to create your first class.',
              'Натисни бутона по-долу, за да създадеш първия си клас.',
            ),
            style: AppTheme.mutedStyle,
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 28),
          ElevatedButton.icon(
            onPressed: onAdd,
            icon: const Icon(Icons.add),
            label: Text(tr(lang, 'Create First Class', 'Създай първи клас')),
          ),
        ],
      ),
    );
  }
}

class _AddButton extends StatelessWidget {
  const _AddButton({required this.onTap, required this.label});

  final VoidCallback onTap;
  final String label;

  @override
  Widget build(BuildContext context) {
    return FloatingActionButton.extended(
      onPressed: onTap,
      backgroundColor: AppTheme.gold,
      foregroundColor: AppTheme.bgDark,
      icon: const Icon(Icons.add),
      label: Text(
        label,
        style: GoogleFonts.boogaloo(fontSize: 16),
      ),
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.error});

  final String error;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.error_outline, color: AppTheme.wrong, size: 48),
          const SizedBox(height: 12),
          Text('Something went wrong', style: AppTheme.headlineStyle),
          const SizedBox(height: 4),
          Text(error, style: AppTheme.mutedStyle, textAlign: TextAlign.center),
        ],
      ),
    );
  }
}
