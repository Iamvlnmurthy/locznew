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
import 'package:locz/features/chat/presentation/chat_screens.dart';
import 'package:locz/features/listings/domain/models.dart';

void main() {
  testWidgets(
    'signed-out chat is useful at 320px and preserves the return route',
    (tester) async {
      await tester.binding.setSurfaceSize(const Size(320, 700));
      addTearDown(() => tester.binding.setSurfaceSize(null));
      var conversationRequests = 0;
      final router = _router();
      addTearDown(router.dispose);

      await tester.pumpWidget(
        _app(
          router,
          authRepository: _TestAuthRepository(),
          conversations: () {
            conversationRequests++;
            return const [];
          },
        ),
      );
      await tester.pumpAndSettle();

      expect(
        find.text('Your local conversations, in one place'),
        findsOneWidget,
      );
      expect(conversationRequests, 0);
      expect(tester.takeException(), isNull);

      await tester.tap(find.text('Sign in'));
      await tester.pumpAndSettle();
      expect(find.text('next=/chats'), findsOneWidget);
    },
  );

  testWidgets('conversation card keeps listing context and latest message', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 700));
    addTearDown(() => tester.binding.setSurfaceSize(null));
    final router = _router();
    addTearDown(router.dispose);

    await tester.pumpWidget(
      _app(
        router,
        authRepository: _TestAuthRepository(signedIn: true),
        conversations: () => [
          ConversationSummary(
            id: 'conversation-1',
            otherPartyName: 'Neighbour seller',
            unreadCount: 2,
            listingTitle: 'Blue commuter bicycle',
            lastMessagePreview: 'Yes, you can inspect it this evening.',
            lastMessageAt: DateTime(2026, 8, 2, 18, 30),
          ),
        ],
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('Neighbour seller'), findsOneWidget);
    expect(find.text('Blue commuter bicycle'), findsOneWidget);
    expect(
      find.text('Yes, you can inspect it this evening.'),
      findsOneWidget,
    );
    expect(find.text('2'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}

GoRouter _router() => GoRouter(
      initialLocation: '/chats',
      routes: [
        GoRoute(path: '/chats', builder: (_, __) => const ChatsScreen()),
        GoRoute(
          path: '/signin',
          builder: (_, state) => Scaffold(
            body: Text('next=${state.uri.queryParameters['next']}'),
          ),
        ),
        GoRoute(
          path: '/chats/:id',
          builder: (_, state) => Scaffold(
            body: Text('chat=${state.pathParameters['id']}'),
          ),
        ),
      ],
    );

Widget _app(
  GoRouter router, {
  required AuthRepository authRepository,
  required List<ConversationSummary> Function() conversations,
}) =>
    ProviderScope(
      overrides: [
        authRepositoryProvider.overrideWithValue(authRepository),
        conversationsProvider.overrideWith((ref) => conversations()),
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
    );

class _TestAuthRepository extends AuthRepository {
  _TestAuthRepository({this.signedIn = false}) : super(ApiClient(TokenStorage()), TokenStorage());

  final bool signedIn;

  @override
  Future<AuthUser?> restoreSession() async => signedIn
      ? const AuthUser(
          id: 'user-1',
          displayName: 'Test neighbour',
          phone: '+919876543210',
          roles: [],
          permissions: [],
        )
      : null;
}
