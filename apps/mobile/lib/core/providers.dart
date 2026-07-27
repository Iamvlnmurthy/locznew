import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/auth/data/auth_repository.dart';
import '../features/chat/data/chat_repository.dart';
import '../features/listings/data/listing_repository.dart';
import '../features/listings/domain/models.dart';
import 'i18n/strings.dart';
import 'network/api_client.dart';
import 'notifications/push_service.dart';
import 'storage/token_storage.dart';

/// Composition root. Every dependency is resolved here so widgets never construct a
/// repository or client themselves — which is what makes them testable with overrides.

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage());

final Provider<ApiClient> apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(ref.watch(tokenStorageProvider));
  // A refresh failure means the session is gone; clearing auth state routes to sign-in.
  client.onSessionExpired = () => ref.read(authProvider.notifier).handleSessionExpiry();
  return client;
});

final Provider<AuthRepository> authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(
    ref.watch(apiClientProvider),
    ref.watch(tokenStorageProvider),
  ),
);

final listingRepositoryProvider = Provider<ListingRepository>(
  (ref) => ListingRepository(ref.watch(apiClientProvider)),
);

final chatRepositoryProvider = Provider<ChatRepository>(
  (ref) => ChatRepository(ref.watch(apiClientProvider)),
);

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

class AuthState {
  const AuthState({this.user, this.isRestoring = false});

  final AuthUser? user;
  final bool isRestoring;

  bool get isSignedIn => user != null;
}

class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._repository) : super(const AuthState(isRestoring: true)) {
    _restore();
  }

  final AuthRepository _repository;

  Future<void> _restore() async {
    final user = await _repository.restoreSession();
    if (mounted) state = AuthState(user: user);
  }

  void setUser(AuthUser user) => state = AuthState(user: user);

  Future<void> signOut() async {
    await _repository.signOut();
    if (mounted) state = const AuthState();
  }

  void handleSessionExpiry() => state = const AuthState();
}

final StateNotifierProvider<AuthNotifier, AuthState> authProvider =
    StateNotifierProvider<AuthNotifier, AuthState>(
  (ref) => AuthNotifier(ref.watch(authRepositoryProvider)),
);

// ---------------------------------------------------------------------------
// Selected city — drives the feed and every search default
// ---------------------------------------------------------------------------

class SelectedCity {
  const SelectedCity({
    required this.id,
    required this.name,
    this.latitude,
    this.longitude,
    this.pincode,
  });

  /// Empty when the user chose a pincode outside every launched city — the radius
  /// search still works, so there is no reason to force a city on them.
  final String id;
  final String name;
  final double? latitude;
  final double? longitude;

  /// Set when the user stated their location as a pincode rather than a city.
  final String? pincode;
}

class CityNotifier extends StateNotifier<SelectedCity?> {
  CityNotifier() : super(null) {
    _restore();
  }

  static const _keyId = 'locz.city.id';
  static const _keyName = 'locz.city.name';
  static const _keyLat = 'locz.city.lat';
  static const _keyLng = 'locz.city.lng';
  static const _keyPincode = 'locz.city.pincode';

  Future<void> _restore() async {
    // Not secret, so plain preferences are appropriate here — unlike tokens.
    final prefs = await SharedPreferences.getInstance();
    final id = prefs.getString(_keyId);
    final name = prefs.getString(_keyName);
    if (id == null || name == null) return;

    if (mounted) {
      state = SelectedCity(
        id: id,
        name: name,
        latitude: prefs.getDouble(_keyLat),
        longitude: prefs.getDouble(_keyLng),
        pincode: prefs.getString(_keyPincode),
      );
    }
  }

  Future<void> select(City city, {double? latitude, double? longitude}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyId, city.id);
    await prefs.setString(_keyName, city.name);
    await prefs.setDouble(_keyLat, latitude ?? city.latitude);
    await prefs.setDouble(_keyLng, longitude ?? city.longitude);
    // Choosing a city clears any earlier pincode: the two are alternative answers to
    // the same question, and leaving both set would silently narrow every search.
    await prefs.remove(_keyPincode);

    state = SelectedCity(
      id: city.id,
      name: city.name,
      latitude: latitude ?? city.latitude,
      longitude: longitude ?? city.longitude,
    );
  }

  /// Location stated as a pincode — the answer most people can give without hesitating,
  /// and one that costs no permission prompt.
  Future<void> selectPincode(PincodeArea area) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyId, area.cityId ?? '');
    await prefs.setString(_keyName, area.cityName ?? area.label);
    await prefs.setDouble(_keyLat, area.latitude);
    await prefs.setDouble(_keyLng, area.longitude);
    await prefs.setString(_keyPincode, area.code);

    state = SelectedCity(
      id: area.cityId ?? '',
      name: area.cityName ?? area.label,
      latitude: area.latitude,
      longitude: area.longitude,
      pincode: area.code,
    );
  }
}

final selectedCityProvider = StateNotifierProvider<CityNotifier, SelectedCity?>(
  (ref) => CityNotifier(),
);

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

class LocaleNotifier extends StateNotifier<AppLocaleOption> {
  LocaleNotifier() : super(AppLocaleOption.en) {
    _restore();
  }

  static const _key = 'locz.locale';

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_key);
    if (stored == null || !mounted) return;

    state = AppLocaleOption.values.firstWhere(
      (option) => option.name == stored,
      orElse: () => AppLocaleOption.en,
    );
  }

  Future<void> select(AppLocaleOption option) async {
    state = option;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, option.name);
  }
}

final localeProvider = StateNotifierProvider<LocaleNotifier, AppLocaleOption>(
  (ref) => LocaleNotifier(),
);

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

class ThemeModeNotifier extends StateNotifier<ThemeMode> {
  ThemeModeNotifier() : super(ThemeMode.system) {
    _restore();
  }

  static const _key = 'locz.theme';

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = prefs.getString(_key);
    if (!mounted || stored == null) return;
    state = ThemeMode.values.firstWhere(
      (mode) => mode.name == stored,
      orElse: () => ThemeMode.system,
    );
  }

  Future<void> select(ThemeMode mode) async {
    state = mode;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_key, mode.name);
  }
}

final themeModeProvider = StateNotifierProvider<ThemeModeNotifier, ThemeMode>(
  (ref) => ThemeModeNotifier(),
);

// ---------------------------------------------------------------------------
// Push permission — attached only when Firebase was configured successfully
// ---------------------------------------------------------------------------

class PushPermissionNotifier extends StateNotifier<bool?> {
  PushPermissionNotifier() : super(null);

  PushService? _service;

  void attach(PushService service) => _service = service;

  void detach(PushService service) {
    if (identical(_service, service)) _service = null;
  }

  Future<bool> request() async {
    final service = _service;
    if (service == null) return false;
    final granted = await service.requestPermission();
    state = granted;
    return granted;
  }
}

final pushPermissionProvider = StateNotifierProvider<PushPermissionNotifier, bool?>(
  (ref) => PushPermissionNotifier(),
);

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

/// The home feed. Depends on the selected city, so choosing a new city refetches
/// automatically rather than needing an explicit invalidation at the call site.
final feedProvider = FutureProvider.autoDispose<Feed>((ref) {
  final city = ref.watch(selectedCityProvider);
  // Re-fetch when the user signs in: the feed gains personalised sections.
  ref.watch(authProvider.select((state) => state.user?.id));

  return ref.watch(listingRepositoryProvider).feed(
        cityId: (city?.id.isEmpty ?? true) ? null : city!.id,
        latitude: city?.latitude,
        longitude: city?.longitude,
        pincode: city?.pincode,
      );
});

final listingDetailProvider = FutureProvider.autoDispose.family<ListingDetail, String>((ref, slug) {
  return ref.watch(listingRepositoryProvider).detail(slug);
});

final myListingsProvider = FutureProvider.autoDispose<List<ListingSummary>>(
  (ref) => ref.watch(listingRepositoryProvider).myListings(),
);

final savedListingsProvider = FutureProvider.autoDispose<List<ListingSummary>>(
  (ref) => ref.watch(listingRepositoryProvider).savedListings(),
);

final categoriesProvider = FutureProvider<List<Category>>(
  (ref) => ref.watch(listingRepositoryProvider).categories(),
);

final citiesProvider = FutureProvider<List<City>>(
  (ref) => ref.watch(listingRepositoryProvider).cities(),
);

final conversationsProvider = FutureProvider.autoDispose<List<ConversationSummary>>(
  (ref) => ref.watch(chatRepositoryProvider).conversations(),
);
