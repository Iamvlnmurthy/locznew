import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

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
    const darkCanvas = Color(0xFF0B100E);
    const darkSurface = Color(0xFF151B18);
    const darkSurfaceHigh = Color(0xFF222B27);
    const darkOutline = Color(0xFF526159);
    const darkText = Color(0xFFF2F1EC);
    const darkSecondaryText = Color(0xFFB9C2BC);

    final scheme = ColorScheme(
      brightness: brightness,
      primary: isDark ? LoczColors.primary300 : LoczColors.primary500,
      onPrimary: isDark ? LoczColors.neutral900 : Colors.white,
      primaryContainer: isDark ? const Color(0xFF153D32) : LoczColors.primary50,
      onPrimaryContainer: isDark ? const Color(0xFFB8E9D8) : LoczColors.primary800,
      secondary: isDark ? LoczColors.accent300 : LoczColors.accent500,
      onSecondary: LoczColors.neutral900,
      secondaryContainer: isDark ? const Color(0xFF3D2D16) : LoczColors.accent50,
      onSecondaryContainer: isDark ? const Color(0xFFFFDDA9) : LoczColors.accent600,
      tertiary: isDark ? const Color(0xFF9CCBFA) : LoczColors.info,
      onTertiary: isDark ? const Color(0xFF003353) : Colors.white,
      tertiaryContainer: isDark ? const Color(0xFF17324A) : LoczColors.infoSurface,
      onTertiaryContainer: isDark ? const Color(0xFFCDE5FF) : LoczColors.info,
      error: isDark ? const Color(0xFFFFB4AB) : LoczColors.danger,
      onError: isDark ? const Color(0xFF690005) : Colors.white,
      errorContainer: isDark ? const Color(0xFF4A1E1B) : LoczColors.dangerSurface,
      onErrorContainer: isDark ? const Color(0xFFFFDAD5) : LoczColors.danger,
      surface: isDark ? darkSurface : LoczColors.neutral0,
      onSurface: isDark ? darkText : LoczColors.neutral900,
      onSurfaceVariant: isDark ? darkSecondaryText : LoczColors.neutral600,
      surfaceContainerLowest: isDark ? darkCanvas : LoczColors.neutral0,
      surfaceContainerLow: isDark ? const Color(0xFF101613) : LoczColors.neutral50,
      surfaceContainer: isDark ? darkSurface : LoczColors.neutral50,
      surfaceContainerHigh: isDark ? const Color(0xFF1B231F) : LoczColors.neutral100,
      surfaceContainerHighest: isDark ? darkSurfaceHigh : LoczColors.neutral100,
      outline: isDark ? darkOutline : LoczColors.neutral300,
      outlineVariant: isDark ? const Color(0xFF303C36) : LoczColors.neutral200,
      inverseSurface: isDark ? LoczColors.neutral50 : LoczColors.neutral800,
      onInverseSurface: isDark ? LoczColors.neutral800 : LoczColors.neutral50,
      inversePrimary: isDark ? LoczColors.primary600 : LoczColors.primary200,
      surfaceTint: Colors.transparent,
    );
    final secondaryCopy = isDark ? darkSecondaryText : LoczColors.neutral700;

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: isDark ? darkCanvas : LoczColors.neutral50,
      fontFamily: LoczTypography.fontFamily,
      // Inter carries no Telugu glyphs, so Telugu text falls back to Anek Telugu (a clean,
      // professional Telugu face) while Latin/digits stay on Inter.
      fontFamilyFallback: const ['AnekTelugu'],
      visualDensity: VisualDensity.standard,
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
          fontSize: 24,
          fontWeight: FontWeight.w700,
          height: 1.24,
          letterSpacing: -0.35,
          color: scheme.onSurface,
        ),
        titleLarge: TextStyle(
          fontSize: 20,
          fontWeight: FontWeight.w700,
          height: 1.3,
          letterSpacing: -0.2,
          color: scheme.onSurface,
        ),
        titleMedium: TextStyle(
          fontSize: 16,
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
        bodyLarge: TextStyle(fontSize: 15, height: 1.5, color: scheme.onSurface),
        bodyMedium: TextStyle(fontSize: 14, height: 1.48, color: secondaryCopy),
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
          color: isDark ? const Color(0xFFAAB4AE) : LoczColors.neutral700,
        ),
      ),
      appBarTheme: AppBarTheme(
        backgroundColor: isDark ? darkCanvas : LoczColors.neutral50,
        foregroundColor: scheme.onSurface,
        elevation: 0,
        scrolledUnderElevation: 0,
        centerTitle: false,
        toolbarHeight: 56,
        surfaceTintColor: Colors.transparent,
        systemOverlayStyle:
            (isDark ? SystemUiOverlayStyle.light : SystemUiOverlayStyle.dark).copyWith(
          statusBarColor: isDark ? darkCanvas : LoczColors.neutral50,
          systemNavigationBarColor: isDark ? darkCanvas : LoczColors.neutral0,
          systemNavigationBarDividerColor: Colors.transparent,
          systemNavigationBarIconBrightness: isDark ? Brightness.light : Brightness.dark,
        ),
        titleTextStyle: TextStyle(
          color: scheme.onSurface,
          fontSize: 17,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.25,
        ),
      ),
      cardTheme: CardThemeData(
        color: scheme.surface,
        elevation: 0,
        shadowColor: LoczColors.neutral900.withValues(alpha: 0.07),
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(
            color: isDark ? scheme.outlineVariant : scheme.outline.withValues(alpha: 0.42),
          ),
        ),
      ),
      listTileTheme: ListTileThemeData(
        minTileHeight: 58,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        iconColor: scheme.primary,
        textColor: scheme.onSurface,
        titleTextStyle: TextStyle(
          color: scheme.onSurface,
          fontSize: 14,
          fontWeight: FontWeight.w700,
          height: 1.3,
        ),
        subtitleTextStyle: TextStyle(
          color: scheme.onSurfaceVariant,
          fontSize: 12,
          height: 1.4,
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
        fillColor: isDark ? scheme.surfaceContainerHigh : scheme.surface,
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: scheme.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(
            color: isDark ? scheme.outlineVariant : scheme.outline,
          ),
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
        backgroundColor: isDark ? scheme.surfaceContainerHigh : scheme.surface,
        selectedColor: scheme.primaryContainer,
        disabledColor: scheme.surfaceContainerLow,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(LoczRadius.full),
        ),
        side: BorderSide(color: isDark ? scheme.outlineVariant : scheme.outline),
        // Chip labels do not reliably inherit onSurface across Material states.
        // An explicit foreground keeps ActionChip/FilterChip copy visible in both themes.
        labelStyle: TextStyle(
          fontSize: 12,
          fontWeight: FontWeight.w600,
          color: scheme.onSurfaceVariant,
        ),
        padding: const EdgeInsets.symmetric(horizontal: 4),
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
        color: isDark ? scheme.outlineVariant : scheme.outline.withValues(alpha: 0.45),
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
      dialogTheme: DialogThemeData(
        backgroundColor: scheme.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(24),
          side: BorderSide(color: scheme.outlineVariant),
        ),
        titleTextStyle: TextStyle(
          color: scheme.onSurface,
          fontSize: 20,
          fontWeight: FontWeight.w800,
          letterSpacing: -0.35,
        ),
        contentTextStyle: TextStyle(
          color: scheme.onSurfaceVariant,
          fontSize: 14,
          height: 1.5,
        ),
      ),
      floatingActionButtonTheme: FloatingActionButtonThemeData(
        backgroundColor: scheme.primary,
        foregroundColor: scheme.onPrimary,
        elevation: 0,
        focusElevation: 0,
        hoverElevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(17)),
      ),
      progressIndicatorTheme: ProgressIndicatorThemeData(
        color: scheme.primary,
        linearTrackColor: scheme.primaryContainer,
        circularTrackColor: scheme.primaryContainer,
      ),
      switchTheme: SwitchThemeData(
        thumbColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected) ? scheme.onPrimary : scheme.outline,
        ),
        trackColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected)
              ? scheme.primary
              : scheme.surfaceContainerHighest,
        ),
      ),
      checkboxTheme: CheckboxThemeData(
        fillColor: WidgetStateProperty.resolveWith(
          (states) => states.contains(WidgetState.selected) ? scheme.primary : Colors.transparent,
        ),
        side: BorderSide(color: scheme.outline, width: 1.4),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(5)),
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
