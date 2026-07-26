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
