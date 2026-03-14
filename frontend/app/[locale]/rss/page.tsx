import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getArticlesForFeed } from '@/lib/strapi';
import type { RichTextBlock } from '@/lib/types';
import RssCopyButton from '@/components/RssCopyButton';

interface PageProps {
  params: Promise<{ locale: string }>;
}

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'rss' });
  return {
    title: t('title'),
    description: t('metaDescription'),
  };
}

export default async function RssPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('rss');
  const feedUrl = `${SITE_URL}/${locale}/feed.xml`;

  const res = await getArticlesForFeed(locale, 3).catch(() => null);
  const articles = res?.data ?? [];

  return (
    <div className="bg-[var(--color-bg-surface)]">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24">

        {/* Header */}
        <header className="mb-10">
          <p className="mono-label text-[var(--color-primary)] mb-2">{t('label')}</p>
          <h1 className="text-3xl font-bold text-[var(--color-text-base)] sm:text-4xl mb-4">
            {t('title')}
          </h1>
          <p className="text-[var(--color-text-muted)] leading-relaxed">{t('intro')}</p>
        </header>

        {/* Feed URL + Copy */}
        <div className="mb-8">
          <p className="mono-label text-[var(--color-text-muted)] mb-3">{t('feedUrlLabel')}</p>
          <RssCopyButton
            url={feedUrl}
            copyLabel={t('copyButton')}
            copiedLabel={t('copied')}
          />
        </div>

        {/* Article preview */}
        <div className="mb-12">
          <p className="mono-label text-[var(--color-primary)] mb-4">{t('previewLabel')}</p>
          {articles.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] font-mono">{t('previewEmpty')}</p>
          ) : (
            <ol className="space-y-6" aria-label="Vorschau RSS-Einträge">
              {articles.map((article) => {
                const firstRichText = article.blocks?.find(
                  (b): b is RichTextBlock => b.__component === 'shared.rich-text',
                );
                const teaser = firstRichText ? stripMarkdown(firstRichText.body) : null;
                const pubDate = new Date(article.publishedAt).toLocaleDateString(
                  locale === 'de' ? 'de-DE' : 'en-GB',
                  { day: 'numeric', month: 'long', year: 'numeric' },
                );

                return (
                  <li
                    key={article.id}
                    className="rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-base)] p-5"
                  >
                    <p className="font-mono text-[10px] text-[var(--color-text-dim)] mb-2 uppercase tracking-widest">
                      {pubDate}
                    </p>
                    <Link
                      href={`/blog/${article.slug}`}
                      className="font-semibold text-[var(--color-text-base)] hover:text-[var(--color-primary)] transition-colors block mb-2"
                    >
                      {article.title}
                    </Link>
                    {teaser && (
                      <p className="text-sm text-[var(--color-text-muted)] leading-relaxed line-clamp-3">
                        {teaser}
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Back link */}
        <Link
          href="/blog"
          className="mono-label text-[var(--color-primary)] hover:opacity-80 transition-opacity"
        >
          {t('backToBlog')}
        </Link>

      </div>
    </div>
  );
}
