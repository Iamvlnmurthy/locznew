import 'dart:async';
import 'dart:ui';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/config/env.dart';
import 'core/i18n/strings.dart';
import 'core/notifications/firebase_config.dart';
import 'core/notifications/push_service.dart';
import 'core/notifications/push_token_registrar.dart';
import 'core/observability/mobile_error_reporter.dart';
import 'core/providers.dart';
import 'core/router/app_router.dart';
import 'core/theme/app_theme.dart';

Future<void> main() async {
  final reporter = MobileErrorReporter();

  await runZonedGuarded(
    () async {
      WidgetsFlutterBinding.ensureInitialized();
      FlutterError.onError = (details) {
        FlutterError.presentError(details);
        unawaited(
          reporter.capture(
            details.exception,
            details.stack ?? StackTrace.current,
            mechanism: 'flutter_framework',
          ),
        );
      };
      PlatformDispatcher.instance.onError = (error, stack) {
        unawaited(
          reporter.capture(error, stack, mechanism: 'platform_dispatcher'),
        );
        return true;
      };

      final firebaseReady = await LoczFirebaseConfig.initialise();
      if (firebaseReady) {
        FirebaseMessaging.onBackgroundMessage(
          _firebaseMessagingBackgroundHandler,
        );
      }

      runApp(
        ProviderScope(
          child: PushBootstrap(
            enabled: firebaseReady,
            child: const LoczApp(),
          ),
        ),
      );
    },
    (error, stack) {
      unawaited(reporter.capture(error, stack, mechanism: 'dart_zone'));
    },
  );
}

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  final options = LoczFirebaseConfig.currentPlatform;
  if (options != null && Firebase.apps.isEmpty) {
    await Firebase.initializeApp(options: options);
  }
}

class PushBootstrap extends ConsumerStatefulWidget {
  const PushBootstrap({
    required this.enabled,
    required this.child,
    super.key,
  });

  final bool enabled;
  final Widget child;

  @override
  ConsumerState<PushBootstrap> createState() => _PushBootstrapState();
}

class _PushBootstrapState extends ConsumerState<PushBootstrap> {
  late final PushTokenRegistrar _registrar;
  ProviderSubscription<AuthState>? _authSubscription;
  PushService? _service;

  @override
  void initState() {
    super.initState();
    _registrar = PushTokenRegistrar(
      (token) => ref.read(authRepositoryProvider).updatePushToken(token),
    );
    _authSubscription = ref.listenManual<AuthState>(
      authProvider,
      (_, next) => unawaited(_registrar.setSignedIn(next.isSignedIn)),
      fireImmediately: true,
    );

    if (widget.enabled) {
      final service = PushService(
        _registrar.receiveToken,
        _openRoute,
      );
      _service = service;
      ref.read(pushPermissionProvider.notifier).attach(service);
      unawaited(service.initialise());
    }
  }

  void _openRoute(String route) {
    if (!mounted) return;
    final safeRoute = route.startsWith('/') ? route : '/notifications';
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) ref.read(routerProvider).go(safeRoute);
    });
  }

  @override
  void dispose() {
    _authSubscription?.close();
    final service = _service;
    if (service != null) {
      ref.read(pushPermissionProvider.notifier).detach(service);
      unawaited(service.dispose());
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
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
