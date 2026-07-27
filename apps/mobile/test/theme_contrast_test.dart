import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:locz/core/theme/app_theme.dart';

void main() {
  test('secondary and metadata copy retain rendered contrast headroom', () {
    for (final theme in [AppTheme.light, AppTheme.dark]) {
      final background = theme.scaffoldBackgroundColor;
      final minimumRatio = theme.brightness == Brightness.light ? 7.0 : 4.5;

      for (final style in [
        theme.textTheme.bodyMedium!,
        theme.textTheme.labelSmall!,
      ]) {
        expect(
          _contrastRatio(style.color!, background),
          greaterThanOrEqualTo(minimumRatio),
          reason: '${theme.brightness.name} small secondary copy must remain readable',
        );
      }
    }
  });

  test('dark theme has distinct surfaces and accessible semantic pairs', () {
    final theme = AppTheme.dark;
    final scheme = theme.colorScheme;

    expect(theme.scaffoldBackgroundColor, isNot(scheme.surface));
    expect(scheme.surface, isNot(scheme.surfaceContainerHigh));
    expect(scheme.surfaceContainerHigh, isNot(scheme.surfaceContainerHighest));
    expect(
      theme.scaffoldBackgroundColor.computeLuminance(),
      lessThan(scheme.surface.computeLuminance()),
    );
    expect(
      scheme.surface.computeLuminance(),
      lessThan(scheme.surfaceContainerHighest.computeLuminance()),
    );

    for (final pair in [
      (scheme.onSurface, scheme.surface, 7.0, 'primary copy'),
      (scheme.onSurfaceVariant, scheme.surface, 4.5, 'secondary copy'),
      (scheme.onPrimaryContainer, scheme.primaryContainer, 4.5, 'selected controls'),
      (scheme.onErrorContainer, scheme.errorContainer, 4.5, 'error messages'),
      (scheme.onTertiaryContainer, scheme.tertiaryContainer, 4.5, 'information messages'),
    ]) {
      expect(
        _contrastRatio(pair.$1, pair.$2),
        greaterThanOrEqualTo(pair.$3),
        reason: 'Dark-theme ${pair.$4} must remain readable',
      );
    }
  });
}

double _contrastRatio(Color first, Color second) {
  final lighter = first.computeLuminance() > second.computeLuminance()
      ? first.computeLuminance()
      : second.computeLuminance();
  final darker = first.computeLuminance() > second.computeLuminance()
      ? second.computeLuminance()
      : first.computeLuminance();
  return (lighter + 0.05) / (darker + 0.05);
}
