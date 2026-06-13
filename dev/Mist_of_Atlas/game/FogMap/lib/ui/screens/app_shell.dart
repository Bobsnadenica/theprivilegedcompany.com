import 'package:flutter/material.dart';

import '../../controllers/app_controller.dart';
import '../../core/utils/armory_progression.dart';
import '../../data/models/achievement.dart';
import 'achievements_screen.dart';
import 'map_screen.dart';
import 'profile_screen.dart';

class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.controller});

  final AppController controller;

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: widget.controller,
      builder: (context, _) {
        final identityKey = widget.controller.profile.id;
        final screens = [
          MapScreen(
            key: ValueKey('map-$identityKey'),
            controller: widget.controller,
          ),
          ProfileScreen(
            key: ValueKey('profile-$identityKey'),
            controller: widget.controller,
          ),
          AchievementsScreen(
            key: ValueKey('achievements-$identityKey'),
            controller: widget.controller,
          ),
        ];

        WidgetsBinding.instance.addPostFrameCallback((_) {
          final error = widget.controller.error;
          if (error != null && context.mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(error)),
            );
            widget.controller.clearError();
          }

          // Surface a celebratory toast the first time an achievement
          // transitions from locked to unlocked. The controller itself
          // dedupes so this is safe to call on every rebuild.
          final unlocked =
              widget.controller.consumePendingAchievementUnlocks();
          if (unlocked.isNotEmpty && context.mounted) {
            _showAchievementUnlockedSnackBar(context, unlocked);
          }
        });

        return Scaffold(
          body: IndexedStack(index: _index, children: screens),
          bottomNavigationBar: DecoratedBox(
            decoration: const BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [
                  Color(0xFF13100D),
                  Color(0xFF0F1318),
                ],
              ),
              border: Border(
                top: BorderSide(color: Color(0x22D6B36A)),
              ),
            ),
            child: NavigationBar(
              selectedIndex: _index,
              onDestinationSelected: (value) => setState(() => _index = value),
              destinations: const [
                NavigationDestination(
                  icon: Icon(Icons.map_outlined),
                  selectedIcon: Icon(Icons.map),
                  label: 'Map',
                ),
                NavigationDestination(
                  icon: Icon(Icons.shield_outlined),
                  selectedIcon: Icon(Icons.shield),
                  label: 'Hero',
                ),
                NavigationDestination(
                  icon: Icon(Icons.emoji_events_outlined),
                  selectedIcon: Icon(Icons.emoji_events),
                  label: 'Deeds',
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void _showAchievementUnlockedSnackBar(
    BuildContext context,
    List<Achievement> achievements,
  ) {
    final messenger = ScaffoldMessenger.of(context);
    // Show only the highest-tier unlock from this batch to avoid stacking
    // multiple toasts when several thresholds clear at once.
    achievements.sort((a, b) => b.tier.index.compareTo(a.tier.index));
    final top = achievements.first;
    final gearLabel =
        ArmoryProgressionBuilder.achievementToGearLabel[top.id];
    final extraCount = achievements.length - 1;

    final content = StringBuffer('Deed unlocked: ${top.title}');
    if (gearLabel != null) {
      content.write(' — Earned $gearLabel');
    }
    if (extraCount > 0) {
      content.write(' (+$extraCount more)');
    }

    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: const Color(0xFF1F2D24),
        duration: const Duration(seconds: 4),
        content: Row(
          children: [
            const Icon(
              Icons.emoji_events,
              color: Color(0xFFE7C36F),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                content.toString(),
                style: const TextStyle(
                  color: Color(0xFFF3EBDC),
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
        action: SnackBarAction(
          textColor: const Color(0xFFE7C36F),
          label: 'View',
          onPressed: () {
            setState(() => _index = 2);
          },
        ),
      ),
    );
  }
}
