import type { Metadata, Viewport } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import localFont from 'next/font/local';
import { Anek_Telugu } from 'next/font/google';
import Script from 'next/script';
import { Header } from '@/components/header';
import { Icon } from '@/components/icons';
import { getTranslator } from '@/i18n';
import { SITE_URL } from '@/lib/api';
import { headers } from 'next/headers';
import { getLocale, getSelectedCity, localizedAlternates } from '@/lib/session';
import { LocationPrompt } from '@/components/location-prompt';
import { MotionFrame } from '@/components/motion-frame';
import './globals.css';
import './theme-overrides.css';
import './premium-motion.css';

const loczSans = localFont({
  src: [
    { path: '../../../mobile/assets/fonts/Inter-Regular.ttf', weight: '400', style: 'normal' },
    { path: '../../../mobile/assets/fonts/Inter-Medium.ttf', weight: '500', style: 'normal' },
    { path: '../../../mobile/assets/fonts/Inter-SemiBold.ttf', weight: '600', style: 'normal' },
    { path: '../../../mobile/assets/fonts/Inter-Bold.ttf', weight: '700', style: 'normal' },
  ],
  variable: '--font-locz-sans',
  display: 'swap',
});

// A modern, professional Telugu face — clean low-contrast strokes and light weights, far more
// refined than the OS default. Applied to Telugu text via :lang(te) in globals.css.
const loczTelugu = Anek_Telugu({
  subsets: ['telugu'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-locz-telugu',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  // hreflang + a locale-aware canonical for whatever path is being served, so English/Telugu/Hindi
  // versions are each indexed as their own URL. Pages that set their own `alternates` build these
  // the same way, so they don't drop the language links.
  const pathname = (await headers()).get('x-pathname') ?? '/';
  return { ...baseMetadata, alternates: await localizedAlternates(pathname) };
}

const baseMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'LocZ — Find it here.. Deal it near..',
    template: '%s | LocZ',
  },
  description:
    'Find it here.. Deal it near.. Classifieds, local jobs, nearby offers and services in your city.',
  applicationName: 'LocZ',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/brand/favicon-16.png', sizes: '16x16', type: 'image/png' },
      { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon.ico', sizes: 'any' },
    ],
    apple: [{ url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  // Used by social cards and by the browser when the site is added to a home screen.
  appleWebApp: { title: 'LocZ', statusBarStyle: 'default' },
  openGraph: {
    type: 'website',
    siteName: 'LocZ',
    title: 'LocZ — Find it here.. Deal it near..',
    description: 'Classifieds, local jobs, nearby offers and services in your city.',
    locale: 'en_IN',
    images: [
      {
        url: '/brand/og-locz.jpg',
        width: 1200,
        height: 630,
        alt: 'LocZ — everything local, in one place',
      },
    ],
  },
  twitter: { card: 'summary_large_image', images: ['/brand/og-locz.jpg'] },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#0f9e8c' },
    { media: '(prefers-color-scheme: dark)', color: '#141a1a' },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [locale, selectedCity] = await Promise.all([getLocale(), getSelectedCity()]);
  const t = getTranslator(locale);

  return (
    // `lang` is set from the user's locale so screen readers pronounce Telugu and Hindi
    // correctly instead of reading them as accented English.
    <html
      lang={locale}
      className={`${loczSans.variable} ${loczTelugu.variable}`}
      data-scroll-behavior="smooth"
      suppressHydrationWarning
    >
      <head>
        <Script id="locz-theme" strategy="beforeInteractive">{`
          try {
            const saved = localStorage.getItem('locz-theme');
            const theme = saved === 'light' || saved === 'dark'
              ? saved
              : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            document.documentElement.dataset.theme = theme;
            document.documentElement.style.colorScheme = theme;
          } catch (_) {
            document.documentElement.dataset.theme = 'light';
          }
        `}</Script>
      </head>
      <body>
        <Header locale={locale} />
        <LocationPrompt hasLocation={Boolean(selectedCity)} />
        <MotionFrame>{children}</MotionFrame>

        <footer className="footer">
          <div className="container footer__inner">
            <div className="footer__brand">
              <Image src="/brand/locz-logo.webp" alt="LocZ" width={107} height={51} />
              <p>{t('brand.tagline')}</p>
              <Link href="/post" className="footer__post-link">
                <Icon name="plus" /> {t('footer.postFree')}
              </Link>
            </div>
            <nav className="footer__links" aria-label={t('footer.aria')}>
              <div>
                <strong>{t('footer.businesses')}</strong>
                <Link href="/business">{t('footer.businesses')}</Link>
                <Link href="/business/new">{t('nav.listBusiness')}</Link>
                <Link href="/get-app">{t('nav.getApp')}</Link>
              </div>
              <div>
                <strong>{t('footer.about')}</strong>
                <Link href="/about">{t('footer.about')}</Link>
                <Link href="/help">{t('footer.help')}</Link>
                <Link href="/safety">{t('footer.safety')}</Link>
              </div>
              <div>
                <strong>{t('footer.terms')}</strong>
                <Link href="/terms">{t('footer.terms')}</Link>
                <Link href="/privacy">{t('footer.privacy')}</Link>
              </div>
            </nav>
          </div>
          <div className="container footer__bottom">
            <p>© {new Date().getFullYear()} LocZ</p>
            <span className="footer__local-promise">
              <Icon name="location" /> {t('brand.tagline')}
            </span>
            <nav aria-label={t('footer.aria')}>
              <Link href="/safety">{t('footer.safety')}</Link>
              <Link href="/terms">{t('footer.terms')}</Link>
              <Link href="/privacy">{t('footer.privacy')}</Link>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
