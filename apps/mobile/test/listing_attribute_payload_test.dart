import 'package:flutter_test/flutter_test.dart';
import 'package:locz/core/network/api_client.dart';
import 'package:locz/core/storage/token_storage.dart';
import 'package:locz/features/listings/data/listing_repository.dart';

void main() {
  test('editing sends the complete attribute set when the form resolved definitions', () async {
    final api = _CapturingApiClient();
    final repository = ListingRepository(api);
    final attributes = <Map<String, dynamic>>[
      {'key': 'brand', 'value': 'SAMSUNG'},
      {'key': 'ram_gb', 'value': 8},
      {
        'key': 'features',
        'value': ['DUAL_SIM', 'NFC'],
      },
    ];

    await repository.updateListing(
      listingId: 'listing-1',
      title: 'Samsung phone',
      description: 'A carefully used phone in good condition.',
      categoryId: 'mobile-phones',
      cityId: 'hyderabad',
      condition: 'GOOD',
      attributes: attributes,
    );

    expect(api.lastPatchBody?['attributes'], attributes);
  });

  test('editing omits attributes when definitions did not load', () async {
    final api = _CapturingApiClient();
    final repository = ListingRepository(api);

    await repository.updateListing(
      listingId: 'listing-1',
      title: 'Samsung phone',
      description: 'A carefully used phone in good condition.',
      categoryId: 'mobile-phones',
      cityId: 'hyderabad',
      condition: 'GOOD',
    );

    expect(api.lastPatchBody, isNot(contains('attributes')));
  });
}

class _CapturingApiClient extends ApiClient {
  _CapturingApiClient() : super(TokenStorage());

  Map<String, dynamic>? lastPatchBody;

  @override
  Future<T> patch<T>(String path, {Object? body}) async {
    lastPatchBody = Map<String, dynamic>.from(body! as Map<String, dynamic>);
    return <String, dynamic>{
      'id': 'listing-1',
      'slug': 'samsung-phone',
      'status': 'PENDING_REVIEW',
    } as T;
  }
}
