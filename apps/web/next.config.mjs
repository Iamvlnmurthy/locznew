import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

/**
 * Load the monorepo's root `.env` before the build reads any variable from it.
 *
 * Next only looks for `.env` inside the application directory, but this repository keeps a
 * single `.env` at the root that every workspace shares. `NEXT_PUBLIC_*` values are inlined
 * at *build* time, so a build that cannot see them silently bakes in the localhost defaults
 * from `src/lib/api.ts` and ships an application that talks to a server which isn't there.
 *
 * That failure is quiet in the worst way: the pages still render, and only data fetched
 * through the API comes back empty — on the deployed site it made every pincode look like a
 * typo. Loading the file here means a rebuild cannot reintroduce it.
 *
 * `override` is left off so a variable already set in the environment still wins, which is
 * what CI and one-off builds rely on.
 */
loadEnv({ path: resolve(import.meta.dirname, '..', '..', '.env'), quiet: true });

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@locz/shared-types', '@locz/ui-tokens', '@locz/validation', '@locz/api-client'],
  poweredByHeader: false,
  experimental: {
    serverActions: {
      /**
       * Every host this application is served from.
       *
       * A Server Action is a POST, and Next refuses one whose `Origin` does not match the
       * host it believes it is running on. Listed explicitly rather than inferred, because
       * the application answers on several names and the proxy does not rewrite them.
       *
       * Worth knowing: this allowlist does *not* address the duplicated `Origin` header that
       * the proxy sends. Next parses the header into a URL before consulting the list, so a
       * duplicated value throws `TypeError: Invalid URL` and never reaches this check. That
       * is repaired in `src/middleware.ts`; the two are unrelated defences.
       */
      allowedOrigins: ['locz.in', 'www.locz.in', 'staging.locz.in', 'localhost:3000'],
    },
  },
  images: {
    // Listing images come from R2 in production and MinIO locally.
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: 'localhost', port: '9000' },
    ],
    formats: ['image/webp'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
};

export default nextConfig;
