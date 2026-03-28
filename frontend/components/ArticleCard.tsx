import Image from 'next/image';
import { Link } from '@/i18n/navigation';
import type { Article } from '@/lib/types';
import { getStrapiUrl } from '@/lib/strapi';

interface ArticleCardProps {
  article: Article;
  locale?: string;
}

export default function ArticleCard({ article, locale }: ArticleCardProps) {
  const formattedDate = article.publishedAt
    ? new Date(article.publishedAt).toLocaleDateString(
        locale === 'de' ? 'de-DE' : 'en-US',
        { year: 'numeric', month: 'long', day: 'numeric' },
      )
    : null;

  return (
    <article
      className="group flex flex-col rounded-xl glass-panel overflow-hidden card-glass-hover"
      aria-label={`Article: ${article.title}`}
    >
      {/* Cyan accent line */}
      <div className="h-px w-full bg-gradient-to-r from-[var(--color-primary)] via-[var(--color-primary)]/40 to-transparent" />

      <div className="flex flex-1 flex-col gap-3 p-5">
        {/* Category badge */}
        {article.category && (
          <span className="mono-label text-[var(--color-primary)] inline-flex w-fit px-2 py-0.5 rounded-full border border-[var(--color-glass-border)] bg-[rgba(6,182,212,0.07)]">
            {article.category.name}
          </span>
        )}

        {/* Title */}
        <h2 className="text-lg font-semibold text-[var(--color-text-base)] leading-snug">
          <Link
            href={{ pathname: '/blog/[slug]', params: { slug: article.slug } }}
            className="hover:text-[var(--color-primary)] transition-colors"
          >
            {article.title}
          </Link>
        </h2>

        {/* Description */}
        {article.description && (
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed line-clamp-4 flex-1">
            {article.description}
          </p>
        )}

        {/* Footer meta */}
        <div className="flex items-center justify-between pt-2 border-t border-[var(--color-glass-border)]">
          {/* Author */}
          {article.author && (
            <Link href="/about" className="flex items-center gap-2 hover:text-[var(--color-primary)] transition-colors group/author">
              {article.author.avatar && (
                <Image
                  src={getStrapiUrl(article.author.avatar.url) ?? ''}
                  alt={article.author.name}
                  width={24}
                  height={24}
                  className="rounded-full object-cover ring-1 ring-[var(--color-glass-border)] shadow-[0_0_8px_rgba(6,182,212,0.25)]"
                />
              )}
              <span className="text-xs text-[var(--color-text-muted)] group-hover/author:text-[var(--color-primary)] transition-colors">
                {article.author.name}
              </span>
            </Link>
          )}

          {/* Date */}
          {formattedDate && (
            <time
              dateTime={article.publishedAt}
              className="text-xs text-[var(--color-text-muted)] font-mono"
            >
              {formattedDate}
            </time>
          )}
        </div>
      </div>
    </article>
  );
}
