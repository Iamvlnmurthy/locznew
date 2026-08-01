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
import 'package:locz/features/auth/data/auth_repository.dart';
import 'package:locz/features/listings/data/listing_repository.dart';
import 'package:locz/features/listings/domain/models.dart';
import 'package:locz/features/post/presentation/post_ad_screen.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  testWidgets(
      'post intent changes the form from selling to a buyer requirement',
      (tester) async {
    SharedPreferences.setMockInitialValues({});
    tester.view.physicalSize = const Size(360, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(_EditAuthRepository()),
          listingRepositoryProvider.overrideWithValue(_EditListingRepository()),
        ],
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
          home: const PostAdScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('I want to sell'), findsOneWidget);
    expect(find.text('I want to buy'), findsOneWidget);
    await tester.tap(find.text('I want to buy'));
    await tester.pumpAndSettle();
    expect(find.text('Budget from'), findsWidgets);
    expect(find.text('Budget up to'), findsWidgets);
    expect(find.text('Quantity needed'), findsWidgets);
    expect(find.text('Price (₹)'), findsNothing);
    expect(tester.takeException(), isNull);
  });

  testWidgets('edit pre-fills listing and warns before re-moderating a live ad',
      (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final router = GoRouter(
      initialLocation: '/post/listing-1/edit',
      routes: [
        GoRoute(
          path: '/post/:id/edit',
          builder: (_, state) => PostAdScreen(
            listingId: state.pathParameters['id'],
          ),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(_EditAuthRepository()),
          listingRepositoryProvider.overrideWithValue(
            _EditListingRepository(),
          ),
        ],
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

    expect(find.text('Edit your ad'), findsOneWidget);
    expect(
      find.text(
        'Changing a live ad sends it through moderation again. '
        'It may be hidden while we review it.',
      ),
      findsOneWidget,
    );
    final fields = tester.widgetList<TextFormField>(find.byType(TextFormField));
    expect(fields.first.controller?.text, 'Blue bicycle');
    expect(
      fields.elementAt(1).controller?.text,
      'A well maintained city bicycle.',
    );
  });

  testWidgets('unfinished post details can be restored from this device',
      (tester) async {
    SharedPreferences.setMockInitialValues({
      'locz.post-progress.v1':
          '{"title":"Saved bicycle","description":"Saved locally before leaving.",'
              '"price":"3200","categoryId":"category-1","cityId":"city-1",'
              '"condition":"GOOD","isFree":false,"isNegotiable":true,'
              '"contactPreference":"IN_APP_ONLY"}',
    });
    final router = GoRouter(
      initialLocation: '/post',
      routes: [
        GoRoute(path: '/post', builder: (_, __) => const PostAdScreen()),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(_EditAuthRepository()),
          listingRepositoryProvider.overrideWithValue(
            _EditListingRepository(),
          ),
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

    expect(find.text('Continue your unfinished ad?'), findsOneWidget);
    await tester.tap(find.widgetWithText(FilledButton, 'Continue'));
    await tester.pumpAndSettle();

    final fields = tester.widgetList<TextFormField>(find.byType(TextFormField));
    expect(fields.first.controller?.text, 'Saved bicycle');
    expect(
      fields.elementAt(1).controller?.text,
      'Saved locally before leaving.',
    );
  });
}

class _EditAuthRepository extends AuthRepository {
  _EditAuthRepository()
      : super(
          ApiClient(TokenStorage()),
          TokenStorage(),
        );

  @override
  Future<AuthUser?> restoreSession() async => const AuthUser(
        id: 'owner-1',
        displayName: 'Local seller',
        phone: '+919999999999',
        roles: [],
        permissions: [],
      );
}

class _EditListingRepository extends ListingRepository {
  _EditListingRepository() : super(ApiClient(TokenStorage()));

  static const city = City(
    id: 'city-1',
    name: 'Hyderabad',
    slug: 'hyderabad',
    stateName: 'Telangana',
    latitude: 17.4,
    longitude: 78.4,
    isLaunched: true,
  );
  static const category = Category(
    id: 'category-1',
    name: 'Bicycles',
    slug: 'bicycles',
    children: [],
  );

  @override
  Future<ListingDetail> detail(String slug) async => ListingDetail(
        summary: const ListingSummary(
          id: 'listing-1',
          slug: 'blue-bicycle',
          type: 'PRODUCT',
          title: 'Blue bicycle',
          status: 'PUBLISHED',
          price: 4500,
          isNegotiable: true,
          cityName: 'Hyderabad',
          localityName: null,
          thumbUrl: null,
          isFeatured: false,
          viewCount: 2,
          publishedAt: null,
        ),
        description: 'A well maintained city bicycle.',
        categoryId: category.id,
        categoryName: category.name,
        owner: ListingOwner(
          id: 'owner-1',
          displayName: 'Local seller',
          memberSince: DateTime(2026),
        ),
        media: const [],
        attributes: const {},
        saveCount: 0,
        cityId: city.id,
        marketplace: const {
          'price': 4500,
          'condition': 'GOOD',
          'isNegotiable': true,
        },
      );

  @override
  Future<List<Category>> categories({String? listingType}) async => const [
        category,
      ];

  @override
  Future<Category> categoryDetail(String slug) async => category;

  @override
  Future<List<City>> cities({bool launchedOnly = false, String? query}) async =>
      const [city];
}
