import type {
  Article,
  About,
  Category,
  Global,
  StrapiListResponse,
  StrapiSingleResponse,
} from './types';
import type { TimelineEvent, TimelineCategory } from './parseTimeline';

const STRAPI_URL = process.env.STRAPI_URL ?? 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN;

// ─── Core Fetcher ────────────────────────────────────────────────────────────

async function strapiGet<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`${STRAPI_URL}/api/${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (STRAPI_API_TOKEN) headers['Authorization'] = `Bearer ${STRAPI_API_TOKEN}`;

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      headers,
      next: { revalidate: process.env.NODE_ENV === 'development' ? 0 : 60 },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    throw new Error(
      `Strapi API error ${res.status} on /${path}: ${res.statusText}`,
    );
  }

  return res.json() as Promise<T>;
}

// ─── Media URL Helper ────────────────────────────────────────────────────────

/**
 * Returns a URL for a Strapi media asset.
 * Relative paths (e.g. /uploads/foo.jpg) are kept as-is so Next.js
 * serves them through the /uploads rewrite proxy, allowing <Image>
 * to treat them as local assets and optimize them without needing
 * remotePatterns. Absolute URLs are passed through unchanged.
 */
export function getStrapiUrl(relativeUrl: string | undefined | null): string | null {
  if (!relativeUrl) return null;
  if (relativeUrl.startsWith('http')) return relativeUrl;
  return relativeUrl; // kept relative → served via Next.js rewrite proxy
}

// ─── Articles ────────────────────────────────────────────────────────────────

export async function getArticles(
  page = 1,
  pageSize = 9,
  locale = 'de',
  categorySlug?: string,
): Promise<StrapiListResponse<Article>> {
  return strapiGet<StrapiListResponse<Article>>('articles', {
    'populate[0]': 'author',
    'populate[1]': 'author.avatar',
    'populate[2]': 'category',
    'sort[0]': 'publishedAt:desc',
    'filters[publishedAt][$notNull]': 'true',
    ...(categorySlug ? { 'filters[category][slug][$eq]': categorySlug } : {}),
    'pagination[page]': String(page),
    'pagination[pageSize]': String(pageSize),
    locale,
  });
}

export async function getCategories(locale = 'de'): Promise<Category[]> {
  try {
    const res = await strapiGet<StrapiListResponse<Category>>('categories', {
      'sort[0]': 'name:asc',
      'pagination[pageSize]': '50',
      locale,
    });
    return res.data;
  } catch (err) {
    console.error('[strapi] getCategories:', err);
    return [];
  }
}

export async function getArticleBySlug(slug: string, locale = 'de'): Promise<Article | null> {
  const res = await strapiGet<StrapiListResponse<Article>>('articles', {
    'filters[slug][$eq]': slug,
    'populate[0]': 'author',
    'populate[1]': 'author.avatar',
    'populate[2]': 'category',
    'populate[3]': 'blocks',
    'populate[4]': 'blocks.file',
    'populate[5]': 'blocks.files',
    locale,
  });
  return res.data[0] ?? null;
}

export async function getAllArticleSlugs(locale = 'de'): Promise<string[]> {
  const res = await strapiGet<StrapiListResponse<Article>>('articles', {
    'fields[0]': 'slug',
    'filters[publishedAt][$notNull]': 'true',
    'pagination[pageSize]': '100',
    locale,
  });
  return res.data.map((a) => a.slug);
}

/** Returns all published article slugs with their blog paths for auto-linking. */
export async function getAllArticleLinks(
  locale = 'de',
): Promise<{ slug: string; path: string }[]> {
  const slugs = await getAllArticleSlugs(locale);
  return slugs.map((slug) => ({ slug, path: `/blog/${slug}` }));
}

/** Returns the slug of an article in a specific locale, looked up by documentId. */
export async function getArticleSlugByDocumentId(
  documentId: string,
  locale: string,
): Promise<string | null> {
  try {
    const res = await strapiGet<StrapiListResponse<Article>>('articles', {
      'filters[documentId][$eq]': documentId,
      'fields[0]': 'slug',
      'filters[publishedAt][$notNull]': 'true',
      locale,
    });
    return res.data[0]?.slug ?? null;
  } catch (err) {
    console.error('[strapi] getArticleSlugByDocumentId:', err);
    return null;
  }
}

export async function getRelatedArticles(
  categorySlug: string,
  currentSlug: string,
  locale = 'de',
  limit = 3,
): Promise<Article[]> {
  try {
    const res = await strapiGet<StrapiListResponse<Article>>('articles', {
      'populate[0]': 'author',
      'populate[1]': 'author.avatar',
      'populate[2]': 'category',
      'filters[category][slug][$eq]': categorySlug,
      'filters[slug][$ne]': currentSlug,
      'filters[publishedAt][$notNull]': 'true',
      'sort[0]': 'publishedAt:desc',
      'pagination[pageSize]': String(limit),
      locale,
    });
    return res.data;
  } catch (err) {
    console.error('[strapi] getRelatedArticles:', err);
    return [];
  }
}

export async function getArticlesForFeed(
  locale = 'de',
  pageSize = 20,
): Promise<StrapiListResponse<Article>> {
  return strapiGet<StrapiListResponse<Article>>('articles', {
    'populate[0]': 'blocks',
    'sort[0]': 'publishedAt:desc',
    'filters[publishedAt][$notNull]': 'true',
    'pagination[pageSize]': String(pageSize),
    locale,
  });
}

// ─── Timeline Events ─────────────────────────────────────────────────────────

type TimelineMonth =
  | 'JANUARY' | 'FEBRUARY' | 'MARCH'     | 'APRIL'
  | 'MAY'     | 'JUNE'     | 'JULY'      | 'AUGUST'
  | 'SEPTEMBER' | 'OCTOBER' | 'NOVEMBER' | 'DECEMBER';

interface StrapiTimelineEvent {
  id: number;
  documentId: string;
  title: string;
  year: number;
  month: TimelineMonth | null;
  isApproximate: boolean;
  category: TimelineCategory;
  description: string;
  caveat: string | null;
}

const MONTH_NUM: Record<TimelineMonth, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3,    APRIL: 4,
  MAY: 5,     JUNE: 6,     JULY: 7,     AUGUST: 8,
  SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
};

const MONTH_SHORT: Record<'de' | 'en', string[]> = {
  de: ['Jan','Feb','Mrz','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'],
  en: ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
};

export async function getTimelineEvents(locale = 'de'): Promise<TimelineEvent[]> {
  try {
    const res = await strapiGet<StrapiListResponse<StrapiTimelineEvent>>('timeline-events', {
      'sort[0]': 'year:asc',
      'sort[1]': 'month:asc',
      'pagination[pageSize]': '100',
      locale,
    });

    const shorts = MONTH_SHORT[locale as 'de' | 'en'] ?? MONTH_SHORT.de;

    // Apply same-year/same-month deduplication offset so dots don't overlap
    const yearKeyCount: Record<string, number> = {};

    return res.data.map((e) => {
      const monthNum  = e.month ? MONTH_NUM[e.month] : null;
      const fraction  = monthNum ? (monthNum - 1) / 12 : 0;
      const baseDecimal = e.year + fraction;
      const key       = baseDecimal.toFixed(4);
      const count     = yearKeyCount[key] ?? 0;
      yearKeyCount[key] = count + 1;

      const label = e.isApproximate
        ? `~${e.year}`
        : monthNum
          ? `${e.year} (${shorts[monthNum - 1]})`
          : `${e.year}`;

      return {
        year:     baseDecimal + count * 0.15,
        label,
        title:    e.title,
        category: e.category,
        desc:     e.description,
        caveat:   e.caveat ?? undefined,
      };
    });
  } catch (err) {
    console.error('[strapi] getTimelineEvents:', err);
    return [];
  }
}

// ─── Global / About ──────────────────────────────────────────────────────────

export async function getGlobal(locale = 'de'): Promise<Global | null> {
  try {
    const res = await strapiGet<StrapiSingleResponse<Global>>('global', {
      'populate[0]': 'favicon',
      'populate[1]': 'defaultSeo',
      'populate[2]': 'defaultSeo.shareImage',
      locale,
    });
    return res.data;
  } catch (err) {
    console.error('[strapi] getGlobal:', err);
    return null;
  }
}

export async function getAbout(locale = 'de'): Promise<About | null> {
  try {
    const res = await strapiGet<StrapiSingleResponse<About>>('about', {
      'populate[0]': 'blocks',
      'populate[1]': 'blocks.file',
      'populate[2]': 'blocks.files',
      locale,
    });
    return res.data;
  } catch (err) {
    console.error('[strapi] getAbout:', err);
    return null;
  }
}

export async function getImpressum(locale = 'de'): Promise<About | null> {
  try {
    const res = await strapiGet<StrapiSingleResponse<About>>('impressum', {
      'populate[0]': 'blocks',
      'populate[1]': 'blocks.file',
      'populate[2]': 'blocks.files',
      locale,
    });
    return res.data;
  } catch (err) {
    console.error('[strapi] getImpressum:', err);
    return null;
  }
}

export async function getDatenschutz(locale = 'de'): Promise<About | null> {
  try {
    const res = await strapiGet<StrapiSingleResponse<About>>('datenschutz', {
      'populate[0]': 'blocks',
      'populate[1]': 'blocks.file',
      'populate[2]': 'blocks.files',
      locale,
    });
    return res.data;
  } catch (err) {
    console.error('[strapi] getDatenschutz:', err);
    return null;
  }
}

export interface PlaygroundRealWorldItem {
  name:        string;
  description: string;
  link?:       string;
}

export interface PlaygroundPageData {
  realWorldItems:    PlaygroundRealWorldItem[];
  sigRealWorldItems: PlaygroundRealWorldItem[];
}

export async function getPlaygroundPage(locale = 'de'): Promise<PlaygroundPageData | null> {
  try {
    const res = await strapiGet<StrapiSingleResponse<PlaygroundPageData>>('playground-page', {
      'populate[0]': 'realWorldItems',
      'populate[1]': 'sigRealWorldItems',
      locale,
    });
    return res.data;
  } catch (err) {
    console.error('[strapi] getPlaygroundPage:', err);
    return null;
  }
}
