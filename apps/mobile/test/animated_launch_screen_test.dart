import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:locz/core/launch/animated_launch_screen.dart';
import 'package:locz/core/theme/app_theme.dart';

void main() {
  testWidgets('animated launch settles without overflow on a compact phone', (tester) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(
      MaterialApp(
        theme: AppTheme.light,
        home: const AnimatedLaunchScreen(tagline: 'Find it here.. Deal it near..'),
      ),
    );
    await tester.pump(const Duration(milliseconds: 550));
    await tester.pump(const Duration(milliseconds: 700));

    expect(find.byType(Image), findsOneWidget);
    expect(find.text('Loc'), findsOneWidget);
    expect(find.text('Z'), findsOneWidget);
    expect(find.text('Find it here.. Deal it near..'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('reduced motion renders the completed launch composition immediately',
      (tester) async {
    await tester.pumpWidget(
      MediaQuery(
        data: const MediaQueryData(disableAnimations: true),
        child: MaterialApp(
          theme: AppTheme.dark,
          home: const AnimatedLaunchScreen(tagline: 'Find it here.. Deal it near..'),
        ),
      ),
    );
    await tester.pump();

    final progress = tester.widget<LinearProgressIndicator>(
      find.byType(LinearProgressIndicator),
    );
    expect(progress.value, 1);
    expect(tester.takeException(), isNull);
  });
}
