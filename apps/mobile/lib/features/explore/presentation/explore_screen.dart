import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/theme/tokens.g.dart';

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
    _Area('explore.localNow', Icons.campaign_outlined, '/search?q=local%20update'),
    _Area('explore.happening', Icons.event_outlined, '/search?type=EVENT'),
    _Area('explore.newNearby', Icons.fiber_new_outlined, '/search?q=new'),
    _Area('explore.entertainment', Icons.theaters_outlined, '/search?q=entertainment'),
    _Area('explore.play', Icons.sports_cricket_outlined, '/search?q=sports'),
  ]),
  _Group('explore.group.buySave', [
    _Area('type.OFFER', Icons.local_offer_outlined, '/search?type=OFFER'),
    _Area('explore.food', Icons.restaurant_outlined, '/search?q=food'),
    _Area('type.PRODUCT', Icons.storefront_outlined, '/search?type=PRODUCT'),
    _Area('explore.freeNearby', Icons.volunteer_activism_outlined, '/search?q=free'),
  ]),
  _Group('explore.group.workEarn', [
    _Area('type.JOB', Icons.work_outline, '/search?type=JOB'),
    _Area('explore.earnNearby', Icons.handshake_outlined, '/search?q=gig'),
    _Area('explore.localRequests', Icons.record_voice_over_outlined,
        '/search?type=BUYER_REQUIREMENT'),
  ]),
  _Group('explore.group.homeProperty', [
    _Area('type.RENTAL', Icons.home_outlined, '/search?type=RENTAL'),
    _Area('explore.property', Icons.apartment_outlined, '/search?q=property'),
    _Area('explore.homeServices', Icons.cleaning_services_outlined, '/search?q=maid'),
    _Area('explore.vehicles', Icons.directions_car_outlined, '/search?q=vehicle'),
  ]),
  _Group('explore.group.services', [
    _Area('type.SERVICE', Icons.build_outlined, '/search?type=SERVICE'),
    _Area('explore.learning', Icons.school_outlined, '/search?q=tutor'),
    _Area('explore.health', Icons.local_hospital_outlined, '/search?q=clinic'),
    _Area('explore.mobility', Icons.local_parking_outlined, '/search?q=parking'),
    _Area('explore.professionals', Icons.camera_alt_outlined, '/search?q=photographer'),
    _Area('explore.businesses', Icons.store_outlined, '/search?q=business'),
  ]),
  _Group('explore.group.community', [
    _Area('explore.community', Icons.groups_outlined, '/search?q=community'),
    _Area('explore.civic', Icons.report_gmailerrorred_outlined, '/search?q=civic'),
    _Area('explore.pets', Icons.pets_outlined, '/search?q=pet'),
    _Area('explore.emergency', Icons.emergency_outlined, '/search?q=emergency'),
  ]),
];

/// Explore — the structured counterpart to Home. Everything LocZ can find, in six
/// understandable groups, never a flat wall of 26 icons (prompt §7, §16).
class ExploreScreen extends StatelessWidget {
  const ExploreScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        titleSpacing: 16,
        toolbarHeight: 60,
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(strings('explore.title'), style: theme.textTheme.titleLarge),
            Text(
              strings('explore.subtitle'),
              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
            ),
          ],
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        children: [
          _SearchEntry(
            hint: strings('explore.searchHint'),
            onTap: () => context.push('/search'),
          ),
          const SizedBox(height: 20),
          for (final group in _taxonomy) ...[
            Text(strings(group.titleKey), style: theme.textTheme.titleMedium),
            const SizedBox(height: 10),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: [
                for (final area in group.areas)
                  _AreaTile(
                    label: strings(area.labelKey),
                    icon: area.icon,
                    onTap: () => context.push(area.route),
                  ),
              ],
            ),
            const SizedBox(height: 22),
          ],
        ],
      ),
    );
  }
}

class _SearchEntry extends StatelessWidget {
  const _SearchEntry({required this.hint, required this.onTap});
  final String hint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          height: 48,
          padding: const EdgeInsets.symmetric(horizontal: 14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: theme.colorScheme.outlineVariant),
          ),
          child: Row(
            children: [
              Icon(Icons.search_rounded, size: 20, color: theme.colorScheme.primary),
              const SizedBox(width: 10),
              Expanded(child: Text(hint, style: theme.textTheme.bodyMedium)),
            ],
          ),
        ),
      ),
    );
  }
}

class _AreaTile extends StatelessWidget {
  const _AreaTile({required this.label, required this.icon, required this.onTap});
  final String label;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(LoczRadius.full),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(LoczRadius.full),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(LoczRadius.full),
            border: Border.all(color: theme.colorScheme.outlineVariant),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(icon, size: 18, color: theme.colorScheme.primary),
              const SizedBox(width: 8),
              Text(
                label,
                style: theme.textTheme.labelLarge?.copyWith(fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
