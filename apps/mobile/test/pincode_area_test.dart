import 'package:flutter_test/flutter_test.dart';
import 'package:locz/features/listings/data/listing_repository.dart';

/// The pincode area model is what the whole "enter your pincode" flow rests on — a
/// wrong centroid or a wrong label sends someone to the wrong town.
void main() {
  Map<String, dynamic> payload({String? cityId, String? cityName}) => {
        'code': '500081',
        'name': 'Madhapur',
        'districtName': 'Hyderabad',
        'stateName': 'Telangana',
        'latitude': 17.4411,
        'longitude': 78.3885,
        'cityId': cityId,
        'cityName': cityName,
        'listingCount': 42,
      };

  group('PincodeArea', () {
    test('parses the API payload', () {
      final area = PincodeArea.fromJson(
        payload(cityId: 'city-1', cityName: 'Hyderabad'),
      );

      expect(area.code, '500081');
      expect(area.latitude, closeTo(17.4411, 0.0001));
      expect(area.longitude, closeTo(78.3885, 0.0001));
      expect(area.listingCount, 42);
    });

    test('labels a linked pincode with its city', () {
      final area = PincodeArea.fromJson(
        payload(cityId: 'city-1', cityName: 'Hyderabad'),
      );

      expect(area.label, 'Madhapur, Hyderabad');
    });

    test('labels an unlinked pincode with its district', () {
      // Most of India is outside a launched city. Those codes still have to read as a
      // place the user recognises rather than as a bare number.
      final area = PincodeArea.fromJson(payload());

      expect(area.cityId, isNull);
      expect(area.label, 'Madhapur, Hyderabad');
    });

    test('survives a payload missing the optional fields', () {
      final area = PincodeArea.fromJson({
        'code': '110001',
        'name': 'Connaught Place',
        'latitude': 28.6328,
        'longitude': 77.2197,
      });

      expect(area.districtName, '');
      expect(area.listingCount, 0);
    });
  });
}
