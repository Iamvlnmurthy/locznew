import '../domain/models.dart';

/// Carries the already-rendered card into the detail route so the first frame can
/// preserve its image while the full listing is fetched.
class ListingNavigationPreview {
  const ListingNavigationPreview({
    required this.listing,
    required this.heroTag,
  });

  final ListingSummary listing;
  final String heroTag;
}
