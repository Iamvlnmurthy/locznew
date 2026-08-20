import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/account/presentation/account_screen.dart';
import '../../features/alerts/presentation/alerts_screen.dart';
import '../../features/auth/presentation/register_screen.dart';
import '../../features/explore/presentation/explore_screen.dart';
import '../../features/auth/presentation/sign_in_screen.dart';
import '../../features/chat/presentation/chat_screens.dart';
import '../../features/feed/presentation/home_screen.dart';
import '../../features/listings/presentation/business_detail_screen.dart';
import '../../features/listings/presentation/listing_detail_screen.dart';
import '../../features/listings/presentation/listing_navigation.dart';
import '../../features/listings/presentation/report_listing_screen.dart';
import '../../features/listings/presentation/requirement_responses_screen.dart';
import '../../features/listings/presentation/saved_searches_screen.dart';
import '../../features/listings/presentation/search_screen.dart';
import '../../features/listings/presentation/seller_profile_screen.dart';
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
        builder: (context, state, navigationShell) => _TabScaffold(shell: navigationShell),
        // Home · Explore · [Post] · Alerts · Profile (prompt §5). Post is a full-screen
        // push from the centre button; Search and Chats are pushed routes reached from the
        // Home app bar, not their own tabs.
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
              GoRoute(
                path: '/discover/:area',
                pageBuilder: (context, state) => _motionPage(
                  context,
                  state,
                  DiscoveryFeedScreen(
                    area: state.pathParameters['area'] ?? 'local-now',
                  ),
                ),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/explore',
                builder: (_, __) => const ExploreScreen(),
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/alerts',
                builder: (_, __) => const AlertsScreen(),
              ),
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

      // Search and Chats moved out of the bottom bar — reached from the Home app bar.
      GoRoute(
        path: '/search',
        pageBuilder: (context, state) => _motionPage(
          context,
          state,
          SearchScreen(
            key: ValueKey('search-${state.uri.query}'),
            initialQuery: state.uri.queryParameters['q'],
            initialType: state.uri.queryParameters['type'],
            initialCategoryId: state.uri.queryParameters['category'],
            initialCategoryLabel: state.uri.queryParameters['label'],
            initialAttributes: state.uri.queryParametersAll['attr'] ?? const [],
          ),
        ),
      ),
      GoRoute(
        path: '/chats',
        pageBuilder: (context, state) => _motionPage(context, state, const ChatsScreen()),
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
        pageBuilder: (context, state) => _motionPage(context, state, const PostAdScreen()),
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
        pageBuilder: (context, state) => _motionPage(context, state, const CityPickerScreen()),
      ),
      GoRoute(
        path: '/notifications',
        pageBuilder: (context, state) => _motionPage(context, state, const NotificationsScreen()),
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
          return listingId == null ? const HomeScreen() : ReportListingScreen(listingId: listingId);
        },
      ),
      GoRoute(
        path: '/b/:slug',
        pageBuilder: (context, state) => _motionPage(
          context,
          state,
          BusinessDetailScreen(slug: state.pathParameters['slug']!),
        ),
      ),
      GoRoute(
        path: '/seller/:id',
        pageBuilder: (context, state) => _motionPage(
          context,
          state,
          SellerProfileScreen(userId: state.pathParameters['id']!),
        ),
      ),
      GoRoute(
        path: '/saved-searches',
        pageBuilder: (context, state) => _motionPage(context, state, const SavedSearchesScreen()),
      ),
      GoRoute(
        path: '/requirements/:id/responses',
        pageBuilder: (context, state) => _motionPage(
          context,
          state,
          RequirementResponsesScreen(
            listingId: state.pathParameters['id']!,
            title: state.uri.queryParameters['title'] ?? '',
            isOwner: state.uri.queryParameters['owner'] == '1',
          ),
        ),
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
            begin: const Offset(0, 0.06),
            end: Offset.zero,
          ).animate(entrance),
          child: ScaleTransition(
            scale: Tween<double>(begin: 0.975, end: 1).animate(entrance),
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

    // Android's back button, handled explicitly.
    //
    // `StatefulShellRoute.indexedStack` does nothing with it by default: back at the root
    // of any tab pops the whole stack and the app disappears — from Search, from Chats,
    // from Account, with no warning. That reads as a crash rather than navigation.
    //
    // The order below is what Android users expect: unwind the current tab's own stack
    // first, then fall back to Home, and only leave the app from Home itself.
    return PopScope(
      canPop: false,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;

        final router = GoRouter.of(context);
        if (router.canPop()) {
          router.pop();
          return;
        }

        if (shell.currentIndex != 0) {
          shell.goBranch(0);
          return;
        }

        // Home with nothing to unwind is the one place leaving is the right answer.
        SystemNavigator.pop();
      },
      child: Scaffold(
        body: shell,
        bottomNavigationBar: _LoczBottomBar(
          currentIndex: shell.currentIndex,
          strings: strings,
          onTab: (index) => shell.goBranch(
            index,
            initialLocation: index == shell.currentIndex,
          ),
          onPost: () {
            context.push('/post');
          },
        ),
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

    return SafeArea(
      top: false,
      minimum: const EdgeInsets.fromLTRB(8, 3, 8, 6),
      child: Container(
        height: 60,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              theme.colorScheme.surface,
              Color.alphaBlend(
                theme.colorScheme.primary.withValues(alpha: 0.035),
                theme.colorScheme.surface,
              ),
            ],
          ),
          borderRadius: BorderRadius.circular(24),
          border: Border.all(color: theme.colorScheme.outlineVariant),
          boxShadow: [
            BoxShadow(
              color: theme.colorScheme.shadow.withValues(
                alpha: theme.brightness == Brightness.dark ? 0.30 : 0.10,
              ),
              blurRadius: 28,
              offset: const Offset(0, 9),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(24),
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
                icon: Icons.explore_outlined,
                selectedIcon: Icons.explore_rounded,
                label: strings('nav.explore'),
                selected: currentIndex == 1,
                onTap: () => onTab(1),
              ),
              Expanded(
                child: Center(
                  child: LoczPressable(
                    onTap: onPost,
                    semanticLabel: strings('nav.post'),
                    borderRadius: BorderRadius.circular(14),
                    child: Container(
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
                            color: theme.colorScheme.primary.withValues(alpha: 0.22),
                            blurRadius: 17,
                            offset: const Offset(0, 6),
                          ),
                        ],
                      ),
                      child: Icon(
                        Icons.add_rounded,
                        size: 22,
                        color: theme.colorScheme.onPrimary,
                      ),
                    ),
                  ),
                ),
              ),
              _BottomDestination(
                icon: Icons.notifications_none_rounded,
                selectedIcon: Icons.notifications_rounded,
                label: strings('nav.alerts'),
                selected: currentIndex == 2,
                onTap: () => onTab(2),
              ),
              _BottomDestination(
                icon: Icons.person_outline_rounded,
                selectedIcon: Icons.person_rounded,
                label: strings('nav.profile'),
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
                width: selected ? 36 : 28,
                height: 23,
                decoration: BoxDecoration(
                  color: selected ? theme.colorScheme.primaryContainer : Colors.transparent,
                  borderRadius: BorderRadius.circular(LoczRadius.full),
                ),
                child: AnimatedScale(
                  scale: selected ? 1.04 : 1,
                  duration: LoczMotion.standard,
                  curve: LoczMotion.enterCurve,
                  child: AnimatedSwitcher(
                    duration: LoczMotion.quick,
                    switchInCurve: LoczMotion.enterCurve,
                    transitionBuilder: (child, animation) => FadeTransition(
                      opacity: animation,
                      child: ScaleTransition(scale: animation, child: child),
                    ),
                    child: Icon(
                      selected ? selectedIcon : icon,
                      key: ValueKey(selected),
                      size: 19,
                      color: color,
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 3),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.fade,
                style: TextStyle(
                  color: color,
                  fontSize: 9.5,
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
