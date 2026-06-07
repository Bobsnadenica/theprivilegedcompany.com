import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/theme/app_theme.dart';
import 'features/arcade/screens/class_selection_screen.dart';
import 'features/arcade/screens/language_selection_screen.dart';
import 'features/arcade/screens/name_entry_screen.dart';
import 'features/arcade/screens/voice_settings_screen.dart';
import 'features/classroom/models/class_profile.dart';
import 'features/classroom/screens/leaderboard_screen.dart';
import 'features/classroom/screens/player_profile_screen.dart';
import 'features/dlc/screens/dlc_screen.dart';
import 'features/game/screens/game_over_screen.dart';
import 'features/game/screens/game_screen.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────
void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Immersive edge-to-edge mode — draws behind status & nav bars.
  await SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);

  // Lock portrait for now; tablet landscape can be enabled in a later phase.
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
  ]);

  runApp(
    const ProviderScope(child: WhoWantsToBeSmartApp()),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root application widget
// ─────────────────────────────────────────────────────────────────────────────
class WhoWantsToBeSmartApp extends StatelessWidget {
  const WhoWantsToBeSmartApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Who Wants to Be Smart?',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.theme,
      // Language selection is the first screen on every launch.
      // It skips to ClassSelectionScreen automatically if a preference is saved.
      initialRoute: LanguageSelectionScreen.routeName,
      onGenerateRoute: _router,
    );
  }

  // ── Route factory ──────────────────────────────────────────────────────────
  Route<dynamic>? _router(RouteSettings settings) {
    switch (settings.name) {
      // ── Language Selection (startup) ───────────────────────────────────
      case LanguageSelectionScreen.routeName:
        return PageRouteBuilder<void>(
          settings: settings,
          transitionDuration: const Duration(milliseconds: 400),
          pageBuilder: (_, __, ___) => const LanguageSelectionScreen(),
          transitionsBuilder: (_, animation, __, child) => FadeTransition(
            opacity: CurvedAnimation(parent: animation, curve: Curves.easeIn),
            child: child,
          ),
        );

      // ── Class Selection (home) ─────────────────────────────────────────
      case ClassSelectionScreen.routeName:
        return MaterialPageRoute<void>(
          builder: (_) => const ClassSelectionScreen(),
          settings: settings,
        );

      // ── Arcade Name Entry ──────────────────────────────────────────────
      case NameEntryScreen.routeName:
        return PageRouteBuilder<void>(
          settings: settings,
          transitionDuration: const Duration(milliseconds: 380),
          reverseTransitionDuration: const Duration(milliseconds: 280),
          pageBuilder: (_, __, ___) => const NameEntryScreen(),
          transitionsBuilder: (_, animation, __, child) {
            final slide = Tween<Offset>(
              begin: const Offset(1.0, 0.0),
              end: Offset.zero,
            ).animate(
              CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
            );
            final fade = Tween<double>(begin: 0.0, end: 1.0).animate(
              CurvedAnimation(
                parent: animation,
                curve: const Interval(0.0, 0.6, curve: Curves.easeIn),
              ),
            );
            return FadeTransition(
              opacity: fade,
              child: SlideTransition(position: slide, child: child),
            );
          },
        );

      // ── Voice Settings ─────────────────────────────────────────────────
      case VoiceSettingsScreen.routeName:
        return PageRouteBuilder<void>(
          settings: settings,
          transitionDuration: const Duration(milliseconds: 320),
          pageBuilder: (_, __, ___) => const VoiceSettingsScreen(),
          transitionsBuilder: (_, animation, __, child) => FadeTransition(
            opacity: CurvedAnimation(parent: animation, curve: Curves.easeIn),
            child: child,
          ),
        );

      // ── Game Screen ────────────────────────────────────────────────────
      case GameScreen.routeName:
        return PageRouteBuilder<void>(
          settings: settings,
          transitionDuration: const Duration(milliseconds: 400),
          pageBuilder: (_, __, ___) => const GameScreen(),
          transitionsBuilder: (_, animation, __, child) => FadeTransition(
            opacity: animation,
            child: child,
          ),
        );

      // ── Game Over Screen ───────────────────────────────────────────────
      case GameOverScreen.routeName:
        return PageRouteBuilder<void>(
          settings: settings,
          transitionDuration: const Duration(milliseconds: 500),
          pageBuilder: (_, __, ___) => const GameOverScreen(),
          transitionsBuilder: (_, animation, __, child) => FadeTransition(
            opacity: CurvedAnimation(parent: animation, curve: Curves.easeIn),
            child: child,
          ),
        );

      // ── DLC Content Store ──────────────────────────────────────────────
      case DlcScreen.routeName:
        return PageRouteBuilder<void>(
          settings: settings,
          transitionDuration: const Duration(milliseconds: 350),
          pageBuilder: (_, __, ___) => const DlcScreen(),
          transitionsBuilder: (_, animation, __, child) {
            final slide = Tween<Offset>(
              begin: const Offset(0, 1),
              end: Offset.zero,
            ).animate(
              CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
            );
            return SlideTransition(position: slide, child: child);
          },
        );

      // ── Class Leaderboard ──────────────────────────────────────────────
      case LeaderboardScreen.routeName:
        final cls = settings.arguments is ClassProfile
            ? settings.arguments as ClassProfile
            : null;
        return PageRouteBuilder<void>(
          settings: settings,
          transitionDuration: const Duration(milliseconds: 350),
          pageBuilder: (_, __, ___) => LeaderboardScreen(classProfile: cls),
          transitionsBuilder: (_, animation, __, child) {
            final slide = Tween<Offset>(
              begin: const Offset(1, 0),
              end: Offset.zero,
            ).animate(
              CurvedAnimation(parent: animation, curve: Curves.easeOutCubic),
            );
            return SlideTransition(position: slide, child: child);
          },
        );

      // ── Personal Profile ────────────────────────────────────────────────
      case PlayerProfileScreen.routeName:
        final playerId = settings.arguments as int;
        return PageRouteBuilder<void>(
          settings: settings,
          transitionDuration: const Duration(milliseconds: 350),
          pageBuilder: (_, __, ___) => PlayerProfileScreen(playerId: playerId),
          transitionsBuilder: (_, animation, __, child) => FadeTransition(
            opacity: CurvedAnimation(parent: animation, curve: Curves.easeIn),
            child: child,
          ),
        );

      default:
        return null;
    }
  }
}
