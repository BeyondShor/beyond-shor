import type { MetadataRoute } from 'next';
import { getAllArticleSlugs } from '@/lib/strapi';
import { getPathname } from '@/i18n/navigation';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const LOCALES = ['de', 'en'] as const;

type Locale = (typeof LOCALES)[number];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // ─── Static pages ──────────────────────────────────────────────────────────
  const staticRoutes: Array<{
    href: Parameters<typeof getPathname>[0]['href'];
    changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'];
    priority: number;
  }> = [
    { href: '/',             changeFrequency: 'monthly', priority: 1.0 },
    { href: '/blog',         changeFrequency: 'weekly',  priority: 0.9 },
    { href: '/about',        changeFrequency: 'monthly', priority: 0.6 },
    { href: '/kontakt',      changeFrequency: 'monthly', priority: 0.6 },
    { href: '/impressum',    changeFrequency: 'monthly', priority: 0.6 },
    { href: '/datenschutz',  changeFrequency: 'monthly', priority: 0.6 },
    { href: '/playground',   changeFrequency: 'monthly', priority: 0.6 },
    { href: '/verify',       changeFrequency: 'monthly', priority: 0.6 },
  ];

  for (const locale of LOCALES) {
    for (const { href, changeFrequency, priority } of staticRoutes) {
      const path = getPathname({ locale, href });
      entries.push({
        url: `${BASE_URL}${path === '/' ? `/${locale}` : path}`,
        changeFrequency,
        priority,
      });
    }
  }

  // ─── Article pages ─────────────────────────────────────────────────────────
  for (const locale of LOCALES) {
    try {
      const slugs = await getAllArticleSlugs(locale);
      for (const slug of slugs) {
        const path = getPathname({ locale, href: { pathname: '/blog/[slug]', params: { slug } } });
        entries.push({
          url: `${BASE_URL}${path}`,
          changeFrequency: 'monthly',
          priority: 0.8,
        });
      }
    } catch {
      // Strapi offline during build — skip article URLs for this locale
    }
  }

  return entries;
}
