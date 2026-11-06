import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

interface Props {
  currentPage: number;
  pageCount: number;
  /** Optional category filter carried along on every page link. */
  category?: string | null;
}

type Item = number | 'gap';

/**
 * First page, last page and the current page with one neighbour on each side;
 * everything else collapses into an ellipsis. A gap that would hide a single
 * page shows that page instead, since the ellipsis would be just as wide.
 * At most seven items, so the bar plus both arrows fits a 375px screen.
 */
function pageItems(current: number, count: number): Item[] {
  const shown = new Set([1, count, current - 1, current, current + 1]);
  const pages = [...shown].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const items: Item[] = [];
  for (const p of pages) {
    const prev = items.length ? (items[items.length - 1] as number) : 0;
    if (p - prev === 2) items.push(prev + 1);
    else if (p - prev > 2) items.push('gap');
    items.push(p);
  }
  return items;
}

export function blogHref(page: number, category?: string | null) {
  const query: Record<string, string> = {};
  if (category) query.category = category;
  if (page > 1) query.page = String(page);
  return { pathname: '/blog' as const, query };
}

const box = 'h-9 w-8 sm:w-9 rounded border font-mono text-sm flex items-center justify-center';
const idle =
  'border-[var(--color-border)] text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]';

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true">
      <path d={dir === 'left' ? 'M10 3 5 8l5 5' : 'M6 3l5 5-5 5'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default async function Pagination({ currentPage, pageCount, category }: Props) {
  if (pageCount <= 1) return null;
  const t = await getTranslations('blog');

  const arrow = (target: number, dir: 'left' | 'right', label: string) =>
    target >= 1 && target <= pageCount ? (
      <Link href={blogHref(target, category)} className={`${box} ${idle}`} aria-label={label} rel={dir === 'left' ? 'prev' : 'next'}>
        <Chevron dir={dir} />
      </Link>
    ) : (
      <span className={`${box} border-[var(--color-border)] text-[var(--color-text-muted)] opacity-40`} aria-hidden="true">
        <Chevron dir={dir} />
      </span>
    );

  return (
    <nav className="mt-12 flex justify-center gap-1 sm:gap-2" aria-label={t('pagination')}>
      {arrow(currentPage - 1, 'left', t('paginationPrev'))}
      {pageItems(currentPage, pageCount).map((item, i) =>
        item === 'gap' ? (
          <span key={`gap-${i}`} className={`${box} border-transparent text-[var(--color-text-muted)]`} aria-hidden="true">
            …
          </span>
        ) : (
          <Link
            key={item}
            href={blogHref(item, category)}
            className={`${box} ${
              item === currentPage
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-bg-base)] font-bold'
                : idle
            }`}
            aria-label={`${t('paginationPage')} ${item}`}
            aria-current={item === currentPage ? 'page' : undefined}
          >
            {item}
          </Link>
        ),
      )}
      {arrow(currentPage + 1, 'right', t('paginationNext'))}
    </nav>
  );
}
