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

    return Scaffold(
      appBar: AppBar(
        titleSpacing: LoczSpacing.x4,
        title: InkWell(
          onTap: () => context.push('/location'),
          borderRadius: BorderRadius.circular(LoczRadius.full),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.location_on_outlined, size: 18),
                const SizedBox(width: 4),
                Flexible(
                  child: Text(
                    city?.name ?? strings('location.change'),
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
                  ),
                ),
                const Icon(Icons.arrow_drop_down, size: 20),
              ],
            ),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications_none),
            onPressed: () => context.push('/notifications'),
            tooltip: strings('account.notifications'),
          ),
        ],
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
                      LoczSpacing.x3,
                      LoczSpacing.x4,
                      0,
                    ),
                    child: SearchBar(
                      hintText: strings('search.placeholder'),
                      leading: const Icon(Icons.search),
                      onTap: () => context.push('/search'),
                      // Read-only: tapping opens the dedicated search screen rather
                      // than typing inline, so results and filters share one place.
                      onChanged: (_) {},
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
                            padding: const EdgeInsets.symmetric(horizontal: LoczSpacing.x4),
                            child: Text(
                              strings('feed.${section.key}'),
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                          ),
                          const SizedBox(height: LoczSpacing.x3),
                          SizedBox(
                            height: 250,
                            child: ListView.separated(
                              scrollDirection: Axis.horizontal,
                              padding: const EdgeInsets.symmetric(horizontal: LoczSpacing.x4),
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

                const SliverToBoxAdapter(child: SizedBox(height: LoczSpacing.x8)),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _FeedError extends StatelessWidget {
  const _FeedError({required this.message, required this.onRetry, required this.retryLabel});

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
  const _EmptyFeed({required this.message, required this.actionLabel, required this.onAction});

  final String message;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(LoczSpacing.x8),
      children: [
        const SizedBox(height: 80),
        Text(slogan, textAlign: TextAlign.center, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: LoczSpacing.x3),
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: LoczSpacing.x4),
        FilledButton(onPressed: onAction, child: Text(actionLabel)),
      ],
    );
  }
}
