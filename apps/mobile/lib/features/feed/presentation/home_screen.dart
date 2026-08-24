import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/motion/locz_motion.dart';
import '../../../core/providers.dart';
import '../../listings/domain/models.dart';
import '../../listings/presentation/business_category_art.dart';
import '../../listings/presentation/listing_navigation.dart';
import '../../listings/presentation/widgets/listing_card.dart';

/// The home experience begins with intent, then proves that LocZ has useful local
/// inventory. API feed sections remain the source of truth, but no longer dictate
/// the information architecture a person has to understand.
class HomeScreen extends ConsumerStatefulWidget {
  const HomeScreen({super.key});

  @override
  ConsumerState<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends ConsumerState<HomeScreen> {
  void _selectArea(String area) {
    context.push('/discover/$area');
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final feed = ref.watch(feedProvider);
    final city = ref.watch(selectedCityProvider);
    final radiusKm = ref.watch(selectedRadiusProvider);

    return Scaffold(
      appBar: _HomeAppBar(
        // The location pill owns the place; the radius chips below own "how far".
        cityLabel: city?.pincode ?? city?.name ?? strings('location.change'),
        strings: strings,
        onLocation: () => context.push('/location'),
        onSearch: () => context.push('/search'),
        onChats: () => context.push('/chats'),
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
                        offset: const Offset(0, 10),
                        child: _RadiusSelector(
                          label: strings('feed.within'),
                          selected: radiusKm,
                          onSelect: (value) =>
                              ref.read(selectedRadiusProvider.notifier).select(value),
                          kmLabel: strings('common.km'),
                        ),
                      ),
                      if (city?.slug != null && (city?.tier == 1 || city?.tier == 2)) ...[
                        const SizedBox(height: 14),
                        LoczEntrance(
                          delay: const Duration(milliseconds: 55),
                          offset: const Offset(0, 9),
                          child: _CityGuideHomeCard(
                            city: city!.name,
                            onTap: () => context.push('/in/${city.slug}'),
                          ),
                        ),
                      ],
                      const SizedBox(height: 18),
                      LoczEntrance(
                        delay: const Duration(milliseconds: 90),
                        offset: const Offset(0, 12),
                        child: _DiscoveryHeading(
                          city: location,
                          resultCount: uniqueItems,
                          onViewAll: () => context.go('/explore'),
                        ),
                      ),
                    ],
                  ),
                ),
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(10, 0, 10, 0),
                  sliver: SliverToBoxAdapter(
                    child: Container(
                      padding: const EdgeInsets.fromLTRB(6, 4, 6, 14),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(28),
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            Theme.of(context).colorScheme.surface.withValues(alpha: .82),
                            Theme.of(context).colorScheme.primaryContainer.withValues(alpha: .34),
                          ],
                        ),
                        border: Border.all(
                          color: Theme.of(context).colorScheme.primary.withValues(alpha: .08),
                        ),
                      ),
                      child: _AroundYouSection(
                        selectedArea: null,
                        onSelect: _selectArea,
                      ),
                    ),
                  ),
                ),
                const SliverToBoxAdapter(child: SizedBox(height: 28)),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _CityGuideHomeCard extends StatelessWidget {
  const _CityGuideHomeCard({required this.city, required this.onTap});

  final String city;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final scheme = Theme.of(context).colorScheme;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Ink(
          padding: const EdgeInsets.fromLTRB(15, 13, 13, 13),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: [
                scheme.primaryContainer.withValues(alpha: .82),
                scheme.surface,
              ],
            ),
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: scheme.primary.withValues(alpha: .15)),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: scheme.primary,
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Icon(
                  Icons.location_city_rounded,
                  color: scheme.onPrimary,
                  size: 21,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      strings('cityGuide.exploreCity', {'city': city}),
                      style: Theme.of(context).textTheme.titleSmall,
                    ),
                    const SizedBox(height: 3),
                    Text(
                      strings('cityGuide.homeHint'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.labelSmall,
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                Icons.arrow_forward_rounded,
                color: scheme.primary,
                size: 19,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// A discovery destination is a full screen, not a filter applied under Home. Each area
/// chooses the useful local sources it owns and may blend imported data with community posts.
class DiscoveryFeedScreen extends ConsumerStatefulWidget {
  const DiscoveryFeedScreen({required this.area, super.key});

  final String area;

  @override
  ConsumerState<DiscoveryFeedScreen> createState() => _DiscoveryFeedScreenState();
}

class _DiscoveryFeedScreenState extends ConsumerState<DiscoveryFeedScreen> {
  bool _latestFirst = false;

  static const _areaTypes = <String, Set<String>>{
    'local-now': {'EVENT', 'BUYER_REQUIREMENT', 'RENTAL'},
    'jobs': {'JOB'},
    'deals': {'OFFER'},
    'services': {'SERVICE'},
    'marketplace': {'PRODUCT', 'CLASSIFIED'},
    'businesses': {'BUSINESS_LISTING'},
  };

  bool get _showAlerts => widget.area == 'alerts';
  bool get _showNews => widget.area == 'news';
  bool get _showJobs => widget.area == 'jobs';
  bool get _showDeals => widget.area == 'deals';
  bool get _showBusinesses => widget.area == 'businesses';
  bool get _showCommunityFeed =>
      widget.area == 'local-now' ||
      widget.area == 'deals' ||
      widget.area == 'services' ||
      widget.area == 'marketplace';

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final feed = ref.watch(feedProvider);
    final title = strings('area.${widget.area}');

    return Scaffold(
      floatingActionButton: FloatingActionButton.small(
        heroTag: 'discovery-back-${widget.area}',
        onPressed: () => context.pop(),
        tooltip: strings('feed.backToExplore'),
        child: const Icon(Icons.grid_view_rounded),
      ),
      body: SafeArea(
        bottom: false,
        child: RefreshIndicator(
          onRefresh: () async => ref.invalidate(feedProvider),
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverPersistentHeader(
                pinned: true,
                delegate: _FeedToolbarDelegate(
                  title: title,
                  area: widget.area,
                  latestFirst: _latestFirst,
                  onSortChanged: (latest) => setState(() => _latestFirst = latest),
                ),
              ),
              if (_showAlerts) const SliverToBoxAdapter(child: _LocalAlertsSection()),
              if (_showNews) const SliverToBoxAdapter(child: _LocalNewsSection()),
              if (_showJobs) const SliverToBoxAdapter(child: _LocalJobsSection()),
              if (_showDeals) const SliverToBoxAdapter(child: _LocalDealsSection()),
              if (_showBusinesses) const SliverToBoxAdapter(child: _NearbyBusinessesSection()),
              if (_showCommunityFeed)
                feed.when(
                  loading: () => const SliverToBoxAdapter(
                    child: SizedBox(height: 430, child: _FeedLoading()),
                  ),
                  error: (_, __) => const SliverToBoxAdapter(child: SizedBox.shrink()),
                  data: (data) {
                    final types = _areaTypes[widget.area];
                    final seen = <String>{};
                    final items = <ListingSummary>[
                      for (final section in data.sections)
                        for (final item in section.items)
                          if (seen.add(item.id) && (types == null || types.contains(item.type)))
                            item,
                    ];
                    if (_latestFirst) {
                      items.sort(
                        (a, b) =>
                            (b.publishedAt ?? DateTime.fromMillisecondsSinceEpoch(0)).compareTo(
                          a.publishedAt ?? DateTime.fromMillisecondsSinceEpoch(0),
                        ),
                      );
                    } else {
                      items.sort((a, b) {
                        final left = a.distanceMeters;
                        final right = b.distanceMeters;
                        if (left == null && right == null) return 0;
                        if (left == null) return 1;
                        if (right == null) return -1;
                        return left.compareTo(right);
                      });
                    }
                    if (items.isEmpty) {
                      return const SliverToBoxAdapter(child: SizedBox.shrink());
                    }
                    return SliverPadding(
                      padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
                      sliver: SliverList.builder(
                        itemCount: items.length,
                        itemBuilder: (context, index) {
                          final listing = items[index];
                          final heroTag = 'discover-${widget.area}-${listing.id}';
                          return Padding(
                            padding: const EdgeInsets.only(bottom: 14),
                            child: LoczEntrance(
                              key: ValueKey(
                                '${widget.area}-$_latestFirst-${listing.id}',
                              ),
                              delay: Duration(
                                milliseconds: (index > 5 ? 5 : index) * 34,
                              ),
                              offset: const Offset(0, 9),
                              child: ListingCard(
                                listing: listing,
                                heroTag: heroTag,
                                typeLabel: strings('type.${listing.type}'),
                                onTap: () => context.push(
                                  '/ad/${listing.slug}',
                                  extra: ListingNavigationPreview(
                                    listing: listing,
                                    heroTag: heroTag,
                                  ),
                                ),
                              ),
                            ),
                          );
                        },
                      ),
                    );
                  },
                ),
              const SliverToBoxAdapter(child: SizedBox(height: 24)),
            ],
          ),
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
    required this.onChats,
    required this.onTheme,
  });

  final String cityLabel;
  final Strings strings;
  final VoidCallback onLocation;
  final VoidCallback onSearch;
  final VoidCallback onChats;
  final VoidCallback onTheme;

  @override
  Size get preferredSize => const Size.fromHeight(112);

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return AppBar(
      titleSpacing: 14,
      toolbarHeight: 60,
      title: Row(
        children: [
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Image.asset(
                'assets/brand/locz-mark.png',
                key: const Key('home-brand-mark'),
                width: 25,
                height: 32,
                fit: BoxFit.contain,
              ),
              const SizedBox(width: 4),
              Text.rich(
                TextSpan(
                  children: [
                    TextSpan(
                      text: 'Loc',
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: theme.colorScheme.primary,
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.9,
                      ),
                    ),
                    TextSpan(
                      text: 'Z',
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: const Color(0xFFEF6851),
                        fontWeight: FontWeight.w900,
                        letterSpacing: -0.9,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(width: 10),
          Flexible(
            child: Semantics(
              button: true,
              label: cityLabel,
              child: Material(
                key: const Key('home-location-control'),
                color: theme.colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(17),
                child: InkWell(
                  onTap: onLocation,
                  borderRadius: BorderRadius.circular(17),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          Icons.near_me_outlined,
                          size: 16,
                          color: theme.colorScheme.onPrimaryContainer,
                        ),
                        const SizedBox(width: 6),
                        Flexible(
                          child: Text(
                            cityLabel,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onPrimaryContainer,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                        const SizedBox(width: 2),
                        Icon(
                          Icons.keyboard_arrow_down_rounded,
                          size: 18,
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
              size: 18,
            ),
          ),
          onPressed: onTheme,
          tooltip: strings('account.appearance'),
        ),
        IconButton(
          visualDensity: VisualDensity.compact,
          constraints: const BoxConstraints.tightFor(width: 40, height: 40),
          icon: const Icon(Icons.chat_bubble_outline_rounded, size: 19),
          onPressed: onChats,
          tooltip: strings('nav.chats'),
        ),
        const SizedBox(width: 6),
      ],
      bottom: PreferredSize(
        preferredSize: const Size.fromHeight(52),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(16, 2, 16, 10),
          child: LoczPressable(
            onTap: onSearch,
            semanticLabel: strings('search.placeholder'),
            child: Container(
              key: const Key('home-header-search'),
              height: 42,
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(18),
                border: Border.all(color: theme.colorScheme.outlineVariant),
                boxShadow: [
                  BoxShadow(
                    color: theme.colorScheme.primary.withValues(alpha: 0.055),
                    blurRadius: 16,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Row(
                children: [
                  Icon(
                    Icons.search_rounded,
                    size: 18,
                    color: theme.colorScheme.primary,
                  ),
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
                    width: 26,
                    height: 26,
                    decoration: BoxDecoration(
                      color: theme.colorScheme.primaryContainer,
                      shape: BoxShape.circle,
                    ),
                    child: Icon(
                      Icons.arrow_forward_rounded,
                      size: 14,
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

class _DiscoveryIntro extends StatefulWidget {
  const _DiscoveryIntro({
    required this.eyebrow,
    required this.title,
    required this.hint,
    required this.liveLabel,
    required this.countLabel,
    required this.actionLabel,
    required this.onAction,
  });

  final String eyebrow;
  final String title;
  final String hint;
  final String liveLabel;
  final String countLabel;
  final String actionLabel;
  final VoidCallback onAction;

  @override
  State<_DiscoveryIntro> createState() => _DiscoveryIntroState();
}

class _DiscoveryIntroState extends State<_DiscoveryIntro> with SingleTickerProviderStateMixin {
  late final AnimationController _ambient = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1400),
  );

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (LoczMotion.enabled(context)) {
      if (!_ambient.isAnimating && !_ambient.isCompleted) {
        _ambient.forward();
      }
    } else {
      _ambient.stop();
      _ambient.value = 0.5;
    }
  }

  @override
  void dispose() {
    _ambient.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    const foreground = Color(0xFFF7F8F3);
    const muted = Color(0xFFB8C6BF);
    return AnimatedBuilder(
      animation: _ambient,
      builder: (context, child) => Container(
        height: 238,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(26),
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF153F35), Color(0xFF0B1713), Color(0xFF111512)],
            stops: [0, 0.58, 1],
          ),
          border: Border.all(color: const Color(0xFF335047), width: 0.8),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF07110D).withValues(
                alpha: theme.brightness == Brightness.dark ? 0.42 : 0.22,
              ),
              blurRadius: 30,
              offset: const Offset(0, 14),
            ),
          ],
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(25),
          child: Stack(
            children: [
              Positioned(
                right: -54 + (_ambient.value * 9),
                top: -64 + (_ambient.value * 5),
                child: const _AmbientRings(),
              ),
              Positioned(
                right: 26,
                top: 28 + (_ambient.value * 4),
                child: Container(
                  width: 42,
                  height: 42,
                  decoration: BoxDecoration(
                    color: const Color(0xFF74C6AF).withValues(alpha: 0.13),
                    shape: BoxShape.circle,
                    border: Border.all(
                      color: const Color(0xFF83D7BF).withValues(alpha: 0.22),
                    ),
                  ),
                  child: const Icon(
                    Icons.near_me_rounded,
                    size: 19,
                    color: Color(0xFF8DD8C3),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 19, 20, 18),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Container(
                          width: 18,
                          height: 2,
                          decoration: BoxDecoration(
                            color: const Color(0xFFF6BE60),
                            borderRadius: BorderRadius.circular(4),
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            widget.eyebrow,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: const Color(0xFF8DD8C3),
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 1.05,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 14),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 270),
                      child: Text(
                        widget.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.headlineSmall?.copyWith(
                          color: foreground,
                          fontSize: 23,
                          height: 1.12,
                          letterSpacing: -0.55,
                        ),
                      ),
                    ),
                    const SizedBox(height: 7),
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxWidth: 292),
                      child: Text(
                        widget.hint,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: muted,
                          fontSize: 12,
                          height: 1.4,
                        ),
                      ),
                    ),
                    const Spacer(),
                    Row(
                      children: [
                        Expanded(
                          child: Container(
                            height: 42,
                            padding: const EdgeInsets.symmetric(horizontal: 12),
                            decoration: BoxDecoration(
                              color: Colors.white.withValues(alpha: 0.075),
                              borderRadius: BorderRadius.circular(14),
                              border: Border.all(
                                color: Colors.white.withValues(alpha: 0.1),
                              ),
                            ),
                            child: Row(
                              children: [
                                Container(
                                  width: 7,
                                  height: 7,
                                  decoration: const BoxDecoration(
                                    color: Color(0xFF6EE7B7),
                                    shape: BoxShape.circle,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        widget.liveLabel,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          color: foreground,
                                          fontSize: 10.5,
                                          fontWeight: FontWeight.w700,
                                        ),
                                      ),
                                      Text(
                                        widget.countLabel,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: const TextStyle(
                                          color: muted,
                                          fontSize: 9.5,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                        const SizedBox(width: 9),
                        LoczPressable(
                          onTap: widget.onAction,
                          semanticLabel: widget.actionLabel,
                          borderRadius: BorderRadius.circular(14),
                          child: Container(
                            width: 42,
                            height: 42,
                            decoration: BoxDecoration(
                              color: const Color(0xFFF3F4EF),
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: const Icon(
                              Icons.arrow_forward_rounded,
                              size: 18,
                              color: Color(0xFF123E34),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _AmbientRings extends StatelessWidget {
  const _AmbientRings();

  @override
  Widget build(BuildContext context) => Container(
        width: 184,
        height: 184,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white.withValues(alpha: 0.055)),
          boxShadow: [
            BoxShadow(
              spreadRadius: 24,
              color: Colors.white.withValues(alpha: 0.027),
            ),
            BoxShadow(
              spreadRadius: 50,
              color: Colors.white.withValues(alpha: 0.018),
            ),
          ],
        ),
      );
}

// Retained while the Explore screen is migrated to the same interaction model.
// ignore: unused_element
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
        const SizedBox(height: 11),
        SizedBox(
          height: 102,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            clipBehavior: Clip.none,
            itemCount: actions.length,
            separatorBuilder: (_, __) => const SizedBox(width: 9),
            itemBuilder: (context, index) => SizedBox(
              width: 132,
              child: _IntentCard(action: actions[index]),
            ),
          ),
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
        padding: const EdgeInsets.fromLTRB(12, 11, 10, 10),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [
              action.color.withValues(
                alpha: theme.brightness == Brightness.dark ? 0.15 : 0.1,
              ),
              theme.colorScheme.surface,
            ],
          ),
          borderRadius: BorderRadius.circular(17),
          border: Border.all(
            color: action.color.withValues(
              alpha: theme.brightness == Brightness.dark ? 0.28 : 0.2,
            ),
          ),
          boxShadow: [
            BoxShadow(
              color: theme.colorScheme.shadow.withValues(alpha: 0.055),
              blurRadius: 14,
              offset: const Offset(0, 5),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Container(
                  width: 31,
                  height: 31,
                  decoration: BoxDecoration(
                    color: action.color.withValues(alpha: 0.16),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(action.icon, size: 16, color: action.color),
                ),
                const Spacer(),
                Icon(
                  Icons.arrow_outward_rounded,
                  size: 14,
                  color: action.color,
                ),
              ],
            ),
            const Spacer(),
            Text(
              action.title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.titleSmall?.copyWith(fontSize: 12.5),
            ),
            const SizedBox(height: 2),
            Text(
              action.hint,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: theme.textTheme.labelSmall?.copyWith(fontSize: 9.5),
            ),
          ],
        ),
      ),
    );
  }
}

/// The global radius chooser. Selecting a value re-queries the whole feed.
class _RadiusSelector extends StatelessWidget {
  const _RadiusSelector({
    required this.label,
    required this.selected,
    required this.onSelect,
    required this.kmLabel,
  });

  final String label;
  final int selected;
  final ValueChanged<int> onSelect;
  final String kmLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: theme.textTheme.labelLarge?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            for (final km in kRadiusPresetsKm)
              ChoiceChip(
                label: Text('$km $kmLabel'),
                selected: km == selected,
                onSelected: (_) => onSelect(km),
                visualDensity: VisualDensity.compact,
              ),
          ],
        ),
      ],
    );
  }
}

/// Quick access — 6–8 high-value shortcuts; "More" opens Explore (prompt §10).
// Retained while the Explore screen is migrated to the same interaction model.
// ignore: unused_element
class _QuickAccess extends StatelessWidget {
  const _QuickAccess({required this.strings});

  final Strings strings;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final items = <(IconData, String, String)>[
      (Icons.local_offer_outlined, strings('type.OFFER'), '/search?type=OFFER'),
      (Icons.work_outline, strings('type.JOB'), '/search?type=JOB'),
      (Icons.home_outlined, strings('type.RENTAL'), '/search?type=RENTAL'),
      (Icons.build_outlined, strings('type.SERVICE'), '/search?type=SERVICE'),
      (Icons.restaurant_outlined, strings('explore.food'), '/search?q=food'),
      (Icons.event_outlined, strings('explore.events'), '/search?type=EVENT'),
      (Icons.storefront_outlined, strings('type.PRODUCT'), '/search?type=PRODUCT'),
      (Icons.grid_view_rounded, strings('explore.more'), '/explore'),
    ];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          strings('feed.quickAccess'),
          style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 12),
        GridView.count(
          crossAxisCount: 4,
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          mainAxisSpacing: 12,
          crossAxisSpacing: 10,
          childAspectRatio: 0.86,
          children: [
            for (final (icon, label, route) in items)
              _QuickTile(
                icon: icon,
                label: label,
                onTap: () => context.push(route),
              ),
          ],
        ),
      ],
    );
  }
}

class _QuickTile extends StatelessWidget {
  const _QuickTile({
    required this.icon,
    required this.label,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(14),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: theme.colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(
              icon,
              size: 22,
              color: theme.colorScheme.onPrimaryContainer,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.labelSmall,
          ),
        ],
      ),
    );
  }
}

/// "Businesses near you" on Home — the cold-start payoff. Page one of nearby businesses,
/// nearest first with a distance and OLX-style band headers. Tapping opens the business.
/// "Around you" — discovery-area counts rolled up from the POIs LocZ already holds, so a
/// brand-new area reads as alive before anyone posts. Mirrors the web Home strip.
class _DiscoveryHeading extends StatelessWidget {
  const _DiscoveryHeading({
    required this.city,
    required this.resultCount,
    required this.onViewAll,
  });

  final String city;
  final int resultCount;
  final VoidCallback onViewAll;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final strings = Strings.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.end,
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                strings('feed.whatsNearYou'),
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.6,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                strings(
                  'feed.discoverySummary',
                  {'count': '$resultCount', 'city': city},
                ),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
        TextButton(onPressed: onViewAll, child: Text(strings('feed.viewAll'))),
      ],
    );
  }
}

class _AroundYouSection extends ConsumerStatefulWidget {
  const _AroundYouSection({
    required this.selectedArea,
    required this.onSelect,
  });

  final String? selectedArea;
  final ValueChanged<String> onSelect;

  @override
  ConsumerState<_AroundYouSection> createState() => _AroundYouSectionState();
}

class _AroundYouSectionState extends ConsumerState<_AroundYouSection> {
  static const _fallbackAreas = <({String area, int count})>[
    (area: 'local-now', count: 0),
    (area: 'businesses', count: 0),
    (area: 'jobs', count: 0),
    (area: 'news', count: 0),
    (area: 'alerts', count: 0),
    (area: 'deals', count: 0),
    (area: 'services', count: 0),
    (area: 'marketplace', count: 0),
  ];

  List<({String area, int count})> _areas = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final city = ref.read(selectedCityProvider);
    try {
      final result = await ref.read(listingRepositoryProvider).areaSummary(
            cityId: (city?.id.isEmpty ?? true) ? null : city!.id,
            pincode: city?.pincode,
          );
      if (mounted) {
        setState(() {
          _areas = result;
        });
      }
    } catch (_) {}
  }

  String _formatCount(int count) {
    // Indian grouping: 12,781 rather than 12781.
    final digits = count.toString();
    if (digits.length <= 3) return digits;
    final head = digits.substring(0, digits.length - 3);
    final tail = digits.substring(digits.length - 3);
    final buffer = StringBuffer();
    for (var i = 0; i < head.length; i += 1) {
      final fromEnd = head.length - i;
      buffer.write(head[i]);
      if (fromEnd > 1 && fromEnd.isOdd) buffer.write(',');
    }
    return '$buffer,$tail';
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final counts = {for (final entry in _areas) entry.area: entry.count};
    final visibleAreas = [
      for (final entry in _fallbackAreas) (area: entry.area, count: counts[entry.area] ?? 0),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(8, 10, 8, 0),
      child: GridView.builder(
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 9,
          crossAxisSpacing: 9,
          childAspectRatio: 2.12,
        ),
        itemCount: visibleAreas.length,
        itemBuilder: (context, index) {
          final entry = visibleAreas[index];
          return LoczEntrance(
            delay: Duration(milliseconds: index * 45),
            offset: const Offset(0, 12),
            child: _AreaChip(
              asset: discoveryAreaAsset(entry.area),
              count: entry.count > 0 ? _formatCount(entry.count) : '',
              label: strings('area.${entry.area}'),
              selected: widget.selectedArea == entry.area,
              onTap: () => widget.onSelect(entry.area),
            ),
          );
        },
      ),
    );
  }
}

class _FeedToolbarDelegate extends SliverPersistentHeaderDelegate {
  _FeedToolbarDelegate({
    required this.title,
    required this.area,
    required this.latestFirst,
    required this.onSortChanged,
  });

  final String title;
  final String area;
  final bool latestFirst;
  final ValueChanged<bool> onSortChanged;

  @override
  double get minExtent => 64;

  @override
  double get maxExtent => 64;

  @override
  Widget build(
    BuildContext context,
    double shrinkOffset,
    bool overlapsContent,
  ) {
    final theme = Theme.of(context);
    final strings = Strings.of(context);
    return AnimatedContainer(
      duration: LoczMotion.standard,
      curve: LoczMotion.enterCurve,
      decoration: BoxDecoration(
        color: theme.colorScheme.surface.withValues(alpha: 0.97),
        border: Border(
          bottom: BorderSide(
            color: overlapsContent
                ? theme.colorScheme.primary.withValues(alpha: 0.16)
                : theme.colorScheme.outlineVariant.withValues(alpha: 0.55),
          ),
        ),
        boxShadow: overlapsContent
            ? [
                BoxShadow(
                  color: theme.colorScheme.shadow.withValues(alpha: 0.14),
                  blurRadius: 22,
                  offset: const Offset(0, 8),
                ),
              ]
            : const [],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Row(
          children: [
            Container(
              width: 42,
              height: 42,
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: theme.colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(13),
              ),
              child: Image.asset(discoveryAreaAsset(area)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w800),
              ),
            ),
            TextButton.icon(
              onPressed: () => onSortChanged(!latestFirst),
              icon: AnimatedSwitcher(
                duration: LoczMotion.quick,
                switchInCurve: LoczMotion.enterCurve,
                child: Icon(
                  latestFirst ? Icons.schedule_rounded : Icons.near_me_outlined,
                  key: ValueKey(latestFirst),
                  size: 17,
                ),
              ),
              label: AnimatedSwitcher(
                duration: LoczMotion.quick,
                child: Text(
                  strings(latestFirst ? 'feed.latest' : 'feed.nearest'),
                  key: ValueKey(latestFirst),
                ),
              ),
            ),
            IconButton(
              onPressed: () => context.push('/search'),
              icon: const Icon(Icons.tune_rounded),
              tooltip: strings('feed.filters'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  bool shouldRebuild(covariant _FeedToolbarDelegate oldDelegate) =>
      title != oldDelegate.title ||
      area != oldDelegate.area ||
      latestFirst != oldDelegate.latestFirst;
}

class _AreaChip extends StatelessWidget {
  const _AreaChip({
    required this.asset,
    required this.count,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String asset;
  final String count;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    return Material(
      color: selected ? scheme.primaryContainer : scheme.surface,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: AnimatedContainer(
          duration: LoczMotion.quick,
          padding: const EdgeInsets.fromLTRB(10, 8, 9, 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: selected ? scheme.primary : scheme.outlineVariant,
              width: selected ? 1.5 : 1,
            ),
            gradient: selected
                ? null
                : LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [
                      scheme.surface,
                      Color.alphaBlend(
                        scheme.primary.withValues(alpha: .035),
                        scheme.surface,
                      ),
                    ],
                  ),
            boxShadow: [
              BoxShadow(
                color: scheme.shadow.withValues(alpha: selected ? .11 : .055),
                blurRadius: selected ? 18 : 12,
                offset: const Offset(0, 6),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: scheme.primary.withValues(alpha: selected ? 0.14 : 0.08),
                  borderRadius: BorderRadius.circular(15),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(4),
                  child: Image.asset(asset, fit: BoxFit.contain),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.labelLarge?.copyWith(
                        color: scheme.onSurface,
                        fontWeight: FontWeight.w700,
                        height: 1.15,
                      ),
                    ),
                    if (count.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Text(
                        count,
                        maxLines: 1,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: scheme.primary,
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              Icon(
                Icons.arrow_forward_rounded,
                size: 14,
                color: scheme.onSurfaceVariant.withValues(alpha: .7),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// "Local Now" weather — a compact strip (temperature + condition), MET Norway attributed.
/// Hidden when there is no location or weather is not configured.
class _WeatherStrip extends ConsumerStatefulWidget {
  const _WeatherStrip();

  @override
  ConsumerState<_WeatherStrip> createState() => _WeatherStripState();
}

class _WeatherStripState extends ConsumerState<_WeatherStrip> {
  ({num tempC, String condition, String description})? _weather;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final city = ref.read(selectedCityProvider);
    if (city?.latitude == null || city?.longitude == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    try {
      final weather =
          await ref.read(listingRepositoryProvider).localWeather(city!.latitude!, city.longitude!);
      if (mounted) {
        setState(() {
          _weather = weather;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  IconData _iconFor(String condition) {
    final value = condition.toLowerCase();
    if (value.contains('thunder')) return Icons.thunderstorm;
    if (value.contains('snow') || value.contains('sleet')) return Icons.ac_unit;
    if (value.contains('rain') || value.contains('drizzle') || value.contains('shower')) {
      return Icons.water_drop;
    }
    if (value.contains('fog') || value.contains('mist')) return Icons.foggy;
    if (value.contains('cloud')) return Icons.cloud;
    if (value.contains('clear') || value.contains('sun') || value.contains('fair')) {
      return Icons.wb_sunny;
    }
    return Icons.cloud;
  }

  @override
  Widget build(BuildContext context) {
    final weather = _weather;
    if (_loading || weather == null) return const SizedBox.shrink();
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: theme.colorScheme.outlineVariant),
        ),
        child: Row(
          children: [
            Icon(
              _iconFor(weather.condition),
              size: 20,
              color: theme.colorScheme.primary,
            ),
            const SizedBox(width: 10),
            Text(
              '${weather.tempC.round()}°C',
              style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                weather.description,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style:
                    theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            ),
            Text(
              'MET Norway',
              style:
                  theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}

/// "Local alerts" — official NDMA SACHET public-safety warnings for the viewer's area, verbatim.
/// Coral-accented, display-only. Hidden when there is nothing (or on error). Mirrors web.
class _LocalAlertsSection extends ConsumerStatefulWidget {
  const _LocalAlertsSection();

  @override
  ConsumerState<_LocalAlertsSection> createState() => _LocalAlertsSectionState();
}

class _LocalAlertsSectionState extends ConsumerState<_LocalAlertsSection> {
  List<({String title, String? category, String? publishedAt})> _items = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final city = ref.read(selectedCityProvider);
    final query = (city?.name.isEmpty ?? true) ? '' : city!.name;
    try {
      final items = await ref.read(listingRepositoryProvider).localAlerts(
            query,
            cityId: (city?.id.isEmpty ?? true) ? null : city!.id,
          );
      if (mounted) {
        setState(() {
          _items = items;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading || _items.isEmpty) return const SizedBox.shrink();
    final strings = Strings.of(context);
    final theme = Theme.of(context);
    final coral = theme.colorScheme.tertiary;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
      child: Container(
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: coral.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: coral.withValues(alpha: 0.4)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Icon(Icons.warning_amber_rounded, size: 20, color: coral),
                const SizedBox(width: 8),
                Text(
                  strings('alerts.localTitle'),
                  style: theme.textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700, color: coral),
                ),
              ],
            ),
            const SizedBox(height: 8),
            for (final alert in _items)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Text(
                  alert.title,
                  style: theme.textTheme.bodyMedium,
                ),
              ),
            Text(
              'NDMA SACHET',
              style:
                  theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
    );
  }
}

/// "Local Now" news — live local headlines for the city, pulled on demand, linking back to the
/// publisher. Mirrors the web Home news strip. Hides itself when there is nothing (or on error).
class _LocalNewsSection extends ConsumerStatefulWidget {
  const _LocalNewsSection();

  @override
  ConsumerState<_LocalNewsSection> createState() => _LocalNewsSectionState();
}

class _LocalNewsSectionState extends ConsumerState<_LocalNewsSection> {
  List<NewsCard> _items = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final city = ref.read(selectedCityProvider);
    final lat = city?.latitude;
    final lng = city?.longitude;
    if (lat == null || lng == null) {
      if (mounted) setState(() => _loading = false);
      return;
    }
    final lang = ref.read(localeProvider).name;
    try {
      final items = await ref
          .read(listingRepositoryProvider)
          .newsFeed(latitude: lat, longitude: lng, lang: lang);
      if (mounted) {
        setState(() {
          _items = items;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  String? _relativeTime(String? iso) {
    if (iso == null) return null;
    final then = DateTime.tryParse(iso);
    if (then == null) return null;
    final diff = DateTime.now().difference(then);
    if (diff.inMinutes < 60) return '${diff.inMinutes}m';
    if (diff.inHours < 24) return '${diff.inHours}h';
    return '${diff.inDays}d';
  }

  @override
  Widget build(BuildContext context) {
    if (_loading || _items.isEmpty) return const SizedBox.shrink();
    final strings = Strings.of(context);
    final theme = Theme.of(context);
    final city = ref.watch(selectedCityProvider);
    final cityName = (city?.name.isEmpty ?? true) ? strings('feed.nearby') : city!.name;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionHeader(
            title: strings('news.title', {'city': cityName}),
            hint: strings('news.kicker'),
          ),
          const SizedBox(height: 8),
          for (final item in _items)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () => context.push('/news/${item.slug}'),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Container(
                          width: 8,
                          height: 8,
                          margin: const EdgeInsets.only(top: 5, right: 10),
                          decoration: BoxDecoration(
                            color: theme.colorScheme.tertiary,
                            shape: BoxShape.circle,
                          ),
                        ),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                item.title,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodyMedium
                                    ?.copyWith(fontWeight: FontWeight.w600),
                              ),
                              if (item.summary != null && item.summary!.isNotEmpty) ...[
                                const SizedBox(height: 3),
                                Text(
                                  item.summary!,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.bodySmall?.copyWith(
                                    color: theme.colorScheme.onSurfaceVariant,
                                  ),
                                ),
                              ],
                              const SizedBox(height: 2),
                              Text(
                                [
                                  if (item.distanceKm != null)
                                    '${item.distanceKm!.toStringAsFixed(item.distanceKm! < 10 ? 1 : 0)} km',
                                  item.category,
                                  if (item.sources > 1) '${item.sources} reports',
                                  _relativeTime(item.publishedAt),
                                ].whereType<String>().where((part) => part.isNotEmpty).join(' · '),
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Icon(
                          Icons.chevron_right,
                          size: 18,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              'LocZ',
              style:
                  theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }
}

/// "Local Now" jobs — live openings for the city (Adzuna), linking back to the posting.
/// Mirrors the web Home jobs strip. Hidden when there is nothing (or on error).
class _LocalJobsSection extends ConsumerStatefulWidget {
  const _LocalJobsSection();

  @override
  ConsumerState<_LocalJobsSection> createState() => _LocalJobsSectionState();
}

class _LocalJobsSectionState extends ConsumerState<_LocalJobsSection> {
  List<({String title, String? company, String? location, String url, String? postedAt})> _items =
      const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final city = ref.read(selectedCityProvider);
    final query = (city?.name.isEmpty ?? true) ? '' : city!.name;
    try {
      final items = await ref.read(listingRepositoryProvider).localJobs(query);
      if (mounted) {
        setState(() {
          _items = items;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading || _items.isEmpty) return const SizedBox.shrink();
    final strings = Strings.of(context);
    final theme = Theme.of(context);
    final city = ref.watch(selectedCityProvider);
    final cityName = (city?.name.isEmpty ?? true) ? strings('feed.nearby') : city!.name;

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionHeader(
            title: strings('jobs.title', {'city': cityName}),
            hint: strings('jobs.kicker'),
          ),
          const SizedBox(height: 8),
          for (final job in _items)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Material(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () => launchUrl(
                    Uri.parse(job.url),
                    mode: LaunchMode.externalApplication,
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Row(
                      children: [
                        Container(
                          width: 38,
                          height: 38,
                          decoration: BoxDecoration(
                            color: theme.colorScheme.primary.withValues(alpha: 0.10),
                            borderRadius: BorderRadius.circular(11),
                          ),
                          child: Icon(
                            Icons.work_outline,
                            size: 18,
                            color: theme.colorScheme.primary,
                          ),
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                job.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.bodyMedium
                                    ?.copyWith(fontWeight: FontWeight.w600),
                              ),
                              Text(
                                [job.company, job.location]
                                    .whereType<String>()
                                    .where((part) => part.isNotEmpty)
                                    .join(' · '),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                          ),
                        ),
                        Icon(
                          Icons.north_east,
                          size: 16,
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              'Adzuna',
              style:
                  theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }
}

/// "Local Now" deals — live affiliate offers linking out to the merchant to redeem. Mirrors the
/// web Deals surface. Deliberately national online offers, NOT location-specific and NOT LocZ-owned
/// listings. Hidden when there is nothing (or on error / when unconfigured).
class _LocalDealsSection extends ConsumerStatefulWidget {
  const _LocalDealsSection();

  @override
  ConsumerState<_LocalDealsSection> createState() => _LocalDealsSectionState();
}

class _LocalDealsSectionState extends ConsumerState<_LocalDealsSection> {
  List<
      ({
        String id,
        String title,
        String merchant,
        String description,
        String? couponCode,
        String? imageUrl,
        String url,
        String? category,
        String? endDate,
      })> _items = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final items = await ref.read(listingRepositoryProvider).localDeals();
      if (mounted) {
        setState(() {
          _items = items;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading || _items.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const _SectionHeader(
            title: 'Deals & offers',
            hint: 'Affiliate offers',
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Text(
              'Online offers from partner merchants — not location-specific.',
              style:
                  theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ),
          const SizedBox(height: 8),
          for (final deal in _items)
            Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Material(
                color: theme.colorScheme.surface,
                borderRadius: BorderRadius.circular(16),
                clipBehavior: Clip.antiAlias,
                child: InkWell(
                  onTap: () => launchUrl(
                    Uri.parse(deal.url),
                    mode: LaunchMode.externalApplication,
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (deal.imageUrl != null && deal.imageUrl!.isNotEmpty)
                        AspectRatio(
                          aspectRatio: 16 / 9,
                          child: Image.network(
                            deal.imageUrl!,
                            fit: BoxFit.cover,
                            errorBuilder: (_, __, ___) => Container(
                              color: theme.colorScheme.primary.withValues(alpha: 0.08),
                              child: Icon(
                                Icons.local_offer_outlined,
                                color: theme.colorScheme.primary,
                              ),
                            ),
                          ),
                        ),
                      Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              deal.title,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style:
                                  theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w700),
                            ),
                            if (deal.description.isNotEmpty) ...[
                              const SizedBox(height: 4),
                              Text(
                                deal.description,
                                maxLines: 2,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.labelSmall?.copyWith(
                                  color: theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                            ],
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    deal.merchant.isNotEmpty
                                        ? 'via ${deal.merchant}'
                                        : (deal.category ?? ''),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: theme.textTheme.labelSmall?.copyWith(
                                      color: theme.colorScheme.onSurfaceVariant,
                                    ),
                                  ),
                                ),
                                if (deal.couponCode != null && deal.couponCode!.isNotEmpty)
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: 8,
                                      vertical: 3,
                                    ),
                                    decoration: BoxDecoration(
                                      borderRadius: BorderRadius.circular(999),
                                      border: Border.all(
                                        color: theme.colorScheme.primary,
                                        width: 1,
                                      ),
                                    ),
                                    child: Text(
                                      'Code: ${deal.couponCode}',
                                      style: theme.textTheme.labelSmall?.copyWith(
                                        color: theme.colorScheme.primary,
                                        fontWeight: FontWeight.w700,
                                      ),
                                    ),
                                  )
                                else
                                  Text(
                                    'Redeem',
                                    style: theme.textTheme.labelSmall?.copyWith(
                                      color: theme.colorScheme.primary,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          Padding(
            padding: const EdgeInsets.only(top: 4),
            child: Text(
              'Cuelinks',
              style:
                  theme.textTheme.labelSmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ),
        ],
      ),
    );
  }
}

class _NearbyBusinessesSection extends ConsumerStatefulWidget {
  const _NearbyBusinessesSection();

  @override
  ConsumerState<_NearbyBusinessesSection> createState() => _NearbyBusinessesSectionState();
}

class _NearbyBusinessesSectionState extends ConsumerState<_NearbyBusinessesSection> {
  static const _bands = [1000, 3000, 5000, 10000, 25000];
  List<BusinessSummary> _items = const [];
  List<String> _areaKeys = const [];
  String? _activeArea;
  bool _verifiedOnly = false;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
    _loadAreas();
  }

  Future<void> _load() async {
    final city = ref.read(selectedCityProvider);
    final radius = ref.read(selectedRadiusProvider);
    try {
      final result = await ref.read(listingRepositoryProvider).nearbyBusinesses(
            latitude: city?.latitude,
            longitude: city?.longitude,
            radiusKm: radius,
            pincode: city?.pincode,
            cityId: (city?.id.isEmpty ?? true) ? null : city!.id,
            area: _activeArea,
            verifiedOnly: _verifiedOnly,
            page: 1,
            limit: 12,
          );
      if (mounted) {
        setState(() {
          _items = result.items;
          _loading = false;
        });
      }
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _loadAreas() async {
    final city = ref.read(selectedCityProvider);
    try {
      final areas = await ref.read(listingRepositoryProvider).areaSummary(
            cityId: (city?.id.isEmpty ?? true) ? null : city!.id,
            pincode: city?.pincode,
          );
      if (mounted) {
        setState(() => _areaKeys = areas.map((a) => a.area).toList());
      }
    } catch (_) {
      /* filters just stay hidden */
    }
  }

  void _applyFilter({String? area, bool? verified}) {
    setState(() {
      if (area != null) _activeArea = _activeArea == area ? null : area;
      if (verified != null) _verifiedOnly = verified;
      _loading = true;
    });
    _load();
  }

  int _bandOf(num metres) {
    for (var i = 0; i < _bands.length; i += 1) {
      if (metres < _bands[i]) return i;
    }
    return _bands.length;
  }

  @override
  Widget build(BuildContext context) {
    final hasFilter = _activeArea != null || _verifiedOnly;
    // Hide the whole section only on the first empty load. Once a filter is on, keep the bar
    // visible (with an empty note) so the user can change or clear it.
    if (_items.isEmpty && !hasFilter && (_loading || _areaKeys.isEmpty)) {
      return const SizedBox.shrink();
    }
    final strings = Strings.of(context);
    final theme = Theme.of(context);

    final rows = <Widget>[];
    var lastBand = -1;
    for (final business in _items) {
      final distance = business.distanceMeters;
      if (distance != null) {
        final band = _bandOf(distance);
        if (band != lastBand) {
          lastBand = band;
          final km = (band < _bands.length ? _bands[band] : 25000) ~/ 1000;
          rows.add(
            Padding(
              padding: const EdgeInsets.only(top: 12, bottom: 4),
              child: Text(
                band == 0
                    ? strings('feed.nearby')
                    : '${strings('feed.within')} $km ${strings('common.km')}',
                style: theme.textTheme.labelLarge?.copyWith(color: theme.colorScheme.primary),
              ),
            ),
          );
        }
      }
      rows.add(_BusinessRow(business: business, strings: strings));
    }

    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 26, 16, 0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _SectionHeader(
            title: strings('business.nearbyTitle'),
            hint: strings('business.nearbyHint'),
          ),
          if (_areaKeys.isNotEmpty) ...[
            const SizedBox(height: 10),
            SizedBox(
              height: 36,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  FilterChip(
                    label: Text(strings('search.businessVerified')),
                    avatar: Icon(
                      Icons.verified,
                      size: 16,
                      color: _verifiedOnly ? theme.colorScheme.primary : null,
                    ),
                    selected: _verifiedOnly,
                    onSelected: (value) => _applyFilter(verified: value),
                  ),
                  const SizedBox(width: 8),
                  for (final key in _areaKeys) ...[
                    FilterChip(
                      label: Text(strings('area.$key')),
                      selected: _activeArea == key,
                      onSelected: (_) => _applyFilter(area: key),
                    ),
                    const SizedBox(width: 8),
                  ],
                ],
              ),
            ),
          ],
          const SizedBox(height: 8),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 24),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_items.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: Text(
                strings('search.noBusinessesMatch'),
                style:
                    theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
              ),
            )
          else
            ...rows,
        ],
      ),
    );
  }
}

class _BusinessRow extends StatelessWidget {
  const _BusinessRow({required this.business, required this.strings});

  final BusinessSummary business;
  final Strings strings;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final metres = business.distanceMeters;
    final distance = metres == null
        ? null
        : metres < 1000
            ? '${metres.round()} m'
            : '${(metres / 1000).toStringAsFixed(metres < 10000 ? 1 : 0)} ${strings('common.km')}';
    final place = business.addressLine ?? business.pincode ?? business.cityName;

    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Material(
        color: scheme.surface,
        elevation: Theme.of(context).brightness == Brightness.dark ? 0 : 1,
        shadowColor: scheme.onSurface.withValues(alpha: 0.08),
        clipBehavior: Clip.antiAlias,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: scheme.outlineVariant.withValues(alpha: 0.75)),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(20),
          onTap: () => context.push('/b/${business.slug}'),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Column(
              children: [
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      width: 76,
                      height: 86,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        gradient: LinearGradient(
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                          colors: [
                            scheme.primaryContainer,
                            scheme.secondaryContainer,
                          ],
                        ),
                        border: Border.all(color: scheme.outlineVariant),
                      ),
                      child: business.logoUrl?.isNotEmpty == true
                          ? CachedNetworkImage(
                              imageUrl: business.logoUrl!,
                              fit: BoxFit.cover,
                              errorWidget: (_, __, ___) => Padding(
                                padding: const EdgeInsets.all(5),
                                child: Image.asset(
                                  businessCategoryAsset(business.categoryName),
                                  fit: BoxFit.contain,
                                ),
                              ),
                            )
                          : Padding(
                              padding: const EdgeInsets.all(5),
                              child: Image.asset(
                                businessCategoryAsset(business.categoryName),
                                fit: BoxFit.contain,
                              ),
                            ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              if (business.categoryName != null)
                                Expanded(
                                  child: Text(
                                    business.categoryName!,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: theme.textTheme.labelSmall?.copyWith(
                                      color: scheme.primary,
                                      fontSize: 11.5,
                                      fontWeight: FontWeight.w600,
                                      letterSpacing: 0.05,
                                    ),
                                  ),
                                ),
                              if (business.isVerified)
                                _BusinessBadge(
                                  icon: Icons.verified_rounded,
                                  label: strings('search.businessVerified'),
                                  color: scheme.primary,
                                )
                              else if (!business.isClaimed)
                                _BusinessBadge(
                                  label: strings('search.businessClaim'),
                                  color: scheme.tertiary,
                                ),
                            ],
                          ),
                          const SizedBox(height: 5),
                          Text(
                            business.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontSize: 16,
                              height: 1.28,
                              letterSpacing: -0.25,
                            ),
                          ),
                          if (place != null && place.isNotEmpty) ...[
                            const SizedBox(height: 5),
                            Row(
                              children: [
                                Icon(
                                  Icons.location_on_outlined,
                                  size: 14,
                                  color: scheme.primary,
                                ),
                                const SizedBox(width: 3),
                                Expanded(
                                  child: Text(
                                    place,
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                    style: theme.textTheme.labelSmall,
                                  ),
                                ),
                              ],
                            ),
                          ],
                          const SizedBox(height: 6),
                          Wrap(
                            spacing: 12,
                            runSpacing: 4,
                            children: [
                              if (distance != null)
                                _BusinessMeta(
                                  icon: Icons.near_me_outlined,
                                  label: distance,
                                ),
                              if (business.listingCount > 0)
                                _BusinessMeta(
                                  icon: Icons.sell_outlined,
                                  label: strings('search.listingCount').replaceFirst(
                                    '{count}',
                                    '${business.listingCount}',
                                  ),
                                ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 10),
                Divider(color: scheme.outlineVariant),
                const SizedBox(height: 8),
                Row(
                  children: [
                    Expanded(
                      child: Row(
                        children: [
                          Text(
                            strings('search.viewProfile'),
                            style: theme.textTheme.labelLarge?.copyWith(color: scheme.primary),
                          ),
                          const SizedBox(width: 5),
                          Icon(
                            Icons.arrow_forward_rounded,
                            size: 16,
                            color: scheme.primary,
                          ),
                        ],
                      ),
                    ),
                    if (business.latitude != null && business.longitude != null)
                      Semantics(
                        button: true,
                        label: strings('business.directions'),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(999),
                          onTap: () => launchUrl(
                            Uri.parse(
                              'https://www.google.com/maps/dir/?api=1&destination='
                              '${business.latitude},${business.longitude}',
                            ),
                            mode: LaunchMode.externalApplication,
                          ),
                          child: Container(
                            constraints: const BoxConstraints(minHeight: 40),
                            padding: const EdgeInsets.symmetric(
                              horizontal: 12,
                              vertical: 8,
                            ),
                            decoration: BoxDecoration(
                              color: scheme.primaryContainer,
                              borderRadius: BorderRadius.circular(999),
                            ),
                            child: Row(
                              children: [
                                Icon(
                                  Icons.near_me_outlined,
                                  size: 16,
                                  color: scheme.primary,
                                ),
                                const SizedBox(width: 6),
                                Text(
                                  strings('business.directions'),
                                  style: theme.textTheme.labelMedium?.copyWith(
                                    color: scheme.primary,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _BusinessMeta extends StatelessWidget {
  const _BusinessMeta({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: theme.colorScheme.primary),
        const SizedBox(width: 4),
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(fontSize: 11.5),
        ),
      ],
    );
  }
}

/// Small trailing chip on a business row — "Verified" or the "Claim this" invite.
class _BusinessBadge extends StatelessWidget {
  const _BusinessBadge({required this.label, required this.color, this.icon});

  final String label;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: Theme.of(context)
                .textTheme
                .labelSmall
                ?.copyWith(color: color, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

/// Section title + one-line hint above the vertical feed.
class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.hint});

  final String title;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: theme.textTheme.titleLarge),
        const SizedBox(height: 2),
        Text(
          hint,
          style: theme.textTheme.bodySmall?.copyWith(
            color: theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ],
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
            Expanded(
              child: Container(height: 126, decoration: _skeleton(color, 18)),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Container(height: 126, decoration: _skeleton(color, 18)),
            ),
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
        Icon(
          Icons.cloud_off_outlined,
          size: 40,
          color: Theme.of(context).colorScheme.primary,
        ),
        const SizedBox(height: 14),
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 18),
        Center(
          child: OutlinedButton(onPressed: onRetry, child: Text(retryLabel)),
        ),
      ],
    );
  }
}
