'use client';

import { useEffect, useRef } from 'react';

export type AdsterraFormat =
  | 'responsive'
  | 'rectangle-300x250'
  | 'leaderboard-728x90'
  | 'banner-468x60'
  | 'mobile-320x50'
  | 'in-article';

interface AdsterraBannerProps {
  format?: AdsterraFormat;
  className?: string;
}

export function AdsterraBanner({ format = 'responsive', className }: AdsterraBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    container.innerHTML = '';

    const widthScreen = typeof window !== 'undefined' ? window.innerWidth : 1200;

    let key = '40bbb936ec9dbc187eec10864cd97e57'; // default 300x250
    let width = 300;
    let height = 250;

    if (format === 'leaderboard-728x90') {
      if (widthScreen >= 768) {
        key = 'b019f458a4ecea96b1a9dd67ff3f2ba8';
        width = 728;
        height = 90;
      } else if (widthScreen >= 500) {
        key = 'c23ff469e6cf4ebe79b89e39501dffda';
        width = 468;
        height = 60;
      } else {
        key = '66aff07f840a9e35fb16f95c89f7f1a0';
        width = 320;
        height = 50;
      }
    } else if (format === 'banner-468x60') {
      if (widthScreen >= 500) {
        key = 'c23ff469e6cf4ebe79b89e39501dffda';
        width = 468;
        height = 60;
      } else {
        key = '66aff07f840a9e35fb16f95c89f7f1a0';
        width = 320;
        height = 50;
      }
    } else if (format === 'mobile-320x50') {
      key = '66aff07f840a9e35fb16f95c89f7f1a0';
      width = 320;
      height = 50;
    } else if (format === 'rectangle-300x250' || format === 'in-article') {
      key = '40bbb936ec9dbc187eec10864cd97e57';
      width = 300;
      height = 250;
    } else {
      // 'responsive'
      if (widthScreen >= 800) {
        key = 'b019f458a4ecea96b1a9dd67ff3f2ba8';
        width = 728;
        height = 90;
      } else if (widthScreen >= 500) {
        key = '40bbb936ec9dbc187eec10864cd97e57';
        width = 300;
        height = 250;
      } else {
        key = '66aff07f840a9e35fb16f95c89f7f1a0';
        width = 320;
        height = 50;
      }
    }

    const iframe = document.createElement('iframe');
    iframe.width = String(width);
    iframe.height = String(height);
    iframe.style.border = 'none';
    iframe.style.overflow = 'hidden';
    iframe.style.margin = '0 auto';
    iframe.style.display = 'block';
    iframe.scrolling = 'no';

    container.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { margin: 0; padding: 0; overflow: hidden; display: flex; justify-content: center; align-items: center; background: transparent; }
            </style>
          </head>
          <body>
            <script type="text/javascript">
              atOptions = {
                'key' : '${key}',
                'format' : 'iframe',
                'height' : ${height},
                'width' : ${width},
                'params' : {}
              };
            </script>
            <script type="text/javascript" src="https://www.highrevenueformat.com/${key}/invoke.js"></script>
          </body>
        </html>
      `);
      doc.close();
    }
  }, [format]);

  return (
    <div
      className={`adsterra-banner-slot ${className ?? ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '16px auto',
        minHeight: format === 'rectangle-300x250' || format === 'in-article' ? '270px' : '70px',
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontSize: '0.58rem',
          color: 'var(--locz-text-muted, #94a3b8)',
          marginBottom: 4,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        Advertisement
      </span>
      <div
        ref={containerRef}
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          minWidth: '300px',
          minHeight: format === 'rectangle-300x250' || format === 'in-article' ? '250px' : '50px',
        }}
      />
    </div>
  );
}

export function AdsterraNative({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    container.innerHTML = '<div id="container-17356faf2a2167079c3b1b15a9920001"></div>';

    const script = document.createElement('script');
    script.async = true;
    script.setAttribute('data-cfasync', 'false');
    script.src =
      'https://pl31052061.profitableratecpmnetwork.com/17356faf2a2167079c3b1b15a9920001/invoke.js';
    container.appendChild(script);
  }, []);

  return (
    <div
      className={`adsterra-native-slot ${className ?? ''}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        margin: '20px auto',
        width: '100%',
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontSize: '0.58rem',
          color: 'var(--locz-text-muted, #94a3b8)',
          marginBottom: 4,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        Sponsored Content
      </span>
      <div
        ref={containerRef}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          minHeight: '120px',
        }}
      />
    </div>
  );
}
