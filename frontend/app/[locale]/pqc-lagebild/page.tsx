import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { pageMeta } from '@/lib/seo';
import {
  PQC_LAGEBILD_PUBLIC, loadLagebild, findCell, formatMonth, formatNumber, formatPercent,
  type Cell,
} from '@/lib/pqc-lagebild';
import LagebildExplorer, { type HistoryPoint } from '@/components/pqc-lagebild/LagebildExplorer';
import MatrixTable from '@/components/pqc-lagebild/MatrixTable';
import LiveConnection from '@/components/pqc-lagebild/LiveConnection';
import LagebildSignatureBadge from '@/components/pqc-lagebild/LagebildSignatureBadge';
import { SectionTitle, ShareBars } from '@/components/pqc-lagebild/charts';

// Data arrives once a month from the pull job; re-read the directory at most hourly.
export const revalidate = 3600;

interface PageProps { params: Promise<{ locale: string }> }

export async function generateStaticParams() {
  return [{ locale: 'de' }, { locale: 'en' }];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pqcLagebild' });
  return {
    title: t('pageTitle'),
    description: t('metaDescription'),
    ...pageMeta(locale, '/pqc-lagebild', { title: t('pageTitle'), description: t('metaDescription') }),
    ...(PQC_LAGEBILD_PUBLIC ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function PqcLagebildPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('pqcLagebild');
  const { latest, history, matrix, visitors } = loadLagebild();
  const ds = latest?.data ?? null;

  // Only what the client explorer needs: EU and DE region cells, plus EU country totals.
  const explorerCells: Cell[] = ds
    ? ds.cells.filter((c) => c.sector === null && ((c.region === 'EU' || c.region === 'DE') || (c.view === 'eu' && c.category === 'all')))
    : [];
  const historyPoints: HistoryPoint[] = history.map((h) => {
    const eu = findCell(h, 'eu', 'EU');
    const de = findCell(h, 'de', 'DE');
    return {
      month: h.month,
      label: formatMonth(h.month, locale),
      eu: eu ? eu.web.pq / eu.web.reachable : null,
      de: de ? de.web.pq / de.web.reachable : null,
    };
  });

  const vMonth = visitors?.months.at(-1) ?? null;
  const groupBars = vMonth
    ? Object.entries(vMonth.browser.groups).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g, n]) => ({
      key: g, label: g, value: n / vMonth.browser.connections,
      valueLabel: formatPercent(n / vMonth.browser.connections, locale),
      detail: t('visitors.groupDetail', { n: formatNumber(n, locale), total: formatNumber(vMonth.browser.connections, locale) }),
    }))
    : [];

  const files = [
    ...(latest ? [{ name: latest.file, sig: latest.sig, label: t('files.lagebild', { month: formatMonth(latest.data.month, locale) }) }] : []),
    ...(matrix ? [{ name: matrix.file, sig: matrix.sig, label: t('files.matrix', { month: formatMonth(matrix.data.month, locale) }) }] : []),
  ];

  return (
    <div className="bg-[var(--color-bg-surface)]">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <header className="mb-12">
          <p className="mono-label text-[var(--color-primary)] mb-2">
            {'// pqc-lagebild'}{ds ? ` · ${t('asOf', { month: formatMonth(ds.month, locale) })}` : ''}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-text-base)]">{t('pageTitle')}</h1>
          <div className="mt-4 space-y-3">
            <p className="text-[var(--color-text-muted)] leading-relaxed">{t('intro', { n: formatNumber(ds?.population.total ?? 175000, locale) })}</p>
            <p className="text-[var(--color-text-muted)] leading-relaxed">{t('introPrivacy')}</p>
          </div>
          {ds && (
            <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-[var(--color-text-muted)]">
              <div><dt className="inline">{t('meta.measured')}: </dt><dd className="inline text-[var(--color-text-base)]">{new Date(ds.scan.finishedAt).toLocaleDateString(locale, { dateStyle: 'long' })}</dd></div>
              <div><dt className="inline">{t('meta.sites')}: </dt><dd className="inline text-[var(--color-text-base)]">{formatNumber(ds.population.total, locale)}</dd></div>
              <div><dt className="inline">{t('meta.reachable')}: </dt><dd className="inline text-[var(--color-text-base)]">{formatNumber(ds.population.reachable, locale)}</dd></div>
            </dl>
          )}
          {latest && (
            <div className="mt-6 max-w-xl">
              <LagebildSignatureBadge file={latest.file} sig={latest.sig} />
            </div>
          )}
          <p className="mt-6">
            <Link href="/pqc-lagebild/methodik" className="font-mono text-sm text-[var(--color-primary)] underline underline-offset-4 hover:opacity-80">
              {t('methodLink')} →
            </Link>
          </p>
        </header>

        <div className="space-y-20">
          {ds ? (
            <LagebildExplorer
              cells={explorerCells}
              providers={ds.providers ?? []}
              mail={ds.mail ?? null}
              trend={ds.trend?.cells.filter((c) => c.region === 'EU' || c.region === 'DE') ?? []}
              previousMonthLabel={ds.trend ? formatMonth(ds.trend.previousMonth, locale) : null}
              history={historyPoints}
              minCell={ds.minCell}
            />
          ) : (
            <section className="rounded-xl border border-[var(--color-border)] p-6">
              <h2 className="text-lg font-semibold text-[var(--color-text-base)]">{t('noData.title')}</h2>
              <p className="mt-2 text-[var(--color-text-muted)] leading-relaxed">{t('noData.body')}</p>
            </section>
          )}

          <section>
            <SectionTitle label="// software" title={t('matrixTitle')}>
              <p>{t('matrixIntro')}</p>
            </SectionTitle>
            {matrix ? (
              <>
                <MatrixTable matrix={matrix.data} locale={locale} />
                <p className="mt-3 text-xs text-[var(--color-text-muted)]">{t('matrixNote', { month: formatMonth(matrix.data.month, locale) })}</p>
                <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--color-text-muted)]">{t('matrixPitfalls')}</p>
              </>
            ) : (
              <p className="text-[var(--color-text-muted)]">{t('matrixNone')}</p>
            )}
          </section>

          <section>
            <SectionTitle label="// visitors" title={t('visitorsTitle')}>
              <p>{t('visitorsIntro')}</p>
            </SectionTitle>
            <div className="grid gap-6 lg:grid-cols-2">
              <LiveConnection />
              <div className="rounded-xl border border-[var(--color-border)] p-5">
                <p className="mono-label text-[var(--color-text-muted)]">{t('visitors.label')}</p>
                {vMonth && vMonth.browser.connections > 0 ? (
                  <>
                    <p className="mt-2 text-4xl font-bold tabular-nums text-[var(--color-text-base)]">{formatPercent(vMonth.browser.pq / vMonth.browser.connections, locale)}</p>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
                      {t('visitors.summary', { month: formatMonth(vMonth.month, locale), days: String(vMonth.days), n: formatNumber(vMonth.browser.connections, locale) })}
                    </p>
                    <div className="mt-5"><ShareBars data={groupBars} emptyLabel="" /></div>
                  </>
                ) : (
                  <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{t('visitors.none')}</p>
                )}
              </div>
            </div>
            <p className="mt-4 text-xs text-[var(--color-text-muted)]">{t('visitorsPrivacy')}</p>
          </section>

          <section>
            <SectionTitle label="// data" title={t('filesTitle')}>
              <p>{t('filesIntro')}</p>
            </SectionTitle>
            {files.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {files.map((f) => (
                  <div key={f.name}>
                    <p className="mb-2 text-sm text-[var(--color-text-base)]">{f.label}</p>
                    <LagebildSignatureBadge file={f.name} sig={f.sig} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[var(--color-text-muted)]">{t('filesNone')}</p>
            )}
            <p className="mt-4 font-mono text-xs text-[var(--color-text-muted)]">
              {t('filesKey')}{' '}
              <a href="/api/pqc-lagebild/public-key.txt" className="text-[var(--color-primary)] hover:opacity-80">public-key.txt</a>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
