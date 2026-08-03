import 'package:flutter_test/flutter_test.dart';
import 'package:locz/features/listings/domain/models.dart';

/// Parsing a business exactly as the API sends it.
///
/// This exists because it was missed. `hours` is a list of opening times and the model
/// read it as a string, so every tap on a shop failed with "could not load this business"
/// — the cast threw before anything reached the screen. Nothing in analyze, the widget
/// tests or the API tests could see it: the shapes only meet at runtime.
void main() {
  /// Copied from a real response for `/businesses/:slug`, field for field.
  Map<String, dynamic> payload({Object? hours}) => {
        'id': '019fc0-aaaa',
        'name': 'Konda kiranam-K.S.N',
        'slug': 'konda-kiranam-k-s-n-0009-tn29',
        'categoryName': 'Grocery & kirana',
        'cityName': 'Khammam',
        'addressLine': null,
        'description': 'Grocery & kirana in Khammam.',
        'descriptionIsGenerated': true,
        'attribution': '© Overture Maps Foundation',
        'primaryPhone': '+918341030088',
        'latitude': 17.21595,
        'longitude': 80.42166,
        'listingCount': 0,
        'isOwner': false,
        'verificationStatus': 'UNVERIFIED',
        'hours': hours ?? <dynamic>[],
      };

  test('parses a business whose opening hours are an empty list', () {
    // The shape that broke it. Almost every imported record has no hours recorded.
    final business = BusinessDetail.fromJson(payload());

    expect(business.name, 'Konda kiranam-K.S.N');
    expect(business.hours, isEmpty);
    expect(business.subtitle, 'Grocery & kirana · Khammam');
  });

  test('parses real opening hours', () {
    final business = BusinessDetail.fromJson(
      payload(
        hours: [
          {'dayOfWeek': 1, 'opensAt': '09:30', 'closesAt': '21:00', 'isClosed': false},
          {'dayOfWeek': 0, 'opensAt': '', 'closesAt': '', 'isClosed': true},
        ],
      ),
    );

    expect(business.hours, hasLength(2));
    expect(business.hours.first.label, 'Mon 09:30-21:00');
    expect(business.hours.last.label, 'Sun closed');
  });

  test('treats an imported record as unclaimed', () {
    final business = BusinessDetail.fromJson(payload());

    // Everything on the screen hangs off this. An import must not present itself as a
    // shop that has confirmed its own details.
    expect(business.isClaimed, isFalse);
    expect(business.descriptionIsGenerated, isTrue);
    // The licence credit has to survive parsing, because it has to reach the screen.
    expect(business.attribution, '© Overture Maps Foundation');
  });

  test('survives a response with only the fields the API guarantees', () {
    // Defensive: a directory record with almost nothing filled in must still open.
    final business = BusinessDetail.fromJson({'id': 'b1', 'name': 'Corner Shop', 'slug': 'corner'});

    expect(business.name, 'Corner Shop');
    expect(business.hours, isEmpty);
    expect(business.primaryPhone, isNull);
    expect(business.isClaimed, isFalse);
  });
}
