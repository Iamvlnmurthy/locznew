import 'package:flutter_test/flutter_test.dart';
import 'package:locz/core/observability/mobile_error_reporter.dart';

void main() {
  test('scrubs contact details, secrets and URL queries from error messages', () {
    const message = 'buyer@example.com +919876543210 token=secret '
        'https://locz.in/search?q=private words';

    final scrubbed = MobileErrorReporter.sanitizeMessage(message);

    expect(scrubbed, contains('[email]'));
    expect(scrubbed, contains('[phone]'));
    expect(scrubbed, contains('token=[redacted]'));
    expect(scrubbed, contains('https://locz.in/search?[redacted]'));
    expect(scrubbed, isNot(contains('buyer@example.com')));
    expect(scrubbed, isNot(contains('9876543210')));
    expect(scrubbed, isNot(contains('private words')));
  });

  test('is disabled when no build-time DSN is supplied', () {
    expect(MobileErrorReporter(dsn: '').isEnabled, isFalse);
  });

  test('rejects malformed DSNs without throwing during startup', () {
    expect(MobileErrorReporter(dsn: 'not a dsn').isEnabled, isFalse);
  });
}
