import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../core/i18n/strings.dart';
import '../../../../core/motion/locz_motion.dart';
import '../../../../core/theme/tokens.g.dart';
import '../../domain/models.dart';

/// Indian digit grouping: ₹1,20,000 rather than ₹120,000.
final _rupees =
    NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 0);

String formatPrice(num value) => _rupees.format(value);

/// Fixed-height rails need extra room as text grows; the app caps scaling at 1.4.
double listingCardRailHeight(double textScale) =>
    248 + ((textScale - 1).clamp(0, 0.4) * 160);

/// Large text gets fewer, taller cards instead of forcing scaled copy into a dense grid.
SliverGridDelegateWithMaxCrossAxisExtent listingCardGridDelegate(
  double textScale,
) =>
    SliverGridDelegateWithMaxCrossAxisExtent(
      maxCrossAxisExtent: textScale > 1.15 ? 320 : 200,
      mainAxisSpacing: 10,
      crossAxisSpacing: 10,
      childAspectRatio: textScale > 1.15 ? 0.66 : 0.70,
    );

class ListingCard extends StatelessWidget {
  const ListingCard({
    super.key,
    required this.listing,
    required this.onTap,
    this.width,
    this.heroTag,
  });

  final ListingSummary listing;
  final VoidCallback onTap;
  final double? width;
  final String? heroTag;

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final price = listing.price == null
        ? null
        : listing.isFree
            ? strings('listing.free')
            : formatPrice(listing.price!);
    final place = listing.localityName ?? listing.cityName;
    final distance = listing.distanceMeters == null
        ? null
        : _distance(listing.distanceMeters!, strings);
    final semanticLabel = [
      if (listing.isFeatured) strings('listing.featured'),
      listing.title,
      if (price != null) price,
      if (listing.isNegotiable) strings('listing.negotiable'),
      place,
      if (distance != null) distance,
      if (listing.isSold) strings('listing.sold'),
    ].join(', ');
    Widget listingImage() {
      final image = CachedNetworkImage(
        imageUrl: listing.thumbUrl!,
        fit: BoxFit.cover,
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
      );
      if (heroTag == null) return image;
      return Hero(
        tag: heroTag!,
        flightShuttleBuilder: loczImageFlight,
        child: image,
      );
    }

    return LoczPressable(
      onTap: onTap,
      semanticLabel: semanticLabel,
      child: SizedBox(
        width: width,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: theme.colorScheme.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: theme.colorScheme.outlineVariant),
            boxShadow: [
              BoxShadow(
                color: theme.colorScheme.shadow.withValues(
                  alpha: isDark ? 0.18 : 0.06,
                ),
                blurRadius: 12,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          child: Material(
            color: Colors.transparent,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                AspectRatio(
                  aspectRatio: 1.34,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      if (listing.thumbUrl != null)
                        listingImage()
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
                            background: isDark
                                ? theme.colorScheme.secondaryContainer
                                : LoczColors.accent100,
                            foreground: isDark
                                ? theme.colorScheme.onSecondaryContainer
                                : LoczColors.accent600,
                          ),
                        ),
                      if (listing.isSold)
                        Positioned(
                          top: 6,
                          right: 6,
                          child: _Pill(
                            label: strings('listing.sold'),
                            background: theme.colorScheme.errorContainer,
                            foreground: theme.colorScheme.onErrorContainer,
                          ),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(11, 9, 11, 11),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Row(
                        children: [
                          if (price != null)
                            Expanded(
                              child: Text(
                                price,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.titleMedium?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  letterSpacing: -0.25,
                                  color: listing.isFree
                                      ? LoczColors.success
                                      : null,
                                ),
                              ),
                            ),
                          if (listing.isNegotiable && price != null)
                            ConstrainedBox(
                              constraints: const BoxConstraints(maxWidth: 62),
                              child: Container(
                                margin: const EdgeInsets.only(left: 4),
                                padding: const EdgeInsets.symmetric(
                                  horizontal: 6,
                                  vertical: 2,
                                ),
                                decoration: BoxDecoration(
                                  color: theme.colorScheme.primaryContainer,
                                  borderRadius: BorderRadius.circular(
                                    LoczRadius.full,
                                  ),
                                ),
                                child: Text(
                                  strings('listing.negotiable'),
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  style: theme.textTheme.labelSmall?.copyWith(
                                    color: theme.colorScheme.onPrimaryContainer,
                                    fontSize: 9,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        listing.title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: theme.colorScheme.onSurface,
                          fontWeight: FontWeight.w600,
                          height: 1.34,
                        ),
                      ),
                      const SizedBox(height: LoczSpacing.x1),
                      Row(
                        children: [
                          Icon(
                            Icons.location_on_outlined,
                            size: 12,
                            color: theme.colorScheme.onSurfaceVariant,
                          ),
                          const SizedBox(width: 2),
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
