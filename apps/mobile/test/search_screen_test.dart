import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:locz/core/i18n/strings.dart';
import 'package:locz/core/network/api_client.dart';
import 'package:locz/core/providers.dart';
import 'package:locz/core/storage/token_storage.dart';
import 'package:locz/core/theme/app_theme.dart';
import 'package:locz/features/listings/data/listing_repository.dart';
import 'package:locz/features/listings/domain/models.dart';
import 'package:locz/features/listings/presentation/search_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets('search never claims a radius without coordinates and forwards sorting',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    final listings = _FakeListingRepository();
    final router = GoRouter(
      initialLocation: '/search',
      routes: [
        GoRoute(
          path: '/search',
          builder: (_, __) => const SearchScreen(),
        ),
        GoRoute(
          path: '/location',
          builder: (_, __) => const Scaffold(body: Text('Location')),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [listingRepositoryProvider.overrideWithValue(listings)],
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

    expect(find.text('Choose area'), findsOneWidget);
    expect(find.text('5 km'), findsNothing);
    expect(listings.calls.last.radiusKm, isNull);
    final chipContext = tester.element(find.byType(ActionChip));
    expect(ChipTheme.of(chipContext).labelStyle?.color, isNotNull);

    await tester.tap(find.text('Best match'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Price: low to high'));
    await tester.pumpAndSettle();

    expect(listings.calls.last.sort, 'price_asc');
    expect(listings.calls.last.radiusKm, isNull);
    expect(tester.takeException(), isNull);
  });

  testWidgets('recent searches stay on-device, can be reused, and can be cleared', (tester) async {
    SharedPreferences.setMockInitialValues({
      'locz.recent-searches.v1': ['bicycle', 'room'],
    });
    final listings = _FakeListingRepository();
    final router = GoRouter(
      initialLocation: '/search',
      routes: [
        GoRoute(path: '/search', builder: (_, __) => const SearchScreen()),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [listingRepositoryProvider.overrideWithValue(listings)],
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

    await tester.tap(find.byType(TextField));
    await tester.pumpAndSettle();
    expect(find.text('Recent searches'), findsOneWidget);
    expect(find.text('bicycle'), findsOneWidget);

    await tester.tap(find.text('bicycle'));
    await tester.pumpAndSettle();
    expect(listings.calls.last.query, 'bicycle');

    await tester.tap(find.byType(TextField));
    await tester.enterText(find.byType(TextField), '');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Clear'));
    await tester.pumpAndSettle();
    expect(find.text('bicycle'), findsNothing);
    final preferences = await SharedPreferences.getInstance();
    expect(preferences.getStringList('locz.recent-searches.v1'), isNull);
  });
}

class _SearchCall {
  const _SearchCall({required this.sort, this.query, this.radiusKm});

  final String sort;
  final String? query;
  final int? radiusKm;
}

class _FakeListingRepository extends ListingRepository {
  _FakeListingRepository() : super(ApiClient(TokenStorage()));

  final List<_SearchCall> calls = [];

  @override
  Future<List<ListingSummary>> search({
    String? query,
    String? cityId,
    String? categoryId,
    String? type,
    double? latitude,
    double? longitude,
    int? radiusKm,
    String? pincode,
    num? priceMin,
    num? priceMax,
    List<String> attributes = const [],
    String sort = 'relevance',
    int page = 1,
  }) async {
    calls.add(_SearchCall(sort: sort, query: query, radiusKm: radiusKm));
    return const [];
  }
}
