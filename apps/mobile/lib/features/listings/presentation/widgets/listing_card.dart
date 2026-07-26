import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/i18n/strings.dart';
import '../../../../core/theme/tokens.g.dart';
import '../../domain/models.dart';

/// Indian digit grouping: ₹1,20,000 rather than ₹120,000.
final _rupees = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

String formatPrice(num value) => _rupees.format(value);

/// Fixed-height rails need extra room as text grows; the app caps scaling at 1.4.
double listingCardRailHeight(double textScale) => 250 + ((textScale - 1).clamp(0, 0.4) * 160);

/// Large text gets fewer, taller cards instead of forcing scaled copy into a dense grid.
SliverGridDelegateWithMaxCrossAxisExtent listingCardGridDelegate(
  double textScale,
) =>
    SliverGridDelegateWithMaxCrossAxisExtent(
      maxCrossAxisExtent: textScale > 1.15 ? 320 : 200,
      mainAxisSpacing: LoczSpacing.x3,
      crossAxisSpacing: LoczSpacing.x3,
      childAspectRatio: textScale > 1.15 ? 0.62 : 0.68,
    );

class ListingCard extends StatelessWidget {
  const ListingCard({
    super.key,
    required this.listing,
    required this.onTap,
    this.width,
  });

  final ListingSummary listing;
  final VoidCallback onTap;
  final double? width;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final theme = Theme.of(context);
    final price = listing.price == null
        ? null
        : listing.isFree
            ? strings('listing.free')
            : formatPrice(listing.price!);
    final place = listing.localityName ?? listing.cityName;
    final distance =
        listing.distanceMeters == null ? null : _distance(listing.distanceMeters!, strings);
    final semanticLabel = [
      if (listing.isFeatured) strings('listing.featured'),
      listing.title,
      if (price != null) price,
      place,
      if (distance != null) distance,
      if (listing.isSold) strings('listing.sold'),
    ].join(', ');

    return Semantics(
      button: true,
      label: semanticLabel,
      onTap: onTap,
      child: ExcludeSemantics(
        child: SizedBox(
          width: width,
          child: Card(
            clipBehavior: Clip.antiAlias,
            child: InkWell(
              onTap: onTap,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  AspectRatio(
                    aspectRatio: 4 / 3,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        if (listing.thumbUrl != null)
                          CachedNetworkImage(
                            imageUrl: listing.thumbUrl!,
                            fit: BoxFit.cover,
                            // A grey box rather than a spinner: on a slow connection a grid
                            // of spinners is visual noise.
                            placeholder: (context, _) => ColoredBox(
                              color: theme.colorScheme.surfaceContainerHighest,
                            ),
                            errorWidget: (context, _, __) => ColoredBox(
                              color: theme.colorScheme.surfaceContainerHighest,
                              child: const Icon(
                                Icons.image_not_supported_outlined,
                                size: 20,
                              ),
                            ),
                          )
                        else
                          ColoredBox(
                            color: theme.colorScheme.surfaceContainerHighest,
                            child: const Icon(Icons.photo_outlined, size: 24),
                          ),
                        if (listing.isFeatured)
                          Positioned(
                            top: 6,
                            left: 6,
                            child: _Pill(
                              label: '★ ${strings('listing.featured')}',
                              background: LoczColors.accent100,
                              foreground: LoczColors.accent600,
                            ),
                          ),
                        if (listing.isSold)
                          Positioned(
                            top: 6,
                            right: 6,
                            child: _Pill(
                              label: strings('listing.sold'),
                              background: LoczColors.dangerSurface,
                              foreground: LoczColors.danger,
                            ),
                          ),
                      ],
                    ),
                  ),
                  Padding(
                    padding: const EdgeInsets.all(LoczSpacing.x3),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        if (price != null)
                          Text(
                            price,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: listing.isFree ? LoczColors.success : null,
                            ),
                          ),
                        const SizedBox(height: 2),
                        Text(
                          listing.title,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: theme.textTheme.bodyMedium,
                        ),
                        const SizedBox(height: LoczSpacing.x1),
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                place,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.labelSmall,
                              ),
                            ),
                            if (distance != null) ...[
                              const SizedBox(width: LoczSpacing.x1),
                              Flexible(
                                child: Text(
                                  distance,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.labelSmall,
                                ),
                              ),
                            ],
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
      ),
    );
  }

  String _distance(num meters, Strings strings) {
    final km = meters / 1000;
    final value = km < 1
        ? '${meters.round()} m'
        : '${km.toStringAsFixed(km < 10 ? 1 : 0)} ${strings('common.km')}';
    return strings('common.away', {'distance': value});
  }
}

class _Pill extends StatelessWidget {
  const _Pill({
    required this.label,
    required this.background,
    required this.foreground,
  });

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(LoczRadius.full),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: foreground,
        ),
      ),
    );
  }
}
