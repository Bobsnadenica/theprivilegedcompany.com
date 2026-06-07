import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

// ─────────────────────────────────────────────────────────────────────────────
// Deep-space game-show palette designed for high contrast on tablets/TVs.
// ─────────────────────────────────────────────────────────────────────────────
class AppTheme {
  AppTheme._();

  // ── Palette ───────────────────────────────────────────────────────────────
  static const Color bgDark = Color(0xFF0A0A2E);
  static const Color bgCard = Color(0xFF16155A);
  static const Color bgSurface = Color(0xFF1F1D7A);
  static const Color gold = Color(0xFFFFD700);
  static const Color goldLight = Color(0xFFFFF176);
  static const Color correct = Color(0xFF00C853);
  static const Color wrong = Color(0xFFEF5350);
  static const Color textWhite = Color(0xFFFFFFFF);
  static const Color textMuted = Color(0xFFB0BEC5);
  static const Color wheelHighlight = Color(0x40FFD700);

  // ── Gradients ─────────────────────────────────────────────────────────────
  static const LinearGradient bgGradient = LinearGradient(
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
    colors: [bgDark, bgCard],
  );

  static const LinearGradient goldGradient = LinearGradient(
    colors: [Color(0xFFFFC107), Color(0xFFFFD700), Color(0xFFFFF176)],
  );

  static const LinearGradient correctGradient = LinearGradient(
    colors: [Color(0xFF00C853), Color(0xFF69F0AE)],
  );

  static const LinearGradient wrongGradient = LinearGradient(
    colors: [Color(0xFFEF5350), Color(0xFFFF8A80)],
  );

  // ── Shadows ───────────────────────────────────────────────────────────────
  static List<BoxShadow> goldGlow = [
    BoxShadow(
      color: gold.withValues(alpha: 0.5),
      blurRadius: 20,
      spreadRadius: 2,
    ),
  ];

  static List<BoxShadow> cardShadow = [
    BoxShadow(
      color: Colors.black.withValues(alpha: 0.4),
      blurRadius: 12,
      offset: const Offset(0, 4),
    ),
  ];

  // ── Text Styles ───────────────────────────────────────────────────────────
  static TextStyle get titleStyle => GoogleFonts.boogaloo(
        fontSize: 32,
        color: gold,
        letterSpacing: 1.5,
        shadows: [Shadow(color: gold.withValues(alpha: 0.6), blurRadius: 12)],
      );

  static TextStyle get headlineStyle => GoogleFonts.boogaloo(
        fontSize: 26,
        color: textWhite,
        letterSpacing: 1.0,
      );

  static TextStyle get questionStyle => GoogleFonts.nunito(
        fontSize: 22,
        color: textWhite,
        fontWeight: FontWeight.w700,
        height: 1.4,
      );

  static TextStyle get answerStyle => GoogleFonts.nunito(
        fontSize: 20,
        color: textWhite,
        fontWeight: FontWeight.w700,
      );

  static TextStyle get bodyStyle => GoogleFonts.nunito(
        fontSize: 16,
        color: textWhite,
      );

  static TextStyle get mutedStyle => GoogleFonts.nunito(
        fontSize: 14,
        color: textMuted,
      );

  static TextStyle get wheelLetterStyle => GoogleFonts.boogaloo(
        fontSize: 44,
        color: textWhite,
        fontWeight: FontWeight.bold,
      );

  static TextStyle get arcadeNameStyle => GoogleFonts.boogaloo(
        fontSize: 52,
        color: gold,
        letterSpacing: 12,
        shadows: [Shadow(color: gold.withValues(alpha: 0.8), blurRadius: 16)],
      );

  // ── Theme ─────────────────────────────────────────────────────────────────
  static ThemeData get theme => ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        scaffoldBackgroundColor: bgDark,
        colorScheme: const ColorScheme.dark(
          primary: gold,
          secondary: bgSurface,
          surface: bgCard,
          onPrimary: bgDark,
          onSecondary: textWhite,
          onSurface: textWhite,
          error: wrong,
        ),
        // Status bar: transparent so we can paint behind it
        appBarTheme: const AppBarTheme(
          backgroundColor: Colors.transparent,
          elevation: 0,
          systemOverlayStyle: SystemUiOverlayStyle(
            statusBarColor: Colors.transparent,
            statusBarIconBrightness: Brightness.light,
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: gold,
            foregroundColor: bgDark,
            textStyle: GoogleFonts.boogaloo(fontSize: 20, letterSpacing: 1),
            padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 16),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(16),
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: bgSurface,
          hintStyle: GoogleFonts.nunito(color: textMuted),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: bgSurface),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: BorderSide(color: gold.withValues(alpha: 0.3)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: gold, width: 2),
          ),
        ),
        dialogTheme: DialogThemeData(
          backgroundColor: bgCard,
          shape:
              RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
        ),
      );
}
