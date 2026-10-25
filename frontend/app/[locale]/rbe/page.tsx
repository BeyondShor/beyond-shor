import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import RbePlayground from '@/components/RbePlayground';
import { PARAMS, derive } from '@/lib/rbe/params';

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

const PARAM_ROWS = ['construction', 'q', 'nR', 'n', 'd', 'l', 'N', 'ct'] as const;

type ParamKey = typeof PARAM_ROWS[number];

const DERIVED = derive(PARAMS);

// Demo values come straight from the parameters the code uses, so table and code cannot drift apart
const demoValues = (locale: string) => ({
  q:   PARAMS.q.toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB'),
  nR:  PARAMS.nR,
  n:   PARAMS.n,
  d:   DERIVED.d,
  m:   DERIVED.m,
  l:   PARAMS.ell,
  ids: 2 ** PARAMS.ell,
  N:   PARAMS.nMax,
  kib: Math.round(((DERIVED.width + PARAMS.k) * PARAMS.nR * Math.ceil(Math.log2(PARAMS.q))) / 8 / 1024),
});

const IMPL_NOTES = ['impl1', 'impl2', 'impl3', 'impl4', 'impl5', 'impl6'] as const;

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function RbePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: 'rbe' });

  return (
    <div className="bg-[var(--color-bg-surface)] min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">

        <Link
          href={{ pathname: '/playground', hash: 'pki' }}
          className="inline-block mb-8 font-mono text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
        >
          {t('backToPki')}
        </Link>

        {/* ── Header ── */}
        <div className="mb-12">
          <p className="font-mono text-sm text-[var(--color-primary)] mb-3">
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

          <div className="rounded-xl border border-[var(--color-border)] overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-base)]">
                  <th className="px-4 py-3 text-left mono-label text-[var(--color-text-muted)] w-[28%]">
                    {t('paramColName')}
                  </th>
                  <th className="px-4 py-3 text-left mono-label text-[var(--color-text-muted)] w-[22%]">
                    {t('paramColDemo')}
                  </th>
                  <th className="px-4 py-3 text-left mono-label text-[var(--color-text-muted)] w-[22%] hidden sm:table-cell">
                    {t('paramColPaper')}
                  </th>
                  <th className="px-4 py-3 text-left mono-label text-[var(--color-text-muted)] hidden md:table-cell">
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
                    <td className="px-4 py-3 font-mono text-[var(--color-primary)] align-top">
                      {t(`param_${key}_name` as Parameters<typeof t>[0])}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--color-text-base)] align-top">
                      {t(`param_${key}_demo` as Parameters<typeof t>[0], demoValues(locale))}
                    </td>
                    <td className="px-4 py-3 font-mono text-[var(--color-text-muted)] align-top hidden sm:table-cell">
                      {t(`param_${key}_paper` as Parameters<typeof t>[0])}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-muted)] hidden md:table-cell leading-relaxed align-top">
                      {t(`param_${key}_explain` as Parameters<typeof t>[0])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Security note */}
          <p className="mt-4 text-sm text-[var(--color-text-muted)] flex items-start gap-2 leading-relaxed">
            <span className="text-amber-400" aria-hidden="true">⚠</span>
            {t('securityNote')}
          </p>
        </section>

        {/* ── Implementation notes ── */}
        <section className="mt-12">
          <h2 className="text-xl font-semibold text-[var(--color-text-base)] mb-4">{t('implTitle')}</h2>
          <ul className="space-y-3 list-disc pl-5 text-sm text-[var(--color-text-muted)] leading-relaxed marker:text-[var(--color-primary)]">
            {IMPL_NOTES.map((key) => (
              <li key={key}>{t(key, { l: PARAMS.ell })}</li>
            ))}
          </ul>
        </section>

      </div>
    </div>
  );
}
