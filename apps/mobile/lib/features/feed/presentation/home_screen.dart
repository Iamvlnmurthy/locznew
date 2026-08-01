import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/motion/locz_motion.dart';
import '../../../core/providers.dart';
import '../../listings/domain/models.dart';
import '../../listings/presentation/listing_navigation.dart';
import '../../listings/presentation/widgets/listing_card.dart';

/// The home experience begins with intent, then proves that LocZ has useful local
/// inventory. API feed sections remain the source of truth, but no longer dictate
/// the information architecture a person has to understand.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final feed = ref.watch(feedProvider);
    final city = ref.watch(selectedCityProvider);
    final textScale = MediaQuery.textScalerOf(context).scale(1);

    return Scaffold(
      appBar: _HomeAppBar(
        cityLabel: city?.pincode ?? city?.name ?? strings('location.change'),
        strings: strings,
        onLocation: () => context.push('/location'),
        onSearch: () => context.go('/search'),
        onNotifications: () => context.push('/notifications'),
        onTheme: () => ref.read(themeModeProvider.notifier).select(
              Theme.of(context).brightness == Brightness.dark ? ThemeMode.light : ThemeMode.dark,
            ),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(feedProvider),
        child: feed.when(
          loading: () => const _FeedLoading(),
          error: (error, _) => _FeedError(
            message: error.toString(),
            onRetry: () => ref.invalidate(feedProvider),
            retryLabel: strings('common.retry'),
          ),
          data: (data) {
            final location = city?.name.isNotEmpty == true
                ? city!.name
                : data.cityName.isNotEmpty
                    ? data.cityName
                    : strings('feed.nearby');
            final uniqueItems = <String>{
              for (final section in data.sections)
                for (final item in section.items) item.id,
            }.length;

            return CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                  sliver: SliverList.list(
                    children: [
                      LoczEntrance(
                        child: _DiscoveryIntro(
                          eyebrow: strings('feed.heroEyebrow'),
                          title: strings('feed.heroTitle'),
                          hint: strings('feed.heroHint'),
                        ),
                      ),
                      const SizedBox(height: 24),
                      LoczEntrance(
                        delay: const Duration(milliseconds: 70),
                        child: _IntentDeck(
                          strings: strings,
                          onBuy: () => context.go('/search'),
                          onSell: () => context.push('/post'),
                          onJobs: () => context.go('/search?q=job'),
                          onServices: () => context.go('/search?q=service'),
                        ),
                      ),
                      const SizedBox(height: 20),
                      LoczEntrance(
                        delay: const Duration(milliseconds: 120),
                        child: _LocalPulse(
                          city: location,
                          count: uniqueItems,
                          strings: strings,
                          onBrowse: () => context.go('/search'),
                          onPost: () => context.push('/post'),
                        ),
                      ),
                    ],
                  ),
                ),
                if (data.sections.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _EmptyFeed(
                      message: strings('feed.empty'),
                      actionLabel: strings('feed.postFree'),
                      onAction: () => context.push('/post'),
                    ),
                  )
                else
                  for (final (index, section) in data.sections.indexed)
                    SliverToBoxAdapter(
                      child: LoczEntrance(
                        delay: Duration(
                          milliseconds: 160 + index.clamp(0, 4) * 50,
                        ),
                        child: _FeedSectionRail(
                          section: section,
                          textScale: textScale,
                          title: strings('feed.${section.key}'),
                          seeAll: strings('feed.seeAll'),
                          onSeeAll: () => context.go('/search'),
                        ),
                      ),
                    ),
                const SliverToBoxAdapter(child: SizedBox(height: 32)),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _HomeAppBar extends StatelessWidget implements PreferredSizeWidget {
  const _HomeAppBar({
    required this.cityLabel,
    required this.strings,
    required this.onLocation,
    required this.onSearch,
    required this.onNotifications,
    required this.onTheme,
  });

  final String cityLabel;
  final Strings strings;
  final VoidCallback onLocation;
  final VoidCallback onSearch;
  final VoidCallback onNotifications;
  final VoidCallback onTheme;

  @override
  Size get preferredSize => const Size.fromHeight(116);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppBar(
      titleSpacing: 16,
      toolbarHeight: 58,
      title: Row(
        children: [
          Image.asset(
            'assets/brand/locz-mark.png',
            key: const Key('home-brand-mark'),
            width: 32,
            height: 36,
            fit: BoxFit.contain,
          ),
          const SizedBox(width: 10),
          Flexible(
            child: Semantics(
              button: true,
              label: cityLabel,
              child: Material(
                key: const Key('home-location-control'),
                color: theme.colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(18),
                child: InkWell(
                  onTap: onLocation,
                  borderRadius: BorderRadius.circular(18),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.near_me_outlined,
                          size: 15,
                          color: theme.colorScheme.onPrimaryContainer,
                        ),
                        const SizedBox(width: 5),
                        Flexible(
                          child: Text(
                            cityLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.labelMedium?.copyWith(
                              color: theme.colorScheme.onPrimaryContainer,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(width: 2),
                        Icon(
                          Icons.keyboard_arrow_down_rounded,
                          size: 16,
                          color: theme.colorScheme.onPrimaryContainer,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      actions: [
        IconButton(
          key: const Key('home-theme-toggle'),
          visualDensity: VisualDensity.compact,
          constraints: const BoxConstraints.tightFor(width: 40, height: 40),
          icon: AnimatedSwitcher(
            duration: LoczMotion.standard,
            child: Icon(
              theme.brightness == Brightness.dark
                  ? Icons.light_mode_outlined
                  : Icons.dark_mode_outlined,
              key: ValueKey(theme.brightness),
              size: 20,
            ),
          ),
          onPressed: onTheme,
          tooltip: strings('account.appearance'),
        ),
        IconButton(
          visualDensity: VisualDensity.compact,
          constraints: const BoxConstraints.tightFor(width: 40, height: 40),
          icon: const Icon(Icons.notifications_none_rounded, size: 21),
          onPressed: onNotifications,
          tooltip: strings('account.notifications'),
        ),
        const SizedBox(width: 8),
      ],
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(58),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
          child: LoczPressable(
            onTap: onSearch,
            semanticLabel: strings('search.placeholder'),
            child: Container(
              key: const Key('home-header-search'),
              height: 46,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: theme.colorScheme.outlineVariant),
                boxShadow: [
                  BoxShadow(
                    color: theme.colorScheme.shadow.withValues(alpha: 0.06),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Icon(Icons.search_rounded, size: 20, color: theme.colorScheme.primary),
                  const SizedBox(width: 9),
                  Expanded(
                    child: Text(
                      strings('search.placeholder'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium,
                    ),
                  ),
                  Container(
                    width: 28,
                    height: 28,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primaryContainer,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.arrow_forward_rounded,
                      size: 16,
                      color: theme.colorScheme.onPrimaryContainer,
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _DiscoveryIntro extends StatelessWidget {
  const _DiscoveryIntro({
    required this.eyebrow,
    required this.title,
    required this.hint,
  });

  final String eyebrow;
  final String title;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Container(
              width: 20,
              height: 3,
              decoration: BoxDecoration(
                color: theme.colorScheme.secondary,
                borderRadius: BorderRadius.circular(8),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                eyebrow,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.primary,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.75,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 8),
        Text(title, style: theme.textTheme.headlineSmall),
        const SizedBox(height: 5),
        Text(hint, style: theme.textTheme.bodyMedium),
      ],
    );
  }
}

class _IntentDeck extends StatelessWidget {
  const _IntentDeck({
    required this.strings,
    required this.onBuy,
    required this.onSell,
    required this.onJobs,
    required this.onServices,
  });

  final Strings strings;
  final VoidCallback onBuy;
  final VoidCallback onSell;
  final VoidCallback onJobs;
  final VoidCallback onServices;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final actions = [
      _IntentData(
        Icons.shopping_bag_outlined,
        strings('feed.intentBuy'),
        strings('feed.intentBuyHint'),
        theme.colorScheme.primary,
        onBuy,
      ),
      _IntentData(
        Icons.add_box_outlined,
        strings('feed.intentSell'),
        strings('feed.intentSellHint'),
        theme.colorScheme.secondary,
        onSell,
      ),
      _IntentData(
        Icons.work_outline_rounded,
        strings('feed.intentJobs'),
        strings('feed.intentJobsHint'),
        theme.colorScheme.tertiary,
        onJobs,
      ),
      _IntentData(
        Icons.handyman_outlined,
        strings('feed.intentServices'),
        strings('feed.intentServicesHint'),
        theme.colorScheme.primary,
        onServices,
      ),
    ];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(strings('feed.actionTitle'), style: theme.textTheme.titleLarge),
        const SizedBox(height: 3),
        Text(strings('feed.actionHint'), style: theme.textTheme.bodyMedium),
        const SizedBox(height: 12),
        LayoutBuilder(
          builder: (context, constraints) {
            final cardWidth = (constraints.maxWidth - 10) / 2;
            return Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                for (final action in actions)
                  SizedBox(
                    width: cardWidth,
                    child: _IntentCard(action: action),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }
}

class _IntentData {
  const _IntentData(this.icon, this.title, this.hint, this.color, this.onTap);

  final IconData icon;
  final String title;
  final String hint;
  final Color color;
  final VoidCallback onTap;
}

class _IntentCard extends StatelessWidget {
  const _IntentCard({required this.action});

  final _IntentData action;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return LoczPressable(
      onTap: action.onTap,
      semanticLabel: '${action.title}. ${action.hint}',
      child: Container(
        constraints: const BoxConstraints(minHeight: 126),
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: action.color.withValues(alpha: 0.13),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(action.icon, size: 19, color: action.color),
                ),
                const Spacer(),
                Icon(Icons.north_east_rounded, size: 17, color: action.color),
              ],
            ),
            const SizedBox(height: 10),
            Text(action.title, style: theme.textTheme.titleSmall),
            const SizedBox(height: 3),
            Text(
              action.hint,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.labelSmall,
            ),
          ],
        ),
      ),
    );
  }
}

class _LocalPulse extends StatelessWidget {
  const _LocalPulse({
    required this.city,
    required this.count,
    required this.strings,
    required this.onBrowse,
    required this.onPost,
  });

  final String city;
  final int count;
  final Strings strings;
  final VoidCallback onBrowse;
  final VoidCallback onPost;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dark = theme.brightness == Brightness.dark;
    final foreground = dark ? theme.colorScheme.onSurface : Colors.white;
    final muted = foreground.withValues(alpha: 0.76);
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: dark
              ? [const Color(0xFF153D32), const Color(0xFF18221E)]
              : [const Color(0xFF0C5B4B), const Color(0xFF123B33)],
        ),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  color: Colors.white.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.radar_rounded, size: 19, color: foreground),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  strings('feed.localPulse', {'city': city}),
                  style: theme.textTheme.titleMedium?.copyWith(color: foreground),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            strings('feed.localPulseHint', {'count': count}),
            style: theme.textTheme.bodyMedium?.copyWith(color: muted),
          ),
          const SizedBox(height: 14),
          Row(
            children: [
              Expanded(
                child: FilledButton(
                  onPressed: onBrowse,
                  style: FilledButton.styleFrom(
                    backgroundColor: foreground,
                    foregroundColor: const Color(0xFF0C5B4B),
                  ),
                  child: Text(strings('feed.browseAll')),
                ),
              ),
              const SizedBox(width: 8),
              OutlinedButton(
                onPressed: onPost,
                style: OutlinedButton.styleFrom(
                  foregroundColor: foreground,
                  side: BorderSide(color: foreground.withValues(alpha: 0.42)),
                ),
                child: Text(strings('feed.postFree')),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _FeedSectionRail extends StatelessWidget {
  const _FeedSectionRail({
    required this.section,
    required this.textScale,
    required this.title,
    required this.seeAll,
    required this.onSeeAll,
  });

  final FeedSection section;
  final double textScale;
  final String title;
  final String seeAll;
  final VoidCallback onSeeAll;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(top: 26),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Expanded(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.titleLarge,
                  ),
                ),
                TextButton.icon(
                  onPressed: onSeeAll,
                  iconAlignment: IconAlignment.end,
                  icon: const Icon(Icons.arrow_forward_rounded, size: 15),
                  label: Text(seeAll),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),
          SizedBox(
            height: listingCardRailHeight(textScale),
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              itemCount: section.items.length,
              separatorBuilder: (_, __) => const SizedBox(width: 12),
              itemBuilder: (context, index) {
                final listing = section.items[index];
                final tag = 'home-${section.key}-${listing.id}';
                return ListingCard(
                  listing: listing,
                  width: 176,
                  heroTag: tag,
                  onTap: () => context.push(
                    '/ad/${listing.slug}',
                    extra: ListingNavigationPreview(listing: listing, heroTag: tag),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _FeedLoading extends StatelessWidget {
  const _FeedLoading();

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.surfaceContainerHigh;
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(16),
      children: [
        Container(height: 76, decoration: _skeleton(color, 16)),
        const SizedBox(height: 24),
        Container(height: 18, width: 180, decoration: _skeleton(color, 8)),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(child: Container(height: 126, decoration: _skeleton(color, 18))),
            const SizedBox(width: 10),
            Expanded(child: Container(height: 126, decoration: _skeleton(color, 18))),
          ],
        ),
        const SizedBox(height: 20),
        Container(height: 150, decoration: _skeleton(color, 20)),
      ],
    );
  }

  BoxDecoration _skeleton(Color color, double radius) => BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(radius),
      );
}

class _FeedError extends StatelessWidget {
  const _FeedError({
    required this.message,
    required this.onRetry,
    required this.retryLabel,
  });

  final String message;
  final VoidCallback onRetry;
  final String retryLabel;

  @override
  Widget build(BuildContext context) {
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.all(32),
      children: [
        const SizedBox(height: 96),
        Icon(Icons.cloud_off_outlined, size: 40, color: Theme.of(context).colorScheme.primary),
        const SizedBox(height: 14),
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 18),
        Center(child: OutlinedButton(onPressed: onRetry, child: Text(retryLabel))),
      ],
    );
  }
}

class _EmptyFeed extends StatelessWidget {
  const _EmptyFeed({
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.add_location_alt_outlined,
              size: 38,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: 12),
            Text(
              message,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: onAction,
              icon: const Icon(Icons.add_rounded),
              label: Text(actionLabel),
            ),
          ],
        ),
      ),
    );
  }
}
