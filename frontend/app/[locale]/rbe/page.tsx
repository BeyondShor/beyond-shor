import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import RbePlayground from '@/components/RbePlayground';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateStaticParams() {
  return [{ locale: 'de' }, { locale: 'en' }];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'rbe' });

  return {
    title: t('pageTitle'),
    description: t('metaDescription'),
    robots: { index: false, follow: false },
  };
}

// ── Parameter table data ──────────────────────────────────────────────────────

const PARAM_ROWS = [
  'q', 'nR', 'd', 'n', 'm', 'l', 'N',
] as const;

type ParamKey = typeof PARAM_ROWS[number];

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function RbePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'rbe' });

  return (
    <div className="bg-[var(--color-bg-surface)] min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">

        {/* ── Header ── */}
        <div className="mb-12">
          <p className="font-mono text-sm text-[var(--color-accent)] mb-3">
            {t('pageLabel')}
          </p>
          <h1 className="text-3xl font-bold text-[var(--color-text-base)] sm:text-4xl mb-4">
            {t('pageTitle')}
          </h1>
          <p className="text-[var(--color-text-muted)] leading-relaxed max-w-2xl">
            {t('intro')}
          </p>

          {/* Dev badge */}
          <span className="inline-flex items-center gap-2 mt-5 px-3 py-1 rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            {t('devBadge')}
          </span>
        </div>

        {/* ── Interactive demo ── */}
        <div className="mb-16">
          <RbePlayground />
        </div>

        {/* ── Parameter table ── */}
        <section>
          <h2 className="text-xl font-semibold text-[var(--color-text-base)] mb-2">
            {t('paramsTitle')}
          </h2>
          <p className="text-sm text-[var(--color-text-muted)] mb-3 max-w-2xl">
            {t('paramsSubtitle')}
          </p>
          <a
            href="https://eprint.iacr.org/2026/628"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mb-6 text-xs font-mono
              text-[var(--color-primary)] hover:underline"
          >
            ↗ {t('paperLinkText')}
          </a>

          <div className="rounded-xl border border-[var(--color-border)]">
            <table className="w-full text-sm table-fixed">
              <colgroup>
                <col className="w-16" />
                <col className="w-28" />
                <col className="w-28" />
                <col />
              </colgroup>
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-base)]">
                  <th className="px-4 py-3 text-left font-mono text-xs text-[var(--color-text-dim)] uppercase tracking-wider">
                    {t('paramColName')}
                  </th>
                  <th className="px-4 py-3 text-left font-mono text-xs text-[var(--color-text-dim)] uppercase tracking-wider">
                    {t('paramColDemo')}
                  </th>
                  <th className="px-4 py-3 text-left font-mono text-xs text-[var(--color-text-dim)] uppercase tracking-wider">
                    {t('paramColPaper')}
                  </th>
                  <th className="px-4 py-3 text-left font-mono text-xs text-[var(--color-text-dim)] uppercase tracking-wider hidden md:table-cell">
                    {t('paramColExplain')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {PARAM_ROWS.map((key: ParamKey, i) => (
                  <tr
                    key={key}
                    className={i % 2 === 0 ? 'bg-[var(--color-bg-surface)]' : 'bg-[var(--color-bg-base)]'}
                  >
                    <td className="px-4 py-3 font-mono text-[var(--color-accent)]">
                      {t(`param_${key}_name` as Parameters<typeof t>[0])}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--color-text-base)] break-words">
                      {t(`param_${key}_demo` as Parameters<typeof t>[0])}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--color-text-muted)] break-words">
                      {t(`param_${key}_paper` as Parameters<typeof t>[0])}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] hidden md:table-cell leading-relaxed">
                      {t(`param_${key}_explain` as Parameters<typeof t>[0])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Security note */}
          <p className="mt-4 text-xs font-mono text-[var(--color-text-dim)] flex items-center gap-2">
            <span className="text-amber-400">⚠</span>
            {t('securityNote')}
          </p>
        </section>

      </div>
    </div>
  );
}
