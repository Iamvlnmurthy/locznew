import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:locz/core/motion/locz_motion.dart';

void main() {
  testWidgets('entrance is immediately visible when motion is disabled', (
    tester,
  ) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: MediaQuery(
          data: MediaQueryData(disableAnimations: true),
          child: LoczEntrance(
            delay: Duration(seconds: 2),
            child: Text('Nearby finds'),
          ),
        ),
      ),
    );

    final fade = tester.widget<FadeTransition>(
      find.descendant(
        of: find.byType(LoczEntrance),
        matching: find.byType(FadeTransition),
      ),
    );
    expect(fade.opacity.value, 1);
    expect(find.text('Nearby finds'), findsOneWidget);
  });

  testWidgets('pressable keeps one semantic action and invokes it', (
    tester,
  ) async {
    var taps = 0;
    final semantics = tester.ensureSemantics();

    await tester.pumpWidget(
      MaterialApp(
        home: Center(
          child: LoczPressable(
            semanticLabel: 'Open local listing',
            onTap: () => taps += 1,
            child: const SizedBox(width: 160, height: 80),
          ),
        ),
      ),
    );

    final node = tester.getSemantics(find.byType(LoczPressable));
    expect(node.flagsCollection.isButton, isTrue);
    expect(node.label, 'Open local listing');

    final gesture = await tester.startGesture(
      tester.getCenter(find.byType(LoczPressable)),
    );
    await tester.pump(LoczMotion.quick);
    expect(
      tester.widget<AnimatedScale>(find.byType(AnimatedScale)).scale,
      0.975,
    );
    await gesture.up();
    await tester.pumpAndSettle();
    expect(taps, 1);
    semantics.dispose();
  });
}
