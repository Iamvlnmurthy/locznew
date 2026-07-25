import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/account/presentation/account_screen.dart';
import '../../features/auth/presentation/sign_in_screen.dart';
import '../../features/chat/presentation/chat_screens.dart';
import '../../features/feed/presentation/home_screen.dart';
import '../../features/listings/presentation/listing_detail_screen.dart';
import '../../features/listings/presentation/search_screen.dart';
import '../../features/location/presentation/city_picker_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/post/presentation/post_ad_screen.dart';
import '../i18n/strings.dart';

/// Routes.
///
/// Paths mirror the web app (`/ad/<slug>`, `/search`, `/post`) so one deep link works
/// for both: `https://locz.in/ad/x` opens the app when installed and the site when not.
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    routes: [
      // The tabbed shell keeps the bottom bar mounted across tab switches, so scroll
      // position and in-flight requests survive navigation.
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => _TabScaffold(shell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [GoRoute(path: '/', builder: (_, __) => const HomeScreen())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: '/search', builder: (_, __) => const SearchScreen())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: '/chats', builder: (_, __) => const ChatsScreen())],
          ),
          StatefulShellBranch(
            routes: [GoRoute(path: '/account', builder: (_, __) => const AccountScreen())],
          ),
        ],
      ),

      // Full-screen routes push over the shell — posting and sign-in deserve the whole
      // screen rather than competing with a nav bar.
      GoRoute(
        path: '/ad/:slug',
        builder: (context, state) => ListingDetailScreen(slug: state.pathParameters['slug']!),
      ),
      GoRoute(path: '/post', builder: (_, __) => const PostAdScreen()),
      GoRoute(path: '/location', builder: (_, __) => const CityPickerScreen()),
      GoRoute(path: '/notifications', builder: (_, __) => const NotificationsScreen()),
      GoRoute(
        path: '/chats/:id',
        builder: (context, state) => ChatScreen(conversationId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/signin',
        builder: (context, state) => SignInScreen(redirectTo: state.uri.queryParameters['next']),
      ),
    ],
  );
});

class _TabScaffold extends StatelessWidget {
  const _TabScaffold({required this.shell});

  final StatefulNavigationShell shell;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return Scaffold(
      body: shell,
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/post'),
        icon: const Icon(Icons.add),
        label: Text(strings('nav.post')),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: shell.currentIndex,
        onDestinationSelected: (index) => shell.goBranch(
          index,
          // Tapping the active tab returns it to its root — the standard expectation.
          initialLocation: index == shell.currentIndex,
        ),
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.home_outlined),
            selectedIcon: const Icon(Icons.home),
            label: strings('nav.home'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.search_outlined),
            selectedIcon: const Icon(Icons.search),
            label: strings('nav.search'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.chat_bubble_outline),
            selectedIcon: const Icon(Icons.chat_bubble),
            label: strings('nav.chats'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            selectedIcon: const Icon(Icons.person),
            label: strings('nav.account'),
          ),
        ],
      ),
    );
  }
}
