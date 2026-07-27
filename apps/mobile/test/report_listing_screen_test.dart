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
import 'package:locz/features/listings/presentation/report_listing_screen.dart';

void main() {
  testWidgets('report requires a reason and submits the selected safety signal', (tester) async {
    final listings = _FakeListingRepository();
    final router = GoRouter(
      initialLocation: '/report?listing=listing-1',
      routes: [
        GoRoute(
          path: '/report',
          builder: (_, state) => ReportListingScreen(
            listingId: state.uri.queryParameters['listing']!,
          ),
        ),
        GoRoute(path: '/signin', builder: (_, __) => const Scaffold(body: Text('Sign in'))),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(_SignedInAuthRepository()),
          listingRepositoryProvider.overrideWithValue(listings),
        ],
        child: MaterialApp.router(
          routerConfig: router,
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
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

    await tester.scrollUntilVisible(
      find.byKey(const Key('report-submit')),
      500,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.byKey(const Key('report-submit')));
    await tester.pump();
    expect(find.text('Choose a reason'), findsOneWidget);
    expect(listings.reportCalls, 0);

    final reasonGroup = tester.widget<RadioGroup<String>>(
      find.byType(RadioGroup<String>),
    );
    reasonGroup.onChanged('SPAM');
    await tester.pump();
    await tester.scrollUntilVisible(
      find.byType(TextField),
      500,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.enterText(find.byType(TextField), 'The same ad appears many times.');
    await tester.scrollUntilVisible(
      find.byKey(const Key('report-submit')),
      500,
      scrollable: find.byType(Scrollable).last,
    );
    await tester.tap(find.byKey(const Key('report-submit')));
    await tester.pumpAndSettle();

    expect(listings.reportCalls, 1);
    expect(listings.reason, 'SPAM');
    expect(listings.details, 'The same ad appears many times.');
    expect(find.textContaining('safety team'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

class _FakeListingRepository extends ListingRepository {
  _FakeListingRepository() : super(ApiClient(TokenStorage()));

  int reportCalls = 0;
  String? reason;
  String? details;

  @override
  Future<void> reportListing({
    required String listingId,
    required String reason,
    String? details,
  }) async {
    reportCalls++;
    this.reason = reason;
    this.details = details;
  }
}

class _SignedInAuthRepository extends AuthRepository {
  _SignedInAuthRepository()
      : super(
          ApiClient(TokenStorage()),
          TokenStorage(),
        );

  @override
  Future<AuthUser?> restoreSession() async => const AuthUser(
        id: 'user-1',
        displayName: 'Anjali Rao',
        phone: '+919876543210',
        roles: ['REGISTERED_USER'],
        permissions: [],
      );
}
