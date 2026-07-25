import 'dart:io';

import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../domain/models.dart';

/// All listing, feed and catalogue reads and writes.
///
/// The repository is the only place that knows API paths — screens depend on this, so a
/// route change is one edit rather than a search across widgets.
class ListingRepository {
  ListingRepository(this._api);

  final ApiClient _api;

  Future<Feed> feed({String? cityId, double? latitude, double? longitude}) async {
    final json = await _api.get<Map<String, dynamic>>(
      '/feed',
      query: {
        'limit': 10,
        if (cityId != null) 'cityId': cityId,
        if (latitude != null) 'latitude': latitude,
        if (longitude != null) 'longitude': longitude,
      },
    );
    return Feed.fromJson(json);
  }

  Future<List<ListingSummary>> search({
    String? query,
    String? cityId,
    String? categoryId,
    String? type,
    double? latitude,
    double? longitude,
    int? radiusKm,
    num? priceMin,
    num? priceMax,
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
        if (categoryId != null) 'categoryId': categoryId,
        if (type != null) 'type': type,
        if (radiusKm != null && latitude != null && longitude != null) ...{
          'radiusKm': radiusKm,
          'latitude': latitude,
          'longitude': longitude,
        },
        if (priceMin != null) 'priceMin': priceMin,
        if (priceMax != null) 'priceMax': priceMax,
      },
    );

    return (json['items'] as List<dynamic>)
        .map((entry) => ListingSummary.fromJson(entry as Map<String, dynamic>))
        .toList();
  }

  Future<ListingDetail> detail(String slug) async {
    final json = await _api.get<Map<String, dynamic>>('/listings/$slug');
    return ListingDetail.fromJson(json);
  }

  Future<List<ListingSummary>> myListings() async {
    final json = await _api.get<Map<String, dynamic>>('/listings/mine', query: {'limit': 50});
    return (json['items'] as List<dynamic>)
        .map((entry) => ListingSummary.fromJson(entry as Map<String, dynamic>))
        .toList();
  }

  Future<List<ListingSummary>> savedListings() async {
    final json = await _api.get<Map<String, dynamic>>('/listings/saved', query: {'limit': 50});
    return (json['items'] as List<dynamic>)
        .map((entry) => ListingSummary.fromJson(entry as Map<String, dynamic>))
        .toList();
  }

  Future<bool> toggleSave(String listingId, {required bool save}) async {
    final json = save
        ? await _api.post<Map<String, dynamic>>('/listings/$listingId/save')
        : await _api.delete<Map<String, dynamic>>('/listings/$listingId/save');
    return json['saved'] as bool;
  }

  Future<Map<String, dynamic>> createListing({
    required String title,
    required String description,
    required String categoryId,
    required String cityId,
    required String condition,
    num? price,
    bool isFree = false,
    bool isNegotiable = false,
    String contactPreference = 'IN_APP_ONLY',
  }) {
    return _api.post<Map<String, dynamic>>(
      '/listings',
      body: {
        'type': 'PRODUCT',
        'title': title,
        'description': description,
        'categoryId': categoryId,
        'cityId': cityId,
        'contactPreference': contactPreference,
        'showPhonePublicly': contactPreference != 'IN_APP_ONLY',
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
      options: Options(headers: {'Content-Type': mimeType, Headers.contentLengthHeader: length}),
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
    final city = json['city'];
    return city == null ? null : City.fromJson(city as Map<String, dynamic>);
  }
}
