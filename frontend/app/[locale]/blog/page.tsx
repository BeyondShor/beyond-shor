import type { Metadata } from 'next';
import { pageMeta, absoluteUrl } from '@/lib/seo';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { redirect } from '@/i18n/navigation';
import { getArticles, getCategories, getCategorySlugs } from '@/lib/strapi';
import ArticleCard from '@/components/ArticleCard';
import CategoryFilterDropdown from '@/components/CategoryFilterDropdown';
import Pagination, { blogHref } from '@/components/Pagination';

type SearchParams = Promise<{ page?: string | string[]; category?: string | string[] }>;

interface BlogPageProps {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}

const PAGE_SIZE = 9;

const first = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);

/**
 * Reads ?page and ?category. `canonical` is false when the URL is not in its
 * normal form (?page=abc, ?page=1, ?page=02, repeated or empty parameters), so
 * the page can redirect to the one URL that serves this content.
 */
function parseQuery(raw: Awaited<SearchParams>) {
  const pageStr = first(raw.page);
  const category = first(raw.category) || null;
  const valid = pageStr === undefined || /^[1-9]\d*$/.test(pageStr);
  const page = valid && pageStr ? Number(pageStr) : 1;
  const canonical =
    valid &&
    pageStr !== '1' &&
    !Array.isArray(raw.page) &&
    !Array.isArray(raw.category) &&
    raw.category !== '';
  return { page, category, canonical };
}

export async function generateMetadata({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: SearchParams }): Promise<Metadata> {
  const { locale } = await params;
  const { page, category } = parseQuery(await searchParams);
  const t = await getTranslations({ locale, namespace: 'blog' });
  const title = page > 1 ? `${t('pageTitle')} – ${t('paginationPage')} ${page}` : t('pageTitle');
  const description = t('metaDescription');

  // hreflang: category slugs differ per language, so each alternate carries
  // that language's slug (or no filter if the category does not exist there).
  // Page numbers are dropped: the languages need not have the same number of
  // articles, so a page 3 in one may not exist in the other.
  const slugs = category ? await getCategorySlugs(category) : null;
  const alt = (l: string) => absoluteUrl(l, blogHref(1, slugs?.[l] ?? null));
  const meta = pageMeta(locale, blogHref(1, category), { title: `Beyond Shor — ${title}`, description });
  const self = absoluteUrl(locale, blogHref(page, category));
  return {
    title,
    description,
    ...meta,
    alternates: { canonical: self, languages: { de: alt('de'), en: alt('en'), 'x-default': alt('de') } },
    openGraph: { ...meta.openGraph, url: self },
  };
}

export default async function BlogPage({ params, searchParams }: BlogPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('blog');
  const { page: currentPage, category: requestedCategory, canonical } = parseQuery(await searchParams);
  const categories = await getCategories(locale);

  // A slug from the other language (e.g. after switching language) is
  // translated; an unknown one would only show an empty list, so the filter
  // is dropped. Only when the category list loaded — empty means Strapi is down.
  let activeCategory = requestedCategory;
  if (requestedCategory && categories.length > 0 && !categories.some((c) => c.slug === requestedCategory)) {
    activeCategory = (await getCategorySlugs(requestedCategory))?.[locale] ?? null;
  }
  if (!canonical || activeCategory !== requestedCategory) {
    redirect({ href: blogHref(currentPage, activeCategory), locale });
  }

  let articles: Awaited<ReturnType<typeof getArticles>>['data'] = [];
  let pagination = { page: 1, pageCount: 1, total: 0, pageSize: PAGE_SIZE };
  let loaded = false;

  try {
    const res = await getArticles(currentPage, PAGE_SIZE, locale, activeCategory ?? undefined);
    articles = res.data;
    pagination = res.meta.pagination;
    loaded = true;
  } catch {
    // Strapi offline — show empty state
  }

  // Past the last page (e.g. an old link after articles were removed): go to
  // the last page that exists. Temporary redirect, the page may come back.
  if (loaded && currentPage > 1 && currentPage > pagination.pageCount) {
    redirect({ href: blogHref(pagination.pageCount, activeCategory), locale });
  }

  return (
    <div className="bg-[var(--color-bg-surface)]">
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
      {/* Page header */}
      <header className="mb-12">
        <p className="mono-label text-[var(--color-primary)] mb-2">{t('allArticlesLabel')}</p>
        <h1 className="text-3xl font-bold text-[var(--color-text-base)] sm:text-4xl">
          {t('pageTitle')}
        </h1>
        {pagination.total > 0 && (
          <p className="mt-3 text-sm text-[var(--color-text-muted)] font-mono">
            {t('articleCount', { count: pagination.total })}
          </p>
        )}
      </header>

      {/* Category filter */}
      {categories.length > 0 && (
        <div className="mb-10">
          <CategoryFilterDropdown categories={categories} activeCategory={activeCategory} />
        </div>
      )}

      {/* Article grid */}
      {articles.length > 0 ? (
        <section aria-label={t('articleList')}>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} locale={locale} />
            ))}
          </div>

          <Pagination currentPage={currentPage} pageCount={pagination.pageCount} category={activeCategory} />
        </section>
      ) : (
        <div
          className="rounded-lg border border-dashed border-[var(--color-border)] p-16 text-center"
          aria-live="polite"
        >
          <p className="font-mono text-[var(--color-primary)] text-sm mb-2">
            {t('noArticles')}
          </p>
          <p className="text-[var(--color-text-muted)] text-sm">
            {t('noArticlesDesc')}
          </p>
        </div>
      )}
    </div>
    </div>
  );
}
