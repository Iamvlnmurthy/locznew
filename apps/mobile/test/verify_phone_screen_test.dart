import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:locz/core/i18n/strings.dart';
import 'package:locz/core/theme/app_theme.dart';
import 'package:locz/features/account/presentation/verify_phone_screen.dart';

void main() {
  testWidgets('phone confirmation is localized and usable at 320px', (tester) async {
    await tester.binding.setSurfaceSize(const Size(320, 700));
    addTearDown(() => tester.binding.setSurfaceSize(null));

    await tester.pumpWidget(
      ProviderScope(
        child: MaterialApp(
          theme: AppTheme.light,
          darkTheme: AppTheme.dark,
          themeMode: ThemeMode.dark,
          locale: const Locale('te'),
          supportedLocales: const [Locale('en'), Locale('te'), Locale('hi')],
          localizationsDelegates: const [
            StringsDelegate(AppLocaleOption.te),
            GlobalMaterialLocalizations.delegate,
            GlobalWidgetsLocalizations.delegate,
            GlobalCupertinoLocalizations.delegate,
          ],
          home: const VerifyPhoneScreen(),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('మీ మొబైల్ నంబర్‌ను ధృవీకరించండి'), findsWidgets);
    expect(find.text('కోడ్ పంపండి'), findsOneWidget);
    expect(tester.takeException(), isNull);

    await tester.tap(find.text('కోడ్ పంపండి'));
    await tester.pump();
    expect(
      find.text('చెల్లుబాటు అయ్యే 10 అంకెల మొబైల్ నంబర్ ఇవ్వండి.'),
      findsOneWidget,
    );
    expect(tester.takeException(), isNull);
  });
}
