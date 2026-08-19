String businessCategoryAsset(String? categoryName) {
  final value = (categoryName ?? '').toLowerCase();
  final category = switch (value) {
    final name when RegExp(r'food|hotel|restaurant|cafe|bakery').hasMatch(name) => 'food',
    final name when RegExp(r'phone|mobile|computer|laptop|electronic|electrical').hasMatch(name) =>
      'phones',
    final name when RegExp(r'home|rental|property|real estate').hasMatch(name) => 'rentals',
    final name when RegExp(r'vehicle|auto|car|bike').hasMatch(name) => 'vehicles',
    final name when RegExp(r'school|education|training|tuition').hasMatch(name) => 'education',
    final name when RegExp(r'event|wedding|party').hasMatch(name) => 'events',
    final name when RegExp(r'service|repair|professional|finance').hasMatch(name) => 'services',
    final name when RegExp(r'job|recruit|career').hasMatch(name) => 'jobs',
    _ => 'business',
  };
  return 'assets/categories/$category-premium.webp';
}
