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
    default: 'LocZ — free local classifieds, jobs and offers near you',
    template: '%s | LocZ',
  },
  description:
    'Post free ads, find local jobs, discover nearby offers and buy or sell used items in your city. Posting on LocZ is always free.',
  applicationName: 'LocZ',
  openGraph: {
    type: 'website',
    siteName: 'LocZ',
    locale: 'en_IN',
  },
  twitter: { card: 'summary_large_image' },
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
    <html lang={locale}>
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
            <p style={{ margin: 0 }}>{t('footer.postFree')}</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
