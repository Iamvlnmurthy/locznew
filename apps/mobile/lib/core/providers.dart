import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../features/auth/data/auth_repository.dart';
import '../features/chat/data/chat_repository.dart';
import '../features/listings/data/listing_repository.dart';
import '../features/listings/domain/models.dart';
import 'i18n/strings.dart';
import 'network/api_client.dart';
import 'storage/token_storage.dart';

/// Composition root. Every dependency is resolved here so widgets never construct a
/// repository or client themselves — which is what makes them testable with overrides.

final tokenStorageProvider = Provider<TokenStorage>((ref) => TokenStorage());

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(ref.watch(tokenStorageProvider));
  // A refresh failure means the session is gone; clearing auth state routes to sign-in.
  client.onSessionExpired = () => ref.read(authProvider.notifier).handleSessionExpiry();
  return client;
});

final authRepositoryProvider = Provider<AuthRepository>(
  (ref) => AuthRepository(ref.watch(apiClientProvider), ref.watch(tokenStorageProvider)),
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

final authProvider = StateNotifierProvider<AuthNotifier, AuthState>(
  (ref) => AuthNotifier(ref.watch(authRepositoryProvider)),
);

// ---------------------------------------------------------------------------
// Selected city — drives the feed and every search default
// ---------------------------------------------------------------------------

class SelectedCity {
  const SelectedCity({required this.id, required this.name, this.latitude, this.longitude});

  final String id;
  final String name;
  final double? latitude;
  final double? longitude;
}

class CityNotifier extends StateNotifier<SelectedCity?> {
  CityNotifier() : super(null) {
    _restore();
  }

  static const _keyId = 'locz.city.id';
  static const _keyName = 'locz.city.name';
  static const _keyLat = 'locz.city.lat';
  static const _keyLng = 'locz.city.lng';

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
      );
    }
  }

  Future<void> select(City city, {double? latitude, double? longitude}) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_keyId, city.id);
    await prefs.setString(_keyName, city.name);
    await prefs.setDouble(_keyLat, latitude ?? city.latitude);
    await prefs.setDouble(_keyLng, longitude ?? city.longitude);

    state = SelectedCity(
      id: city.id,
      name: city.name,
      latitude: latitude ?? city.latitude,
      longitude: longitude ?? city.longitude,
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
// Data
// ---------------------------------------------------------------------------

/// The home feed. Depends on the selected city, so choosing a new city refetches
/// automatically rather than needing an explicit invalidation at the call site.
final feedProvider = FutureProvider.autoDispose<Feed>((ref) {
  final city = ref.watch(selectedCityProvider);
  // Re-fetch when the user signs in: the feed gains personalised sections.
  ref.watch(authProvider.select((state) => state.user?.id));

  return ref
      .watch(listingRepositoryProvider)
      .feed(cityId: city?.id, latitude: city?.latitude, longitude: city?.longitude);
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
