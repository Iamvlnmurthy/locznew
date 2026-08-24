import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/motion/locz_motion.dart';
import '../../../core/providers.dart';
import '../../../core/theme/tokens.g.dart';

/// City chooser.
///
/// GPS is offered, never required. A large share of users decline the permission, so
/// city-level browsing is the primary path and the manual list is what the screen opens
/// on — the location button is one option among many, not a gate.
class CityPickerScreen extends ConsumerStatefulWidget {
  const CityPickerScreen({super.key});

  @override
  ConsumerState<CityPickerScreen> createState() => _CityPickerScreenState();
}

class _CityPickerScreenState extends ConsumerState<CityPickerScreen> {
  final _pincodeController = TextEditingController();
  String _query = '';
  bool _locating = false;
  bool _checkingPincode = false;
  String? _status;
  String? _pincodeError;

  @override
  void dispose() {
    _pincodeController.dispose();
    super.dispose();
  }

  /// A pincode resolves to its centroid, and the area around that point is what gets
  /// browsed. Nobody has to grant a permission, and a code outside every launched city
  /// still works — radius search does not need a city.
  Future<void> _applyPincode() async {
    final strings = Strings.of(context);
    final code = _pincodeController.text.trim();

    setState(() {
      _checkingPincode = true;
      _pincodeError = null;
    });

    try {
      final area = await ref.read(listingRepositoryProvider).lookupPincode(code);

      if (!mounted) return;

      if (area == null) {
        setState(() => _pincodeError = strings('location.pincodeUnknown'));
        return;
      }

      final knownCities = ref.read(citiesProvider).valueOrNull ?? const [];
      final resolvedCity = area.cityId == null
          ? null
          : knownCities.where((city) => city.id == area.cityId).firstOrNull;
      await ref.read(selectedCityProvider.notifier).selectPincode(area, city: resolvedCity);
      if (mounted) context.pop();
    } finally {
      if (mounted) setState(() => _checkingPincode = false);
    }
  }

  Future<void> _useCurrentLocation() async {
    final strings = Strings.of(context);
    setState(() {
      _locating = true;
      _status = null;
    });

    try {
      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }

      if (permission == LocationPermission.denied ||
          permission == LocationPermission.deniedForever) {
        setState(() => _status = strings('location.permissionDenied'));
        return;
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(
          // Low accuracy is deliberate: the city is all that is needed, and a coarse fix
          // arrives far faster and costs much less battery than a GPS lock.
          accuracy: LocationAccuracy.low,
          timeLimit: Duration(seconds: 10),
        ),
      );

      final city = await ref
          .read(listingRepositoryProvider)
          .resolveCity(position.latitude, position.longitude);

      if (!mounted) return;

      if (city == null) {
        setState(() => _status = strings('location.outsideLaunchArea'));
        return;
      }

      await ref.read(selectedCityProvider.notifier).select(
            city,
            latitude: position.latitude,
            longitude: position.longitude,
          );

      if (mounted) context.pop();
    } catch (_) {
      if (mounted) {
        setState(
          () => _status = Strings.of(context)('location.permissionDenied'),
        );
      }
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final cities = ref.watch(citiesProvider);
    final selected = ref.watch(selectedCityProvider);

    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: Text(strings('location.searchCity'))),
      body: DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [
              theme.colorScheme.primaryContainer.withValues(alpha: .52),
              theme.scaffoldBackgroundColor,
              theme.scaffoldBackgroundColor,
            ],
            stops: const [0, .28, 1],
          ),
        ),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 8, 14, 12),
              child: Column(
                children: [
                  LoczEntrance(
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.surface.withValues(alpha: .96),
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(color: theme.colorScheme.outlineVariant),
                        boxShadow: [
                          BoxShadow(
                            color: theme.colorScheme.primary.withValues(alpha: .08),
                            blurRadius: 30,
                            offset: const Offset(0, 12),
                          ),
                        ],
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          Row(
                            children: [
                              Container(
                                width: 46,
                                height: 46,
                                decoration: BoxDecoration(
                                  gradient: LinearGradient(
                                    colors: [
                                      theme.colorScheme.primary,
                                      theme.colorScheme.primary.withValues(alpha: .78),
                                    ],
                                  ),
                                  borderRadius: BorderRadius.circular(15),
                                ),
                                child: Icon(
                                  Icons.near_me_rounded,
                                  color: theme.colorScheme.onPrimary,
                                ),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      strings('location.findArea'),
                                      style: theme.textTheme.titleLarge,
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      selected?.name ?? strings('location.gpsOrPincode'),
                                      style: theme.textTheme.bodySmall?.copyWith(
                                        color: theme.colorScheme.onSurfaceVariant,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 15),
                          FilledButton.icon(
                            onPressed: _locating ? null : _useCurrentLocation,
                            icon: _locating
                                ? const SizedBox(
                                    height: 17,
                                    width: 17,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                    ),
                                  )
                                : const Icon(
                                    Icons.my_location_rounded,
                                    size: 19,
                                  ),
                            label: Text(strings('location.useCurrent')),
                          ),
                          if (_status != null) ...[
                            const SizedBox(height: 10),
                            _LocationStatus(message: _status!),
                          ],
                          const SizedBox(height: 12),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: TextField(
                                  controller: _pincodeController,
                                  keyboardType: TextInputType.number,
                                  maxLength: 6,
                                  decoration: InputDecoration(
                                    labelText: strings('location.pincodeLabel'),
                                    hintText: '500081',
                                    prefixIcon: const Icon(
                                      Icons.pin_drop_outlined,
                                      size: 20,
                                    ),
                                    counterText: '',
                                    errorText: _pincodeError,
                                  ),
                                  onChanged: (value) {
                                    if (_pincodeError != null) {
                                      setState(() => _pincodeError = null);
                                    }
                                  },
                                  onSubmitted: (_) {
                                    if (_pincodeController.text.trim().length == 6) {
                                      _applyPincode();
                                    }
                                  },
                                ),
                              ),
                              const SizedBox(width: 8),
                              SizedBox(
                                width: 82,
                                height: 47,
                                child: FilledButton.tonal(
                                  onPressed: _checkingPincode ? null : _applyPincode,
                                  child: _checkingPincode
                                      ? const SizedBox(
                                          height: 17,
                                          width: 17,
                                          child: CircularProgressIndicator(
                                            strokeWidth: 2,
                                          ),
                                        )
                                      : Text(strings('location.pincodeGo')),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  LoczEntrance(
                    delay: const Duration(milliseconds: 80),
                    offset: const Offset(0, 8),
                    child: TextField(
                      decoration: InputDecoration(
                        hintText: strings('location.searchCity'),
                        prefixIcon: const Icon(Icons.search_rounded, size: 21),
                      ),
                      onChanged: (value) => setState(() => _query = value.toLowerCase()),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: cities.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, __) => _LocationLoadError(
                  message: strings('location.loadError'),
                  retryLabel: strings('common.retry'),
                  onRetry: () => ref.invalidate(citiesProvider),
                ),
                data: (list) {
                  final filtered = list
                      .where(
                        (city) =>
                            _query.isEmpty ||
                            city.name.toLowerCase().contains(_query) ||
                            (city.nameTe?.contains(_query) ?? false) ||
                            (city.nameHi?.contains(_query) ?? false),
                      )
                      .toList()
                    ..sort(
                      (a, b) => (b.isLaunched ? 1 : 0).compareTo(a.isLaunched ? 1 : 0),
                    );

                  if (filtered.isEmpty) {
                    return _EmptyCities(
                      message: strings(
                        _query.isEmpty ? 'location.noCities' : 'location.noMatches',
                      ),
                    );
                  }

                  return ListView.separated(
                    keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                    padding: const EdgeInsets.fromLTRB(14, 2, 14, 28),
                    itemCount: filtered.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (context, index) {
                      final city = filtered[index];
                      return LoczEntrance(
                        delay: Duration(milliseconds: (index.clamp(0, 5)) * 30),
                        offset: const Offset(0, 7),
                        child: _CityRow(
                          name: city.name,
                          state: city.stateName,
                          launched: city.isLaunched,
                          selected: selected?.id == city.id,
                          soonLabel: strings('location.soon'),
                          onTap: !city.isLaunched
                              ? null
                              : () async {
                                  await ref.read(selectedCityProvider.notifier).select(city);
                                  if (context.mounted) context.pop();
                                },
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _LocationStatus extends StatelessWidget {
  const _LocationStatus({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 9),
      decoration: BoxDecoration(
        color: theme.colorScheme.secondaryContainer.withValues(alpha: .7),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(
            Icons.info_outline_rounded,
            size: 17,
            color: theme.colorScheme.onSecondaryContainer,
          ),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              message,
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSecondaryContainer,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _CityRow extends StatelessWidget {
  const _CityRow({
    required this.name,
    required this.state,
    required this.launched,
    required this.selected,
    required this.soonLabel,
    required this.onTap,
  });

  final String name;
  final String state;
  final bool launched;
  final bool selected;
  final String soonLabel;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: selected
          ? theme.colorScheme.primaryContainer.withValues(alpha: .72)
          : theme.colorScheme.surface,
      borderRadius: BorderRadius.circular(18),
      child: Container(
        constraints: const BoxConstraints(minHeight: 68),
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: selected
                ? theme.colorScheme.primary.withValues(alpha: .36)
                : theme.colorScheme.outlineVariant,
          ),
        ),
        child: ListTile(
          onTap: onTap,
          leading: Container(
            width: 42,
            height: 42,
            decoration: BoxDecoration(
              color: launched
                  ? theme.colorScheme.primaryContainer
                  : theme.colorScheme.secondaryContainer,
              borderRadius: BorderRadius.circular(13),
            ),
            child: Icon(
              launched ? Icons.location_city_rounded : Icons.schedule_rounded,
              size: 20,
              color: launched
                  ? theme.colorScheme.onPrimaryContainer
                  : theme.colorScheme.onSecondaryContainer,
            ),
          ),
          title: Text(name),
          subtitle: Text(state),
          trailing: selected
              ? Icon(
                  Icons.check_circle_rounded,
                  color: theme.colorScheme.primary,
                )
              : launched
                  ? Icon(
                      Icons.arrow_forward_rounded,
                      size: 18,
                      color: theme.colorScheme.primary,
                    )
                  : Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 9,
                        vertical: 5,
                      ),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.secondaryContainer,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        soonLabel,
                        style: theme.textTheme.labelSmall?.copyWith(
                          color: theme.colorScheme.onSecondaryContainer,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
        ),
      ),
    );
  }
}

class _LocationLoadError extends StatelessWidget {
  const _LocationLoadError({
    required this.message,
    required this.retryLabel,
    required this.onRetry,
  });

  final String message;
  final String retryLabel;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(LoczSpacing.x8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.location_off_outlined,
              size: 40,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: LoczSpacing.x3),
            Text(message, textAlign: TextAlign.center),
            const SizedBox(height: LoczSpacing.x4),
            OutlinedButton(onPressed: onRetry, child: Text(retryLabel)),
          ],
        ),
      ),
    );
  }
}

class _EmptyCities extends StatelessWidget {
  const _EmptyCities({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(LoczSpacing.x8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              Icons.travel_explore_outlined,
              size: 40,
              color: Theme.of(context).colorScheme.primary,
            ),
            const SizedBox(height: LoczSpacing.x3),
            Text(message, textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
