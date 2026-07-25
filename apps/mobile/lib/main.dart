import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config/env.dart';
import 'core/i18n/strings.dart';
import 'core/providers.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Firebase is intentionally *not* initialised here. It requires
  // google-services.json / GoogleService-Info.plist, which are not committed, so the app
  // must run without them. PushService is started from the account screen once a project
  // is configured — see docs/MOBILE_SETUP.md.

  runApp(const ProviderScope(child: LoczApp()));
}

class LoczApp extends ConsumerWidget {
  const LoczApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final router = ref.watch(routerProvider);
    final locale = ref.watch(localeProvider);
    final auth = ref.watch(authProvider);

    // Hold the splash until the stored session has been checked, so the app never
    // flashes a signed-out UI to someone who is signed in.
    if (auth.isRestoring) {
      return MaterialApp(
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        debugShowCheckedModeBanner: false,
        home: const Scaffold(body: Center(child: CircularProgressIndicator())),
      );
    }

    return MaterialApp.router(
      title: Env.appName,
      debugShowCheckedModeBanner: false,
      routerConfig: router,

      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      // The design tokens define both themes, so following the system setting is free.
      themeMode: ThemeMode.system,

      locale: Locale(locale.name),
      supportedLocales: const [Locale('en'), Locale('te'), Locale('hi')],
      localizationsDelegates: [
        StringsDelegate(locale),
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],

      builder: (context, child) {
        // Caps text scaling: Android allows up to 2.0, which breaks price rows and
        // bottom bars. 1.4 keeps large-text users supported without a broken layout.
        final scale = MediaQuery.textScalerOf(context).clamp(maxScaleFactor: 1.4);
        return MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: scale),
          child: child!,
        );
      },
    );
  }
}
