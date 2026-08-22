import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:locz/core/i18n/strings.dart';
import 'package:locz/core/theme/app_theme.dart';
import 'package:locz/core/update/app_update.dart';
import 'package:locz/core/update/update_banner.dart';

void main() {
  testWidgets('update prompt stays usable at 320px in Telugu dark mode', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 700));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: ThemeMode.dark,
        locale: const Locale('te'),
        supportedLocales: const [Locale('en'), Locale('te'), Locale('hi')],
        localizationsDelegates: const [
          StringsDelegate(AppLocaleOption.te),
          GlobalMaterialLocalizations.delegate,
          GlobalWidgetsLocalizations.delegate,
          GlobalCupertinoLocalizations.delegate,
        ],
        home: Scaffold(
          body: Align(
            alignment: Alignment.topCenter,
            child: UpdateBanner(checker: _UpdateChecker()),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('నవీకరించండి'), findsOneWidget);
    expect(find.byTooltip('ఇప్పుడు వద్దు'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.tap(find.byTooltip('ఇప్పుడు వద్దు'));
    await tester.pumpAndSettle();
    expect(find.text('నవీకరించండి'), findsNothing);
  });
}

class _UpdateChecker extends AppUpdateChecker {
  @override
  Future<AvailableUpdate?> check() async => const AvailableUpdate(
        versionName: '2.4.0',
        versionCode: 240,
        url: 'https://locz.in/download/locz.apk',
        sizeBytes: 25 * 1048576,
        sha256: '0000000000000000000000000000000000000000000000000000000000000000',
      );
}
