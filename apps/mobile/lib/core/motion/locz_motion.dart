import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

/// The LocZ motion language: quick enough for everyday utility, but with enough
/// depth to make navigation and discovery feel intentionally composed.
abstract final class LoczMotion {
  static const quick = Duration(milliseconds: 140);
  static const standard = Duration(milliseconds: 220);
  static const emphasized = Duration(milliseconds: 380);

  static const enterCurve = Cubic(0.16, 1, 0.3, 1);
  static const exitCurve = Cubic(0.7, 0, 0.84, 0);

  static bool enabled(BuildContext context) => !MediaQuery.disableAnimationsOf(context);
}

/// A small, reusable entrance used to compose a screen in beats rather than
/// allowing every component to appear at the same instant.
class LoczEntrance extends StatefulWidget {
  const LoczEntrance({
    required this.child,
    this.delay = Duration.zero,
    this.offset = const Offset(0, 14),
    super.key,
  });

  final Widget child;
  final Duration delay;
  final Offset offset;

  @override
  State<LoczEntrance> createState() => _LoczEntranceState();
}

class _LoczEntranceState extends State<LoczEntrance> with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: LoczMotion.emphasized,
  );
  Timer? _timer;
  bool? _disabled;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final disabled = !LoczMotion.enabled(context);
    if (_disabled == disabled) return;
    _disabled = disabled;
    _timer?.cancel();
    if (disabled) {
      _controller.value = 1;
      return;
    }
    _controller.value = 0;
    _timer = Timer(widget.delay, () {
      if (mounted) _controller.forward();
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final curve = CurvedAnimation(
      parent: _controller,
      curve: LoczMotion.enterCurve,
    );
    return FadeTransition(
      opacity: curve,
      child: SlideTransition(
        position: Tween<Offset>(
          begin: Offset(widget.offset.dx / 100, widget.offset.dy / 100),
          end: Offset.zero,
        ).animate(curve),
        child: widget.child,
      ),
    );
  }
}

/// Tactile depth without a package or GPU-heavy shader. Pointer-down compresses
/// the surface; release restores it with the shared motion curve.
class LoczPressable extends StatefulWidget {
  const LoczPressable({
    required this.child,
    required this.onTap,
    this.semanticLabel,
    this.borderRadius = const BorderRadius.all(Radius.circular(16)),
    super.key,
  });

  final Widget child;
  final VoidCallback onTap;
  final String? semanticLabel;
  final BorderRadius borderRadius;

  @override
  State<LoczPressable> createState() => _LoczPressableState();
}

class _LoczPressableState extends State<LoczPressable> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed != value) setState(() => _pressed = value);
  }

  void _activate() {
    HapticFeedback.selectionClick();
    widget.onTap();
  }

  @override
  Widget build(BuildContext context) {
    final animate = LoczMotion.enabled(context);
    return Semantics(
      button: true,
      label: widget.semanticLabel,
      onTap: _activate,
      child: ExcludeSemantics(
        child: AnimatedScale(
          scale: animate && _pressed ? 0.975 : 1,
          duration: LoczMotion.quick,
          curve: LoczMotion.enterCurve,
          child: GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTapDown: (_) => _setPressed(true),
            onTapCancel: () => _setPressed(false),
            onTapUp: (_) => _setPressed(false),
            onTap: _activate,
            child: ClipRRect(
              borderRadius: widget.borderRadius,
              child: widget.child,
            ),
          ),
        ),
      ),
    );
  }
}

/// Keeps image flights quiet and premium: no material arc, no white flash, and
/// rounded corners gradually relax as a card becomes a full-width gallery.
Widget loczImageFlight(
  BuildContext flightContext,
  Animation<double> animation,
  HeroFlightDirection direction,
  BuildContext fromContext,
  BuildContext toContext,
) {
  final curve = CurvedAnimation(
    parent: animation,
    curve: LoczMotion.enterCurve,
    reverseCurve: LoczMotion.exitCurve,
  );
  final source =
      direction == HeroFlightDirection.push ? fromContext.widget as Hero : toContext.widget as Hero;
  return FadeTransition(
    opacity: curve,
    child: source.child,
  );
}
