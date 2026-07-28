import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';
import '../../listings/presentation/widgets/listing_card.dart';

/// Home feed — horizontal rails per section, mirroring the web app.
///
/// The API omits empty sections, so there is no "no results" carousel to hide here.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final strings = Strings.of(context);
    final feed = ref.watch(feedProvider);
    final city = ref.watch(selectedCityProvider);
    final textScale = MediaQuery.textScalerOf(context).scale(1);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: LoczSpacing.x4,
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
            const SizedBox(width: LoczSpacing.x2),
            Expanded(
              child: Align(
                alignment: Alignment.centerLeft,
                child: Material(
                  color: Theme.of(context).colorScheme.primaryContainer,
                  borderRadius: BorderRadius.circular(18),
                  child: InkWell(
                    key: const Key('home-location-control'),
                    onTap: () => context.push('/location'),
                    borderRadius: BorderRadius.circular(18),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 7),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(
                            Icons.location_on_outlined,
                            size: 15,
                            color: Theme.of(context).colorScheme.onPrimaryContainer,
                          ),
                          const SizedBox(width: 4),
                          Flexible(
                            child: Text(
                              city?.pincode ?? city?.name ?? strings('location.change'),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.labelMedium?.copyWith(
                                    color: Theme.of(context).colorScheme.onPrimaryContainer,
                                  ),
                            ),
                          ),
                          const SizedBox(width: 1),
                          Icon(
                            Icons.keyboard_arrow_down_rounded,
                            size: 16,
                            color: Theme.of(context).colorScheme.onPrimaryContainer,
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
            icon: Icon(
              Theme.of(context).brightness == Brightness.dark
                  ? Icons.light_mode_outlined
                  : Icons.dark_mode_outlined,
              size: 20,
            ),
            onPressed: () => ref.read(themeModeProvider.notifier).select(
                  Theme.of(context).brightness == Brightness.dark
                      ? ThemeMode.light
                      : ThemeMode.dark,
                ),
            tooltip: strings('account.appearance'),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            constraints: const BoxConstraints.tightFor(width: 40, height: 40),
            icon: const Icon(Icons.notifications_none_rounded, size: 22),
            onPressed: () => context.push('/notifications'),
            tooltip: strings('account.notifications'),
          ),
          const SizedBox(width: LoczSpacing.x2),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(58),
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              LoczSpacing.x4,
              0,
              LoczSpacing.x4,
              LoczSpacing.x3,
            ),
            child: Semantics(
              button: true,
              child: Material(
                color: Theme.of(context).colorScheme.surface,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(15),
                  side: BorderSide(
                    color: Theme.of(context).colorScheme.outline.withValues(alpha: 0.55),
                  ),
                ),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  key: const Key('home-header-search'),
                  onTap: () => context.push('/search'),
                  child: SizedBox(
                    height: 46,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 14),
                      child: Row(
                        children: [
                          Icon(
                            Icons.search_rounded,
                            size: 20,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                          const SizedBox(width: 9),
                          Expanded(
                            child: Text(
                              strings('search.placeholder'),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: Theme.of(context).textTheme.bodyMedium,
                            ),
                          ),
                          Icon(
                            Icons.arrow_forward_rounded,
                            size: 18,
                            color: Theme.of(context).colorScheme.primary,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
      body: RefreshIndicator(
        // Pull-to-refresh is the expected gesture on a feed; invalidating the provider
        // refetches through the same path as first load.
        onRefresh: () async => ref.invalidate(feedProvider),
        child: feed.when(
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => _FeedError(
            message: error.toString(),
            onRetry: () => ref.invalidate(feedProvider),
            retryLabel: strings('common.retry'),
          ),
          data: (data) {
            if (data.sections.isEmpty) {
              return _EmptyFeed(
                slogan: strings('brand.tagline'),
                message: strings('feed.empty'),
                actionLabel: strings('nav.post'),
                onAction: () => context.push('/post'),
              );
            }

            return CustomScrollView(
              slivers: [
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.fromLTRB(
                      LoczSpacing.x4,
                      LoczSpacing.x2,
                      LoczSpacing.x4,
                      0,
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          strings('brand.tagline'),
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                      ],
                    ),
                  ),
                ),
                for (final section in data.sections)
                  SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.only(top: LoczSpacing.x6),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Padding(
                            padding: const EdgeInsets.symmetric(
                              horizontal: LoczSpacing.x4,
                            ),
                            child: Text(
                              strings('feed.${section.key}'),
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                          ),
                          const SizedBox(height: LoczSpacing.x3),
                          SizedBox(
                            height: listingCardRailHeight(textScale),
                            child: ListView.separated(
                              scrollDirection: Axis.horizontal,
                              padding: const EdgeInsets.symmetric(
                                horizontal: LoczSpacing.x4,
                              ),
                              itemCount: section.items.length,
                              separatorBuilder: (_, __) => const SizedBox(width: LoczSpacing.x3),
                              itemBuilder: (context, index) {
                                final listing = section.items[index];
                                return ListingCard(
                                  listing: listing,
                                  width: 168,
                                  onTap: () => context.push('/ad/${listing.slug}'),
                                );
                              },
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                const SliverToBoxAdapter(
                  child: SizedBox(height: LoczSpacing.x8),
                ),
              ],
            );
          },
        ),
      ),
    );
  }
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
    // Must stay scrollable so pull-to-refresh still works on the error state.
    return ListView(
      padding: const EdgeInsets.all(LoczSpacing.x8),
      children: [
        const SizedBox(height: 80),
        const Icon(Icons.cloud_off_outlined, size: 40),
        const SizedBox(height: LoczSpacing.x4),
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: LoczSpacing.x4),
        OutlinedButton(onPressed: onRetry, child: Text(retryLabel)),
      ],
    );
  }
}

class _EmptyFeed extends StatelessWidget {
  const _EmptyFeed({
    required this.slogan,
    required this.message,
    required this.actionLabel,
    required this.onAction,
  });

  /// "Find it here. Deal it near." — the empty feed is the one screen with room for it.
  final String slogan;
  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(LoczSpacing.x8),
      children: [
        const SizedBox(height: 80),
        Text(
          slogan,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: LoczSpacing.x3),
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: LoczSpacing.x4),
        FilledButton(onPressed: onAction, child: Text(actionLabel)),
      ],
    );
  }
}
