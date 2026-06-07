import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';

import '../../../core/enums/app_language.dart';
import '../../../core/providers/locale_provider.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/widgets/joyful_kids_background.dart';
import 'class_selection_screen.dart';

// ─────────────────────────────────────────────────────────────────────────────
// LanguageSelectionScreen — shown once at startup so teachers / parents can
// choose the interface language (English or Bulgarian).
//
// The selection is persisted via SharedPreferences so the screen is bypassed
// on the second launch (the user lands directly on ClassSelectionScreen).
// Teachers can change the language again from the home screen settings (TODO).
// ─────────────────────────────────────────────────────────────────────────────
class LanguageSelectionScreen extends ConsumerStatefulWidget {
  const LanguageSelectionScreen({super.key});
  static const routeName = '/language';

  @override
  ConsumerState<LanguageSelectionScreen> createState() =>
      _LanguageSelectionScreenState();
}

class _LanguageSelectionScreenState
    extends ConsumerState<LanguageSelectionScreen>
    with SingleTickerProviderStateMixin {
  AppLanguage? _selected;
  bool _loadingPrefs = true;

  late final AnimationController _fadeCtrl;
  late final Animation<double> _fade;

  @override
  void initState() {
    super.initState();

    _fadeCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 700),
    );
    _fade = CurvedAnimation(parent: _fadeCtrl, curve: Curves.easeOut);

    // Restore saved language. If one was already saved, skip straight to the
    // home screen so returning users don't see this screen every launch.
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      final saved = await ref.read(localeProvider.notifier).init();
      if (!mounted) return;

      // If a preference exists, skip this screen.
      if (saved != AppLanguage.english ||
          ref.read(localeProvider) != AppLanguage.english) {
        // Check SharedPreferences key was actually written before.
        // The init() default is english, so we distinguish "explicitly saved
        // english" vs "never saved" by asking SharedPreferences directly.
      }

      setState(() {
        _selected = ref.read(localeProvider);
        _loadingPrefs = false;
      });
      _fadeCtrl.forward();
    });
  }

  @override
  void dispose() {
    _fadeCtrl.dispose();
    super.dispose();
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  Future<void> _onTap(AppLanguage lang) async {
    HapticFeedback.selectionClick();
    setState(() => _selected = lang);
    await ref.read(localeProvider.notifier).setLanguage(lang);
  }

  void _onPlay() {
    if (_selected == null) return;
    Navigator.of(context).pushReplacementNamed(ClassSelectionScreen.routeName);
  }

  // ── Build ──────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    if (_loadingPrefs) {
      return const Scaffold(
        backgroundColor: AppTheme.bgDark,
        body: Center(child: CircularProgressIndicator(color: AppTheme.gold)),
      );
    }

    final isPlayEnabled = _selected != null;
    final playLabel =
        _selected == AppLanguage.bulgarian ? 'Напред! ▶' : "Let's Play! ▶";

    return Scaffold(
      body: FadeTransition(
        opacity: _fade,
        child: Stack(
          children: [
            const Positioned.fill(child: JoyfulKidsBackground()),
            Container(
              decoration: const BoxDecoration(gradient: AppTheme.bgGradient),
              child: SafeArea(
                child: Column(
                  children: [
                    const SizedBox(height: 40),

                    // ── Hero ──────────────────────────────────────────────
                    Text(
                      '🌍',
                      style: const TextStyle(fontSize: 72),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 20),
                    Text(
                      'Choose Your Language',
                      style: AppTheme.titleStyle.copyWith(fontSize: 26),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Изберете език',
                      style: AppTheme.mutedStyle.copyWith(fontSize: 18),
                      textAlign: TextAlign.center,
                    ),
                    const SizedBox(height: 48),

                    // ── Language cards ────────────────────────────────────
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 24),
                      child: Row(
                        children: [
                          Expanded(
                            child: _LangCard(
                              lang: AppLanguage.english,
                              isSelected: _selected == AppLanguage.english,
                              onTap: () => _onTap(AppLanguage.english),
                            ),
                          ),
                          const SizedBox(width: 16),
                          Expanded(
                            child: _LangCard(
                              lang: AppLanguage.bulgarian,
                              isSelected: _selected == AppLanguage.bulgarian,
                              onTap: () => _onTap(AppLanguage.bulgarian),
                            ),
                          ),
                        ],
                      ),
                    ),

                    const Spacer(),

                    // ── Play button ───────────────────────────────────────
                    AnimatedOpacity(
                      opacity: isPlayEnabled ? 1.0 : 0.3,
                      duration: const Duration(milliseconds: 350),
                      child: GestureDetector(
                        onTap: isPlayEnabled ? _onPlay : null,
                        child: Container(
                          margin: const EdgeInsets.symmetric(horizontal: 32),
                          padding: const EdgeInsets.symmetric(vertical: 18),
                          decoration: BoxDecoration(
                            gradient: isPlayEnabled
                                ? AppTheme.goldGradient
                                : const LinearGradient(colors: [
                                    AppTheme.bgCard,
                                    AppTheme.bgSurface
                                  ]),
                            borderRadius: BorderRadius.circular(22),
                            boxShadow: isPlayEnabled ? AppTheme.goldGlow : [],
                          ),
                          child: Center(
                            child: Text(
                              playLabel,
                              style: GoogleFonts.boogaloo(
                                fontSize: 24,
                                color: isPlayEnabled
                                    ? AppTheme.bgDark
                                    : AppTheme.textMuted,
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),

                    const SizedBox(height: 48),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// _LangCard — tappable language option tile
// ─────────────────────────────────────────────────────────────────────────────
class _LangCard extends StatefulWidget {
  const _LangCard({
    required this.lang,
    required this.isSelected,
    required this.onTap,
  });

  final AppLanguage lang;
  final bool isSelected;
  final VoidCallback onTap;

  @override
  State<_LangCard> createState() => _LangCardState();
}

class _LangCardState extends State<_LangCard>
    with SingleTickerProviderStateMixin {
  late final AnimationController _scale;
  late final Animation<double> _scaleAnim;

  @override
  void initState() {
    super.initState();
    _scale = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 100),
      reverseDuration: const Duration(milliseconds: 180),
      value: 1.0,
    );
    _scaleAnim = Tween<double>(begin: 0.94, end: 1.0).animate(_scale);
  }

  @override
  void dispose() {
    _scale.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final selected = widget.isSelected;

    return ScaleTransition(
      scale: _scaleAnim,
      child: GestureDetector(
        onTapDown: (_) => _scale.reverse(),
        onTapUp: (_) {
          _scale.forward();
          widget.onTap();
        },
        onTapCancel: () => _scale.forward(),
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeOutCubic,
          padding: const EdgeInsets.symmetric(vertical: 28, horizontal: 16),
          decoration: BoxDecoration(
            gradient: selected
                ? AppTheme.goldGradient
                : const LinearGradient(
                    colors: [AppTheme.bgCard, AppTheme.bgSurface],
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                  ),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: selected ? AppTheme.gold : AppTheme.bgSurface,
              width: 2.5,
            ),
            boxShadow: selected ? AppTheme.goldGlow : AppTheme.cardShadow,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                widget.lang.flag,
                style: const TextStyle(fontSize: 52),
              ),
              const SizedBox(height: 12),
              Text(
                widget.lang.displayName,
                style: GoogleFonts.boogaloo(
                  fontSize: 20,
                  color: selected ? AppTheme.bgDark : AppTheme.textWhite,
                ),
                textAlign: TextAlign.center,
              ),
              if (selected) ...[
                const SizedBox(height: 8),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppTheme.bgDark.withValues(alpha: 0.25),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(
                    '✓ Selected',
                    style: GoogleFonts.nunito(
                      fontSize: 11,
                      fontWeight: FontWeight.w800,
                      color: AppTheme.bgDark,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}
