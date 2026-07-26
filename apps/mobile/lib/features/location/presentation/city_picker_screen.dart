import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:go_router/go_router.dart';

import '../../../core/i18n/strings.dart';
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

      await ref.read(selectedCityProvider.notifier).selectPincode(area);
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

      await ref
          .read(selectedCityProvider.notifier)
          .select(city, latitude: position.latitude, longitude: position.longitude);

      if (mounted) context.pop();
    } catch (_) {
      if (mounted) setState(() => _status = Strings.of(context)('location.permissionDenied'));
    } finally {
      if (mounted) setState(() => _locating = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final cities = ref.watch(citiesProvider);
    final selected = ref.watch(selectedCityProvider);

    return Scaffold(
      appBar: AppBar(title: Text(strings('location.searchCity'))),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.all(LoczSpacing.x4),
            child: Column(
              children: [
                FilledButton.icon(
                  onPressed: _locating ? null : _useCurrentLocation,
                  icon: _locating
                      ? const SizedBox(
                          height: 16,
                          width: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : const Icon(Icons.my_location),
                  label: Text(strings('location.useCurrent')),
                ),
                if (_status != null) ...[
                  const SizedBox(height: LoczSpacing.x2),
                  Text(
                    _status!,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ],
                const SizedBox(height: LoczSpacing.x4),
                Row(
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _pincodeController,
                        keyboardType: TextInputType.number,
                        maxLength: 6,
                        decoration: InputDecoration(
                          labelText: strings('location.pincodeLabel'),
                          hintText: '500081',
                          prefixIcon: const Icon(Icons.markunread_mailbox_outlined),
                          counterText: '',
                          errorText: _pincodeError,
                        ),
                        onChanged: (value) {
                          if (_pincodeError != null) setState(() => _pincodeError = null);
                        },
                        onSubmitted: (_) {
                          if (_pincodeController.text.trim().length == 6) _applyPincode();
                        },
                      ),
                    ),
                    const SizedBox(width: LoczSpacing.x2),
                    // The theme makes every filled button full-width (Size.fromHeight
                    // gives an infinite minimum width), and a Row hands unbounded width
                    // to its non-flex children — which asserts. An explicit width is what
                    // reconciles a full-width button style with sitting beside a field.
                    SizedBox(
                      width: 104,
                      child: FilledButton.tonal(
                        onPressed: _checkingPincode ? null : _applyPincode,
                        child: _checkingPincode
                            ? const SizedBox(
                                height: 16,
                                width: 16,
                                child: CircularProgressIndicator(strokeWidth: 2),
                              )
                            : Text(strings('location.pincodeGo')),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: LoczSpacing.x4),
                TextField(
                  decoration: InputDecoration(
                    hintText: strings('location.searchCity'),
                    prefixIcon: const Icon(Icons.search),
                  ),
                  onChanged: (value) => setState(() => _query = value.toLowerCase()),
                ),
              ],
            ),
          ),
          Expanded(
            child: cities.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => Center(child: Text(error.toString())),
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
                  // Launched cities first; the rest stay visible but clearly secondary.
                  ..sort((a, b) => (b.isLaunched ? 1 : 0).compareTo(a.isLaunched ? 1 : 0));

                return ListView.builder(
                  itemCount: filtered.length,
                  itemBuilder: (context, index) {
                    final city = filtered[index];
                    return ListTile(
                      title: Text(city.name),
                      subtitle: Text(city.stateName),
                      trailing: city.isLaunched
                          ? (selected?.id == city.id ? const Icon(Icons.check) : null)
                          : const Chip(label: Text('soon'), visualDensity: VisualDensity.compact),
                      onTap: () async {
                        await ref.read(selectedCityProvider.notifier).select(city);
                        if (context.mounted) context.pop();
                      },
                    );
                  },
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
