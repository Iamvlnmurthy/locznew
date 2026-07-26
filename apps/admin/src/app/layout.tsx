import type { Metadata } from 'next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LocZ Admin',
  description: 'Moderation and operations console for LocZ',
  // The console must never be indexed, and never appear in a search result.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-density="compact">
      <body>
        {children}
        {process.env.NODE_ENV === 'production' ? <SpeedInsights /> : null}
      </body>
    </html>
  );
}
