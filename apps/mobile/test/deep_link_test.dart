import 'package:flutter_test/flutter_test.dart';
import 'package:locz/core/router/app_router.dart';

void main() {
  test('normalizes a LocZ listing scheme into the shared listing route', () {
    final uri = normalizeLoczDeepLink(
      Uri.parse('locz://ad/iphone-13-blue?source=poster'),
    );

    expect(uri.path, '/ad/iphone-13-blue');
    expect(uri.queryParameters, {'source': 'poster'});
  });

  test('leaves verified web links unchanged', () {
    final uri = Uri.parse('https://locz.in/ad/iphone-13-blue');

    expect(normalizeLoczDeepLink(uri), uri);
  });

  test('does not claim unrelated custom-scheme links', () {
    final uri = Uri.parse('locz://business/madhapur-cafe');

    expect(normalizeLoczDeepLink(uri), uri);
  });
}
