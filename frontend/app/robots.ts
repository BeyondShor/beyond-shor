import type { MetadataRoute } from 'next';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/de/impressum',
          '/en/imprint',
          '/de/datenschutz',
          '/en/privacy-policy',
          '/de/about',
          '/en/about',
          '/de/kontakt',
          '/en/contact',
        ],
      },
    ],
    sitemap: `${BASE_URL}/sitemap.xml`,
  };
}
