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
import 'package:locz/features/account/presentation/account_screen.dart';
import 'package:locz/features/auth/data/auth_repository.dart';
import 'package:locz/features/listings/data/listing_repository.dart';
import 'package:locz/features/listings/domain/models.dart';

void main() {
  testWidgets('My ads exposes edit and confirms destructive delete', (tester) async {
    tester.view.physicalSize = const Size(320, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    final listings = _FakeListingRepository();
    final router = GoRouter(
      initialLocation: '/account',
      routes: [
        GoRoute(path: '/account', builder: (_, __) => const AccountScreen()),
        GoRoute(
          path: '/post/:id/edit',
          builder: (_, state) => Scaffold(
            body: Text('editing ${state.pathParameters['id']}'),
          ),
        ),
        GoRoute(
          path: '/ad/:slug',
          builder: (_, __) => const SizedBox.shrink(),
        ),
        GoRoute(
          path: '/notifications',
          builder: (_, __) => const SizedBox.shrink(),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(_FakeAuthRepository()),
          listingRepositoryProvider.overrideWithValue(listings),
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

    expect(find.text('Edit'), findsOneWidget);
    expect(find.text('Delete'), findsOneWidget);

    await tester.tap(find.text('Edit'));
    await tester.pumpAndSettle();
    expect(find.text('editing listing-1'), findsOneWidget);

    router.go('/account');
    await tester.pumpAndSettle();
    await tester.tap(find.text('Delete'));
    await tester.pumpAndSettle();
    expect(find.text('Delete this ad?'), findsOneWidget);
    expect(listings.commands, isEmpty);

    await tester.tap(find.widgetWithText(FilledButton, 'Delete'));
    await tester.pumpAndSettle();
    expect(listings.commands, [('listing-1', 'delete')]);
  });
}

class _FakeAuthRepository extends AuthRepository {
  _FakeAuthRepository()
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

class _FakeListingRepository extends ListingRepository {
  _FakeListingRepository() : super(ApiClient(TokenStorage()));

  final List<(String, String)> commands = [];

  static const listing = ListingSummary(
    id: 'listing-1',
    slug: 'local-bicycle',
    type: 'PRODUCT',
    title: 'Local bicycle',
    status: 'PUBLISHED',
    price: 4500,
    isNegotiable: true,
    cityName: 'Hyderabad',
    localityName: null,
    thumbUrl: null,
    isFeatured: false,
    viewCount: 4,
    publishedAt: null,
  );

  @override
  Future<List<ListingSummary>> myListings() async => const [listing];

  @override
  Future<List<ListingSummary>> savedListings() async => const [];

  @override
  Future<void> listingCommand(String listingId, String command) async {
    commands.add((listingId, command));
  }
}
