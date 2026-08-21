import 'dart:io';

import 'package:dio/dio.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../domain/models.dart';

/// All listing, feed and catalogue reads and writes.
///
/// The repository is the only place that knows API paths — screens depend on this, so a
/// route change is one edit rather than a search across widgets.
class ListingRepository {
  ListingRepository(this._api);

  final ApiClient _api;

  Future<Feed> feed({
    String? cityId,
    double? latitude,
    double? longitude,
    String? pincode,
    int? radiusKm,
  }) async {
    final json = await _api.get<Map<String, dynamic>>(
      '/feed',
      query: {
        'limit': 10,
        if (cityId != null) 'cityId': cityId,
        if (pincode != null) 'pincode': pincode,
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
        // Only meaningful with coordinates; the API ignores it otherwise.
        if (radiusKm != null && latitude != null && longitude != null) 'radiusKm': radiusKm,
      },
    );
    return Feed.fromJson(_portableMediaUrls(json));
  }

  /// Returns businesses alongside listings.
  ///
  /// The API has always sent them; this client parsed `items` and dropped the rest, so
  /// 3.4 million directory businesses were invisible to every phone user while the
  /// website showed them.
  Future<SearchResults> search({
    String? query,
    String? cityId,
    String? categoryId,
    String? type,
    double? latitude,
    double? longitude,
    int? radiusKm,
    String? pincode,
    num? priceMin,
    num? priceMax,
    List<String> attributes = const [],
    String sort = 'relevance',
    int page = 1,
  }) async {
    final json = await _api.get<Map<String, dynamic>>(
      '/search',
      query: {
        'page': page,
        'limit': 24,
        'sort': sort,
        if (query != null && query.isNotEmpty) 'q': query,
        if (cityId != null) 'cityId': cityId,
        if (pincode != null) 'pincode': pincode,
        if (categoryId != null) 'categoryId': categoryId,
        if (type != null) 'type': type,
        if (radiusKm != null && latitude != null && longitude != null) ...{
          'radiusKm': radiusKm,
          'latitude': latitude,
          'longitude': longitude,
        },
        if (priceMin != null) 'priceMin': priceMin,
        if (priceMax != null) 'priceMax': priceMax,
        if (attributes.isNotEmpty) 'attr': attributes,
      },
    );

    return SearchResults(
      listings: (json['items'] as List<dynamic>)
          .map(
            (entry) => ListingSummary.fromJson(
              _portableMediaUrls(entry as Map<String, dynamic>),
            ),
          )
          .toList(),
      businesses: (json['businesses'] as List<dynamic>? ?? const [])
          .map((entry) => BusinessSummary.fromJson(entry as Map<String, dynamic>))
          .toList(),
      businessTotal: (json['businessTotal'] as num?)?.toInt() ?? 0,
    );
  }

  /// The next page of businesses for a query, without re-running the listing search.
  ///
  /// The mixed `/search` returns six beside the listings. Browsing shops needs more than
  /// that, and re-fetching the whole mixed response per page would repeat an expensive
  /// listing query to throw its results away.
  Future<SearchResults> searchBusinesses({
    required String query,
    String? cityId,
    String? pincode,
    double? latitude,
    double? longitude,
    int? radiusKm,
    int page = 1,
    int limit = 10,
  }) async {
    final json = await _api.get<Map<String, dynamic>>(
      '/search/businesses',
      query: {
        'q': query,
        'businessPage': page,
        'businessLimit': limit,
        if (cityId != null) 'cityId': cityId,
        if (pincode != null) 'pincode': pincode,
        if (radiusKm != null && latitude != null && longitude != null) ...{
          'radiusKm': radiusKm,
          'latitude': latitude,
          'longitude': longitude,
        },
      },
    );

    return SearchResults(
      listings: const [],
      businesses: (json['businesses'] as List<dynamic>? ?? const [])
          .map((entry) => BusinessSummary.fromJson(entry as Map<String, dynamic>))
          .toList(),
      businessTotal: (json['businessTotal'] as num?)?.toInt() ?? 0,
    );
  }

  /// Businesses near a point (nearest first, with a distance on each) or, without coordinates,
  /// scoped to a pincode/city. Paginated 20 at a time for infinite scroll on Home.
  Future<({List<BusinessSummary> items, bool hasNextPage, int total})> nearbyBusinesses({
    double? latitude,
    double? longitude,
    int? radiusKm,
    String? pincode,
    String? cityId,
    String? categoryId,
    String? area,
    bool verifiedOnly = false,
    int page = 1,
    int limit = 20,
  }) async {
    final geo = latitude != null && longitude != null;
    final json = await _api.get<Map<String, dynamic>>(
      geo ? '/businesses/nearby' : '/businesses',
      query: {
        'page': page,
        'limit': limit,
        if (geo) ...{
          'latitude': latitude,
          'longitude': longitude,
          'radiusKm': radiusKm ?? 25,
        },
        if (pincode != null) 'pincode': pincode,
        if (!geo && cityId != null) 'cityId': cityId,
        if (categoryId != null) 'categoryId': categoryId,
        if (area != null) 'area': area,
        if (verifiedOnly) 'verifiedOnly': 'true',
        if (!geo) 'sort': 'recommended',
      },
    );
    final meta = (json['meta'] as Map<String, dynamic>?) ?? const {};
    return (
      items: (json['items'] as List<dynamic>? ?? const [])
          .map((entry) => BusinessSummary.fromJson(entry as Map<String, dynamic>))
          .toList(),
      hasNextPage: meta['hasNextPage'] as bool? ?? false,
      total: (meta['total'] as num?)?.toInt() ?? 0,
    );
  }

  /// Active-business count per category for an area, for the Explore tiles.
  Future<Map<String, int>> businessCategoryCounts({String? cityId, String? pincode}) async {
    final json = await _api.get<List<dynamic>>(
      '/businesses/category-counts',
      query: {
        if (cityId != null) 'cityId': cityId,
        if (pincode != null) 'pincode': pincode,
      },
    );
    return {
      for (final entry in json)
        (entry as Map<String, dynamic>)['categoryId'] as String:
            (entry['count'] as num?)?.toInt() ?? 0,
    };
  }

  /// "Around you" — how many known places sit in each discovery area, rolled up from the POIs
  /// LocZ already holds. Makes a brand-new area look alive before anyone posts. Ordered by count.
  Future<List<({String area, int count})>> areaSummary({String? cityId, String? pincode}) async {
    final json = await _api.get<Map<String, dynamic>>(
      '/local-now/area-summary',
      query: {
        if (cityId != null) 'cityId': cityId,
        if (pincode != null) 'pincode': pincode,
      },
    );
    final areas = (json['areas'] as List<dynamic>? ?? []);
    return [
      for (final entry in areas)
        (
          area: (entry as Map<String, dynamic>)['area'] as String,
          count: (entry['count'] as num?)?.toInt() ?? 0,
        ),
    ];
  }

  /// Current weather for a point, for the "Local Now" strip. Null when not configured or on error.
  Future<({num tempC, String condition, String description})?> localWeather(
    double latitude,
    double longitude,
  ) async {
    final json = await _api.get<Map<String, dynamic>>(
      '/local-now/weather',
      query: {'latitude': latitude, 'longitude': longitude},
    );
    final weather = json['weather'] as Map<String, dynamic>?;
    if (weather == null) return null;
    return (
      tempC: (weather['tempC'] as num?) ?? 0,
      condition: weather['condition'] as String? ?? '',
      description: weather['description'] as String? ?? '',
    );
  }

  /// Live local news headlines for an area, pulled on demand (never stored). Display-only:
  /// headline + publisher + a link back to the original. Empty on any failure.
  Future<List<({String title, String url, String source, String? publishedAt})>> localNews(
    String query,
  ) async {
    if (query.trim().isEmpty) return const [];
    final json = await _api.get<Map<String, dynamic>>('/local-now/news', query: {'q': query});
    final headlines = (json['headlines'] as List<dynamic>? ?? []);
    return [
      for (final entry in headlines)
        (
          title: (entry as Map<String, dynamic>)['title'] as String? ?? '',
          url: entry['url'] as String? ?? '',
          source: entry['source'] as String? ?? '',
          publishedAt: entry['publishedAt'] as String?,
        ),
    ];
  }

  /// Official public-safety alerts (NDMA SACHET) naming the viewer's area. Display-only, verbatim.
  /// Passing cityId widens the match to the city's district/state. Empty on failure.
  Future<List<({String title, String? category, String? publishedAt})>> localAlerts(
    String query, {
    String? cityId,
  }) async {
    if (query.trim().isEmpty) return const [];
    final json = await _api.get<Map<String, dynamic>>(
      '/local-now/alerts',
      query: {'q': query, if (cityId != null) 'cityId': cityId},
    );
    final alerts = (json['alerts'] as List<dynamic>? ?? []);
    return [
      for (final entry in alerts)
        (
          title: (entry as Map<String, dynamic>)['title'] as String? ?? '',
          category: entry['category'] as String?,
          publishedAt: entry['publishedAt'] as String?,
        ),
    ];
  }

  /// Live local job openings (Adzuna), pulled on demand (never stored). Display-only: title,
  /// company, location + a link back to the posting. Empty when unconfigured or on failure.
  Future<List<({String title, String? company, String? location, String url, String? postedAt})>>
      localJobs(String query) async {
    if (query.trim().isEmpty) return const [];
    final json = await _api.get<Map<String, dynamic>>('/local-now/jobs', query: {'q': query});
    final jobs = (json['jobs'] as List<dynamic>? ?? []);
    return [
      for (final entry in jobs)
        (
          title: (entry as Map<String, dynamic>)['title'] as String? ?? '',
          company: entry['company'] as String?,
          location: entry['location'] as String?,
          url: entry['url'] as String? ?? '',
          postedAt: entry['postedAt'] as String?,
        ),
    ];
  }

  /// Live affiliate deals/offers, pulled on demand (never stored). Display-only: title, merchant,
  /// coupon + a link out to redeem at the merchant. Deliberately national online offers, NOT
  /// location-specific and NOT LocZ-owned listings. Empty when unconfigured or on failure.
  Future<
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
          })>> localDeals() async {
    final json = await _api.get<Map<String, dynamic>>('/local-now/deals');
    final deals = (json['deals'] as List<dynamic>? ?? []);
    return [
      for (final entry in deals)
        (
          id: (entry as Map<String, dynamic>)['id'] as String? ?? '',
          title: entry['title'] as String? ?? '',
          merchant: entry['merchant'] as String? ?? '',
          description: entry['description'] as String? ?? '',
          couponCode: entry['couponCode'] as String?,
          imageUrl: entry['imageUrl'] as String?,
          url: entry['url'] as String? ?? '',
          category: entry['category'] as String?,
          endDate: entry['endDate'] as String?,
        ),
    ];
  }

  Future<BusinessDetail> businessDetail(String slug) async {
    final json = await _api.get<Map<String, dynamic>>('/businesses/$slug');
    return BusinessDetail.fromJson(json);
  }

  Future<ListingDetail> detail(String slug) async {
    final json = await _api.get<Map<String, dynamic>>('/listings/$slug');
    return ListingDetail.fromJson(_portableMediaUrls(json));
  }

  Future<void> reportListing({
    required String listingId,
    required String reason,
    String? details,
  }) =>
      _api.post<void>(
        '/reports',
        body: {
          'targetType': 'LISTING',
          'targetId': listingId,
          'reason': reason,
          if (details != null && details.trim().isNotEmpty) 'details': details.trim(),
        },
      );

  Future<List<ListingSummary>> myListings() async {
    final json = await _api.get<Map<String, dynamic>>('/listings/mine', query: {'limit': 50});
    return (json['items'] as List<dynamic>)
        .map(
          (entry) => ListingSummary.fromJson(
            _portableMediaUrls(entry as Map<String, dynamic>),
          ),
        )
        .toList();
  }

  Future<List<ListingSummary>> savedListings() async {
    final json = await _api.get<Map<String, dynamic>>('/listings/saved', query: {'limit': 50});
    return (json['items'] as List<dynamic>)
        .map(
          (entry) => ListingSummary.fromJson(
            _portableMediaUrls(entry as Map<String, dynamic>),
          ),
        )
        .toList();
  }

  Future<bool> toggleSave(String listingId, {required bool save}) async {
    final json = save
        ? await _api.post<Map<String, dynamic>>('/listings/$listingId/save')
        : await _api.delete<Map<String, dynamic>>('/listings/$listingId/save');
    return json['saved'] as bool;
  }

  Future<Map<String, dynamic>> createListing({
    String type = 'PRODUCT',
    required String title,
    required String description,
    required String categoryId,
    required String cityId,
    required String condition,
    num? price,
    bool isFree = false,
    bool isNegotiable = false,
    String contactPreference = 'IN_APP_ONLY',
    bool saveAsDraft = false,
    List<Map<String, dynamic>>? attributes,
    num? budgetMin,
    num? budgetMax,
    DateTime? requiredBy,
    int? quantity,
    String? preferredCondition,
  }) {
    return _api.post<Map<String, dynamic>>(
      '/listings',
      body: {
        'type': type,
        'title': title,
        'description': description,
        'categoryId': categoryId,
        'cityId': cityId,
        'contactPreference': contactPreference,
        'showPhonePublicly': contactPreference != 'IN_APP_ONLY',
        'saveAsDraft': saveAsDraft,
        if (attributes != null) 'attributes': attributes,
        if (type == 'BUYER_REQUIREMENT')
          'buyerRequirement': {
            if (budgetMin != null) 'budgetMin': budgetMin,
            if (budgetMax != null) 'budgetMax': budgetMax,
            if (requiredBy != null) 'requiredBy': requiredBy.toIso8601String(),
            if (quantity != null) 'quantity': quantity,
            if (preferredCondition != null) 'preferredCondition': preferredCondition,
          }
        else
          'marketplace': {
            if (price != null) 'price': price,
            'isFree': isFree,
            'isNegotiable': isNegotiable,
            'condition': condition,
          },
      },
    );
  }

  Future<Map<String, dynamic>> updateListing({
    required String listingId,
    String type = 'PRODUCT',
    required String title,
    required String description,
    required String categoryId,
    required String cityId,
    required String condition,
    num? price,
    bool isFree = false,
    bool isNegotiable = false,
    String contactPreference = 'IN_APP_ONLY',
    List<Map<String, dynamic>>? attributes,
    num? budgetMin,
    num? budgetMax,
    DateTime? requiredBy,
    int? quantity,
    String? preferredCondition,
  }) {
    return _api.patch<Map<String, dynamic>>(
      '/listings/$listingId',
      body: {
        'title': title,
        'description': description,
        'categoryId': categoryId,
        'cityId': cityId,
        'contactPreference': contactPreference,
        'showPhonePublicly': contactPreference != 'IN_APP_ONLY',
        if (attributes != null) 'attributes': attributes,
        if (type == 'BUYER_REQUIREMENT')
          'buyerRequirement': {
            if (budgetMin != null) 'budgetMin': budgetMin,
            if (budgetMax != null) 'budgetMax': budgetMax,
            if (requiredBy != null) 'requiredBy': requiredBy.toIso8601String(),
            if (quantity != null) 'quantity': quantity,
            if (preferredCondition != null) 'preferredCondition': preferredCondition,
          }
        else
          'marketplace': {
            if (price != null) 'price': price,
            'isFree': isFree,
            'isNegotiable': isNegotiable,
            'condition': condition,
          },
      },
    );
  }

  /// Two-step upload: the API signs a URL, the file goes straight to object storage,
  /// then the API is asked to derive the renditions. The bytes never touch the API.
  Future<String> uploadImage(
    String listingId,
    File file, {
    void Function(double progress)? onProgress,
  }) async {
    final mimeType = _mimeTypeFor(file.path);
    final length = await file.length();

    final signed = await _api.post<Map<String, dynamic>>(
      '/listings/$listingId/media/upload-url',
      body: {'mimeType': mimeType, 'sizeBytes': length},
    );

    // A bare Dio instance: the signed URL is pre-authorised, and sending the app's
    // bearer token to a storage host would leak it outside the API's origin.
    await Dio().put<void>(
      signed['uploadUrl'] as String,
      data: file.openRead(),
      options: Options(
        headers: {
          'Content-Type': mimeType,
          Headers.contentLengthHeader: length,
        },
      ),
      onSendProgress: (sent, total) {
        if (total > 0) onProgress?.call(sent / total);
      },
    );

    final media = await _api.post<Map<String, dynamic>>('/media/${signed['mediaId']}/confirm');
    return media['id'] as String;
  }

  String _mimeTypeFor(String path) {
    final lower = path.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.heic')) return 'image/heic';
    return 'image/jpeg';
  }

  Future<void> listingCommand(String listingId, String command) async {
    if (command == 'delete') {
      await _api.delete<void>('/listings/$listingId');
    } else {
      await _api.post<void>('/listings/$listingId/$command');
    }
  }

  Future<List<Category>> categories({String? listingType}) async {
    final json = await _api.get<List<dynamic>>(
      '/categories',
      query: {if (listingType != null) 'listingType': listingType},
      auth: false,
    );
    return json.map((entry) => Category.fromJson(entry as Map<String, dynamic>)).toList();
  }

  Future<Category> categoryDetail(String slug) async {
    final json = await _api.get<Map<String, dynamic>>(
      '/categories/${Uri.encodeComponent(slug)}',
      auth: false,
    );
    return Category.fromJson(json);
  }

  Future<List<String>> modelSuggestions(
    String categorySlug, {
    String? brand,
    String? query,
  }) async {
    final json = await _api.get<List<dynamic>>(
      '/categories/${Uri.encodeComponent(categorySlug)}/models',
      query: {
        if (brand != null && brand.isNotEmpty) 'brand': brand,
        if (query != null && query.isNotEmpty) 'q': query,
        'limit': 12,
      },
      auth: false,
    );
    return json.cast<String>();
  }

  Future<List<RequirementResponse>> requirementResponses(
    String listingId,
  ) async {
    final json = await _api.get<List<dynamic>>('/requirements/$listingId/responses');
    return json
        .map(
          (entry) => RequirementResponse.fromJson(entry as Map<String, dynamic>),
        )
        .toList();
  }

  Future<RequirementResponse> respondToRequirement({
    required String listingId,
    required String kind,
    num? offeredPrice,
    DateTime? availableFrom,
    String? message,
    String? offeredListingId,
    String? businessId,
  }) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/requirements/$listingId/responses',
      body: {
        'kind': kind,
        if (offeredPrice != null) 'offeredPrice': offeredPrice,
        if (availableFrom != null) 'availableFrom': availableFrom.toIso8601String(),
        if (message != null && message.isNotEmpty) 'message': message,
        if (offeredListingId != null) 'offeredListingId': offeredListingId,
        if (businessId != null) 'businessId': businessId,
      },
    );
    return RequirementResponse.fromJson(json);
  }

  Future<void> withdrawRequirementResponse(String responseId) =>
      _api.delete<void>('/requirements/responses/$responseId');

  Future<String> openRequirementChat(String responseId, String message) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/requirements/responses/$responseId/chat',
      body: {'message': message},
    );
    return json['conversationId'] as String;
  }

  Future<void> markRequirementFulfilled(
    String listingId, {
    required bool fulfilled,
  }) =>
      _api.put<void>(
        '/requirements/$listingId/fulfilled',
        body: {'fulfilled': fulfilled},
      );

  Future<SellerProfile> sellerProfile(String userId) async {
    final json = await _api.get<Map<String, dynamic>>(
      '/users/$userId/profile',
      auth: false,
    );
    return SellerProfile.fromJson(json);
  }

  Future<List<SavedSearch>> savedSearches() async {
    final json = await _api.get<List<dynamic>>('/saved-searches');
    return json.map((entry) => SavedSearch.fromJson(entry as Map<String, dynamic>)).toList();
  }

  Future<SavedSearch> saveSearch({
    required String label,
    String? query,
    String? type,
    String? categoryId,
    String? cityId,
    num? priceMin,
    num? priceMax,
    List<String> attributes = const [],
  }) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/saved-searches',
      body: {
        'label': label,
        if (query != null && query.isNotEmpty) 'q': query,
        if (type != null) 'type': type,
        if (categoryId != null) 'categoryId': categoryId,
        if (cityId != null && cityId.isNotEmpty) 'cityId': cityId,
        if (priceMin != null) 'priceMin': priceMin,
        if (priceMax != null) 'priceMax': priceMax,
        if (attributes.isNotEmpty) 'attr': attributes,
      },
    );
    return SavedSearch.fromJson(json);
  }

  Future<void> setSavedSearchActive(String id, {required bool active}) =>
      _api.put<void>('/saved-searches/$id/active', body: {'isActive': active});

  Future<void> deleteSavedSearch(String id) => _api.delete<void>('/saved-searches/$id');

  Future<List<City>> cities({bool launchedOnly = false, String? query}) async {
    final json = await _api.get<List<dynamic>>(
      '/locations/cities',
      query: {
        'limit': 50,
        if (launchedOnly) 'launchedOnly': true,
        if (query != null && query.isNotEmpty) 'q': query,
      },
      auth: false,
    );
    return json.map((entry) => City.fromJson(entry as Map<String, dynamic>)).toList();
  }

  /// Resolves device coordinates to a launched city. Null means the user is outside
  /// every launched area — the caller shows the city picker rather than guessing.
  Future<City?> resolveCity(double latitude, double longitude) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/locations/resolve',
      body: {'latitude': latitude, 'longitude': longitude},
      auth: false,
    );
    final cityJson = json['city'];
    if (cityJson == null) return null;
    final city = City.fromJson(cityJson as Map<String, dynamic>);

    // Prefer the nearest locality so "my location" reads "Gachibowli, Hyderabad" rather than
    // just "Hyderabad" — but only when it's genuinely close, so a coarse fix in an area with
    // no mapped locality isn't mislabelled with one kilometres away.
    final localities = (json['nearbyLocalities'] as List?) ?? const [];
    if (localities.isNotEmpty) {
      final nearest = localities.first as Map<String, dynamic>;
      final name = nearest['name'] as String?;
      final distance = (nearest['distanceMeters'] as num?)?.toDouble() ?? double.infinity;
      if (name != null && name.isNotEmpty && distance <= 8000) {
        return City(
          id: city.id,
          name: '$name, ${city.name}',
          slug: city.slug,
          stateName: city.stateName,
          latitude: city.latitude,
          longitude: city.longitude,
          isLaunched: city.isLaunched,
          nameTe: city.nameTe,
          nameHi: city.nameHi,
        );
      }
    }
    return city;
  }

  /// Looks up a pincode. Null means the dataset does not know it, which the caller
  /// reports as a typo rather than an outage — every real Indian pincode is present.
  Future<PincodeArea?> lookupPincode(String code) async {
    if (!RegExp(r'^\d{6}$').hasMatch(code)) return null;

    try {
      final json = await _api.get<Map<String, dynamic>>(
        '/locations/pincodes/$code',
        auth: false,
      );
      return PincodeArea.fromJson(json);
    } catch (_) {
      return null;
    }
  }

  /// The pincode the given coordinates fall in — used when someone grants location but
  /// wants their area stated as a pincode rather than a whole city.
  Future<PincodeArea?> resolvePincode(double latitude, double longitude) async {
    final json = await _api.post<Map<String, dynamic>>(
      '/locations/resolve/pincode',
      body: {'latitude': latitude, 'longitude': longitude},
      auth: false,
    );
    final pincode = json['pincode'];
    return pincode == null ? null : PincodeArea.fromJson(pincode as Map<String, dynamic>);
  }

  /// Seeded and development records can contain a loopback web URL. `localhost`
  /// means the Android phone itself, not the machine serving LocZ, so replace only
  /// loopback origins with the build's public site origin while preserving paths.
  Map<String, dynamic> _portableMediaUrls(Map<String, dynamic> source) {
    final site = Uri.tryParse(Env.siteUrl);

    dynamic rewrite(dynamic value) {
      if (value is Map<String, dynamic>) {
        return value.map((key, child) => MapEntry(key, rewrite(child)));
      }
      if (value is List<dynamic>) return value.map(rewrite).toList();
      if (value is! String || site == null) return value;

      final uri = Uri.tryParse(value);
      if (uri == null ||
          (uri.host != 'localhost' && uri.host != '127.0.0.1') ||
          !uri.path.startsWith('/seed/')) {
        return value;
      }
      return site
          .replace(
            path: uri.path,
            query: uri.hasQuery ? uri.query : null,
            fragment: uri.hasFragment ? uri.fragment : null,
          )
          .toString();
    }

    return rewrite(source) as Map<String, dynamic>;
  }
}

/// A postal code and its centroid. LocZ treats a pincode as a point with a radius,
/// not a boundary — post-office boundaries are not published as usable geometry, and
/// people cross into the next code without noticing.
class PincodeArea {
  const PincodeArea({
    required this.code,
    required this.name,
    required this.districtName,
    required this.stateName,
    required this.latitude,
    required this.longitude,
    this.cityId,
    this.cityName,
    this.listingCount = 0,
  });

  factory PincodeArea.fromJson(Map<String, dynamic> json) => PincodeArea(
        code: json['code'] as String,
        name: json['name'] as String,
        districtName: json['districtName'] as String? ?? '',
        stateName: json['stateName'] as String? ?? '',
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
        cityId: json['cityId'] as String?,
        cityName: json['cityName'] as String?,
        listingCount: (json['listingCount'] as num?)?.toInt() ?? 0,
      );

  final String code;
  final String name;
  final String districtName;
  final String stateName;
  final double latitude;
  final double longitude;
  final String? cityId;
  final String? cityName;
  final int listingCount;

  /// "Madhapur, Hyderabad" — what the user recognises, not the bare number.
  String get label => cityName == null ? '$name, $districtName' : '$name, $cityName';
}
