import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

/**
 * Load the monorepo's root `.env`, which Next does not look for on its own — it only reads a
 * `.env` inside the application directory. `NEXT_PUBLIC_*` is inlined at build time, so a
 * build that cannot see the file quietly ships localhost defaults. See the same block in
 * `apps/web/next.config.mjs` for the full account.
 */
loadEnv({ path: resolve(import.meta.dirname, '..', '..', '.env'), quiet: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // The workspace packages ship TypeScript source rather than a build step.
  transpilePackages: ['@locz/shared-types', '@locz/ui-tokens', '@locz/validation', '@locz/api-client'],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // The admin console shows unmoderated user content — including titles and
          // descriptions written by people trying to abuse the platform. These headers
          // are the backstop if any of it is ever rendered unescaped.
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            // Google's sign-in popup calls window.postMessage back to this page. The
            // stricter same-origin value severs that, and the sign-in silently never
            // completes; -allow-popups keeps the isolation and permits the reply.
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "img-src 'self' data: https: http://localhost:9000",
              // Google serves the button's stylesheet from its own origin; without this the
              // button renders but unstyled.
              "style-src 'self' 'unsafe-inline' https://accounts.google.com",
              // accounts.google.com is here for console sign-in and nothing else. Named
              // explicitly rather than widened: this header is strict because the console
              // renders unmoderated user content, and a wildcard would give that content a
              // way out.
              "script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com",
              "connect-src 'self' http://localhost:4000 https://accounts.google.com",
              // Google renders its button inside an iframe it serves itself.
              "frame-src https://accounts.google.com",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
