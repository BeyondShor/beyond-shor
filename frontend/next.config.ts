import type { NextConfig } from 'next';
import path from 'path';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const STRAPI_URL = process.env.STRAPI_URL ?? 'http://localhost:1337';

const nextConfig: NextConfig = {
  // Tell Next.js/Turbopack that the project root is this directory,
  // not the parent Strapi folder (which also has a lockfile).
  turbopack: {
    root: path.resolve(__dirname),
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options',       value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy',        value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy',     value: 'geolocation=(), microphone=(), camera=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://analytics.beyond-shor.eu",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self'",
              "frame-ancestors 'none'",
            ].join('; '),
          },
        ],
      },
    ];
  },

  // Proxy /uploads/* to Strapi so Next.js <Image> can optimize them
  // as "local" assets — bypasses the remotePatterns check entirely.
  async rewrites() {
    return [
      {
        source: '/uploads/:path*',
        destination: `${STRAPI_URL}/uploads/:path*`,
      },
    ];
  },

  images: {
    // remotePatterns kept for absolute Strapi URLs (e.g. external CDN).
    remotePatterns: [
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '1337',
        pathname: '/uploads/**',
      },
    ],
  },
};

export default withNextIntl(nextConfig);
