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
import 'package:locz/features/notifications/presentation/notifications_screen.dart';

void main() {
  testWidgets('signed-out notifications do not request private data and preserve return route',
      (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 700));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    var notificationRequests = 0;
    final router = GoRouter(
      initialLocation: '/notifications',
      routes: [
        GoRoute(
          path: '/notifications',
          builder: (_, __) => const NotificationsScreen(),
        ),
        GoRoute(
          path: '/signin',
          builder: (_, state) => Scaffold(
            body: Text('next=${state.uri.queryParameters['next']}'),
          ),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(_SignedOutAuthRepository()),
          notificationsProvider.overrideWith((ref) {
            notificationRequests++;
            return const [];
          }),
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

    expect(find.text('Sign in for your updates'), findsOneWidget);
    expect(find.text('Mark all read'), findsNothing);
    expect(notificationRequests, 0);

    await tester.tap(find.text('Sign in'));
    await tester.pumpAndSettle();
    expect(find.text('next=/notifications'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

class _SignedOutAuthRepository extends AuthRepository {
  _SignedOutAuthRepository()
      : super(
          ApiClient(TokenStorage()),
          TokenStorage(),
        );

  @override
  Future<AuthUser?> restoreSession() async => null;
}
