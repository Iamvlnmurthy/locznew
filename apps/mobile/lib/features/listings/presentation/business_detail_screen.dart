import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
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
      _business = ref.read(listingRepositoryProvider).businessDetail(widget.slug);
    });
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);

    return Scaffold(
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

    return ListView(
      padding: EdgeInsets.zero,
      children: [
        // A computed shopfront, because an imported record has no photograph and never
        // will. Colour from the id, glyph from the category, initials from the name.
        BusinessStorefront(
          businessId: business.id,
          name: business.name,
          categoryName: business.categoryName,
        ),
        Padding(
          padding: const EdgeInsets.all(LoczSpacing.x4),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(business.name, style: theme.textTheme.headlineSmall),
              if (business.subtitle.isNotEmpty) ...[
                const SizedBox(height: LoczSpacing.x1),
                Text(
                  business.subtitle,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
              const SizedBox(height: LoczSpacing.x3),

              // What this record is, before anything it claims. An unclaimed entry came from an
              // open dataset and nobody at the shop has confirmed a word of it.
              Container(
                padding: const EdgeInsets.all(LoczSpacing.x3),
                decoration: BoxDecoration(
                  color: theme.colorScheme.surfaceContainerHighest,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Row(
                  children: [
                    Icon(
                      business.isClaimed ? Icons.verified_rounded : Icons.info_outline_rounded,
                      size: 18,
                      color: business.isClaimed
                          ? theme.colorScheme.primary
                          : theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: LoczSpacing.x2),
                    Expanded(
                      child: Text(
                        strings(
                          business.isClaimed ? 'business.claimed' : 'business.unclaimed',
                        ),
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
              ),

              if (business.addressLine != null && business.addressLine!.trim().isNotEmpty) ...[
                const SizedBox(height: LoczSpacing.x4),
                _Row(icon: Icons.place_outlined, text: business.addressLine!),
              ],
              if (business.hours.isNotEmpty) ...[
                const SizedBox(height: LoczSpacing.x2),
                _Row(
                  icon: Icons.schedule_outlined,
                  text: business.hours.map((hour) => hour.label).join('  ·  '),
                ),
              ],

              if (business.description != null && business.description!.trim().isNotEmpty) ...[
                const SizedBox(height: LoczSpacing.x4),
                Text(business.description!, style: theme.textTheme.bodyMedium),
                // A generated description is the platform's guess from category and place, not
                // the shop describing itself. Presenting it as the latter would be a small lie
                // repeated three million times.
                if (business.descriptionIsGenerated) ...[
                  const SizedBox(height: LoczSpacing.x1),
                  Text(
                    strings('business.descriptionGenerated'),
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ],

              const SizedBox(height: LoczSpacing.x5),

              if (phone != null && phone.trim().isNotEmpty)
                FilledButton.icon(
                  onPressed: () => _open('tel:$phone'),
                  icon: const Icon(Icons.call_outlined),
                  label: Text(strings('business.call')),
                ),
              if (business.latitude != null && business.longitude != null) ...[
                const SizedBox(height: LoczSpacing.x2),
                OutlinedButton.icon(
                  onPressed: () => _open(
                    'https://www.google.com/maps/search/?api=1&query=${business.latitude},${business.longitude}',
                  ),
                  icon: const Icon(Icons.directions_outlined),
                  label: Text(strings('business.directions')),
                ),
              ],

              // The claim flow lives on the website, which already has the evidence form and the
              // location check. Sending somebody there beats a button that cannot finish the job.
              if (!business.isClaimed) ...[
                const SizedBox(height: LoczSpacing.x2),
                OutlinedButton.icon(
                  onPressed: () => _open('${Env.siteUrl}/b/${business.slug}/claim'),
                  icon: const Icon(Icons.storefront_outlined),
                  label: Text(strings('business.claim')),
                ),
              ],

              // Legally required, not a footnote we may drop. ODbL-1.0 and CDLA-Permissive-2.0
              // both oblige the credit to appear wherever the data is shown.
              if (business.attribution != null && business.attribution!.trim().isNotEmpty) ...[
                const SizedBox(height: LoczSpacing.x6),
                Text(
                  business.attribution!,
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
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

class _Row extends StatelessWidget {
  const _Row({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: theme.colorScheme.onSurfaceVariant),
        const SizedBox(width: LoczSpacing.x2),
        Expanded(child: Text(text, style: theme.textTheme.bodyMedium)),
      ],
    );
  }
}
