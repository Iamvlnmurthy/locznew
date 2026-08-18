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

/**
 * The origin an environment variable names, or null when it is absent or malformed.
 *
 * Used to derive both the image allowlist and the CSP from the configuration that is actually
 * in force, so neither has to be edited by hand when the storage bucket or API host moves —
 * and so a missing variable produces a policy that is too strict (visibly broken images in
 * development) rather than one that is too loose.
 */
function originOf(value) {
  if (!value) return null;
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

const mediaHost = originOf(process.env.STORAGE_PUBLIC_BASE_URL ?? process.env.STORAGE_ENDPOINT);
const apiHost = originOf(process.env.NEXT_PUBLIC_API_BASE_URL);

/** Prefixed with a space so it appends cleanly to a directive that may already have sources. */
const mediaOrigin = mediaHost ? ` ${mediaHost.origin}` : '';
const apiOrigin = apiHost ? apiHost.origin : '';

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
    /**
     * Listing images come from R2 in production and MinIO locally.
     *
     * Named hosts, not `hostname: '**'`. A wildcard turns `/_next/image` into an open image
     * proxy for the entire web: anybody can pass any HTTPS URL and have this server fetch,
     * re-encode and cache it, on our bandwidth and from our address. The host is derived from
     * the storage URL that is actually configured, so nothing has to be kept in step by hand.
     */
    remotePatterns: [
      ...(mediaHost
        ? [
            {
              protocol: mediaHost.protocol.replace(':', ''),
              hostname: mediaHost.hostname,
              ...(mediaHost.port ? { port: mediaHost.port } : {}),
            },
          ]
        : []),
      { protocol: 'http', hostname: 'localhost', port: '9000' },
      { protocol: 'http', hostname: '127.0.0.1', port: '9000' },
      // The Android emulator's route to the host machine, for local device testing.
      { protocol: 'http', hostname: '10.0.2.2', port: '9000' },
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
          {
            /**
             * The public site had no CSP at all.
             *
             * The API disables helmet's on the grounds that "CSP is left to Nginx and the
             * Next.js apps", Nginx sets none for this host, and this file set every other
             * security header but not this one — so the one surface that renders untrusted
             * listing titles, descriptions, seller names and business names to anonymous
             * visitors at scale was the one without a policy, while the admin console had a
             * strict one.
             *
             * `'unsafe-inline'` on scripts is required by Next's inline bootstrap and by the
             * JSON-LD blocks the listing, business and city pages emit. Those are built from
             * `JSON.stringify` of server-side data with `<` escaped, never from raw user
             * HTML — the escaping is what makes them safe, not the policy.
             */
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              // Listing photographs are signed URLs on the storage host; `data:` covers the
              // blur placeholders Next inlines.
              `img-src 'self' data: blob:${mediaOrigin}`,
              "style-src 'self' 'unsafe-inline'",
              "script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com",
              `connect-src 'self' ${apiOrigin} https://accounts.google.com`.trim(),
              "font-src 'self' data:",
              // Google renders its sign-in button inside an iframe it serves itself.
              "frame-src https://accounts.google.com",
              "frame-ancestors 'self'",
              "base-uri 'self'",
              // Nothing on this site posts a form anywhere but back to it.
              "form-action 'self'",
              "object-src 'none'",
            ].join('; '),
          },
          {
            // Google's sign-in popup calls window.postMessage back to this page; the stricter
            // same-origin value severs that and sign-in silently never completes.
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin-allow-popups',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
