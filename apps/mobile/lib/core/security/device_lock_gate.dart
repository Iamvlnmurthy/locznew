import 'package:flutter/material.dart';

import 'device_lock.dart';

/// Holds the app behind the phone's own lock while a session is signed in.
///
/// Wraps the whole application rather than individual screens, because the thing being
/// protected is not one page — it is the session. Someone holding an unlocked phone should
/// not be able to read chats, see saved listings or post as the owner, whichever screen the
/// app happened to be on.
///
/// Re-challenges when the app returns from the background, which is the moment that actually
/// matters. Locking only at cold start protects nothing: phones are handed over unlocked with
/// apps already running far more often than they are rebooted.
///
/// A short grace period keeps it usable. Without it, every trip to the camera or the gallery
/// to attach a photo would demand a fingerprint on the way back — which teaches people to
/// turn the feature off.
class DeviceLockGate extends StatefulWidget {
  const DeviceLockGate({
    required this.child,
    required this.isSignedIn,
    this.deviceLock,
    this.grace = const Duration(seconds: 30),
    super.key,
  });

  final Widget child;

  /// Only a signed-in session is worth gating; a signed-out app shows nothing private.
  final bool Function() isSignedIn;

  final DeviceLock? deviceLock;

  /// How long the app may be backgrounded before it locks again.
  final Duration grace;

  @override
  State<DeviceLockGate> createState() => _DeviceLockGateState();
}

class _DeviceLockGateState extends State<DeviceLockGate> with WidgetsBindingObserver {
  late final DeviceLock _lock = widget.deviceLock ?? DeviceLock();

  bool _locked = false;
  bool _prompting = false;
  DateTime? _leftAt;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) => _challengeIfNeeded());
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      final away = _leftAt == null ? Duration.zero : DateTime.now().difference(_leftAt!);
      _leftAt = null;
      if (away >= widget.grace) _challengeIfNeeded();
      return;
    }

    // `paused` is the app genuinely leaving; `inactive` also fires for a notification shade
    // pull or an incoming call, which should not start the grace clock.
    if (state == AppLifecycleState.paused && _leftAt == null) {
      _leftAt = DateTime.now();
    }
  }

  Future<void> _challengeIfNeeded() async {
    if (_prompting || !widget.isSignedIn()) return;
    if (!await _lock.shouldChallenge()) return;

    if (mounted) setState(() => _locked = true);
    await _prompt();
  }

  Future<void> _prompt() async {
    if (_prompting) return;
    _prompting = true;

    final passed = await _lock.authenticate(reason: 'Unlock LocZ');

    _prompting = false;
    if (mounted) setState(() => _locked = !passed);
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: [
        // The app stays mounted underneath so state, scroll position and in-flight requests
        // survive the lock. The cover is what hides it, not a rebuild.
        widget.child,
        if (_locked)
          Semantics(
            label: 'LocZ is locked',
            child: _LockCover(onUnlock: _prompt, prompting: _prompting),
          ),
      ],
    );
  }
}

class _LockCover extends StatelessWidget {
  const _LockCover({required this.onUnlock, required this.prompting});

  final VoidCallback onUnlock;
  final bool prompting;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Material(
      // Opaque rather than translucent: a blur still leaks the shape of a conversation.
      color: theme.colorScheme.surface,
      child: Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.lock_outline, size: 56, color: theme.colorScheme.primary),
              const SizedBox(height: 20),
              Text('LocZ is locked', style: theme.textTheme.headlineSmall),
              const SizedBox(height: 8),
              Text(
                'Unlock with your fingerprint, face or screen lock to continue.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: 24),
              FilledButton.icon(
                // Disabled while the system prompt is already showing, so a double tap
                // cannot stack two BiometricPrompts and cancel both.
                onPressed: prompting ? null : onUnlock,
                icon: const Icon(Icons.fingerprint),
                label: const Text('Unlock'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
