import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/motion/locz_motion.dart';
import '../../listings/presentation/business_category_art.dart';

/// One browsable area. Routes into the existing universal search, filtered by a listing
/// type where one exists, or by a keyword otherwise — so every tile works today without a
/// new backend, and the taxonomy stays a pure config layer (prompt §4, §16).
class _Area {
  const _Area(this.labelKey, this.icon, this.route);
  final String labelKey;
  final IconData icon;
  final String route;
}

class _Group {
  const _Group(this.titleKey, this.areas);
  final String titleKey;
  final List<_Area> areas;
}

const _taxonomy = <_Group>[
  _Group('explore.group.discover', [
    _Area(
      'explore.localNow',
      Icons.campaign_outlined,
      '/search?q=local%20update',
    ),
    _Area('explore.happening', Icons.event_outlined, '/search?type=EVENT'),
    _Area('explore.newNearby', Icons.fiber_new_outlined, '/search?q=new'),
    _Area(
      'explore.entertainment',
      Icons.theaters_outlined,
      '/search?q=entertainment',
    ),
    _Area('explore.play', Icons.sports_cricket_outlined, '/search?q=sports'),
  ]),
  _Group('explore.group.buySave', [
    _Area('type.OFFER', Icons.local_offer_outlined, '/search?type=OFFER'),
    _Area('explore.food', Icons.restaurant_outlined, '/search?q=food'),
    _Area('type.PRODUCT', Icons.storefront_outlined, '/search?type=PRODUCT'),
    _Area(
      'explore.freeNearby',
      Icons.volunteer_activism_outlined,
      '/search?q=free',
    ),
  ]),
  _Group('explore.group.workEarn', [
    _Area('type.JOB', Icons.work_outline, '/search?type=JOB'),
    _Area('explore.earnNearby', Icons.handshake_outlined, '/search?q=gig'),
    _Area(
      'explore.localRequests',
      Icons.record_voice_over_outlined,
      '/search?type=BUYER_REQUIREMENT',
    ),
  ]),
  _Group('explore.group.homeProperty', [
    _Area('type.RENTAL', Icons.home_outlined, '/search?type=RENTAL'),
    _Area('explore.property', Icons.apartment_outlined, '/search?q=property'),
    _Area(
      'explore.homeServices',
      Icons.cleaning_services_outlined,
      '/search?q=maid',
    ),
    _Area(
      'explore.vehicles',
      Icons.directions_car_outlined,
      '/search?q=vehicle',
    ),
  ]),
  _Group('explore.group.services', [
    _Area('type.SERVICE', Icons.build_outlined, '/search?type=SERVICE'),
    _Area('explore.learning', Icons.school_outlined, '/search?q=tutor'),
    _Area('explore.health', Icons.local_hospital_outlined, '/search?q=clinic'),
    _Area(
      'explore.mobility',
      Icons.local_parking_outlined,
      '/search?q=parking',
    ),
    _Area(
      'explore.professionals',
      Icons.camera_alt_outlined,
      '/search?q=photographer',
    ),
    _Area('explore.businesses', Icons.store_outlined, '/search?q=business'),
  ]),
  _Group('explore.group.community', [
    _Area('explore.community', Icons.groups_outlined, '/search?q=community'),
    _Area(
      'explore.civic',
      Icons.report_gmailerrorred_outlined,
      '/search?q=civic',
    ),
    _Area('explore.pets', Icons.pets_outlined, '/search?q=pet'),
    _Area('explore.emergency', Icons.emergency_outlined, '/search?q=emergency'),
  ]),
];

const _areaArtwork = <String, String>{
  'explore.localNow': 'local-now',
  'explore.happening': 'happening-nearby',
  'explore.newNearby': 'new-nearby',
  'explore.entertainment': 'entertainment',
  'explore.play': 'play',
  'type.OFFER': 'deals',
  'explore.food': 'food',
  'type.PRODUCT': 'marketplace',
  'explore.freeNearby': 'free-nearby',
  'type.JOB': 'jobs',
  'explore.earnNearby': 'earn-nearby',
  'explore.localRequests': 'local-requests',
  'type.RENTAL': 'rentals',
  'explore.property': 'property',
  'explore.homeServices': 'home',
  'explore.vehicles': 'vehicles',
  'type.SERVICE': 'services',
  'explore.learning': 'learning',
  'explore.health': 'health',
  'explore.mobility': 'mobility',
  'explore.professionals': 'local-professionals',
  'explore.businesses': 'businesses',
  'explore.community': 'community',
  'explore.civic': 'civic',
  'explore.pets': 'pets',
  'explore.emergency': 'emergency',
};

/// Explore — the structured counterpart to Home. Everything LocZ can find, in six
/// understandable groups, never a flat wall of 26 icons (prompt §7, §16).
class ExploreScreen extends StatelessWidget {
  const ExploreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final theme = Theme.of(context);

    return Scaffold(
      body: SafeArea(
        bottom: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 34),
          children: [
            LoczEntrance(
              child: Container(
                padding: const EdgeInsets.fromLTRB(20, 20, 20, 18),
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(28),
                  gradient: const LinearGradient(
                    begin: Alignment.topLeft,
                    end: Alignment.bottomRight,
                    colors: [Color(0xFF123F35), Color(0xFF0B6653)],
                  ),
                  boxShadow: [
                    BoxShadow(
                      color: theme.colorScheme.primary.withValues(alpha: .18),
                      blurRadius: 30,
                      offset: const Offset(0, 14),
                    ),
                  ],
                ),
                child: Stack(
                  children: [
                    Positioned(
                      right: -34,
                      top: -42,
                      child: Container(
                        width: 145,
                        height: 145,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          border: Border.all(
                            color: Colors.white.withValues(alpha: .08),
                          ),
                        ),
                      ),
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Container(
                              width: 38,
                              height: 38,
                              padding: const EdgeInsets.all(5),
                              decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: .11),
                                borderRadius: BorderRadius.circular(13),
                              ),
                              child: Image.asset(discoveryAreaAsset('local-now')),
                            ),
                            const Spacer(),
                            Icon(
                              Icons.grid_view_rounded,
                              color: Colors.white.withValues(alpha: .65),
                              size: 20,
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Text(
                          strings('explore.title'),
                          style: theme.textTheme.headlineSmall?.copyWith(
                            color: Colors.white,
                            fontSize: 25,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -.7,
                          ),
                        ),
                        const SizedBox(height: 5),
                        Text(
                          strings('explore.subtitle'),
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: Colors.white.withValues(alpha: .72),
                          ),
                        ),
                        const SizedBox(height: 18),
                        _SearchEntry(
                          hint: strings('explore.searchHint'),
                          onTap: () => context.push('/search'),
                          onDark: true,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 14),
            for (var index = 0; index < _taxonomy.length; index++) ...[
              LoczEntrance(
                delay: Duration(milliseconds: 70 + index * 35),
                offset: const Offset(0, 10),
                child: _ExploreGroupSection(
                  group: _taxonomy[index],
                  title: strings(_taxonomy[index].titleKey),
                  index: index,
                  labelFor: (key) => strings(key),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ],
        ),
      ),
    );
  }
}

class _SearchEntry extends StatelessWidget {
  const _SearchEntry({
    required this.hint,
    required this.onTap,
    this.onDark = false,
  });
  final String hint;
  final VoidCallback onTap;
  final bool onDark;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: onDark ? Colors.white.withValues(alpha: .95) : theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          height: 48,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(
              color: onDark ? Colors.white.withValues(alpha: .2) : theme.colorScheme.outlineVariant,
            ),
            boxShadow: onDark
                ? [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: .12),
                      blurRadius: 18,
                      offset: const Offset(0, 7),
                    ),
                  ]
                : null,
          ),
          child: Row(
            children: [
              Icon(
                Icons.search_rounded,
                size: 20,
                color: theme.colorScheme.primary,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  hint,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: onDark ? const Color(0xFF4C5B54) : null,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ExploreGroupSection extends StatelessWidget {
  const _ExploreGroupSection({
    required this.group,
    required this.title,
    required this.index,
    required this.labelFor,
  });

  final _Group group;
  final String title;
  final int index;
  final String Function(String) labelFor;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final accents = <Color>[
      theme.colorScheme.primary,
      const Color(0xFFB87333),
      const Color(0xFF3C718C),
      const Color(0xFF7C6595),
      const Color(0xFFB05E4D),
      const Color(0xFF58734D),
    ];
    final accent = accents[index % accents.length];
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 14, 12, 12),
      decoration: BoxDecoration(
        color: Color.alphaBlend(
          accent.withValues(alpha: .035),
          theme.colorScheme.surface,
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: accent.withValues(alpha: .10)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(4, 0, 4, 11),
            child: Row(
              children: [
                Container(
                  width: 7,
                  height: 7,
                  decoration: BoxDecoration(color: accent, shape: BoxShape.circle),
                ),
                const SizedBox(width: 8),
                Text(
                  title,
                  style: theme.textTheme.titleMedium?.copyWith(
                    color: theme.colorScheme.onSurface,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: group.areas.length,
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 2,
              mainAxisSpacing: 8,
              crossAxisSpacing: 8,
              childAspectRatio: 1.82,
            ),
            itemBuilder: (context, areaIndex) {
              final area = group.areas[areaIndex];
              return _AreaTile(
                label: labelFor(area.labelKey),
                artwork: discoveryAreaAsset(
                  _areaArtwork[area.labelKey] ?? 'services',
                ),
                fallbackIcon: area.icon,
                accent: accent,
                onTap: () => context.push(area.route),
              );
            },
          ),
        ],
      ),
    );
  }
}

class _AreaTile extends StatelessWidget {
  const _AreaTile({
    required this.label,
    required this.artwork,
    required this.fallbackIcon,
    required this.accent,
    required this.onTap,
  });
  final String label;
  final String artwork;
  final IconData fallbackIcon;
  final Color accent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(18),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(18),
        child: Container(
          padding: const EdgeInsets.fromLTRB(9, 8, 8, 8),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(18),
            border: Border.all(color: accent.withValues(alpha: .11)),
            boxShadow: [
              BoxShadow(
                color: theme.colorScheme.shadow.withValues(alpha: .04),
                blurRadius: 12,
                offset: const Offset(0, 5),
              ),
            ],
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                  color: accent.withValues(alpha: .08),
                  borderRadius: BorderRadius.circular(13),
                ),
                child: Image.asset(
                  artwork,
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => Icon(fallbackIcon, color: accent, size: 20),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: theme.colorScheme.onSurface,
                    fontWeight: FontWeight.w700,
                    height: 1.15,
                  ),
                ),
              ),
              Icon(
                Icons.arrow_forward_rounded,
                size: 13,
                color: accent.withValues(alpha: .72),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
