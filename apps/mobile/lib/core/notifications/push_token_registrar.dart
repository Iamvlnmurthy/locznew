/// Coordinates two events that can arrive in either order: Firebase issuing a token,
/// and the stored user session finishing restoration.
class PushTokenRegistrar {
  PushTokenRegistrar(this._register);

  final Future<bool> Function(String token) _register;

  String? _latestToken;
  String? _registeredToken;
  bool _signedIn = false;
  bool _registering = false;
  bool _flushAgain = false;

  Future<void> receiveToken(String token) async {
    if (token.isEmpty) return;
    if (_latestToken != token) _registeredToken = null;
    _latestToken = token;
    await _flush();
  }

  Future<void> setSignedIn(bool value) async {
    if (_signedIn != value && !value) _registeredToken = null;
    _signedIn = value;
    await _flush();
  }

  Future<void> retry() => _flush();

  Future<void> _flush() async {
    if (_registering) {
      _flushAgain = true;
      return;
    }

    _registering = true;
    try {
      do {
        _flushAgain = false;
        final token = _latestToken;
        if (!_signedIn || token == null || token == _registeredToken) continue;

        final registered = await _register(token);
        if (registered && _signedIn && token == _latestToken) {
          _registeredToken = token;
        }
      } while (_flushAgain);
    } finally {
      _registering = false;
    }
  }
}
