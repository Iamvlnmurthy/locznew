import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'LocZ — Everything local, in one place',
    short_name: 'LocZ',
    description: 'Buy, sell, hire and discover trusted local businesses near you.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F4ED',
    theme_color: '#125B4C',
    orientation: 'portrait',
    icons: [
      {
        src: '/brand/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/brand/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
