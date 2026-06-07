import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/constants/app_constants.dart';
import '../../../core/enums/app_language.dart';
import '../../../core/localization/simple_text.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/providers/session_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/joyful_kids_background.dart';
import '../../game/screens/game_screen.dart';
import '../widgets/wheel_letter_picker.dart';

// ─────────────────────────────────────────────────────────────────────────────
// NameEntryScreen
//
// Retro arcade 3-letter name picker. Three ListWheelScrollView columns let
// the player spin to any A-Z letter. A live preview shows the current name.
// Tapping PLAY calls SessionNotifier.confirmPlayer() which runs the DB upsert.
// ─────────────────────────────────────────────────────────────────────────────
class NameEntryScreen extends ConsumerStatefulWidget {
  const NameEntryScreen({super.key});

  static const routeName = '/name-entry';

  @override
  ConsumerState<NameEntryScreen> createState() => _NameEntryScreenState();
}

class _NameEntryScreenState extends ConsumerState<NameEntryScreen>
    with SingleTickerProviderStateMixin {
  late final List<FixedExtentScrollController> _controllers;
  late final AnimationController _pulseCtrl;
  late final Animation<double> _pulseAnim;

  // Tracks which wheel is being actively scrolled.
  int _activeWheel = -1;

  @override
  void initState() {
    super.initState();

    // Initialise each wheel at 'A' (index 0).
    _controllers = List.generate(
      AppConstants.nameLength,
      (_) => FixedExtentScrollController(),
    );

    // Gentle pulsing glow on the PLAY button.
    _pulseCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 900),
    )..repeat(reverse: true);

    _pulseAnim = Tween<double>(begin: 0.85, end: 1.0).animate(
      CurvedAnimation(parent: _pulseCtrl, curve: Curves.easeInOut),
    );

    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final hasClass = ref.read(sessionProvider).selectedClass != null;
      if (hasClass) return;
      await ref.read(sessionProvider.notifier).selectQuickPlayClass();
    });
  }

  @override
  void dispose() {
    for (final c in _controllers) {
      c.dispose();
    }
    _pulseCtrl.dispose();
    super.dispose();
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  void _onLetterChanged(int position, String letter) {
    ref.read(sessionProvider.notifier).updateNameAt(position, letter);
  }

  Future<void> _onPlayPressed() async {
    final session = ref.read(sessionProvider);
    if (session.isConfirming) return;

    try {
      if (session.selectedClass == null) {
        await ref.read(sessionProvider.notifier).selectQuickPlayClass();
      }
      await ref.read(sessionProvider.notifier).confirmPlayer();
      if (!mounted) return;
      Navigator.of(context).pushNamed(GameScreen.routeName);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Error: $e'),
          backgroundColor: AppTheme.wrong,
        ),
      );
    }
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final session = ref.watch(sessionProvider);
    final lang = ref.watch(localeProvider);
    final className = session.selectedClass?.name ?? '—';
    final pendingName = session.pendingName.padRight(3, 'A');

    return Scaffold(
      body: Stack(
        children: [
          const Positioned.fill(child: JoyfulKidsBackground()),
          Container(
            decoration: const BoxDecoration(gradient: AppTheme.bgGradient),
            child: SafeArea(
              child: Column(
                children: [
                  _buildHeader(className),
                  const Spacer(),
                  _buildInstructions(lang),
                  const SizedBox(height: 28),
                  _buildWheelRow(pendingName),
                  const SizedBox(height: 20),
                  _buildNamePreview(lang, pendingName),
                  const Spacer(),
                  _buildPlayButton(lang, session.isConfirming),
                  const SizedBox(height: 36),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  // ── Section builders ───────────────────────────────────────────────────────

  Widget _buildHeader(String className) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Row(
        children: [
          // Back
          _GoldIconButton(
            icon: Icons.arrow_back_ios_new,
            onTap: () => Navigator.of(context).pop(),
          ),
          const Spacer(),
          // Class name badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            decoration: BoxDecoration(
              color: AppTheme.bgSurface,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: AppTheme.gold.withValues(alpha: 0.4)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.school, color: AppTheme.gold, size: 16),
                const SizedBox(width: 6),
                Text(className, style: AppTheme.bodyStyle),
              ],
            ),
          ),
          const Spacer(),
          // Invisible spacer to keep badge centred.
          const SizedBox(width: 40),
        ],
      ),
    );
  }

  Widget _buildInstructions(AppLanguage lang) {
    return Column(
      children: [
        Text(
          tr(lang, 'SPIN YOUR NAME', 'ЗАВЪРТИ ИМЕТО СИ'),
          style: AppTheme.titleStyle.copyWith(fontSize: 28),
        ),
        const SizedBox(height: 4),
        Text(
          tr(
            lang,
            'Scroll each wheel to pick a letter',
            'Завърти всяко колело, за да избереш буква',
          ),
          style: AppTheme.mutedStyle,
        ),
      ],
    );
  }

  Widget _buildWheelRow(String name) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(AppConstants.nameLength, (i) {
        final isActive = _activeWheel == i;
        return Padding(
          padding: EdgeInsets.symmetric(horizontal: i == 1 ? 12.0 : 0.0),
          child: GestureDetector(
            // Track which column the finger is on for the highlight effect.
            onPanDown: (_) => setState(() => _activeWheel = i),
            onPanEnd: (_) => setState(() => _activeWheel = -1),
            onTapDown: (_) => setState(() => _activeWheel = i),
            onTapUp: (_) => setState(() => _activeWheel = -1),
            child: WheelLetterPicker(
              controller: _controllers[i],
              isHighlighted: isActive,
              onChanged: (letter) => _onLetterChanged(i, letter),
            ),
          ),
        );
      }),
    );
  }

  Widget _buildNamePreview(AppLanguage lang, String name) {
    return Column(
      children: [
        Text(tr(lang, 'YOUR NAME', 'ТВОЕТО ИМЕ'), style: AppTheme.mutedStyle),
        const SizedBox(height: 4),
        Text(name, style: AppTheme.arcadeNameStyle),
      ],
    );
  }

  Widget _buildPlayButton(AppLanguage lang, bool isLoading) {
    return AnimatedBuilder(
      animation: _pulseAnim,
      builder: (context, child) => Transform.scale(
        scale: _pulseAnim.value,
        child: child,
      ),
      child: isLoading
          ? const SizedBox(
              width: 220,
              height: 62,
              child: Center(
                child: CircularProgressIndicator(color: AppTheme.gold),
              ),
            )
          : _PlayButton(
              label: tr(lang, 'PLAY!', 'ИГРАЙ!'),
              onPressed: _onPlayPressed,
            ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Local sub-widgets
// ─────────────────────────────────────────────────────────────────────────────

class _PlayButton extends StatelessWidget {
  const _PlayButton({required this.onPressed, required this.label});

  final VoidCallback onPressed;
  final String label;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onPressed,
      child: Container(
        width: 220,
        height: 62,
        decoration: BoxDecoration(
          gradient: AppTheme.goldGradient,
          borderRadius: BorderRadius.circular(18),
          boxShadow: AppTheme.goldGlow,
        ),
        child: Center(
          child: Text(
            label,
            style: GoogleFonts.boogaloo(
              fontSize: 28,
              color: AppTheme.bgDark,
              letterSpacing: 3,
            ),
          ),
        ),
      ),
    );
  }
}

class _GoldIconButton extends StatelessWidget {
  const _GoldIconButton({required this.icon, required this.onTap});

  final IconData icon;
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
        child: Icon(icon, color: AppTheme.gold, size: 18),
      ),
    );
  }
}
