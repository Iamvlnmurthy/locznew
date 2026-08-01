import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/account/presentation/account_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/auth/presentation/sign_in_screen.dart';
import '../../features/chat/presentation/chat_screens.dart';
import '../../features/feed/presentation/home_screen.dart';
import '../../features/listings/presentation/listing_detail_screen.dart';
import '../../features/listings/presentation/listing_navigation.dart';
import '../../features/listings/presentation/report_listing_screen.dart';
import '../../features/listings/presentation/search_screen.dart';
import '../../features/location/presentation/city_picker_screen.dart';
import '../../features/notifications/presentation/notifications_screen.dart';
import '../../features/post/presentation/post_ad_screen.dart';
import '../i18n/strings.dart';
import '../motion/locz_motion.dart';
import '../theme/tokens.g.dart';

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
        builder: (context, state, navigationShell) =>
            _TabScaffold(shell: navigationShell),
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
        pageBuilder: (context, state) => _motionPage(
          context,
          state,
          ListingDetailScreen(
            slug: state.pathParameters['slug']!,
            preview: state.extra is ListingNavigationPreview
                ? (state.extra! as ListingNavigationPreview).listing
                : null,
            heroTag: state.extra is ListingNavigationPreview
                ? (state.extra! as ListingNavigationPreview).heroTag
                : null,
          ),
        ),
      ),
      GoRoute(
        path: '/post',
        pageBuilder: (context, state) =>
            _motionPage(context, state, const PostAdScreen()),
      ),
      GoRoute(
        path: '/post/:id/edit',
        pageBuilder: (context, state) => _motionPage(
          context,
          state,
          PostAdScreen(listingId: state.pathParameters['id']),
        ),
      ),
      GoRoute(
        path: '/location',
        pageBuilder: (context, state) =>
            _motionPage(context, state, const CityPickerScreen()),
      ),
      GoRoute(
        path: '/notifications',
        pageBuilder: (context, state) =>
            _motionPage(context, state, const NotificationsScreen()),
      ),
      GoRoute(
        path: '/chats/:id',
        pageBuilder: (context, state) => _motionPage(
          context,
          state,
          ChatScreen(conversationId: state.pathParameters['id']!),
        ),
      ),
      GoRoute(
        path: '/signin',
        pageBuilder: (context, state) => _motionPage(
          context,
          state,
          SignInScreen(redirectTo: state.uri.queryParameters['next']),
        ),
      ),
      GoRoute(
        path: '/register',
        pageBuilder: (context, state) => _motionPage(
          context,
          state,
          RegisterScreen(redirectTo: state.uri.queryParameters['next']),
        ),
      ),
      GoRoute(
        path: '/report',
        builder: (context, state) {
          final listingId = state.uri.queryParameters['listing'];
          return listingId == null
              ? const HomeScreen()
              : ReportListingScreen(listingId: listingId);
        },
      ),
    ],
  );
});

CustomTransitionPage<void> _motionPage(
  BuildContext context,
  GoRouterState state,
  Widget child,
) {
  return CustomTransitionPage<void>(
    key: state.pageKey,
    transitionDuration: LoczMotion.emphasized,
    reverseTransitionDuration: LoczMotion.standard,
    child: child,
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      if (!LoczMotion.enabled(context)) return child;
      final entrance = CurvedAnimation(
        parent: animation,
        curve: LoczMotion.enterCurve,
        reverseCurve: LoczMotion.exitCurve,
      );
      return FadeTransition(
        opacity: entrance,
        child: SlideTransition(
          position: Tween<Offset>(
            begin: const Offset(0, 0.035),
            end: Offset.zero,
          ).animate(entrance),
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.992, end: 1).animate(entrance),
            child: child,
          ),
        ),
      );
    },
  );
}

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
        onPost: () {
          HapticFeedback.mediumImpact();
          context.push('/post');
        },
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
          top: BorderSide(color: theme.colorScheme.outlineVariant),
        ),
        boxShadow: [
          BoxShadow(
            color: theme.colorScheme.shadow.withValues(
              alpha: theme.brightness == Brightness.dark ? 0.26 : 0.08,
            ),
            blurRadius: 18,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 68,
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
                    radius: 34,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary,
                            borderRadius: BorderRadius.circular(14),
                            border: Border.all(
                              color: theme.colorScheme.surface,
                              width: 2,
                            ),
                            boxShadow: [
                              BoxShadow(
                                color: theme.colorScheme.primary
                                    .withValues(alpha: 0.22),
                                blurRadius: 14,
                                offset: const Offset(0, 5),
                              ),
                            ],
                          ),
                          child: Icon(
                            Icons.add_rounded,
                            size: 23,
                            color: theme.colorScheme.onPrimary,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          strings('nav.post'),
                          maxLines: 1,
                          overflow: TextOverflow.fade,
                          style: TextStyle(
                            color: theme.colorScheme.primary,
                            fontSize: 9.5,
                            fontWeight: FontWeight.w700,
                          ),
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
    final color = selected
        ? theme.colorScheme.primary
        : theme.colorScheme.onSurfaceVariant;

    return Expanded(
      child: InkResponse(
        onTap: () {
          HapticFeedback.selectionClick();
          onTap();
        },
        radius: 30,
        child: Semantics(
          selected: selected,
          button: true,
          label: label,
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AnimatedContainer(
                duration: LoczMotion.standard,
                curve: LoczMotion.enterCurve,
                width: selected ? 36 : 30,
                height: 27,
                decoration: BoxDecoration(
                  color: selected
                      ? theme.colorScheme.primaryContainer
                      : Colors.transparent,
                  borderRadius: BorderRadius.circular(LoczRadius.full),
                ),
                child: AnimatedScale(
                  scale: selected ? 1.04 : 1,
                  duration: LoczMotion.standard,
                  curve: LoczMotion.enterCurve,
                  child: Icon(
                    selected ? selectedIcon : icon,
                    size: 20,
                    color: color,
                  ),
                ),
              ),
              const SizedBox(height: 4),
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
