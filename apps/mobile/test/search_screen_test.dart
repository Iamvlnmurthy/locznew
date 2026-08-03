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
  testWidgets('shows directory businesses alongside listings', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final listings = _FakeListingRepository();
    // The API has always returned these. The app parsed `items` and dropped the rest, so
    // 3.4 million businesses were invisible on a phone while the website showed them.
    listings.businesses = const [
      BusinessSummary(
        id: 'b1',
        slug: 'anjali-kirana-store',
        name: 'Anjali Kirana Store',
        categoryName: 'Grocery',
        localityName: 'Chainpur',
      ),
    ];
    listings.businessTotal = 42;

    await tester.pumpWidget(
      ProviderScope(
        overrides: [listingRepositoryProvider.overrideWithValue(listings)],
        child: MaterialApp(
          theme: AppTheme.light,
          locale: const Locale('en'),
          supportedLocales: const [Locale('en'), Locale('te'), Locale('hi')],
          localizationsDelegates: const [
            StringsDelegate(AppLocaleOption.en),
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: const SearchScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Shops and businesses'), findsOneWidget);
    expect(find.text('Anjali Kirana Store'), findsOneWidget);
    // Category and place, so a name alone does not have to carry the whole answer.
    expect(find.text('Grocery · Chainpur'), findsOneWidget);
    // An imported record is shown as what it is, not dressed up as a verified shop.
    expect(find.text('From the local directory'), findsOneWidget);
    // The count is the total that matched, not the handful rendered.
    expect(find.text('42 found'), findsOneWidget);
  });

  testWidgets('loads more shops as the strip is swiped', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final listings = _FakeListingRepository();
    listings.businesses = const [
      BusinessSummary(id: 'b1', slug: 'one', name: 'Anjali Kirana Store'),
    ];
    listings.businessTotal = 42;
    listings.nextBusinessPage = const [
      BusinessSummary(id: 'b2', slug: 'two', name: 'Ashok Kirana Store'),
    ];

    await tester.pumpWidget(
      ProviderScope(
        overrides: [listingRepositoryProvider.overrideWithValue(listings)],
        child: MaterialApp(
          theme: AppTheme.light,
          locale: const Locale('en'),
          supportedLocales: const [Locale('en'), Locale('te'), Locale('hi')],
          localizationsDelegates: const [
            StringsDelegate(AppLocaleOption.en),
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: const SearchScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    // Page two is fetched on its own, not by re-running the listing search — sharing a
    // page number would have moved the ads underneath while somebody swiped shops.
    expect(listings.businessPageRequests, contains(2));
    expect(find.text('Ashok Kirana Store'), findsOneWidget);
    // Appended, not replaced.
    expect(find.text('Anjali Kirana Store'), findsOneWidget);
  });

  testWidgets('intent search visibly filters by listing type', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final listings = _FakeListingRepository();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [listingRepositoryProvider.overrideWithValue(listings)],
        child: MaterialApp(
          theme: AppTheme.light,
          locale: const Locale('en'),
          supportedLocales: const [Locale('en'), Locale('te'), Locale('hi')],
          localizationsDelegates: const [
            StringsDelegate(AppLocaleOption.en),
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: const SearchScreen(initialType: 'JOB'),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Find work'), findsOneWidget);
    expect(listings.calls.last.type, 'JOB');
    expect(listings.calls.last.query, isNull);
  });

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

  testWidgets('restored saved search keeps every attribute filter', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final listings = _FakeListingRepository();

    await tester.pumpWidget(
      ProviderScope(
        overrides: [listingRepositoryProvider.overrideWithValue(listings)],
        child: MaterialApp(
          theme: AppTheme.light,
          locale: const Locale('en'),
          supportedLocales: const [Locale('en'), Locale('te'), Locale('hi')],
          localizationsDelegates: const [
            StringsDelegate(AppLocaleOption.en),
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: const SearchScreen(
            initialCategoryId: 'cars',
            initialAttributes: [
              'brand:MARUTI_SUZUKI',
              'km_driven:..50000',
            ],
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(
      listings.calls.last.attributes,
      ['brand:MARUTI_SUZUKI', 'km_driven:..50000'],
    );
  });

  testWidgets('category filters send picklists and numeric ranges as repeated attributes',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
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
        ),
      ),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Filters'));
    await tester.pumpAndSettle();
    await tester.tap(find.byType(DropdownButtonFormField<String>).first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cars').last);
    await tester.pumpAndSettle();

    expect(find.text('Brand'), findsOneWidget);
    expect(find.text('Kilometres'), findsOneWidget);
    await tester.tap(find.text('Any'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Maruti Suzuki').last);
    await tester.pumpAndSettle();

    final maximum = find.byType(TextFormField).last;
    await tester.enterText(maximum, '50000');
    await tester.tap(find.text('Apply filters'));
    await tester.pumpAndSettle();

    expect(listings.calls.last.categoryId, 'cars');
    expect(
      listings.calls.last.attributes,
      containsAll(['brand:MARUTI_SUZUKI', 'km_driven:..50000']),
    );
    expect(tester.takeException(), isNull);
  });
}

class _SearchCall {
  const _SearchCall({
    required this.sort,
    required this.attributes,
    this.query,
    this.radiusKm,
    this.categoryId,
    this.type,
  });

  final String sort;
  final String? query;
  final int? radiusKm;
  final String? categoryId;
  final String? type;
  final List<String> attributes;
}

class _FakeListingRepository extends ListingRepository {
  List<BusinessSummary> businesses = const [];
  int businessTotal = 0;
  List<BusinessSummary> nextBusinessPage = const [];
  final List<int> businessPageRequests = [];

  _FakeListingRepository() : super(ApiClient(TokenStorage()));

  final List<_SearchCall> calls = [];

  @override
  Future<SearchResults> search({
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
    calls.add(
      _SearchCall(
        sort: sort,
        query: query,
        radiusKm: radiusKm,
        categoryId: categoryId,
        type: type,
        attributes: [...attributes],
      ),
    );
    return SearchResults(listings: const [], businesses: businesses, businessTotal: businessTotal);
  }

  /// The strip prefetches the next page as it nears the end of what it has. Without this
  /// the fake falls through to the real network call and a widget test hangs.
  @override
  Future<SearchResults> searchBusinesses({
    required String query,
    String? cityId,
    String? pincode,
    double? latitude,
    double? longitude,
    int? radiusKm,
    int page = 1,
    int limit = 10,
  }) async {
    businessPageRequests.add(page);
    return SearchResults(
        listings: const [], businesses: nextBusinessPage, businessTotal: businessTotal);
  }

  @override
  Future<List<Category>> categories({String? listingType}) async => const [_cars];

  @override
  Future<Category> categoryDetail(String slug) async => _cars;
}

const _cars = Category(
  id: 'cars',
  name: 'Cars',
  slug: 'cars',
  children: [],
  attributes: [
    CategoryAttribute(
      key: 'brand',
      label: 'Brand',
      dataType: 'SELECT',
      options: [
        CategoryAttributeOption(
          value: 'MARUTI_SUZUKI',
          label: 'Maruti Suzuki',
        ),
      ],
      isRequired: false,
      isFilterable: true,
    ),
    CategoryAttribute(
      key: 'km_driven',
      label: 'Kilometres',
      dataType: 'NUMBER',
      options: [],
      isRequired: false,
      isFilterable: true,
    ),
  ],
);
