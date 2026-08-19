import 'server-only';
import { cookies, headers } from 'next/headers';
import type { AuthSession } from '@locz/shared-types';
import {
  ACCESS_COOKIE,
  CITY_COOKIE,
  LOCALE_COOKIE,
  RADIUS_COOKIE,
  REFRESH_COOKIE,
  SITE_URL,
  USER_COOKIE,
} from './api';
import type { Metadata } from 'next';
import { DEFAULT_LOCALE, isLocale, negotiateLocale, type Locale } from '@/i18n';

const secure = process.env.NODE_ENV === 'production';

export interface WebUser {
  id: string;
  displayName: string;
  roles: string[];
  permissions: string[];
}

export interface SelectedCity {
  /** Empty when the visitor chose a pincode outside every launched city. */
  id: string;
  name: string;
  slug: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  /** Set when the visitor stated their location as a pincode rather than a city. */
  pincode?: string;
}

export async function storeSession(session: AuthSession): Promise<void> {
  const jar = await cookies();
  const user: WebUser = {
    id: session.user.id,
    displayName: session.user.displayName,
    roles: session.user.roles,
    permissions: session.user.permissions,
  };

  // Tokens are httpOnly: public listing pages render user-supplied text, so a token the
  // page's own JavaScript can read is a token an XSS bug can steal.
  jar.set(ACCESS_COOKIE, session.tokens.accessToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 15,
  });
  jar.set(REFRESH_COOKIE, session.tokens.refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  jar.set(USER_COOKIE, JSON.stringify(user), {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession(): Promise<void> {
  const jar = await cookies();
  for (const name of [ACCESS_COOKIE, REFRESH_COOKIE, USER_COOKIE]) jar.delete(name);
}

export async function getCurrentUser(): Promise<WebUser | null> {
  const raw = (await cookies()).get(USER_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as WebUser;
  } catch {
    return null;
  }
}

/** The city drives every feed and search default, so it is stored for signed-out visitors too. */
export async function getSelectedCity(): Promise<SelectedCity | null> {
  const raw = (await cookies()).get(CITY_COOKIE)?.value;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SelectedCity;
  } catch {
    return null;
  }
}

/** Selectable radii shown in the UI (km). Excludes 50 — the hyperlocal ceiling is 25. */
export const RADIUS_OPTIONS_KM = [1, 3, 5, 10, 25] as const;
export const DEFAULT_RADIUS_KM = 5;

/** The "how far around me" context, shared by the feed. Defaults to 5 km. */
export async function getSelectedRadius(): Promise<number> {
  const raw = (await cookies()).get(RADIUS_COOKIE)?.value;
  const value = raw ? Number(raw) : NaN;
  return (RADIUS_OPTIONS_KM as readonly number[]).includes(value) ? value : DEFAULT_RADIUS_KM;
}

export async function setSelectedCity(city: SelectedCity): Promise<void> {
  const jar = await cookies();
  // Not httpOnly — the client-side location picker reads it, and it holds nothing secret.
  jar.set(CITY_COOKIE, JSON.stringify(city), {
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

/**
 * Explicit choice wins; otherwise the browser's Accept-Language decides. A Telugu
 * speaker in Hyderabad should land on Telugu without hunting for a switcher.
 */
/**
 * `alternates` for a page's metadata that make each language a first-class, indexable URL:
 * a self-referential canonical for whichever locale is being served (/b/x for English,
 * /te/b/x for Telugu) plus reciprocal hreflang links across en/te/hi and an x-default. Pass the
 * un-prefixed path; the served locale is read from the request. Use on every indexable page so a
 * page that sets its own `alternates` does not drop hreflang.
 */
export async function localizedAlternates(path: string): Promise<Metadata['alternates']> {
  const forced = (await headers()).get('x-locale');
  const base = path === '/' ? '' : path;
  const canonical = forced === 'te' || forced === 'hi' ? `/${forced}${base}` : path;
  return {
    canonical,
    languages: {
      en: `${SITE_URL}${path}`,
      te: `${SITE_URL}/te${base}`,
      hi: `${SITE_URL}/hi${base}`,
      'x-default': `${SITE_URL}${path}`,
    },
  };
}

export async function getLocale(): Promise<Locale> {
  // A locale-prefixed URL (/te, /hi) is an explicit, indexable language choice and wins over the
  // cookie — this is how a crawler reads each language version.
  const forced = (await headers()).get('x-locale') ?? undefined;
  if (isLocale(forced)) return forced;

  const stored = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(stored)) return stored;

  const header = (await headers()).get('accept-language');
  return header ? negotiateLocale(header) : DEFAULT_LOCALE;
}

export async function setLocale(locale: Locale): Promise<void> {
  (await cookies()).set(LOCALE_COOKIE, locale, {
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}
