import type { Metadata } from 'next';
import { getMessageGroup, getTranslator } from '@/i18n';
import { getLocale } from '@/lib/session';

export const metadata: Metadata = {
  title: 'Get the LocZ app',
};

/**
 * The Android download page.
 *
 * LocZ is not on the Play Store yet, so the APK is served from this site. The manifest that
 * `publish-apk.sh` writes beside it is the single source of truth for what the current build
 * is — read here at request time so the page never advertises a version that is no longer
 * published, and never needs editing when a new build ships.
 *
 * Deliberately honest about sideloading. Android will warn the user that the file came from
 * outside the Play Store, and a page that does not mention that leaves people thinking
 * something has gone wrong at exactly the moment they are deciding whether to trust it.
 */
type Manifest = {
  versionName?: string;
  versionCode?: number;
  url?: string;
  sizeBytes?: number;
  publishedAt?: string;
};

async function loadManifest(): Promise<Manifest | null> {
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/download/latest.json`, {
      // A cached manifest would keep offering yesterday's build after a release.
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return (await response.json()) as Manifest;
  } catch {
    // The page is still useful without it — it just cannot name a version.
    return null;
  }
}

export default async function GetAppPage() {
  const [locale, manifest] = await Promise.all([getLocale(), loadManifest()]);
  const t = getTranslator(locale);
  const s = getMessageGroup(locale, 'getApp');

  const megabytes = manifest?.sizeBytes ? Math.round(manifest.sizeBytes / 1048576) : null;
  const href = manifest?.url ?? '/download/locz-latest.apk';

  return (
    <main className="container static-page">
      <h1>{s.title}</h1>
      <p className="static-page__lede">{s.lede}</p>

      <p>
        <a className="btn btn--primary btn--lg" href={href} download>
          {s.download}
          {megabytes ? ` (${megabytes} MB)` : ''}
        </a>
      </p>

      {manifest?.versionName ? (
        <p className="static-page__meta">
          {s.version} {manifest.versionName}
          {manifest.publishedAt
            ? ` · ${new Date(manifest.publishedAt).toLocaleDateString(
                { en: 'en-IN', hi: 'hi-IN', te: 'te-IN' }[locale] ?? 'en-IN',
              )}`
            : ''}
        </p>
      ) : null}

      <h2>{s.installTitle}</h2>
      <ol>
        <li>{s.step1}</li>
        <li>{s.step2}</li>
        <li>{s.step3}</li>
      </ol>

      <p className="static-page__note">{s.updateNote}</p>
      <p className="static-page__note">{t('getApp.iosNote')}</p>
    </main>
  );
}
