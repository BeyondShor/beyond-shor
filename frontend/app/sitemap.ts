import type { MetadataRoute } from 'next';
import { getAllArticleSlugs } from '@/lib/strapi';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const LOCALES = ['de', 'en'] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];

  // ─── Static pages ──────────────────────────────────────────────────────────
  const staticRoutes = ['', '/blog', '/about', '/kontakt', '/impressum', '/datenschutz', '/verify', '/playground', '/rss'];

  for (const locale of LOCALES) {
    for (const route of staticRoutes) {
      entries.push({
        url: `${BASE_URL}/${locale}${route}`,
        changeFrequency: route === '/blog' ? 'weekly' : 'monthly',
        priority: route === '' ? 1 : route === '/blog' ? 0.9 : 0.6,
      });
    }
  }

  // ─── Article pages ─────────────────────────────────────────────────────────
  for (const locale of LOCALES) {
    try {
      const slugs = await getAllArticleSlugs(locale);
      for (const slug of slugs) {
        entries.push({
          url: `${BASE_URL}/${locale}/blog/${slug}`,
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
