import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

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

            // One proximity-sorted column instead of horizontal rails — the merged
            // "Around You Now" feed. Every item carries an API distance, so the list
            // is ordered strictly by how close it is; ties keep API order.
            final seen = <String>{};
            final feedItems = <ListingSummary>[];
            for (final section in data.sections) {
              for (final item in section.items) {
                if (seen.add(item.id)) feedItems.add(item);
              }
            }
            feedItems.sort((a, b) {
              final da = a.distanceMeters;
              final db = b.distanceMeters;
              if (da == null && db == null) return 0;
              if (da == null) return 1;
              if (db == null) return -1;
              return da.compareTo(db);
            });

            return CustomScrollView(
              physics: const AlwaysScrollableScrollPhysics(),
              slivers: [
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                  sliver: SliverList.list(
                    children: [
                      _RadiusSelector(
                        label: strings('feed.within'),
                        selected: radiusKm,
                        onSelect: (value) =>
                            ref.read(selectedRadiusProvider.notifier).select(value),
                        kmLabel: strings('common.km'),
                      ),
                      const SizedBox(height: 14),
                      LoczEntrance(
                        child: _DiscoveryIntro(
                          eyebrow: strings('feed.heroEyebrow'),
                          title: strings('feed.heroTitle'),
                          hint: strings('feed.heroHint'),
                          liveLabel: strings('feed.localPulse', {'city': location}),
                          countLabel: strings(
                            'feed.localPulseHint',
                            {'count': uniqueItems},
                          ),
                          actionLabel: strings('feed.browseAll'),
                          onAction: () => context.go('/search'),
                        ),
                      ),
                      const SizedBox(height: 18),
                      LoczEntrance(
                        delay: const Duration(milliseconds: 70),
                        child: _IntentDeck(
                          strings: strings,
                          onBuy: () => context.push('/search?type=PRODUCT'),
                          onSell: () => context.push('/post'),
                          onJobs: () => context.push('/search?type=JOB'),
                          onServices: () => context.push('/search?type=SERVICE'),
                        ),
                      ),
                      const SizedBox(height: 18),
                      LoczEntrance(
                        delay: const Duration(milliseconds: 110),
                        child: _QuickAccess(strings: strings),
                      ),
                    ],
                  ),
                ),
                if (feedItems.isEmpty)
                  SliverFillRemaining(
                    hasScrollBody: false,
                    child: _EmptyFeed(
                      message: strings('feed.empty'),
                      actionLabel: strings('feed.postFree'),
                      onAction: () => context.push('/post'),
                    ),
                  )
                else ...[
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 26, 16, 8),
                    sliver: SliverToBoxAdapter(
                      child: _SectionHeader(
                        title: strings('feed.aroundYou'),
                        hint: data.radiusWidened
                            ? strings('feed.radiusWidened', {'radius': '$radiusKm'})
                            : strings('feed.aroundYouHint'),
                      ),
                    ),
                  ),
                  SliverPadding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    sliver: SliverList.builder(
                      itemCount: feedItems.length,
                      itemBuilder: (context, index) {
                        final listing = feedItems[index];
                        final tag = 'home-feed-${listing.id}';
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 14),
                          child: ListingCard(
                            listing: listing,
                            heroTag: tag,
                            typeLabel: strings('type.${listing.type}'),
                            onTap: () => context.push(
                              '/ad/${listing.slug}',
                              extra: ListingNavigationPreview(
                                listing: listing,
                                heroTag: tag,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ),
                ],
                const SliverToBoxAdapter(child: _NearbyBusinessesSection()),
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
          Image.asset(
            'assets/brand/locz-mark.png',
            key: const Key('home-brand-mark'),
            width: 32,
            height: 38,
            fit: BoxFit.contain,
          ),
          const SizedBox(width: 8),
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
              _QuickTile(icon: icon, label: label, onTap: () => context.push(route)),
          ],
        ),
      ],
    );
  }
}

class _QuickTile extends StatelessWidget {
  const _QuickTile({required this.icon, required this.label, required this.onTap});

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
            child: Icon(icon, size: 22, color: theme.colorScheme.onPrimaryContainer),
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
class _NearbyBusinessesSection extends ConsumerStatefulWidget {
  const _NearbyBusinessesSection();

  @override
  ConsumerState<_NearbyBusinessesSection> createState() => _NearbyBusinessesSectionState();
}

class _NearbyBusinessesSectionState extends ConsumerState<_NearbyBusinessesSection> {
  static const _bands = [1000, 3000, 5000, 10000, 25000];
  List<BusinessSummary> _items = const [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
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

  int _bandOf(num metres) {
    for (var i = 0; i < _bands.length; i += 1) {
      if (metres < _bands[i]) return i;
    }
    return _bands.length;
  }

  @override
  Widget build(BuildContext context) {
    if (_loading || _items.isEmpty) return const SizedBox.shrink();
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
          const SizedBox(height: 8),
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
    final metres = business.distanceMeters;
    final distance = metres == null
        ? null
        : metres < 1000
            ? '${metres.round()} m'
            : '${(metres / 1000).toStringAsFixed(metres < 10000 ? 1 : 0)} ${strings('common.km')}';
    // Distance already says "near you"; the repeated pincode is just noise, so fall back to
    // it only when there is no distance to show. Mirrors the web card.
    final place = distance ?? business.pincode ?? business.cityName;

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Material(
        color: theme.colorScheme.surface,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: () => context.push('/b/${business.slug}'),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 18,
                  backgroundColor: theme.colorScheme.surfaceContainerHighest,
                  child: Text(
                    business.name.isEmpty ? '?' : business.name[0].toUpperCase(),
                    style: theme.textTheme.titleMedium,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (business.categoryName != null)
                        Text(
                          business.categoryName!,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.labelSmall
                              ?.copyWith(color: theme.colorScheme.primary),
                        ),
                      Text(
                        business.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                      ),
                      if (place != null && place.isNotEmpty)
                        Text(
                          place,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.labelSmall,
                        ),
                    ],
                  ),
                ),
                if (business.isVerified)
                  _BusinessBadge(
                    icon: Icons.verified,
                    label: strings('search.businessVerified'),
                    color: theme.colorScheme.primary,
                  )
                else if (!business.isClaimed)
                  // An imported listing nobody owns yet — invite its real owner to take it over.
                  _BusinessBadge(
                    label: strings('search.businessClaim'),
                    color: theme.colorScheme.tertiary,
                  ),
                const SizedBox(width: 4),
                if (business.latitude != null && business.longitude != null)
                  IconButton(
                    icon: const Icon(Icons.directions_outlined, size: 20),
                    color: theme.colorScheme.primary,
                    tooltip: strings('business.directions'),
                    constraints: const BoxConstraints(minWidth: 44, minHeight: 44),
                    onPressed: () => launchUrl(
                      Uri.parse(
                        'https://www.google.com/maps/dir/?api=1&destination='
                        '${business.latitude},${business.longitude}',
                      ),
                      mode: LaunchMode.externalApplication,
                    ),
                  )
                else
                  Icon(Icons.chevron_right, size: 18, color: theme.colorScheme.onSurfaceVariant),
              ],
            ),
          ),
        ),
      ),
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
