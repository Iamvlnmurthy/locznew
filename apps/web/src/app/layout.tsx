import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { Header } from '@/components/header';
import { getTranslator } from '@/i18n';
import { SITE_URL } from '@/lib/api';
import { getLocale } from '@/lib/session';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'LocZ — Find it here.. Deal it near..',
    template: '%s | LocZ',
  },
  description:
    'Find it here.. Deal it near.. Free classifieds, local jobs, nearby offers and services in your city. Posting on LocZ is always free.',
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
    description:
      'Free classifieds, local jobs, nearby offers and services in your city. Posting is always free.',
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
  alternates: { canonical: '/' },
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
  const locale = await getLocale();
  const t = getTranslator(locale);

  return (
    // `lang` is set from the user's locale so screen readers pronounce Telugu and Hindi
    // correctly instead of reading them as accented English.
    <html lang={locale} data-theme="light">
      <body>
        <Header locale={locale} />
        <main id="main">{children}</main>

        <footer className="footer">
          <div className="container">
            <nav className="footer__links" aria-label="Footer">
              <Link href="/business/new">{t('nav.listBusiness')}</Link>
              <Link href="/about">{t('footer.about')}</Link>
              <Link href="/help">{t('footer.help')}</Link>
              <Link href="/safety">{t('footer.safety')}</Link>
              <Link href="/terms">{t('footer.terms')}</Link>
              <Link href="/privacy">{t('footer.privacy')}</Link>
            </nav>
            <p style={{ margin: '0 0 4px', fontWeight: 600, color: 'var(--locz-text)' }}>
              {t('brand.tagline')}
            </p>
            <p style={{ margin: 0 }}>{t('footer.postFree')}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
