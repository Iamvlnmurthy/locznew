import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:locz/core/config/env.dart';
import 'package:locz/core/router/app_router.dart';
import 'package:locz/core/storage/token_storage.dart';
import 'package:locz/features/listings/presentation/widgets/listing_card.dart';
import 'package:locz/main.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _email = String.fromEnvironment(
  'LOCZ_INTEGRATION_EMAIL',
  defaultValue: 'buyer@locz.test',
);
const _password = String.fromEnvironment(
  'LOCZ_INTEGRATION_PASSWORD',
  defaultValue: 'LocZ@dev1234',
);

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('buyer can discover, search, open and durably save a listing', (tester) async {
    final semantics = tester.ensureSemantics();
    try {
      final storage = TokenStorage();
      await storage.clear();
      final preferences = await SharedPreferences.getInstance();
      await preferences.clear();

      final dio = Dio(
        BaseOptions(
          baseUrl: Env.apiBaseUrl,
          connectTimeout: const Duration(seconds: 12),
          receiveTimeout: const Duration(seconds: 20),
        ),
      );
      final login = _unwrap(
        await dio.post<Map<String, dynamic>>(
          '/auth/login/email',
          data: {
            'email': _email,
            'password': _password,
            'device': {
              'deviceKey': 'flutter-integration-${DateTime.now().microsecondsSinceEpoch}',
              'platform': 'ANDROID',
              'name': 'Flutter integration gate',
            },
          },
        ),
      );
      final tokens = login['tokens'] as Map<String, dynamic>;
      final user = login['user'] as Map<String, dynamic>;
      final accessToken = tokens['accessToken'] as String;
      await storage.saveTokens(
        accessToken: accessToken,
        refreshToken: tokens['refreshToken'] as String,
      );
      await storage.saveUser(user);
      dio.options.headers['Authorization'] = 'Bearer $accessToken';

      final fixture = await _createPublishedListingFixture();
      addTearDown(fixture.dispose);
      final target = fixture.listing;
      final listingId = target['id'] as String;
      final listingSlug = target['slug'] as String;
      final initiallySaved = await _isSaved(dio, listingId);

      addTearDown(() async {
        final saved = await _isSaved(dio, listingId);
        if (saved == initiallySaved) return;
        if (initiallySaved) {
          await dio.post<void>('/listings/$listingId/save');
        } else {
          await dio.delete<void>('/listings/$listingId/save');
        }
      });

      final container = ProviderContainer();
      addTearDown(container.dispose);
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const LoczApp(),
        ),
      );
      await _waitFor(tester, find.text('Home'));
      await _waitFor(tester, find.byType(ListingCard));
      expect(find.text('Search'), findsOneWidget);
      expect(find.text('Chats'), findsOneWidget);
      expect(find.text('Account'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await _expectAccessible(tester);

      await tester.tap(find.text('Account'));
      await _waitFor(tester, find.text(user['displayName'] as String));
      expect(find.text('My ads'), findsOneWidget);
      expect(find.text('Saved ads'), findsOneWidget);

      await tester.tap(find.text('Search'));
      await _waitFor(tester, find.byType(TextField));
      await _waitFor(tester, find.byType(ListingCard));
      await tester.enterText(
        find.byType(TextField),
        'locz-no-result-${DateTime.now().microsecondsSinceEpoch}',
      );
      await tester.testTextInput.receiveAction(TextInputAction.search);
      await _waitFor(tester, find.text('Nothing found'));
      await _expectAccessible(tester);

      container.read(routerProvider).go('/ad/$listingSlug');
      await tester.pump();
      final initialTooltip = initiallySaved ? 'Saved' : 'Save';
      final toggledTooltip = initiallySaved ? 'Save' : 'Saved';
      await _waitFor(tester, find.byTooltip(initialTooltip));
      await _expectAccessible(tester);

      await tester.tap(find.byTooltip(initialTooltip));
      await _waitFor(tester, find.byTooltip(toggledTooltip));
      await _waitForSavedState(dio, listingId, !initiallySaved);

      await tester.tap(find.byTooltip(toggledTooltip));
      await _waitFor(tester, find.byTooltip(initialTooltip));
      await _waitForSavedState(dio, listingId, initiallySaved);
      expect(tester.takeException(), isNull);
    } finally {
      semantics.dispose();
    }
  });
}

Future<void> _expectAccessible(WidgetTester tester) async {
  await expectLater(tester, meetsGuideline(androidTapTargetGuideline));
  await expectLater(tester, meetsGuideline(labeledTapTargetGuideline));
  await expectLater(tester, meetsGuideline(textContrastGuideline));
}

Map<String, dynamic> _unwrap(Response<Map<String, dynamic>> response) {
  final body = response.data;
  if (body == null || body['data'] is! Map<String, dynamic>) {
    throw StateError('API response did not contain a data object');
  }
  return body['data'] as Map<String, dynamic>;
}

Future<_ListingFixture> _createPublishedListingFixture() async {
  final dio = Dio(
    BaseOptions(
      baseUrl: Env.apiBaseUrl,
      connectTimeout: const Duration(seconds: 12),
      receiveTimeout: const Duration(seconds: 20),
    ),
  );
  final marker = DateTime.now().microsecondsSinceEpoch;
  final login = _unwrap(
    await dio.post<Map<String, dynamic>>(
      '/auth/login/email',
      data: {
        'email': 'admin@locz.test',
        'password': _password,
        'device': {
          'deviceKey': 'flutter-fixture-admin-$marker',
          'platform': 'ANDROID',
          'name': 'Flutter fixture owner',
        },
      },
    ),
  );
  final tokens = login['tokens'] as Map<String, dynamic>;
  dio.options.headers['Authorization'] = 'Bearer ${tokens['accessToken']}';

  final cityResponse = await dio.get<Map<String, dynamic>>(
    '/locations/cities',
    queryParameters: {'launchedOnly': true, 'limit': 10},
  );
  final cities = cityResponse.data?['data'] as List<dynamic>? ?? const [];
  final categoryResponse = await dio.get<Map<String, dynamic>>(
    '/categories',
    queryParameters: {'listingType': 'PRODUCT'},
  );
  final categories = categoryResponse.data?['data'] as List<dynamic>? ?? const [];
  if (cities.isEmpty || categories.isEmpty) {
    throw StateError(
      'Integration fixture requires a launched city and product category',
    );
  }

  final category = (categories.first as Map<String, dynamic>);
  final children = category['children'] as List<dynamic>? ?? const [];
  final categoryId =
      children.isNotEmpty ? (children.first as Map<String, dynamic>)['id'] : category['id'];
  final cityId = (cities.first as Map<String, dynamic>)['id'];
  final listing = _unwrap(
    await dio.post<Map<String, dynamic>>(
      '/listings',
      data: {
        'type': 'PRODUCT',
        'title': 'Flutter fixture phone $marker',
        'description': 'A reversible listing created only for the Android integration journey.',
        'categoryId': categoryId,
        'cityId': cityId,
        'contactPreference': 'IN_APP_ONLY',
        'marketplace': {
          'price': 4500,
          'condition': 'GOOD',
          'isNegotiable': true,
        },
      },
    ),
  );
  await dio.post<void>(
    '/moderation/listings/${listing['id']}/approve',
    data: {'note': 'Deterministic Flutter integration fixture'},
  );

  return _ListingFixture(dio, listing);
}

class _ListingFixture {
  const _ListingFixture(this.client, this.listing);

  final Dio client;
  final Map<String, dynamic> listing;

  Future<void> dispose() async {
    try {
      await client.delete<void>('/listings/${listing['id']}');
    } on DioException {
      // The primary test failure is more useful than a best-effort cleanup failure.
    }
  }
}

Future<bool> _isSaved(Dio dio, String listingId) async {
  final saved = _unwrap(
    await dio.get<Map<String, dynamic>>(
      '/listings/saved',
      queryParameters: {'limit': 50},
    ),
  );
  return (saved['items'] as List<dynamic>)
      .cast<Map<String, dynamic>>()
      .any((item) => item['id'] == listingId);
}

Future<void> _waitForSavedState(
  Dio dio,
  String listingId,
  bool expected,
) async {
  final deadline = DateTime.now().add(const Duration(seconds: 10));
  while (DateTime.now().isBefore(deadline)) {
    if (await _isSaved(dio, listingId) == expected) return;
    await Future<void>.delayed(const Duration(milliseconds: 200));
  }
  throw TestFailure('Listing save state did not become $expected in the API');
}

Future<void> _waitFor(
  WidgetTester tester,
  Finder finder, {
  Duration timeout = const Duration(seconds: 20),
}) async {
  final deadline = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(deadline)) {
    await tester.pump(const Duration(milliseconds: 200));
    if (finder.evaluate().isNotEmpty) return;
  }
  throw TestFailure('Timed out waiting for $finder');
}
