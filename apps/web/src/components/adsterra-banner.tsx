'use client';

import { useEffect, useRef } from 'react';

interface AdsterraBannerProps {
  format?: 'responsive' | '468x60' | '320x50';
  className?: string;
}

export function AdsterraBanner({ format = 'responsive', className }: AdsterraBannerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    container.innerHTML = '';

    const isMobile = typeof window !== 'undefined' ? window.innerWidth < 640 : false;
    const key =
      format === '320x50' || (format === 'responsive' && isMobile)
        ? '66aff07f840a9e35fb16f95c89f7f1a0'
        : 'c23ff469e6cf4ebe79b89e39501dffda';
    const width = key === '66aff07f840a9e35fb16f95c89f7f1a0' ? 320 : 468;
    const height = key === '66aff07f840a9e35fb16f95c89f7f1a0' ? 50 : 60;

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
        minHeight: '66px',
        maxWidth: '100%',
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          fontSize: '0.6rem',
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
          minWidth: '320px',
          minHeight: '50px',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      />
    </div>
  );
}
