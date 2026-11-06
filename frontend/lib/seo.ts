import type { Metadata } from 'next';
import { getPathname } from '@/i18n/navigation';

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

type Href = Parameters<typeof getPathname>[0]['href'];

export function absoluteUrl(locale: string, href: Href): string {
  const path = getPathname({ locale, href });
  return `${BASE_URL}${path === '/' ? `/${locale}` : path}`;
}

export const OG_IMAGE = { url: '/og-default.png', width: 1200, height: 630, alt: 'Beyond Shor' };

/**
 * Canonical, hreflang (incl. x-default) and a complete openGraph block for a
 * static page. A page's openGraph replaces the layout's as a whole, so it has to
 * carry the image and site name again — forgetting that drops og:image.
 */
export function pageMeta(
  locale: string,
  href: Href,
  og: { title: string; description?: string },
): Pick<Metadata, 'alternates' | 'openGraph'> {
  const url = absoluteUrl(locale, href);
  return {
    alternates: {
      canonical: url,
      languages: {
        de: absoluteUrl('de', href),
        en: absoluteUrl('en', href),
        'x-default': absoluteUrl('de', href),
      },
    },
    openGraph: {
      type: 'website',
      siteName: 'Beyond Shor',
      locale: locale === 'de' ? 'de_DE' : 'en_US',
      url,
      title: og.title,
      description: og.description,
      images: [OG_IMAGE],
    },
  };
}
