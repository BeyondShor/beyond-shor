import type {
  Article,
  About,
  Category,
  Global,
  StrapiListResponse,
  StrapiSingleResponse,
} from './types';

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
  } catch {
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
  } catch {
    return null;
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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
    return null;
  }
}
