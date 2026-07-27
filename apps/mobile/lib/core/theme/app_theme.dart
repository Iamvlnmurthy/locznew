import 'package:flutter/material.dart';

import 'tokens.g.dart';

/// The native LocZ visual language: warm, compact, local and intentionally quieter
/// than Material's defaults. Telugu and Devanagari retain enough line height while
/// Latin UI copy stays dense enough for a phone.
class AppTheme {
  const AppTheme._();

  static ThemeData get light => _build(Brightness.light);
  static ThemeData get dark => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;
    final scheme = ColorScheme(
      brightness: brightness,
      primary: isDark ? LoczColors.primary300 : LoczColors.primary500,
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
    final secondaryCopy = isDark ? LoczColors.neutral300 : LoczColors.neutral700;

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: isDark ? LoczColors.neutral900 : LoczColors.neutral50,
      fontFamily: LoczTypography.fontFamily,
      visualDensity: VisualDensity.compact,
      splashFactory: InkSparkle.splashFactory,
      textTheme: TextTheme(
        displaySmall: TextStyle(
          fontSize: 28,
          fontWeight: FontWeight.w800,
          height: 1.18,
          letterSpacing: -0.7,
          color: scheme.onSurface,
        ),
        headlineSmall: TextStyle(
          fontSize: 22,
          fontWeight: FontWeight.w700,
          height: 1.24,
          letterSpacing: -0.35,
          color: scheme.onSurface,
        ),
        titleLarge: TextStyle(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          height: 1.3,
          letterSpacing: -0.2,
          color: scheme.onSurface,
        ),
        titleMedium: TextStyle(
          fontSize: 15,
          fontWeight: FontWeight.w700,
          height: 1.35,
          letterSpacing: -0.1,
          color: scheme.onSurface,
        ),
        titleSmall: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w600,
          height: 1.35,
          color: scheme.onSurface,
        ),
        bodyLarge: TextStyle(fontSize: 14, height: 1.5, color: scheme.onSurface),
        bodyMedium: TextStyle(fontSize: 13, height: 1.48, color: secondaryCopy),
        labelLarge: TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          height: 1.25,
          color: scheme.onSurface,
        ),
        labelMedium: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          height: 1.3,
          color: secondaryCopy,
        ),
        labelSmall: TextStyle(
          fontSize: 11,
          height: 1.35,
          color: isDark ? LoczColors.neutral400 : LoczColors.neutral700,
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: isDark ? LoczColors.neutral900 : LoczColors.neutral50,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        toolbarHeight: 56,
        surfaceTintColor: Colors.transparent,
        titleTextStyle: TextStyle(
          color: scheme.onSurface,
          fontSize: 17,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.25,
        ),
      ),
      cardTheme: CardThemeData(
        color: scheme.surface,
        elevation: isDark ? 0 : 0.5,
        shadowColor: LoczColors.neutral900.withValues(alpha: 0.08),
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: scheme.outline.withValues(alpha: isDark ? 0.5 : 0.42)),
        ),
      ),
      filledButtonTheme: FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size(0, 44),
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 11),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          minimumSize: const Size(0, 44),
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          side: BorderSide(color: scheme.outline),
          textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(
          minimumSize: const Size(44, 40),
          textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: scheme.surface,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: scheme.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: scheme.outline),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
        labelStyle: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
        hintStyle: TextStyle(fontSize: 13, color: scheme.onSurfaceVariant),
        prefixIconConstraints: const BoxConstraints(minWidth: 42, minHeight: 42),
        suffixIconConstraints: const BoxConstraints(minWidth: 42, minHeight: 42),
      ),
      chipTheme: ChipThemeData(
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(LoczRadius.full)),
        side: BorderSide(color: scheme.outline),
        labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
        padding: const EdgeInsets.symmetric(horizontal: 4),
        visualDensity: VisualDensity.compact,
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: scheme.surface,
        indicatorColor: isDark ? LoczColors.primary800 : LoczColors.primary50,
        height: 66,
        elevation: 0,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        labelTextStyle: WidgetStateProperty.resolveWith(
          (states) => TextStyle(
            fontSize: 10.5,
            fontWeight: states.contains(WidgetState.selected) ? FontWeight.w700 : FontWeight.w500,
            color: states.contains(WidgetState.selected) ? scheme.primary : scheme.onSurfaceVariant,
          ),
        ),
        iconTheme: WidgetStateProperty.resolveWith(
          (states) => IconThemeData(
            size: 21,
            color: states.contains(WidgetState.selected) ? scheme.primary : scheme.onSurfaceVariant,
          ),
        ),
      ),
      dividerTheme: DividerThemeData(
        color: scheme.outline.withValues(alpha: 0.45),
        thickness: 0.7,
        space: 1,
      ),
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        showDragHandle: true,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
        ),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: isDark ? LoczColors.neutral50 : LoczColors.neutral900,
        contentTextStyle: TextStyle(
          color: isDark ? LoczColors.neutral900 : LoczColors.neutral50,
          fontSize: 13,
        ),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
      ),
    );
  }
}
