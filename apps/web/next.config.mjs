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
       * host it believes it is running on. Behind a reverse proxy that belief comes from
       * forwarded headers, and when those do not agree with the browser's Origin the action
       * fails with `TypeError: Invalid URL` — a 500 with no hint that the cause is
       * configuration. On this deployment that meant *every* Server Action broke while
       * ordinary page loads worked, so choosing a location silently did nothing.
       *
       * Listed explicitly rather than inferred, because the application answers on several
       * names and the proxy does not rewrite them.
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
