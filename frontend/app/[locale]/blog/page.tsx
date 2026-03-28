import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getArticles, getCategories } from '@/lib/strapi';
import ArticleCard from '@/components/ArticleCard';
import CategoryFilterDropdown from '@/components/CategoryFilterDropdown';

interface BlogPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string; category?: string }>;
}

const PAGE_SIZE = 9;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'blog' });
  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    title: t('pageTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${BASE_URL}/${locale}/blog`,
      languages: {
        de: `${BASE_URL}/de/blog`,
        en: `${BASE_URL}/en/blog`,
      },
    },
    openGraph: {
      title: `Beyond Shor — ${t('pageTitle')}`,
      type: 'website',
    },
  };
}

export default async function BlogPage({ params, searchParams }: BlogPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('blog');
  const { page: pageParam, category: categoryParam } = await searchParams;
  const currentPage = Math.max(1, Number(pageParam ?? 1));
  const activeCategory = categoryParam ?? null;

  let articles: Awaited<ReturnType<typeof getArticles>>['data'] = [];
  let pagination = { page: 1, pageCount: 1, total: 0, pageSize: PAGE_SIZE };
  const categories = await getCategories(locale);

  try {
    const res = await getArticles(currentPage, PAGE_SIZE, locale, activeCategory ?? undefined);
    articles = res.data;
    pagination = res.meta.pagination;
  } catch {
    // Strapi offline — show empty state
  }

  // Build pagination href preserving the active category filter
  function pageHref(p: number) {
    const query: Record<string, string> = {};
    if (activeCategory) query.category = activeCategory;
    if (p > 1) query.page = String(p);
    return { pathname: '/blog' as const, query };
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

          {/* Pagination */}
          {pagination.pageCount > 1 && (
            <nav
              className="mt-12 flex justify-center gap-2"
              aria-label={t('pagination')}
            >
              {Array.from({ length: pagination.pageCount }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={pageHref(p)}
                  className={`h-9 w-9 rounded border font-mono text-sm flex items-center justify-center transition-colors ${
                    p === currentPage
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-bg-base)] font-bold'
                      : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                  }`}
                  aria-label={`${t('paginationPage')} ${p}`}
                  aria-current={p === currentPage ? 'page' : undefined}
                >
                  {p}
                </Link>
              ))}
            </nav>
          )}
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
