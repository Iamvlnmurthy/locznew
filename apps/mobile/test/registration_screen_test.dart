import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:locz/core/config/env.dart';
import 'package:locz/core/i18n/strings.dart';
import 'package:locz/core/network/api_client.dart';
import 'package:locz/core/providers.dart';
import 'package:locz/core/storage/token_storage.dart';
import 'package:locz/core/theme/app_theme.dart';
import 'package:locz/features/auth/data/auth_repository.dart';
import 'package:locz/features/auth/presentation/register_screen.dart';
import 'package:locz/features/auth/presentation/sign_in_screen.dart';

void main() {
  testWidgets('registration validates matching passwords before contacting the API', (
    tester,
  ) async {
    final repository = _FakeAuthRepository();
    await _pumpRegistration(tester, repository);

    await tester.enterText(find.byKey(const Key('register-name')), 'Anjali Rao');
    await tester.enterText(find.byKey(const Key('register-phone')), '9876543210');
    await tester.enterText(find.byKey(const Key('register-password')), 'neighbourhood');
    await tester.enterText(find.byKey(const Key('register-confirm')), 'different-password');
    await tester.ensureVisible(find.byKey(const Key('register-submit')));
    await tester.tap(find.byKey(const Key('register-submit')));
    await tester.pump();

    expect(find.text('The passwords do not match'), findsOneWidget);
    expect(repository.registerCalls, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets('registration creates a session and returns to the intended route', (tester) async {
    final repository = _FakeAuthRepository();
    await _pumpRegistration(tester, repository, redirectTo: '/saved');

    await tester.enterText(find.byKey(const Key('register-name')), '  Anjali Rao  ');
    await tester.enterText(find.byKey(const Key('register-phone')), '9876543210');
    await tester.enterText(find.byKey(const Key('register-password')), 'neighbourhood');
    await tester.enterText(find.byKey(const Key('register-confirm')), 'neighbourhood');
    await tester.ensureVisible(find.byKey(const Key('register-submit')));
    await tester.tap(find.byKey(const Key('register-submit')));
    await tester.pumpAndSettle();

    expect(repository.registerCalls, 1);
    expect(repository.displayName, '  Anjali Rao  ');
    expect(repository.nationalNumber, '9876543210');
    expect(find.text('Saved destination'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('registration remains overflow-free in dark mode at phone width', (tester) async {
    await tester.binding.setSurfaceSize(const Size(390, 844));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await _pumpRegistration(tester, _FakeAuthRepository(), themeMode: ThemeMode.dark);

    expect(find.text('Create your account'), findsOneWidget);
    expect(find.text('Create free account'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('password sign-in validates locally and restores the intended journey', (
    tester,
  ) async {
    final repository = _FakeAuthRepository();
    await _pumpSignIn(tester, repository, redirectTo: '/saved');

    await tester.tap(find.byKey(const Key('signin-submit')));
    await tester.pump();
    expect(repository.signInCalls, 0);
    expect(find.text('Enter a valid 10-digit mobile number'), findsOneWidget);

    await tester.enterText(find.byKey(const Key('signin-phone')), '9876543210');
    await tester.enterText(find.byKey(const Key('signin-password')), 'neighbourhood');
    await tester.tap(find.byKey(const Key('signin-submit')));
    await tester.pumpAndSettle();

    expect(repository.signInCalls, 1);
    expect(find.text('Saved destination'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('Google sign-in is only offered in configured builds', (tester) async {
    await _pumpSignIn(tester, _FakeAuthRepository());

    expect(
      find.byKey(const Key('signin-google')),
      Env.isGoogleSignInConfigured ? findsOneWidget : findsNothing,
    );
    expect(tester.takeException(), isNull);
  });
}

Future<void> _pumpRegistration(
  WidgetTester tester,
  _FakeAuthRepository repository, {
  String? redirectTo,
  ThemeMode themeMode = ThemeMode.light,
}) async {
  final router = GoRouter(
    initialLocation: Uri(
      path: '/register',
      queryParameters: {if (redirectTo != null) 'next': redirectTo},
    ).toString(),
    routes: [
      GoRoute(
        path: '/register',
        builder: (_, state) => RegisterScreen(redirectTo: state.uri.queryParameters['next']),
      ),
      GoRoute(
        path: '/saved',
        builder: (_, __) => const Scaffold(body: Text('Saved destination')),
      ),
      GoRoute(path: '/', builder: (_, __) => const Scaffold(body: Text('Home destination'))),
      GoRoute(path: '/signin', builder: (_, __) => const Scaffold(body: Text('Sign in'))),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [authRepositoryProvider.overrideWithValue(repository)],
      child: MaterialApp.router(
        routerConfig: router,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: themeMode,
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
}

Future<void> _pumpSignIn(
  WidgetTester tester,
  _FakeAuthRepository repository, {
  String? redirectTo,
}) async {
  final router = GoRouter(
    initialLocation: Uri(
      path: '/signin',
      queryParameters: {if (redirectTo != null) 'next': redirectTo},
    ).toString(),
    routes: [
      GoRoute(
        path: '/signin',
        builder: (_, state) => SignInScreen(redirectTo: state.uri.queryParameters['next']),
      ),
      GoRoute(
        path: '/saved',
        builder: (_, __) => const Scaffold(body: Text('Saved destination')),
      ),
      GoRoute(path: '/', builder: (_, __) => const Scaffold(body: Text('Home destination'))),
      GoRoute(
        path: '/register',
        builder: (_, __) => const Scaffold(body: Text('Create account')),
      ),
    ],
  );
  addTearDown(router.dispose);

  await tester.pumpWidget(
    ProviderScope(
      overrides: [authRepositoryProvider.overrideWithValue(repository)],
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
}

class _FakeAuthRepository extends AuthRepository {
  _FakeAuthRepository()
      : super(
          ApiClient(TokenStorage()),
          TokenStorage(),
        );

  int registerCalls = 0;
  int signInCalls = 0;
  String? displayName;
  String? nationalNumber;

  @override
  Future<AuthUser?> restoreSession() async => null;

  @override
  Future<AuthUser> register({
    required String displayName,
    required String nationalNumber,
    required String password,
    String? pushToken,
  }) async {
    registerCalls++;
    this.displayName = displayName;
    this.nationalNumber = nationalNumber;
    return const AuthUser(
      id: 'user-1',
      displayName: 'Anjali Rao',
      phone: '+919876543210',
      roles: ['REGISTERED_USER'],
      permissions: [],
    );
  }

  @override
  Future<AuthUser> signInWithPassword({
    required String nationalNumber,
    required String password,
    String? pushToken,
  }) async {
    signInCalls++;
    return const AuthUser(
      id: 'user-1',
      displayName: 'Anjali Rao',
      phone: '+919876543210',
      roles: ['REGISTERED_USER'],
      permissions: [],
    );
  }
}
