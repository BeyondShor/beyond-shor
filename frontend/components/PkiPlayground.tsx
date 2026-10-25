'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

// Each PKI demo is a page of its own plus the article that explains it.
// New demos get an entry here and their texts under `pkiPlayground.demos.<key>`.
const DEMOS = [
  { key: 'rbe', demo: { pathname: '/rbe' }, article: { pathname: '/blog/[slug]', params: { slug: 'rbe' } } },
] as const;

export default function PkiPlayground() {
  const t = useTranslations('pkiPlayground');

  return (
    <div className="flex flex-col gap-8">
      <header>
        <p className="mono-label text-[var(--color-primary)] mb-2">{t('label')}</p>
        <h2 className="text-2xl font-bold text-[var(--color-text-base)] sm:text-3xl">{t('title')}</h2>
        <p className="mt-4 max-w-2xl text-[var(--color-text-muted)] leading-relaxed">{t('intro')}</p>
      </header>

      <ul className="grid gap-4 list-none m-0 p-0">
        {DEMOS.map(({ key, demo, article }) => (
          <li key={key}>
            <article className="glass-panel card-glass-hover rounded-xl p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2 mb-3 font-mono text-xs">
                <span className="rounded border border-amber-500/40 px-1.5 py-0.5 text-amber-400">
                  {t(`demos.${key}.badge`)}
                </span>
                <span className="text-[var(--color-text-muted)]">{t(`demos.${key}.meta`)}</span>
              </div>
              <h3 className="text-lg font-semibold text-[var(--color-text-base)] leading-snug">
                {t(`demos.${key}.title`)}
              </h3>
              <p className="mt-2 text-sm text-[var(--color-text-muted)] leading-relaxed">
                {t(`demos.${key}.desc`)}
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
                <Link
                  href={demo}
                  className="group inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-primary)]/40 bg-[var(--color-primary)]/10 px-4 py-2 font-mono text-sm text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 transition-colors"
                >
                  {t('openDemo')}
                  <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
                </Link>
                <Link
                  href={article}
                  className="font-mono text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
                >
                  {t('readArticle')}
                </Link>
              </div>
            </article>
          </li>
        ))}
      </ul>

      <p className="font-mono text-xs text-[var(--color-text-muted)]">{t('more')}</p>
    </div>
  );
}
