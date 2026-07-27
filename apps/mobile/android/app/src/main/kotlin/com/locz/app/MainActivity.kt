package com.locz.app

import io.flutter.embedding.android.FlutterFragmentActivity

/**
 * A FragmentActivity rather than a plain FlutterActivity.
 *
 * `local_auth` shows the system BiometricPrompt, which is a fragment and refuses to attach to
 * a non-fragment host. With FlutterActivity the device-lock call fails at runtime with
 * "no_fragment_activity" — on the device, not at build time.
 */
class MainActivity : FlutterFragmentActivity()
