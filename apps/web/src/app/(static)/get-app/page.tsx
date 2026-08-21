import type { Metadata } from 'next';
import Image from 'next/image';
import { getMessageGroup, getTranslator } from '@/i18n';
import { getLocale } from '@/lib/session';

export async function generateMetadata(): Promise<Metadata> {
  const t = getTranslator(await getLocale());
  return { title: t('getApp.title'), alternates: { canonical: '/get-app' } };
}

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

  const version = manifest?.versionName
    ? `${s.version} ${manifest.versionName}${
        manifest.publishedAt
          ? ` · ${new Date(manifest.publishedAt).toLocaleDateString(
              { en: 'en-IN', hi: 'hi-IN', te: 'te-IN' }[locale] ?? 'en-IN',
            )}`
          : ''
      }`
    : null;

  return (
    <div className="get-app-page">
      <section className="container get-app-hero">
        <div className="get-app-hero__copy">
          <span className="get-app-hero__eyebrow">{s.eyebrow}</span>
          <h1>{s.title}</h1>
          <p>{s.lede}</p>

          <a className="btn btn--primary btn--lg get-app-hero__download" href={href} download>
            <span aria-hidden="true">↓</span>
            {s.download}
            {megabytes ? ` · ${megabytes} MB` : ''}
          </a>

          {version ? <p className="get-app-hero__version">{version}</p> : null}

          <div className="get-app-hero__trust" aria-label={s.assurances}>
            <span>✓ {s.sourceTrust}</span>
            <span>✓ {s.platformTrust}</span>
            <span>✓ {s.updateTrust}</span>
          </div>
        </div>

        <div className="get-app-hero__visual" aria-hidden="true">
          <div className="get-app-device">
            <div className="get-app-device__top" />
            <Image
              src="/brand/app-icon-premium-v2-1024.png"
              alt=""
              width={150}
              height={150}
              priority
            />
            <strong>LocZ</strong>
            <small>{s.tagline}</small>
            <div className="get-app-device__tiles">
              <i />
              <i />
              <i />
              <i />
            </div>
          </div>
          <span className="get-app-hero__orb get-app-hero__orb--one" />
          <span className="get-app-hero__orb get-app-hero__orb--two" />
        </div>
      </section>

      <section className="container get-app-install">
        <div className="get-app-install__heading">
          <span>01—03</span>
          <h2>{s.installTitle}</h2>
        </div>
        <ol className="get-app-install__steps">
          {[s.step1, s.step2, s.step3].map((step, index) => (
            <li key={step}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="container get-app-notes">
        <p>{s.updateNote}</p>
        <p>{t('getApp.iosNote')}</p>
      </section>
    </div>
  );
}
