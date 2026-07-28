import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/account/presentation/account_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/auth/presentation/sign_in_screen.dart';
import '../../features/chat/presentation/chat_screens.dart';
import '../../features/feed/presentation/home_screen.dart';
import '../../features/listings/presentation/listing_detail_screen.dart';
import '../../features/listings/presentation/report_listing_screen.dart';
import '../../features/listings/presentation/search_screen.dart';
import '../../features/location/presentation/city_picker_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/post/presentation/post_ad_screen.dart';
import '../i18n/strings.dart';

/// Converts the compact campaign URI `locz://ad/<slug>` into the same path used by
/// verified web links. Keeping this pure makes the platform boundary easy to test.
Uri normalizeLoczDeepLink(Uri uri) {
  if (uri.scheme != 'locz' || uri.host != 'ad' || uri.pathSegments.isEmpty) {
    return uri;
  }

  return uri.replace(
    scheme: '',
    host: '',
    path: '/ad/${uri.pathSegments.join('/')}',
  );
}

/// Routes.
///
/// Paths mirror the web app (`/ad/<slug>`, `/search`, `/post`) so one deep link works
/// for both: `https://locz.in/ad/x` opens the app when installed and the site when not.
final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    redirect: (_, state) {
      final normalized = normalizeLoczDeepLink(state.uri);
      return normalized == state.uri ? null : normalized.toString();
    },
    routes: [
      // The tabbed shell keeps the bottom bar mounted across tab switches, so scroll
      // position and in-flight requests survive navigation.
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => _TabScaffold(shell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/search',
                builder: (_, __) => const SearchScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/chats', builder: (_, __) => const ChatsScreen()),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/account',
                builder: (_, __) => const AccountScreen(),
              ),
            ],
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
      GoRoute(
        path: '/post/:id/edit',
        builder: (_, state) => PostAdScreen(listingId: state.pathParameters['id']),
      ),
      GoRoute(path: '/location', builder: (_, __) => const CityPickerScreen()),
      GoRoute(
        path: '/notifications',
        builder: (_, __) => const NotificationsScreen(),
      ),
      GoRoute(
        path: '/chats/:id',
        builder: (context, state) => ChatScreen(conversationId: state.pathParameters['id']!),
      ),
      GoRoute(
        path: '/signin',
        builder: (context, state) => SignInScreen(redirectTo: state.uri.queryParameters['next']),
      ),
      GoRoute(
        path: '/register',
        builder: (context, state) => RegisterScreen(redirectTo: state.uri.queryParameters['next']),
      ),
      GoRoute(
        path: '/report',
        builder: (context, state) {
          final listingId = state.uri.queryParameters['listing'];
          return listingId == null ? const HomeScreen() : ReportListingScreen(listingId: listingId);
        },
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
      bottomNavigationBar: _LoczBottomBar(
        currentIndex: shell.currentIndex,
        strings: strings,
        onTab: (index) => shell.goBranch(
          index,
          initialLocation: index == shell.currentIndex,
        ),
        onPost: () => context.push('/post'),
      ),
    );
  }
}

class _LoczBottomBar extends StatelessWidget {
  const _LoczBottomBar({
    required this.currentIndex,
    required this.strings,
    required this.onTab,
    required this.onPost,
  });

  final int currentIndex;
  final Strings strings;
  final ValueChanged<int> onTab;
  final VoidCallback onPost;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DecoratedBox(
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          top: BorderSide(color: theme.colorScheme.outline.withValues(alpha: 0.45)),
        ),
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 64,
          child: Row(
            children: [
              _BottomDestination(
                icon: Icons.home_outlined,
                selectedIcon: Icons.home_rounded,
                label: strings('nav.home'),
                selected: currentIndex == 0,
                onTap: () => onTab(0),
              ),
              _BottomDestination(
                icon: Icons.search_rounded,
                selectedIcon: Icons.manage_search_rounded,
                label: strings('nav.search'),
                selected: currentIndex == 1,
                onTap: () => onTab(1),
              ),
              Expanded(
                child: Semantics(
                  button: true,
                  label: strings('nav.post'),
                  child: InkResponse(
                    onTap: onPost,
                    radius: 30,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary,
                            borderRadius: BorderRadius.circular(13),
                            boxShadow: [
                              BoxShadow(
                                color: theme.colorScheme.primary.withValues(alpha: 0.22),
                                blurRadius: 12,
                                offset: const Offset(0, 4),
                              ),
                            ],
                          ),
                          child: Icon(Icons.add_rounded, color: theme.colorScheme.onPrimary),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              _BottomDestination(
                icon: Icons.chat_bubble_outline_rounded,
                selectedIcon: Icons.chat_bubble_rounded,
                label: strings('nav.chats'),
                selected: currentIndex == 2,
                onTap: () => onTab(2),
              ),
              _BottomDestination(
                icon: Icons.person_outline_rounded,
                selectedIcon: Icons.person_rounded,
                label: strings('nav.account'),
                selected: currentIndex == 3,
                onTap: () => onTab(3),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BottomDestination extends StatelessWidget {
  const _BottomDestination({
    required this.icon,
    required this.selectedIcon,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final IconData icon;
  final IconData selectedIcon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final color = selected ? theme.colorScheme.primary : theme.colorScheme.onSurfaceVariant;

    return Expanded(
      child: InkResponse(
        onTap: onTap,
        radius: 30,
        child: Semantics(
          selected: selected,
          button: true,
          label: label,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(selected ? selectedIcon : icon, size: 21, color: color),
              const SizedBox(height: 3),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.fade,
                style: TextStyle(
                  color: color,
                  fontSize: 10,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
