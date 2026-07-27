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
import 'package:locz/features/post/presentation/post_ad_screen.dart';

void main() {
  testWidgets('signed-out post entry is useful and overflow-free in dark mode', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    final router = GoRouter(
      initialLocation: '/post',
      routes: [
        GoRoute(path: '/post', builder: (_, __) => const PostAdScreen()),
        GoRoute(path: '/signin', builder: (_, __) => const Scaffold(body: Text('Sign in'))),
        GoRoute(
          path: '/register',
          builder: (_, __) => const Scaffold(body: Text('Create account')),
        ),
      ],
    );
    addTearDown(router.dispose);

    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(_SignedOutAuthRepository()),
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

    expect(find.text('Sign in to post your free ad'), findsOneWidget);
    expect(find.text('Create an account'), findsOneWidget);
    expect(find.text('Posting on LocZ is always free'), findsOneWidget);
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
