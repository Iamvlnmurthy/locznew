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
        publishedAt: json['publishedAt'] == null
            ? null
            : DateTime.tryParse(json['publishedAt'] as String),
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
        contactPreference:
            json['contactPreference'] as String? ?? 'IN_APP_ONLY',
        marketplace: (json['marketplace'] as Map<String, dynamic>?) ?? const {},
        buyerRequirement:
            (json['buyerRequirement'] as Map<String, dynamic>?) ?? const {},
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

  factory RequirementResponse.fromJson(Map<String, dynamic> json) =>
      RequirementResponse(
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
  });

  final String cityId;
  final String cityName;
  final List<FeedSection> sections;

  factory Feed.fromJson(Map<String, dynamic> json) => Feed(
        cityId: json['cityId'] as String,
        cityName: json['cityName'] as String,
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

  factory CategoryAttributeOption.fromJson(Map<String, dynamic> json) =>
      CategoryAttributeOption(
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

  factory CategoryAttribute.fromJson(Map<String, dynamic> json) =>
      CategoryAttribute(
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
              (entry) =>
                  CategoryAttribute.fromJson(entry as Map<String, dynamic>),
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

  factory ConversationSummary.fromJson(Map<String, dynamic> json) =>
      ConversationSummary(
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
