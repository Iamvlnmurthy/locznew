import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:locz/core/i18n/strings.dart';
import 'package:locz/core/providers.dart';
import 'package:locz/core/theme/app_theme.dart';
import 'package:locz/features/feed/presentation/home_screen.dart';
import 'package:locz/features/listings/domain/models.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  for (final mode in [ThemeMode.light, ThemeMode.dark]) {
    testWidgets('native home header stays readable at 320px in ${mode.name}', (tester) async {
      SharedPreferences.setMockInitialValues({});
      tester.view.physicalSize = const Size(320, 700);
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.resetPhysicalSize);
      addTearDown(tester.view.resetDevicePixelRatio);

      await tester.pumpWidget(
        ProviderScope(
          overrides: [
            feedProvider.overrideWith(
              (_) async => const Feed(cityId: '', cityName: '', sections: []),
            ),
          ],
          child: MaterialApp(
            theme: AppTheme.light,
            darkTheme: AppTheme.dark,
            themeMode: mode,
            locale: const Locale('en'),
            supportedLocales: const [Locale('en'), Locale('te'), Locale('hi')],
            localizationsDelegates: const [
              StringsDelegate(AppLocaleOption.en),
              GlobalMaterialLocalizations.delegate,
              GlobalWidgetsLocalizations.delegate,
              GlobalCupertinoLocalizations.delegate,
            ],
            home: const HomeScreen(),
          ),
        ),
      );
      await tester.pumpAndSettle();

      expect(find.byKey(const Key('home-brand-mark')), findsOneWidget);
      expect(find.byKey(const Key('home-location-control')), findsOneWidget);
      expect(find.text('Change'), findsOneWidget);
      expect(find.byKey(const Key('home-theme-toggle')), findsOneWidget);
      expect(find.byKey(const Key('home-header-search')), findsOneWidget);

      final brandRect = tester.getRect(find.byKey(const Key('home-brand-mark')));
      final locationRect = tester.getRect(find.byKey(const Key('home-location-control')));
      final themeRect = tester.getRect(find.byKey(const Key('home-theme-toggle')));
      final searchRect = tester.getRect(find.byKey(const Key('home-header-search')));
      expect(locationRect.top, lessThan(brandRect.bottom));
      expect(themeRect.top, lessThan(brandRect.bottom));
      expect(searchRect.top, greaterThanOrEqualTo(brandRect.bottom));
      expect(searchRect.width, greaterThanOrEqualTo(288));
      expect(tester.takeException(), isNull);
    });
  }

  testWidgets('discovery feed stays composed at 320px in dark mode', (
    tester,
  ) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(320, 700);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    final listing = ListingSummary(
      id: 'listing-1',
      slug: 'nearby-phone',
      type: 'PRODUCT',
      title: 'Phone in excellent condition',
      status: 'PUBLISHED',
      price: 32900,
      isNegotiable: true,
      cityName: 'Hyderabad',
      localityName: 'Madhapur',
      thumbUrl: null,
      isFeatured: false,
      viewCount: 12,
      publishedAt: DateTime(2026, 7, 29),
    );

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          feedProvider.overrideWith(
            (_) async => Feed(
              cityId: 'hyderabad',
              cityName: 'Hyderabad',
              sections: [
                FeedSection(key: 'latest_products', items: [listing]),
              ],
            ),
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: ThemeMode.dark,
          locale: const Locale('en'),
          supportedLocales: const [Locale('en'), Locale('te'), Locale('hi')],
          localizationsDelegates: const [
            StringsDelegate(AppLocaleOption.en),
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: const HomeScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Good finds, right around you'), findsOneWidget);
    await tester.drag(find.byType(CustomScrollView), const Offset(0, -620));
    await tester.pumpAndSettle();
    expect(find.text('Latest items for sale'), findsOneWidget);
    expect(find.text('See all'), findsOneWidget);
    expect(find.text('₹32,900'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
