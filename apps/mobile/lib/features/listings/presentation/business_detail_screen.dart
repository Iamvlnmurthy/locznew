import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/env.dart';
import '../../../core/i18n/strings.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';
import '../domain/models.dart';
import 'business_storefront.dart';

/// One business from the directory.
///
/// Until now a shop in search results led nowhere on a phone — the app had no screen for
/// one, so a tap opened the website and left the app. This is the destination.
///
/// The screen is deliberately modest about what it knows. Most of these 3.4 million
/// records were imported from open data: nobody at the shop wrote the description, and
/// nothing here has been confirmed by its owner. Saying so is the difference between a
/// directory people trust and one that quietly overstates itself.
class BusinessDetailScreen extends ConsumerStatefulWidget {
  const BusinessDetailScreen({required this.slug, super.key});

  final String slug;

  @override
  ConsumerState<BusinessDetailScreen> createState() => _BusinessDetailScreenState();
}

class _BusinessDetailScreenState extends ConsumerState<BusinessDetailScreen> {
  Future<BusinessDetail>? _business;

  @override
  void initState() {
    super.initState();
    _load();
  }

  void _load() {
    setState(() {
      _business = ref.read(listingRepositoryProvider).businessDetail(
            widget.slug,
            lang: ref.read(localeProvider).name,
          );
    });
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surfaceContainerLowest,
      appBar: AppBar(title: Text(strings('business.title'))),
      body: FutureBuilder<BusinessDetail>(
        future: _business,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.waiting) {
            return const Center(child: CircularProgressIndicator());
          }

          if (snapshot.hasError || !snapshot.hasData) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(LoczSpacing.x8),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      strings('business.loadFailed'),
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: LoczSpacing.x4),
                    OutlinedButton(
                      onPressed: _load,
                      child: Text(strings('common.retry')),
                    ),
                  ],
                ),
              ),
            );
          }

          return _BusinessBody(business: snapshot.data!, strings: strings);
        },
      ),
    );
  }
}

class _BusinessBody extends StatelessWidget {
  const _BusinessBody({required this.business, required this.strings});

  final BusinessDetail business;
  final Strings strings;

  Future<void> _open(String url) async {
    await launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final phone = business.primaryPhone;
    final hasPhone = phone != null && phone.trim().isNotEmpty;
    final hasDirections = business.latitude != null && business.longitude != null;
    final website = business.website?.trim();
    final hasWebsite = website != null && website.isNotEmpty;
    final hasAddress = business.addressLine?.trim().isNotEmpty ?? false;
    final hasDescription = business.description?.trim().isNotEmpty ?? false;
    final isSparse = !hasPhone &&
        !hasDirections &&
        !hasWebsite &&
        !hasAddress &&
        business.hours.isEmpty &&
        !hasDescription;

    final actions = <_BusinessActionSpec>[
      if (hasPhone)
        _BusinessActionSpec(
          icon: Icons.call_outlined,
          label: strings('business.call'),
          onTap: () => _open('tel:$phone'),
          primary: true,
        ),
      if (hasDirections)
        _BusinessActionSpec(
          icon: Icons.directions_outlined,
          label: strings('business.directions'),
          onTap: () => _open(
            'https://www.google.com/maps/search/?api=1&query=${business.latitude},${business.longitude}',
          ),
        ),
      if (hasWebsite)
        _BusinessActionSpec(
          icon: Icons.language_rounded,
          label: strings('business.website'),
          onTap: () => _open(
            Uri.parse(website).hasScheme ? website : 'https://$website',
          ),
        ),
    ];

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        SizedBox(
          // The floating identity card can carry a two-line name, two-line subtitle and
          // the legally important unclaimed disclosure. At 320dp that needs real room;
          // a shorter fixed hero caused the action deck to cover the disclosure.
          height: 362,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              BusinessStorefront(
                businessId: business.id,
                name: business.name,
                categoryName: business.categoryName,
                height: 220,
              ),
              Positioned(
                left: LoczSpacing.x4,
                right: LoczSpacing.x4,
                top: 174,
                child: Card(
                  margin: EdgeInsets.zero,
                  elevation: 0,
                  color: theme.colorScheme.surface,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(LoczRadius.xl),
                    side: BorderSide(color: theme.colorScheme.outlineVariant),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(LoczSpacing.x4),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          business.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.headlineSmall?.copyWith(
                            fontWeight: FontWeight.w800,
                            height: 1.1,
                          ),
                        ),
                        if (business.subtitle.isNotEmpty) ...[
                          const SizedBox(height: LoczSpacing.x1),
                          Text(
                            business.subtitle,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                        const SizedBox(height: LoczSpacing.x3),
                        _DirectoryStatus(
                          claimed: business.isClaimed,
                          text: strings(
                            business.isClaimed ? 'business.claimed' : 'business.unclaimed',
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            LoczSpacing.x4,
            LoczSpacing.x2,
            LoczSpacing.x4,
            LoczSpacing.x8,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (actions.isNotEmpty) ...[
                Row(
                  children: [
                    for (var index = 0; index < actions.length; index++) ...[
                      if (index > 0) const SizedBox(width: LoczSpacing.x2),
                      Expanded(child: _BusinessAction(spec: actions[index])),
                    ],
                  ],
                ),
                const SizedBox(height: LoczSpacing.x5),
              ],

              if (isSparse)
                _SparseBusinessState(strings: strings)
              else ...[
                if (hasAddress || business.hours.isNotEmpty) ...[
                  _SectionLabel(text: strings('business.details')),
                  const SizedBox(height: LoczSpacing.x2),
                  Card(
                    margin: EdgeInsets.zero,
                    elevation: 0,
                    child: Padding(
                      padding: const EdgeInsets.all(LoczSpacing.x4),
                      child: Column(
                        children: [
                          if (hasAddress)
                            _InfoRow(
                              icon: Icons.place_outlined,
                              label: strings('business.address'),
                              child: Text(business.addressLine!),
                            ),
                          if (hasAddress && business.hours.isNotEmpty)
                            const Divider(height: LoczSpacing.x6),
                          if (business.hours.isNotEmpty)
                            _InfoRow(
                              icon: Icons.schedule_outlined,
                              label: strings('business.hours'),
                              child: Wrap(
                                spacing: LoczSpacing.x2,
                                runSpacing: LoczSpacing.x2,
                                children: business.hours
                                    .map(
                                      (hour) => Container(
                                        padding: const EdgeInsets.symmetric(
                                          horizontal: LoczSpacing.x2,
                                          vertical: LoczSpacing.x1,
                                        ),
                                        decoration: BoxDecoration(
                                          color: theme.colorScheme.surfaceContainerHighest,
                                          borderRadius: BorderRadius.circular(
                                            LoczRadius.full,
                                          ),
                                        ),
                                        child: Text(
                                          hour.label,
                                          style: theme.textTheme.labelSmall,
                                        ),
                                      ),
                                    )
                                    .toList(),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ],
                if (hasDescription) ...[
                  const SizedBox(height: LoczSpacing.x5),
                  _SectionLabel(text: strings('business.about')),
                  const SizedBox(height: LoczSpacing.x2),
                  Card(
                    margin: EdgeInsets.zero,
                    elevation: 0,
                    child: Padding(
                      padding: const EdgeInsets.all(LoczSpacing.x4),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            business.description!,
                            style: theme.textTheme.bodyMedium,
                          ),
                          if (business.descriptionIsGenerated) ...[
                            const SizedBox(height: LoczSpacing.x3),
                            Container(
                              padding: const EdgeInsets.all(LoczSpacing.x3),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.secondaryContainer,
                                borderRadius: BorderRadius.circular(LoczRadius.md),
                              ),
                              child: Row(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Icon(
                                    Icons.auto_awesome_outlined,
                                    size: 17,
                                    color: theme.colorScheme.onSecondaryContainer,
                                  ),
                                  const SizedBox(width: LoczSpacing.x2),
                                  Expanded(
                                    child: Text(
                                      strings('business.descriptionGenerated'),
                                      style: theme.textTheme.labelSmall?.copyWith(
                                        color: theme.colorScheme.onSecondaryContainer,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                ],
              ],

              _SimilarNearby(business: business, strings: strings),

              if (!business.isClaimed) ...[
                const SizedBox(height: LoczSpacing.x5),
                Container(
                  padding: const EdgeInsets.all(LoczSpacing.x4),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.primaryContainer.withValues(alpha: 0.5),
                    borderRadius: BorderRadius.circular(LoczRadius.lg),
                    border: Border.all(color: theme.colorScheme.outlineVariant),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Icon(
                            Icons.storefront_outlined,
                            color: theme.colorScheme.primary,
                          ),
                          const SizedBox(width: LoczSpacing.x2),
                          Expanded(
                            child: Text(
                              strings('business.claim'),
                              style: theme.textTheme.titleSmall,
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: LoczSpacing.x2),
                      Text(
                        strings('business.claimHint'),
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                      const SizedBox(height: LoczSpacing.x3),
                      SizedBox(
                        width: double.infinity,
                        child: FilledButton.icon(
                          onPressed: () => _open('${Env.siteUrl}/b/${business.slug}/claim'),
                          icon: const Icon(Icons.arrow_outward_rounded),
                          label: Text(strings('business.claim')),
                        ),
                      ),
                    ],
                  ),
                ),
              ],

              // Legally required, not a footnote we may drop. ODbL-1.0 and CDLA-Permissive-2.0
              // both oblige the credit to appear wherever the data is shown.
              if (business.attribution != null && business.attribution!.trim().isNotEmpty) ...[
                const SizedBox(height: LoczSpacing.x6),
                Container(
                  padding: const EdgeInsets.all(LoczSpacing.x3),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.surfaceContainer,
                    borderRadius: BorderRadius.circular(LoczRadius.md),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        Icons.dataset_outlined,
                        size: 17,
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                      const SizedBox(width: LoczSpacing.x2),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              strings('business.attributionTitle'),
                              style: theme.textTheme.labelMedium,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              business.attribution!,
                              style: theme.textTheme.labelSmall?.copyWith(
                                color: theme.colorScheme.onSurfaceVariant,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}

class _BusinessActionSpec {
  const _BusinessActionSpec({
    required this.icon,
    required this.label,
    required this.onTap,
    this.primary = false,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool primary;
}

class _BusinessAction extends StatelessWidget {
  const _BusinessAction({required this.spec});

  final _BusinessActionSpec spec;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: spec.primary ? theme.colorScheme.primary : theme.colorScheme.surfaceContainer,
      borderRadius: BorderRadius.circular(LoczRadius.lg),
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        onTap: spec.onTap,
        child: SizedBox(
          height: 82,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: LoczSpacing.x2,
              vertical: LoczSpacing.x3,
            ),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(
                  spec.icon,
                  size: 21,
                  color: spec.primary ? theme.colorScheme.onPrimary : theme.colorScheme.primary,
                ),
                const SizedBox(height: LoczSpacing.x1),
                Text(
                  spec.label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.labelMedium?.copyWith(
                    color: spec.primary ? theme.colorScheme.onPrimary : theme.colorScheme.onSurface,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _DirectoryStatus extends StatelessWidget {
  const _DirectoryStatus({required this.claimed, required this.text});

  final bool claimed;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(
          claimed ? Icons.verified_rounded : Icons.info_outline_rounded,
          size: 17,
          color: claimed ? theme.colorScheme.primary : theme.colorScheme.onSurfaceVariant,
        ),
        const SizedBox(width: LoczSpacing.x2),
        Expanded(
          child: Text(
            text,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.text});

  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w800),
      );
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.child,
  });

  final IconData icon;
  final String label;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: LoczSpacing.x2),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                label,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
              const SizedBox(height: 3),
              DefaultTextStyle.merge(
                style: theme.textTheme.bodyMedium,
                child: child,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _SparseBusinessState extends StatelessWidget {
  const _SparseBusinessState({required this.strings});

  final Strings strings;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.all(LoczSpacing.x5),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainer,
        borderRadius: BorderRadius.circular(LoczRadius.xl),
        border: Border.all(color: theme.colorScheme.outlineVariant),
      ),
      child: Column(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              color: theme.colorScheme.primaryContainer,
              borderRadius: BorderRadius.circular(LoczRadius.lg),
            ),
            child: Icon(
              Icons.travel_explore_rounded,
              color: theme.colorScheme.primary,
            ),
          ),
          const SizedBox(height: LoczSpacing.x3),
          Text(
            strings('business.sparseTitle'),
            textAlign: TextAlign.center,
            style: theme.textTheme.titleMedium,
          ),
          const SizedBox(height: LoczSpacing.x2),
          Text(
            strings('business.sparseHint'),
            textAlign: TextAlign.center,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
        ],
      ),
    );
  }
}

/// "Similar places nearby" — the same category around this business's point. Mirrors the web
/// storefront: unique per location and a way to keep discovery inside the app rather than
/// dead-ending on a single record. Fetches lazily and renders nothing until it has results.
class _SimilarNearby extends ConsumerStatefulWidget {
  const _SimilarNearby({required this.business, required this.strings});

  final BusinessDetail business;
  final Strings strings;

  @override
  ConsumerState<_SimilarNearby> createState() => _SimilarNearbyState();
}

class _SimilarNearbyState extends ConsumerState<_SimilarNearby> {
  Future<List<BusinessSummary>>? _future;

  @override
  void initState() {
    super.initState();
    final b = widget.business;
    final categoryId = b.categoryId;
    if (categoryId == null || categoryId.isEmpty) return;
    final hasGeo = b.latitude != null && b.longitude != null;
    if (!hasGeo && (b.pincode == null || b.pincode!.isEmpty)) return;
    _future = ref
        .read(listingRepositoryProvider)
        .nearbyBusinesses(
          latitude: b.latitude,
          longitude: b.longitude,
          categoryId: categoryId,
          pincode: hasGeo ? null : b.pincode,
          radiusKm: 10,
          limit: 9,
        )
        .then((r) => r.items.where((x) => x.slug != b.slug).take(8).toList());
  }

  @override
  Widget build(BuildContext context) {
    final future = _future;
    if (future == null) return const SizedBox.shrink();
    final theme = Theme.of(context);

    return FutureBuilder<List<BusinessSummary>>(
      future: future,
      builder: (context, snapshot) {
        final items = snapshot.data ?? const <BusinessSummary>[];
        if (snapshot.connectionState != ConnectionState.done || items.isEmpty) {
          return const SizedBox.shrink();
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const SizedBox(height: LoczSpacing.x6),
            _SectionLabel(text: widget.strings('business.similarTitle')),
            const SizedBox(height: LoczSpacing.x3),
            for (final b in items)
              Padding(
                padding: const EdgeInsets.only(bottom: LoczSpacing.x2),
                child: Material(
                  color: theme.colorScheme.surfaceContainer,
                  borderRadius: BorderRadius.circular(LoczRadius.md),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(LoczRadius.md),
                    onTap: () => context.push('/b/${b.slug}'),
                    child: Padding(
                      padding: const EdgeInsets.all(LoczSpacing.x3),
                      child: Row(
                        children: [
                          Container(
                            width: 42,
                            height: 42,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: theme.colorScheme.primaryContainer,
                              borderRadius: BorderRadius.circular(LoczRadius.sm),
                            ),
                            child: Text(
                              b.name.isNotEmpty ? b.name.substring(0, 1).toUpperCase() : '?',
                              style: theme.textTheme.titleMedium
                                  ?.copyWith(color: theme.colorScheme.primary),
                            ),
                          ),
                          const SizedBox(width: LoczSpacing.x3),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  b.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.titleSmall,
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  [
                                    if (b.isVerified) widget.strings('business.verified'),
                                    b.subtitle,
                                  ].where((s) => s.trim().isNotEmpty).join(' · '),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.labelSmall
                                      ?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                                ),
                              ],
                            ),
                          ),
                          Icon(
                            Icons.chevron_right_rounded,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}
