import 'package:flutter/material.dart';

import 'tokens.g.dart';

/// Material theme built from the generated design tokens, so mobile, web and admin
/// share one visual system. Never hardcode a colour in a widget — add or use a token.
class AppTheme {
  const AppTheme._();

  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;

    final scheme = ColorScheme(
      brightness: brightness,
      // The lighter primary is used on dark surfaces so the teal keeps its contrast.
      primary: isDark ? LoczColors.primary400 : LoczColors.primary500,
      onPrimary: isDark ? LoczColors.neutral900 : Colors.white,
      secondary: isDark ? LoczColors.accent300 : LoczColors.accent500,
      onSecondary: LoczColors.neutral900,
      error: LoczColors.danger,
      onError: Colors.white,
      surface: isDark ? LoczColors.neutral800 : LoczColors.neutral0,
      onSurface: isDark ? LoczColors.neutral50 : LoczColors.neutral900,
      surfaceContainerHighest: isDark ? LoczColors.neutral700 : LoczColors.neutral100,
      outline: isDark ? LoczColors.neutral600 : LoczColors.neutral300,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: isDark ? LoczColors.neutral900 : LoczColors.neutral50,
      fontFamily: LoczTypography.fontFamily,

      // Line heights are generous throughout: Telugu and Devanagari glyphs are taller
      // than Latin at the same point size and get clipped by a Latin-tuned scale.
      textTheme: TextTheme(
        headlineSmall: TextStyle(
          fontSize: LoczTypography.xxl,
          fontWeight: FontWeight.w700,
          height: LoczTypography.leadingTight,
          color: scheme.onSurface,
        ),
        titleMedium: TextStyle(
          fontSize: LoczTypography.lg,
          fontWeight: FontWeight.w600,
          height: LoczTypography.leadingTight,
          color: scheme.onSurface,
        ),
        bodyLarge: TextStyle(
          fontSize: LoczTypography.base,
          height: LoczTypography.leadingNormal,
          color: scheme.onSurface,
        ),
        bodyMedium: TextStyle(
          fontSize: LoczTypography.sm,
          height: LoczTypography.leadingNormal,
          // Leave headroom for glyph anti-aliasing, which lowers the contrast of
          // rendered 12–14 px text compared with the raw token pair.
          color: isDark ? LoczColors.neutral300 : LoczColors.neutral700,
        ),
        labelSmall: TextStyle(
          fontSize: LoczTypography.xs,
          // Small metadata needs the stronger neutral to clear WCAG 4.5:1 on the
          // warm scaffold surface after glyph anti-aliasing.
          color: isDark ? LoczColors.neutral400 : LoczColors.neutral700,
        ),
      ),

      appBarTheme: AppBarTheme(
        backgroundColor: scheme.surface,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 1,
        centerTitle: false,
      ),

      cardTheme: CardThemeData(
        color: scheme.surface,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(LoczRadius.lg),
          side: BorderSide(color: scheme.outline.withValues(alpha: 0.6)),
        ),
      ),

      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          // 48dp: these are tapped one-handed on a phone.
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(LoczRadius.full),
          ),
          textStyle: const TextStyle(
            fontSize: LoczTypography.base,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),

      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(LoczRadius.full),
          ),
        ),
      ),

      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surface,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: LoczSpacing.x4,
          vertical: LoczSpacing.x4,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(LoczRadius.md),
          borderSide: BorderSide(color: scheme.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(LoczRadius.md),
          borderSide: BorderSide(color: scheme.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(LoczRadius.md),
          borderSide: BorderSide(color: scheme.primary, width: 2),
        ),
      ),

      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(LoczRadius.full),
        ),
        side: BorderSide(color: scheme.outline),
      ),

      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surface,
        indicatorColor: isDark ? LoczColors.primary800 : LoczColors.primary50,
        height: 64,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
      ),
    );
  }
}
