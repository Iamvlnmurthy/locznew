import '../../../core/network/api_client.dart';

class CityGuideRepository {
  const CityGuideRepository(this._api);

  final ApiClient _api;

  Future<CityGuideData> load(String slug) async {
    final json = await _api.get<Map<String, dynamic>>(
      '/locations/cities/${Uri.encodeComponent(slug)}/content',
      auth: false,
    );
    return CityGuideData.fromJson(json);
  }
}

class CityGuideData {
  const CityGuideData({
    required this.city,
    required this.tier,
    required this.sections,
    required this.images,
    this.population,
    this.content,
  });

  factory CityGuideData.fromJson(Map<String, dynamic> json) => CityGuideData(
        city: CityGuideCity.fromJson(json['city'] as Map<String, dynamic>),
        tier: (json['tier'] as num?)?.toInt() ?? 3,
        population: (json['population'] as num?)?.toInt(),
        content: json['content'] == null
            ? null
            : CityGuideContent.fromJson(
                json['content'] as Map<String, dynamic>,
              ),
        sections: (json['sections'] as List<dynamic>? ?? const [])
            .map(
              (item) => CityGuideSection.fromJson(item as Map<String, dynamic>),
            )
            .toList(growable: false),
        images: (json['images'] as List<dynamic>? ?? const [])
            .map(
              (item) => CityGuideImage.fromJson(item as Map<String, dynamic>),
            )
            .toList(growable: false),
      );

  final CityGuideCity city;
  final int tier;
  final int? population;
  final CityGuideContent? content;
  final List<CityGuideSection> sections;
  final List<CityGuideImage> images;

  CityGuideImage? imageOfKind(String kind) {
    for (final image in images) {
      if (image.kind == kind) return image;
    }
    return null;
  }

  List<CityGuideImage> imagesOfKind(String kind) =>
      images.where((image) => image.kind == kind).toList(growable: false);
}

class CityGuideCity {
  const CityGuideCity({
    required this.id,
    required this.name,
    required this.slug,
    required this.stateName,
    required this.latitude,
    required this.longitude,
    this.districtName,
  });

  factory CityGuideCity.fromJson(Map<String, dynamic> json) => CityGuideCity(
        id: json['id'] as String,
        name: json['name'] as String,
        slug: json['slug'] as String,
        stateName: json['stateName'] as String? ?? '',
        districtName: json['districtName'] as String?,
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
      );

  final String id;
  final String name;
  final String slug;
  final String stateName;
  final String? districtName;
  final double latitude;
  final double longitude;
}

class CityGuideContent {
  const CityGuideContent({
    this.shortIntro,
    this.description,
    this.famousFor,
    this.character,
    this.climate,
    this.knownFor,
  });

  factory CityGuideContent.fromJson(Map<String, dynamic> json) => CityGuideContent(
        shortIntro: json['shortIntro'] as String?,
        description: json['description'] as String?,
        famousFor: json['famousFor'] as String?,
        character: json['character'] as String?,
        climate: json['climate'] as String?,
        knownFor: json['knownFor'] as String?,
      );

  final String? shortIntro;
  final String? description;
  final String? famousFor;
  final String? character;
  final String? climate;
  final String? knownFor;
}

class CityGuideSection {
  const CityGuideSection({
    required this.key,
    required this.title,
    required this.content,
    this.sourceUrl,
    this.license,
    this.source,
  });

  factory CityGuideSection.fromJson(Map<String, dynamic> json) => CityGuideSection(
        key: json['key'] as String? ?? 'overview',
        title: json['title'] as String? ?? '',
        content: json['content'] as String? ?? '',
        sourceUrl: json['sourceUrl'] as String?,
        license: json['license'] as String?,
        source: json['source'] as String?,
      );

  final String key;
  final String title;
  final String content;
  final String? sourceUrl;
  final String? license;
  final String? source;
}

class CityGuideImage {
  const CityGuideImage({
    required this.kind,
    required this.url,
    this.title,
    this.attribution,
    this.license,
    this.source,
  });

  factory CityGuideImage.fromJson(Map<String, dynamic> json) => CityGuideImage(
        kind: json['kind'] as String? ?? 'ATTRACTION',
        url: json['url'] as String,
        title: json['title'] as String?,
        attribution: json['attribution'] as String?,
        license: json['license'] as String?,
        source: json['source'] as String?,
      );

  final String kind;
  final String url;
  final String? title;
  final String? attribution;
  final String? license;
  final String? source;
}
