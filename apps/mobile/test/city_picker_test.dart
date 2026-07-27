import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:locz/core/i18n/strings.dart';
import 'package:locz/core/providers.dart';
import 'package:locz/core/theme/app_theme.dart';
import 'package:locz/features/listings/domain/models.dart';
import 'package:locz/features/location/presentation/city_picker_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('coming-soon cities cannot become the active location', (tester) async {
    SharedPreferences.setMockInitialValues({});
    const launched = City(
      id: 'hyderabad',
      name: 'Hyderabad',
      slug: 'hyderabad',
      stateName: 'Telangana',
      latitude: 17.385,
      longitude: 78.4867,
      isLaunched: true,
    );
    const upcoming = City(
      id: 'pune',
      name: 'Pune',
      slug: 'pune',
      stateName: 'Maharashtra',
      latitude: 18.5204,
      longitude: 73.8567,
      isLaunched: false,
    );
    final router = GoRouter(
      initialLocation: '/',
      routes: [
        GoRoute(path: '/', builder: (_, __) => const Scaffold(body: Text('Home'))),
        GoRoute(path: '/location', builder: (_, __) => const CityPickerScreen()),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          citiesProvider.overrideWith((ref) async => const [upcoming, launched]),
        ],
        child: MaterialApp.router(
          routerConfig: router,
          theme: AppTheme.light,
          locale: const Locale('en'),
          supportedLocales: const [Locale('en'), Locale('te'), Locale('hi')],
          localizationsDelegates: const [
            StringsDelegate(AppLocaleOption.en),
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
        ),
      ),
    );
    await tester.pumpAndSettle();
    unawaited(router.push('/location'));
    await tester.pumpAndSettle();

    expect(find.text('soon'), findsOneWidget);
    final upcomingTile = tester.widget<ListTile>(
      find.widgetWithText(ListTile, 'Pune'),
    );
    expect(upcomingTile.onTap, isNull);

    await tester.tap(find.text('Pune'));
    await tester.pumpAndSettle();
    expect(find.byType(CityPickerScreen), findsOneWidget);

    await tester.tap(find.text('Hyderabad'));
    await tester.pumpAndSettle();
    expect(find.text('Home'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
