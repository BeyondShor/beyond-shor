import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getArticleBySlug, getAllArticleSlugs, getArticleSlugByDocumentId, getStrapiUrl, getAllArticleLinks, getRelatedArticles } from '@/lib/strapi';
import BlockRenderer from '@/components/BlockRenderer';
import JsonLd from '@/components/JsonLd';
import PqcSignatureBadge from '@/components/PqcSignatureBadge';
import ArticleCard from '@/components/ArticleCard';
import TableOfContents from '@/components/TableOfContents';
import { extractHeadings } from '@/lib/headings';

// ─── Static Params ─────────────────────────────────────────────────────────────

export async function generateStaticParams() {
  const results: { locale: string; slug: string }[] = [];
  for (const locale of ['de', 'en']) {
    try {
      const slugs = await getAllArticleSlugs(locale);
      slugs.forEach((slug) => results.push({ locale, slug }));
    } catch {
      // Strapi offline — no static params for this locale
    }
  }
  return results;
}

// ─── Metadata ─────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const article = await getArticleBySlug(slug, locale);
  if (!article) return { title: 'Article not found' };

  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  const coverUrl = getStrapiUrl(article.cover?.url);
  const otherLocale = locale === 'de' ? 'en' : 'de';
  const otherSlug = await getArticleSlugByDocumentId(article.documentId, otherLocale);

  return {
    title: article.title,
    description: article.description ?? undefined,
    alternates: {
      canonical: `${BASE_URL}/${locale}/blog/${slug}`,
      languages: {
        [locale]: `${BASE_URL}/${locale}/blog/${slug}`,
        ...(otherSlug ? { [otherLocale]: `${BASE_URL}/${otherLocale}/blog/${otherSlug}` } : {}),
      },
    },
    openGraph: {
      title: article.title,
      description: article.description ?? undefined,
      type: 'article',
      publishedTime: article.publishedAt,
      authors: article.author?.name ? [article.author.name] : undefined,
      images: coverUrl
        ? [{ url: coverUrl, alt: article.cover?.alternativeText ?? article.title }]
        : [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Beyond Shor — Post-Quantum Cryptography' }],
    },
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function ArticlePage({ params }: PageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('article');

  const [article, autoLinks] = await Promise.all([
    getArticleBySlug(slug, locale),
    getAllArticleLinks(locale),
  ]);
  if (!article) notFound();

  const relatedArticles = article.category?.slug
    ? await getRelatedArticles(article.category.slug, slug, locale)
    : [];

  const headings = article.blocks?.length ? extractHeadings(article.blocks) : [];

  const coverUrl = getStrapiUrl(article.cover?.url);
  const authorAvatarUrl = getStrapiUrl(article.author?.avatar?.url);

  const formattedDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString(locale === 'de' ? 'de-DE' : 'en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : null;

  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description ?? undefined,
    datePublished: article.publishedAt,
    dateModified: article.updatedAt,
    ...(coverUrl ? { image: coverUrl } : {}),
    ...(article.author
      ? {
          author: {
            '@type': 'Person',
            name: article.author.name,
            email: article.author.email,
          },
        }
      : {}),
    publisher: {
      '@type': 'Organization',
      name: 'Beyond Shor',
    },
  };

  return (
    <>
      <JsonLd data={articleJsonLd} />

      {/* Surface background reduces harshness of white-on-black contrast for long-form reading */}
      <div className="bg-[var(--color-bg-surface)]">
      <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24" aria-label={article.title}>
        {/* Breadcrumb */}
        <nav className="mb-8" aria-label="Breadcrumb">
          <ol className="flex items-center gap-2 font-mono text-xs text-[var(--color-text-muted)]">
            <li>
              <Link href="/" className="hover:text-[var(--color-primary)] transition-colors">
                {t('breadcrumbHome')}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li>
              <Link href="/blog" className="hover:text-[var(--color-primary)] transition-colors">
                {t('breadcrumbBlog')}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li className="text-[var(--color-text-muted)] truncate max-w-[200px]" aria-current="page">
              {article.slug}
            </li>
          </ol>
        </nav>

        {/* Category */}
        {article.category && (
          <p className="mono-label text-[var(--color-primary)] mb-2">
            {article.category.name}
          </p>
        )}

        {/* Title */}
        <h1 className="text-3xl font-bold text-[var(--color-text-base)] leading-snug sm:text-4xl mb-6">
          {article.title}
        </h1>

        {/* Description lead */}
        {article.description && (
          <p className="text-lg text-[var(--color-text-muted)] leading-relaxed mb-8 border-l-2 border-[var(--color-primary)] pl-4">
            {article.description}
          </p>
        )}

        {/* Author + Date meta */}
        <div className="flex items-center gap-4 mb-10 pb-6 border-b border-[var(--color-border)]">
          {article.author && (
            <Link href="/about" className="flex items-center gap-4 group/author">
              {authorAvatarUrl && (
                <Image
                  src={authorAvatarUrl}
                  alt={article.author.name}
                  width={40}
                  height={40}
                  className="rounded-full object-cover ring-2 ring-[var(--color-border)] group-hover/author:ring-[var(--color-primary)] transition-all"
                />
              )}
              <p className="text-sm font-semibold text-[var(--color-text-base)] group-hover/author:text-[var(--color-primary)] transition-colors">
                {article.author.name}
              </p>
            </Link>
          )}
          {formattedDate && (
            <time
              dateTime={article.publishedAt}
              className="text-xs text-[var(--color-text-muted)] font-mono"
            >
              {formattedDate}
            </time>
          )}
        </div>

        {/* PQC Signature Badge */}
        {article.pqcSignature && (
          <PqcSignatureBadge
            signature={article.pqcSignature}
            documentId={article.documentId}
          />
        )}

        {/* Content blocks */}
        {article.blocks?.length > 0 && (
          <BlockRenderer blocks={article.blocks} autoLinks={autoLinks} currentSlug={slug} />
        )}

        <TableOfContents headings={headings} locale={locale} />

        {/* Back link */}
        <div className="mt-16 pt-8 border-t border-[var(--color-border)]">
          <Link
            href="/blog"
            className="mono-label text-[var(--color-primary)] hover:underline"
          >
            {t('backToBlog')}
          </Link>
        </div>
      </article>

      {/* Related articles */}
      {relatedArticles.length > 0 && (
        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="border-t border-[var(--color-border)] pt-12">
            <p className="mono-label text-[var(--color-primary)] mb-6">{t('related')}</p>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {relatedArticles.map((related) => (
                <ArticleCard key={related.documentId} article={related} locale={locale} />
              ))}
            </div>
          </div>
        </section>
      )}
      </div>
    </>
  );
}
