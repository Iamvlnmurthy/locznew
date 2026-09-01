import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

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

export const metadata: Metadata = {
  title: 'LocZ Admin',
  description: 'Moderation and operations console for LocZ',
  // The console must never be indexed, and never appear in a search result.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-density="compact" className={loczSans.variable}>
      <body>{children}</body>
    </html>
  );
}
