import 'dart:async';

import 'package:flutter/material.dart';

import '../../../core/i18n/strings.dart';
import '../../../core/security/device_lock.dart';

/// The switch that turns the device lock on and off.
///
/// Deliberately does more than flip a boolean. Both directions require passing the lock
/// first: turning it *on* without proving the device can satisfy the prompt is how people
/// lock themselves out of their own account, and turning it *off* without proving identity
/// would let whoever is holding the phone simply disable it.
///
/// When the device cannot do it at all, the switch is disabled and says why. A toggle that
/// silently does nothing is worse than one that is visibly unavailable.
class DeviceLockTile extends StatefulWidget {
  const DeviceLockTile({this.deviceLock, super.key});

  final DeviceLock? deviceLock;

  @override
  State<DeviceLockTile> createState() => _DeviceLockTileState();
}

class _DeviceLockTileState extends State<DeviceLockTile> {
  late final DeviceLock _lock = widget.deviceLock ?? DeviceLock();

  DeviceLockAvailability? _availability;
  bool _enabled = false;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  Future<void> _load() async {
    final availability = await _lock.availability();
    final enabled = await _lock.isEnabled();
    if (mounted) {
      setState(() {
        _availability = availability;
        _enabled = enabled;
      });
    }
  }

  Future<void> _toggle(bool wanted) async {
    setState(() => _busy = true);
    final passed = wanted ? await _lock.enable() : await _lock.disable();
    if (!mounted) return;

    setState(() {
      _busy = false;
      // Only follow the switch when the lock was actually satisfied; otherwise it snaps
      // back, which is the honest signal that nothing changed.
      if (passed) _enabled = wanted;
    });

    if (!passed) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(Strings.of(context)('deviceLock.notChanged'))),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final strings = Strings.of(context);
    final availability = _availability;
    if (availability == null) {
      return ListTile(
        leading: const Icon(Icons.lock_outline),
        title: Text(strings('deviceLock.title')),
        subtitle: Text(strings('deviceLock.checking')),
      );
    }

    final usable = availability == DeviceLockAvailability.biometric ||
        availability == DeviceLockAvailability.deviceCredential;

    return SwitchListTile(
      secondary: const Icon(Icons.lock_outline),
      title: Text(strings('deviceLock.require')),
      subtitle: Text(
        switch (availability) {
          DeviceLockAvailability.biometric => strings('deviceLock.biometric'),
          DeviceLockAvailability.deviceCredential => strings('deviceLock.credential'),
          DeviceLockAvailability.notEnrolled => strings('deviceLock.notEnrolled'),
          DeviceLockAvailability.unsupported => strings('deviceLock.unsupported'),
        },
      ),
      value: _enabled,
      onChanged: usable && !_busy ? _toggle : null,
    );
  }
}
