// Domain models use hand-written `fromJson` rather than generated code: the API is the
// contract, and a small explicit parser makes it obvious when a field is optional. Every
// nullable field here is nullable in the API too — none of it is defensive guessing.

class ListingSummary {
  const ListingSummary({
    required this.id,
    required this.slug,
    required this.type,
    required this.title,
    required this.status,
    required this.price,
    required this.isNegotiable,
    required this.cityName,
    required this.localityName,
    required this.thumbUrl,
    required this.isFeatured,
    required this.viewCount,
    required this.publishedAt,
    this.distanceMeters,
    this.isSaved,
  });

  final String id;
  final String slug;
  final String type;
  final String title;
  final String status;
  final num? price;
  final bool isNegotiable;
  final String cityName;
  final String? localityName;
  final String? thumbUrl;
  final bool isFeatured;
  final int viewCount;
  final DateTime? publishedAt;
  final num? distanceMeters;
  final bool? isSaved;

  bool get isFree => price == 0;
  bool get isSold => status == 'SOLD';

  factory ListingSummary.fromJson(Map<String, dynamic> json) => ListingSummary(
        id: json['id'] as String,
        slug: json['slug'] as String,
        type: json['type'] as String,
        title: json['title'] as String,
        status: json['status'] as String,
        price: json['price'] as num?,
        isNegotiable: json['isNegotiable'] as bool? ?? false,
        cityName: json['cityName'] as String? ?? '',
        localityName: json['localityName'] as String?,
        thumbUrl: json['thumbUrl'] as String?,
        isFeatured: json['isFeatured'] as bool? ?? false,
        viewCount: json['viewCount'] as int? ?? 0,
        publishedAt:
            json['publishedAt'] == null ? null : DateTime.tryParse(json['publishedAt'] as String),
        distanceMeters: json['distanceMeters'] as num?,
        isSaved: json['isSaved'] as bool?,
      );
}

class ListingMedia {
  const ListingMedia({
    required this.id,
    this.thumbUrl,
    this.cardUrl,
    this.fullUrl,
  });

  final String id;
  final String? thumbUrl;
  final String? cardUrl;
  final String? fullUrl;

  factory ListingMedia.fromJson(Map<String, dynamic> json) => ListingMedia(
        id: json['id'] as String,
        thumbUrl: json['thumbUrl'] as String?,
        cardUrl: json['cardUrl'] as String?,
        fullUrl: json['fullUrl'] as String?,
      );
}

class ListingOwner {
  const ListingOwner({
    required this.id,
    required this.displayName,
    required this.memberSince,
    this.phone,
  });

  final String id;
  final String displayName;
  final DateTime memberSince;

  /// Populated only when the owner chose to publish their number.
  final String? phone;

  factory ListingOwner.fromJson(Map<String, dynamic> json) => ListingOwner(
        id: json['id'] as String,
        displayName: json['displayName'] as String,
        memberSince: DateTime.parse(json['memberSince'] as String),
        phone: json['phone'] as String?,
      );
}

class ListingDetail {
  const ListingDetail({
    required this.summary,
    required this.description,
    required this.categoryId,
    required this.categoryName,
    required this.owner,
    required this.media,
    required this.attributes,
    required this.saveCount,
    this.latitude,
    this.longitude,
    this.addressLine,
    this.cityId,
    this.pincodeCode,
    this.contactPreference = 'IN_APP_ONLY',
    this.marketplace = const {},
    this.buyerRequirement = const {},
  });

  final ListingSummary summary;
  final String description;
  final String categoryId;
  final String categoryName;
  final ListingOwner owner;
  final List<ListingMedia> media;
  final Map<String, dynamic> attributes;
  final int saveCount;
  final double? latitude;
  final double? longitude;
  final String? addressLine;
  final String? cityId;
  final String? pincodeCode;
  final String contactPreference;
  final Map<String, dynamic> marketplace;
  final Map<String, dynamic> buyerRequirement;

  factory ListingDetail.fromJson(Map<String, dynamic> json) => ListingDetail(
        summary: ListingSummary.fromJson(json),
        description: json['description'] as String? ?? '',
        categoryId: json['categoryId'] as String? ?? '',
        categoryName: json['categoryName'] as String? ?? '',
        owner: ListingOwner.fromJson(json['owner'] as Map<String, dynamic>),
        media: (json['media'] as List<dynamic>? ?? [])
            .map(
              (entry) => ListingMedia.fromJson(entry as Map<String, dynamic>),
            )
            .toList(),
        attributes: (json['attributes'] as Map<String, dynamic>?) ?? const {},
        saveCount: json['saveCount'] as int? ?? 0,
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        addressLine: json['addressLine'] as String?,
        cityId: json['cityId'] as String?,
        pincodeCode: json['pincodeCode'] as String?,
        contactPreference: json['contactPreference'] as String? ?? 'IN_APP_ONLY',
        marketplace: (json['marketplace'] as Map<String, dynamic>?) ?? const {},
        buyerRequirement: (json['buyerRequirement'] as Map<String, dynamic>?) ?? const {},
      );
}

class RequirementResponse {
  const RequirementResponse({
    required this.id,
    required this.listingId,
    required this.responderId,
    required this.kind,
    required this.createdAt,
    this.businessId,
    this.offeredPrice,
    this.availableFrom,
    this.message,
    this.offeredListingId,
    this.conversationId,
  });

  final String id;
  final String listingId;
  final String responderId;
  final String? businessId;
  final String kind;
  final num? offeredPrice;
  final DateTime? availableFrom;
  final String? message;
  final String? offeredListingId;
  final String? conversationId;
  final DateTime createdAt;

  factory RequirementResponse.fromJson(Map<String, dynamic> json) => RequirementResponse(
        id: json['id'] as String,
        listingId: json['listingId'] as String,
        responderId: json['responderId'] as String,
        businessId: json['businessId'] as String?,
        kind: json['kind'] as String,
        offeredPrice: json['offeredPrice'] as num?,
        availableFrom: json['availableFrom'] == null
            ? null
            : DateTime.tryParse(json['availableFrom'] as String),
        message: json['message'] as String?,
        offeredListingId: json['offeredListingId'] as String?,
        conversationId: json['conversationId'] as String?,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class SellerProfile {
  const SellerProfile({
    required this.id,
    required this.displayName,
    required this.memberSince,
    required this.publishedListings,
    required this.soldListings,
    this.bio,
    this.responseRate,
    this.medianResponseMinutes,
  });

  final String id;
  final String displayName;
  final String? bio;
  final DateTime memberSince;
  final int publishedListings;
  final int soldListings;
  final num? responseRate;
  final num? medianResponseMinutes;

  factory SellerProfile.fromJson(Map<String, dynamic> json) => SellerProfile(
        id: json['id'] as String,
        displayName: json['displayName'] as String,
        bio: json['bio'] as String?,
        memberSince: DateTime.parse(json['memberSince'] as String),
        publishedListings: (json['publishedListings'] as num?)?.toInt() ?? 0,
        soldListings: (json['soldListings'] as num?)?.toInt() ?? 0,
        responseRate: json['responseRate'] as num?,
        medianResponseMinutes: json['medianResponseMinutes'] as num?,
      );
}

class SavedSearch {
  const SavedSearch({
    required this.id,
    required this.label,
    required this.filters,
    required this.isActive,
    required this.createdAt,
    this.query,
    this.cityId,
    this.lastMatchedAt,
  });

  final String id;
  final String label;
  final String? query;
  final String? cityId;
  final Map<String, dynamic> filters;
  final bool isActive;
  final DateTime? lastMatchedAt;
  final DateTime createdAt;

  factory SavedSearch.fromJson(Map<String, dynamic> json) => SavedSearch(
        id: json['id'] as String,
        label: json['label'] as String,
        query: json['q'] as String?,
        cityId: json['cityId'] as String?,
        filters: Map<String, dynamic>.from(json['filters'] as Map? ?? const {}),
        isActive: json['isActive'] as bool? ?? true,
        lastMatchedAt: json['lastMatchedAt'] == null
            ? null
            : DateTime.tryParse(json['lastMatchedAt'] as String),
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

class FeedSection {
  const FeedSection({required this.key, required this.items});

  final String key;
  final List<ListingSummary> items;

  factory FeedSection.fromJson(Map<String, dynamic> json) => FeedSection(
        key: json['key'] as String,
        items: (json['items'] as List<dynamic>)
            .map(
              (entry) => ListingSummary.fromJson(entry as Map<String, dynamic>),
            )
            .toList(),
      );
}

class Feed {
  const Feed({
    required this.cityId,
    required this.cityName,
    required this.sections,
    this.radiusWidened = false,
  });

  final String cityId;
  final String cityName;
  final List<FeedSection> sections;

  /// True when the chosen radius matched nothing and the feed was widened to the whole city.
  final bool radiusWidened;

  factory Feed.fromJson(Map<String, dynamic> json) => Feed(
        cityId: json['cityId'] as String,
        cityName: json['cityName'] as String,
        radiusWidened: json['radiusWidened'] as bool? ?? false,
        sections: (json['sections'] as List<dynamic>)
            .map((entry) => FeedSection.fromJson(entry as Map<String, dynamic>))
            .toList(),
      );
}

class City {
  const City({
    required this.id,
    required this.name,
    required this.slug,
    required this.stateName,
    required this.latitude,
    required this.longitude,
    required this.isLaunched,
    this.nameTe,
    this.nameHi,
  });

  final String id;
  final String name;
  final String slug;
  final String stateName;
  final double latitude;
  final double longitude;
  final bool isLaunched;
  final String? nameTe;
  final String? nameHi;

  factory City.fromJson(Map<String, dynamic> json) => City(
        id: json['id'] as String,
        name: json['name'] as String,
        slug: json['slug'] as String,
        stateName: json['stateName'] as String? ?? '',
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
        isLaunched: json['isLaunched'] as bool? ?? false,
        nameTe: json['nameTe'] as String?,
        nameHi: json['nameHi'] as String?,
      );
}

class CategoryAttributeOption {
  const CategoryAttributeOption({
    required this.value,
    required this.label,
    this.labelTe,
    this.labelHi,
  });

  final String value;
  final String label;
  final String? labelTe;
  final String? labelHi;

  factory CategoryAttributeOption.fromJson(Map<String, dynamic> json) => CategoryAttributeOption(
        value: json['value'] as String,
        label: json['label'] as String,
        labelTe: json['labelTe'] as String?,
        labelHi: json['labelHi'] as String?,
      );
}

class CategoryAttribute {
  const CategoryAttribute({
    required this.key,
    required this.label,
    required this.dataType,
    required this.options,
    required this.isRequired,
    required this.isFilterable,
    this.labelTe,
    this.labelHi,
    this.unit,
    this.minValue,
    this.maxValue,
  });

  final String key;
  final String label;
  final String? labelTe;
  final String? labelHi;
  final String dataType;
  final List<CategoryAttributeOption> options;
  final String? unit;
  final bool isRequired;
  final bool isFilterable;
  final num? minValue;
  final num? maxValue;

  factory CategoryAttribute.fromJson(Map<String, dynamic> json) => CategoryAttribute(
        key: json['key'] as String,
        label: json['label'] as String,
        labelTe: json['labelTe'] as String?,
        labelHi: json['labelHi'] as String?,
        dataType: json['dataType'] as String,
        options: (json['options'] as List<dynamic>? ?? [])
            .map(
              (entry) => CategoryAttributeOption.fromJson(
                entry as Map<String, dynamic>,
              ),
            )
            .toList(),
        unit: json['unit'] as String?,
        isRequired: json['isRequired'] as bool? ?? false,
        isFilterable: json['isFilterable'] as bool? ?? false,
        minValue: json['minValue'] as num?,
        maxValue: json['maxValue'] as num?,
      );
}

class Category {
  const Category({
    required this.id,
    required this.name,
    required this.slug,
    required this.children,
    this.nameTe,
    this.nameHi,
    this.iconKey,
    this.attributes = const [],
  });

  final String id;
  final String name;
  final String slug;
  final List<Category> children;
  final String? nameTe;
  final String? nameHi;
  final String? iconKey;
  final List<CategoryAttribute> attributes;

  factory Category.fromJson(Map<String, dynamic> json) => Category(
        id: json['id'] as String,
        name: json['name'] as String,
        slug: json['slug'] as String,
        nameTe: json['nameTe'] as String?,
        nameHi: json['nameHi'] as String?,
        iconKey: json['iconKey'] as String?,
        attributes: (json['attributes'] as List<dynamic>? ?? [])
            .map(
              (entry) => CategoryAttribute.fromJson(entry as Map<String, dynamic>),
            )
            .toList(),
        children: (json['children'] as List<dynamic>? ?? [])
            .map((entry) => Category.fromJson(entry as Map<String, dynamic>))
            .toList(),
      );
}

class ConversationSummary {
  const ConversationSummary({
    required this.id,
    required this.otherPartyName,
    required this.unreadCount,
    this.listingTitle,
    this.listingThumbUrl,
    this.lastMessagePreview,
    this.lastMessageAt,
  });

  final String id;
  final String otherPartyName;
  final int unreadCount;
  final String? listingTitle;
  final String? listingThumbUrl;
  final String? lastMessagePreview;
  final DateTime? lastMessageAt;

  factory ConversationSummary.fromJson(Map<String, dynamic> json) => ConversationSummary(
        id: json['id'] as String,
        otherPartyName: json['otherPartyName'] as String,
        unreadCount: json['unreadCount'] as int? ?? 0,
        listingTitle: json['listingTitle'] as String?,
        listingThumbUrl: json['listingThumbUrl'] as String?,
        lastMessagePreview: json['lastMessagePreview'] as String?,
        lastMessageAt: json['lastMessageAt'] == null
            ? null
            : DateTime.tryParse(json['lastMessageAt'] as String),
      );
}

class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.body,
    required this.isMine,
    required this.createdAt,
  });

  final String id;
  final String body;
  final bool isMine;
  final DateTime createdAt;

  factory ChatMessage.fromJson(Map<String, dynamic> json) => ChatMessage(
        id: json['id'] as String,
        body: json['body'] as String,
        isMine: json['isMine'] as bool? ?? false,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );
}

/// A business from the directory, as search returns it.
///
/// Deliberately thin. The directory holds 3.4 million records and a search result only
/// needs enough to decide whether to tap: who they are, what they do, and where. Anything
/// more is a second request the user may never want.
class BusinessSummary {
  const BusinessSummary({
    required this.id,
    required this.slug,
    required this.name,
    this.categoryName,
    this.localityName,
    this.cityName,
    this.pincode,
    this.logoUrl,
    this.addressLine,
    this.listingCount = 0,
    this.distanceMeters,
    this.latitude,
    this.longitude,
    this.isVerified = false,
    this.isClaimed = false,
  });

  final String id;
  final String slug;
  final String name;
  final String? categoryName;
  final String? localityName;
  final String? cityName;
  final String? pincode;
  final String? logoUrl;
  final String? addressLine;
  final int listingCount;

  /// Present only for nearby (geo) results — metres from the viewer.
  final num? distanceMeters;

  /// For a one-tap directions link on the card; null for records without a fixed point.
  final double? latitude;
  final double? longitude;

  /// Someone at LocZ confirmed this record. Not the same as claimed.
  final bool isVerified;

  /// The owner has taken it over, so what it says is theirs rather than imported.
  final bool isClaimed;

  /// "Grocery · Kaimur" — whichever parts exist, joined without empty gaps.
  String get subtitle => [
        categoryName,
        localityName ?? pincode ?? cityName,
      ].whereType<String>().where((part) => part.trim().isNotEmpty).join(' · ');

  factory BusinessSummary.fromJson(Map<String, dynamic> json) => BusinessSummary(
        id: json['id'] as String,
        slug: json['slug'] as String? ?? '',
        name: json['name'] as String? ?? '',
        categoryName: json['categoryName'] as String?,
        localityName: json['localityName'] as String?,
        cityName: json['cityName'] as String?,
        pincode: json['pincode'] as String?,
        logoUrl: json['logoUrl'] as String?,
        addressLine: json['addressLine'] as String?,
        listingCount: json['listingCount'] as int? ?? 0,
        distanceMeters: json['distanceMeters'] as num?,
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        // /search/businesses sends isVerified; /businesses(/nearby) sends verificationStatus.
        isVerified: json['isVerified'] as bool? ?? (json['verificationStatus'] == 'VERIFIED'),
        isClaimed: json['isClaimed'] as bool? ?? (json['claimStatus'] == 'CLAIMED'),
      );
}

/// What one search returns: the ads, and the shops.
///
/// Kept apart rather than merged. A shop and a for-sale ad do not answer the same
/// question, and the API scores them in separate indexes for that reason — flattening
/// them here would invent a ranking neither side computed.
class SearchResults {
  const SearchResults({
    required this.listings,
    this.businesses = const [],
    this.businessTotal = 0,
  });

  final List<ListingSummary> listings;
  final List<BusinessSummary> businesses;

  /// How many businesses matched in total, not how many were returned.
  final int businessTotal;
}

/// One day's opening hours.
///
/// The API sends a list of these, not a string. Reading it as a string is what made every
/// business detail screen fail with "could not load this business" — the cast threw before
/// anything reached the widget.
class BusinessHour {
  const BusinessHour({
    required this.dayOfWeek,
    required this.opensAt,
    required this.closesAt,
    this.isClosed = false,
  });

  /// 0 = Sunday, matching the API.
  final int dayOfWeek;
  final String opensAt;
  final String closesAt;
  final bool isClosed;

  static const _dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  String get label {
    final day = dayOfWeek >= 0 && dayOfWeek < 7 ? _dayNames[dayOfWeek] : '';
    return isClosed ? '$day closed' : '$day $opensAt-$closesAt';
  }

  factory BusinessHour.fromJson(Map<String, dynamic> json) => BusinessHour(
        dayOfWeek: (json['dayOfWeek'] as num?)?.toInt() ?? 0,
        opensAt: json['opensAt'] as String? ?? '',
        closesAt: json['closesAt'] as String? ?? '',
        isClosed: json['isClosed'] as bool? ?? false,
      );
}

/// A directory business, in full.
///
/// `attribution` is not decoration. The directory is built from OpenStreetMap (ODbL-1.0)
/// and Overture Maps (CDLA-Permissive-2.0), and both licences require the credit to appear
/// wherever the data is shown. Dropping it from a screen is a licence breach, not a tidy-up.
class BusinessDetail {
  const BusinessDetail({
    required this.id,
    required this.name,
    required this.slug,
    this.categoryName,
    this.categoryId,
    this.cityName,
    this.cityId,
    this.localityName,
    this.landmark,
    this.pincode,
    this.addressLine,
    this.description,
    this.descriptionIsGenerated = false,
    this.attribution,
    this.primaryPhone,
    this.whatsappNumber,
    this.website,
    this.hours = const [],
    this.latitude,
    this.longitude,
    this.listingCount = 0,
    this.isOwner = false,
    this.verificationStatus,
  });

  final String id;
  final String name;
  final String slug;
  final String? categoryName;
  final String? categoryId;
  final String? cityName;
  final String? cityId;
  final String? localityName;
  final String? landmark;
  final String? pincode;
  final String? addressLine;
  final String? description;

  /// Written by the platform from the category and place, not by the owner. Said plainly
  /// on screen so nobody mistakes it for a shop describing itself.
  final bool descriptionIsGenerated;

  /// Required credit for the open data this record came from.
  final String? attribution;

  final String? primaryPhone;
  final String? whatsappNumber;
  final String? website;
  final List<BusinessHour> hours;
  final double? latitude;
  final double? longitude;
  final int listingCount;
  final bool isOwner;
  final String? verificationStatus;

  bool get isClaimed => verificationStatus == 'VERIFIED' || isOwner;

  String get subtitle => [
        categoryName,
        cityName,
      ].whereType<String>().where((part) => part.trim().isNotEmpty).join(' · ');

  factory BusinessDetail.fromJson(Map<String, dynamic> json) => BusinessDetail(
        id: json['id'] as String,
        name: json['name'] as String? ?? '',
        slug: json['slug'] as String? ?? '',
        categoryName: json['categoryName'] as String?,
        categoryId: json['categoryId'] as String?,
        cityName: json['cityName'] as String?,
        cityId: json['cityId'] as String?,
        localityName: json['localityName'] as String?,
        landmark: json['landmark'] as String?,
        pincode: json['pincode'] as String?,
        addressLine: json['addressLine'] as String?,
        description: json['description'] as String?,
        descriptionIsGenerated: json['descriptionIsGenerated'] as bool? ?? false,
        attribution: json['attribution'] as String?,
        primaryPhone: json['primaryPhone'] as String?,
        whatsappNumber: json['whatsappNumber'] as String?,
        website: json['website'] as String?,
        hours: (json['hours'] as List<dynamic>? ?? const [])
            .map(
              (entry) => BusinessHour.fromJson(entry as Map<String, dynamic>),
            )
            .toList(),
        latitude: (json['latitude'] as num?)?.toDouble(),
        longitude: (json['longitude'] as num?)?.toDouble(),
        listingCount: (json['listingCount'] as num?)?.toInt() ?? 0,
        isOwner: json['isOwner'] as bool? ?? false,
        verificationStatus: json['verificationStatus'] as String?,
      );
}

/// A LocZ-regenerated news card from `/news/feed`. Content is our OWN rewrite — the card links to
/// the in-app detail screen (`/news/:slug`), never out to the source publisher.
class NewsCard {
  const NewsCard({
    required this.slug,
    required this.title,
    required this.category,
    this.summary,
    this.distanceKm,
    this.publishedAt,
    this.sources = 1,
  });

  final String slug;
  final String title;
  final String category;
  final String? summary;
  final double? distanceKm;
  final String? publishedAt;

  /// How many source articles collapsed into this card (1 = single report).
  final int sources;
}

/// A full LocZ-regenerated news event (`/news/:slug`) with its source attributions.
class NewsEvent {
  const NewsEvent({
    required this.slug,
    required this.title,
    required this.categories,
    this.summary,
    this.publishedAt,
    this.sources = const [],
  });

  final String slug;
  final String title;
  final List<String> categories;
  final String? summary;
  final String? publishedAt;
  final List<({String? publisher, String? url})> sources;
}
