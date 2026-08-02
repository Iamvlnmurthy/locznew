'use client';

import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';

/**
 * The Firebase app, created once and only in the browser.
 *
 * Firebase is used here for exactly one thing: confirming that somebody controls a mobile
 * number. The device talks to Google directly and hands back a signed assertion, which the
 * API then verifies. Nothing about a LocZ session comes from Firebase.
 *
 * These values are public and are meant to be. A Firebase web config identifies the project;
 * it authorises nothing. What actually gates access is the authorised-domains list and
 * reCAPTCHA, both enforced on Google's side. Shipping them to the browser is the intended
 * design, not a leak — the browser is where the verification runs.
 *
 * Loaded lazily so the SDK is not in the bundle of every page. Phone verification is a rare
 * moment in an account's life, and roughly 200 KB of JavaScript should not be paid for on
 * every page load to support it.
 */

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? '',
};

/** Whether the deployment has been given a project to talk to. */
export function isPhoneVerificationConfigured(): boolean {
  return Boolean(config.apiKey && config.projectId);
}

let app: FirebaseApp | undefined;

export function firebaseAuth(): Auth {
  if (!isPhoneVerificationConfigured()) {
    // A clearer failure than whatever the SDK produces from an empty config, which surfaces
    // as an opaque internal error several frames deep.
    throw new Error('Phone verification is not configured for this deployment.');
  }

  // getApps() rather than a module flag: React strict mode mounts twice in development, and
  // initializeApp throws on the second call with the same name.
  app ??= getApps()[0] ?? initializeApp(config);

  const auth = getAuth(app);
  // Send SMS and reCAPTCHA copy in the reader's own language where Google has it.
  auth.useDeviceLanguage();

  return auth;
}
