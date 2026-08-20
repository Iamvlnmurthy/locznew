import 'package:flutter/material.dart';

import '../theme/tokens.g.dart';

/// Branded Flutter handoff shown after the platform launch screen.
///
/// The native Android/iOS splash remains static because the operating system owns it.
/// This screen begins once Flutter can draw, and can remain on its final frame while
/// session restoration finishes on a slow device.
class AnimatedLaunchScreen extends StatefulWidget {
  const AnimatedLaunchScreen({required this.tagline, super.key});

  final String tagline;

  @override
  State<AnimatedLaunchScreen> createState() => _AnimatedLaunchScreenState();
}

class _AnimatedLaunchScreenState extends State<AnimatedLaunchScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 1050),
  );
  bool? _animationsDisabled;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final disabled = MediaQuery.disableAnimationsOf(context);
    if (_animationsDisabled == disabled) return;
    _animationsDisabled = disabled;

    if (disabled) {
      _controller.value = 1;
    } else {
      _controller.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final markCurve = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0, 0.58, curve: Curves.easeOutBack),
    );
    final wordCurve = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.28, 0.76, curve: Curves.easeOutCubic),
    );
    final taglineCurve = CurvedAnimation(
      parent: _controller,
      curve: const Interval(0.58, 1, curve: Curves.easeOutCubic),
    );

    return Scaffold(
      backgroundColor: isDark ? theme.scaffoldBackgroundColor : const Color(0xFFF3F7F5),
      body: Semantics(
        label: 'LocZ. ${widget.tagline}',
        image: true,
        child: ExcludeSemantics(
          child: Center(
            child: RepaintBoundary(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AnimatedBuilder(
                      animation: markCurve,
                      builder: (context, child) {
                        final progress = markCurve.value;
                        return Transform.translate(
                          offset: Offset(0, 14 * (1 - progress)),
                          child: Transform.scale(
                            scale: 0.76 + (0.24 * progress),
                            child: Opacity(
                              opacity: progress.clamp(0, 1),
                              child: Container(
                                width: 112,
                                height: 112,
                                padding: const EdgeInsets.all(10),
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: isDark
                                      ? LoczColors.primary900.withValues(alpha: 0.38)
                                      : Colors.white.withValues(alpha: 0.82),
                                  boxShadow: [
                                    BoxShadow(
                                      color: LoczColors.primary600.withValues(
                                        alpha: (isDark ? 0.2 : 0.12) * progress,
                                      ),
                                      blurRadius: 32,
                                      spreadRadius: 3,
                                    ),
                                  ],
                                ),
                                child: Image.asset(
                                  'assets/brand/locz-mark.png',
                                  fit: BoxFit.contain,
                                  filterQuality: FilterQuality.high,
                                ),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                    const SizedBox(height: 22),
                    AnimatedBuilder(
                      animation: wordCurve,
                      child: const _LoczWordmark(),
                      builder: (context, child) => ClipRect(
                        child: Align(
                          alignment: Alignment.centerLeft,
                          widthFactor: wordCurve.value,
                          child: Opacity(
                            opacity: wordCurve.value,
                            child: child,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 10),
                    FadeTransition(
                      opacity: taglineCurve,
                      child: SlideTransition(
                        position: Tween<Offset>(
                          begin: const Offset(0, 0.35),
                          end: Offset.zero,
                        ).animate(taglineCurve),
                        child: Text(
                          widget.tagline,
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: theme.colorScheme.onSurfaceVariant,
                            letterSpacing: 0.1,
                          ),
                        ),
                      ),
                    ),
                    const SizedBox(height: 30),
                    AnimatedBuilder(
                      animation: taglineCurve,
                      builder: (context, _) => SizedBox(
                        width: 42,
                        child: LinearProgressIndicator(
                          value: taglineCurve.value,
                          minHeight: 2,
                          borderRadius: BorderRadius.circular(LoczRadius.full),
                          backgroundColor: theme.colorScheme.outlineVariant,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _LoczWordmark extends StatelessWidget {
  const _LoczWordmark();

  @override
  Widget build(BuildContext context) {
    final base = Theme.of(context).textTheme.displaySmall?.copyWith(
          fontWeight: FontWeight.w800,
          letterSpacing: -1.4,
          height: 1,
        );

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          'Loc',
          style: base?.copyWith(color: Theme.of(context).colorScheme.primary),
        ),
        Text('Z', style: base?.copyWith(color: LoczColors.danger)),
      ],
    );
  }
}
