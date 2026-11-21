'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Cell, TrendCell, View } from '@/lib/pqc-lagebild';
import { ShareBars, SegmentedBar, StatTile, SectionTitle, LineChart, Legend, SERIES, type BarDatum } from './charts';

export interface HistoryPoint { month: string; label: string; eu: number | null; de: number | null }

interface Props {
  cells: Cell[];          // EU and DE region cells (all categories/sectors) + EU country totals
  trend: TrendCell[];     // region-level panel trend, may be empty
  previousMonthLabel: string | null;
  history: HistoryPoint[];
  minCell: number;
}

const CATS = ['kritis', 'institutions', 'corporations', 'other'] as const;
const KRITIS = ['energy', 'water', 'health', 'finance', 'transport', 'ict', 'food', 'waste'];
const INSTITUTIONS = ['government', 'municipality', 'higher-education', 'eu-body'];

export default function LagebildExplorer({ cells, trend, previousMonthLabel, history, minCell }: Props) {
  const t = useTranslations('pqcLagebild');
  const locale = useLocale();
  const [view, setView] = useState<View>('de');
  const region = view === 'de' ? 'DE' : 'EU';

  const nf = new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US');
  const pf = (x: number | null, d = 0) => (x == null ? '–' : new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US', { style: 'percent', maximumFractionDigits: d, minimumFractionDigits: d }).format(x));
  const sh = (a: number | null | undefined, b: number | null | undefined) => (a == null || !b ? null : a / b);
  const cell = (category = 'all', sector: string | null = null) =>
    cells.find((c) => c.view === view && c.region === region && c.category === category && c.sector === sector) ?? null;
  const regionNames = new Intl.DisplayNames([locale === 'de' ? 'de-DE' : 'en-US'], { type: 'region' });

  const main = cell();
  const pqBar = (key: string, label: string, c: Cell | null, highlight = false): BarDatum | null =>
    c ? {
      key, label, highlight,
      value: sh(c.web.pq, c.web.reachable),
      valueLabel: pf(sh(c.web.pq, c.web.reachable)),
      detail: t('barDetail', { pq: nf.format(c.web.pq), reachable: nf.format(c.web.reachable) }),
    } : null;
  const bars = (list: (BarDatum | null)[]) => list.filter((b): b is BarDatum => !!b);

  const selfPq = main ? (() => {
    const cdnPq = main.pqByHosting.cdn ?? (main.hosting.cdn === 0 ? 0 : null);
    return cdnPq == null ? null : sh(main.web.pq - cdnPq, main.web.reachable - main.hosting.cdn);
  })() : null;

  const countries = view === 'eu'
    ? cells.filter((c) => c.view === 'eu' && c.region !== 'EU' && c.category === 'all' && c.sector === null)
      .sort((a, b) => b.web.pq / b.web.reachable - a.web.pq / a.web.reachable)
    : [];
  const tr = trend.find((c) => c.view === view && c.region === region && c.category === 'all') ?? null;
  const hostingOther = main ? main.hosting.other + main.hosting.unknown : 0;

  return (
    <div className="space-y-16">
      {/* view switch */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="mono-label text-[var(--color-text-muted)]">{t('viewLabel')}</span>
        <div role="tablist" aria-label={t('viewLabel')} className="inline-flex rounded-lg border border-[var(--color-border)] p-1">
          {(['de', 'eu'] as const).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`rounded-md px-4 py-1.5 font-mono text-sm font-semibold transition-colors ${view === v ? 'bg-[var(--color-primary)] text-[var(--color-bg-base)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]'}`}
            >
              {t(`view.${v}`)}
            </button>
          ))}
        </div>
        <p className="w-full text-sm text-[var(--color-text-muted)]">{t(`viewNote.${view}`)}</p>
      </div>

      {!main ? (
        <p className="text-[var(--color-text-muted)]">{t('noCell', { min: minCell })}</p>
      ) : (
        <>
          {/* headline numbers */}
          <section aria-labelledby="pqcl-overview">
            <SectionTitle label="// 01" title={t('overviewTitle')}>
              <p id="pqcl-overview">{t('overviewIntro', { reachable: nf.format(main.web.reachable), n: nf.format(main.n) })}</p>
            </SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatTile accent value={pf(sh(main.web.pq, main.web.reachable))} label={t('kpi.pq')} sub={t('kpi.pqSub')} />
              <StatTile value={pf(selfPq)} label={t('kpi.self')} sub={t('kpi.selfSub')} />
              {main.mail ? (
                <StatTile value={pf(sh(main.mail.pq, main.mail.tls))} label={t('kpi.mail')} sub={t('kpi.mailSub', { n: nf.format(main.mail.tls) })} />
              ) : (
                <StatTile value={pf(sh(main.web.tls13, main.web.reachable))} label={t('kpi.tls13')} sub={t('kpi.tls13Sub')} />
              )}
              <StatTile value={pf(sh(main.web.cert.pq, main.web.reachable), main.web.cert.pq ? 1 : 0)} label={t('kpi.cert')} sub={t('kpi.certSub')} />
            </div>
          </section>

          {/* categories */}
          <section>
            <SectionTitle label="// 02" title={t('categoriesTitle')}>
              <p>{t('categoriesIntro')}</p>
            </SectionTitle>
            <ShareBars emptyLabel={t('empty')} data={bars(CATS.map((c) => pqBar(c, t(`category.${c}`), cell(c))))} />
            <p className="mt-4 text-xs text-[var(--color-text-muted)]">{t('suppressedNote', { min: minCell })}</p>
          </section>

          {/* sectors */}
          <section>
            <SectionTitle label="// 03" title={t('sectorsTitle')}>
              <p>{t('sectorsIntro')}</p>
            </SectionTitle>
            <div className="grid gap-10 lg:grid-cols-2">
              <div>
                <h3 className="mb-4 text-lg font-semibold text-[var(--color-text-base)]">{t('category.kritis')}</h3>
                <ShareBars emptyLabel={t('empty')} data={bars(KRITIS.map((s) => pqBar(s, t(`sector.${s}`), cell('kritis', s))))} />
              </div>
              <div>
                <h3 className="mb-4 text-lg font-semibold text-[var(--color-text-base)]">{t('category.institutions')}</h3>
                <ShareBars emptyLabel={t('empty')} data={bars(INSTITUTIONS.map((s) => pqBar(s, t(`sector.${s}`), cell('institutions', s))))} />
              </div>
            </div>
          </section>

          {/* hosting */}
          <section>
            <SectionTitle label="// 04" title={t('hostingTitle')}>
              <p>{t('hostingIntro')}</p>
            </SectionTitle>
            <SegmentedBar
              locale={locale}
              ariaLabel={t('hostingTitle')}
              total={main.web.reachable}
              parts={[
                { key: 'cdn', label: t('hosting.cdn'), value: main.hosting.cdn, color: SERIES[0] },
                { key: 'cloud', label: t('hosting.cloud'), value: main.hosting.cloud, color: SERIES[1] },
                { key: 'other', label: t('hosting.other'), value: hostingOther, color: SERIES[2] },
              ]}
            />
            <div className="mt-8">
              <ShareBars
                emptyLabel={t('empty')}
                data={(['cdn', 'cloud', 'other'] as const).flatMap((h) => {
                  const pq = h === 'other' ? (main.pqByHosting.other ?? 0) + (main.pqByHosting.unknown ?? 0) : main.pqByHosting[h];
                  const n = h === 'other' ? hostingOther : main.hosting[h];
                  if (pq == null || n < minCell) return [];
                  return [{ key: h, label: t(`hosting.${h}`), value: sh(pq, n), valueLabel: pf(sh(pq, n)), detail: t('barDetail', { pq: nf.format(pq), reachable: nf.format(n) }) }];
                })}
              />
            </div>
          </section>

          {/* the hard half */}
          <section>
            <SectionTitle label="// 05" title={t('hardTitle')}>
              <p>{t('hardIntro')}</p>
            </SectionTitle>
            <div className="space-y-10">
              <div>
                <h3 className="mb-4 text-lg font-semibold text-[var(--color-text-base)]">{t('certTitle')}</h3>
                <SegmentedBar
                  locale={locale}
                  ariaLabel={t('certTitle')}
                  total={main.web.cert.rsa + main.web.cert.ecdsa + main.web.cert.eddsa + main.web.cert.pq + main.web.cert.other}
                  parts={[
                    { key: 'rsa', label: 'RSA', value: main.web.cert.rsa, color: SERIES[0] },
                    { key: 'ecdsa', label: 'ECDSA', value: main.web.cert.ecdsa, color: SERIES[1] },
                    { key: 'eddsa', label: 'EdDSA', value: main.web.cert.eddsa, color: SERIES[2] },
                    { key: 'pq', label: t('certPq'), value: main.web.cert.pq + main.web.cert.other, color: SERIES[3] },
                  ]}
                />
                <p className="mt-3 text-sm text-[var(--color-text-muted)]">{t('certNote')}</p>
              </div>
              <dl className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border border-[var(--color-border)] p-4">
                  <dt className="text-sm text-[var(--color-text-muted)]">{t('tls13')}</dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-text-base)]">{pf(sh(main.web.tls13, main.web.reachable))}</dd>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] p-4">
                  <dt className="text-sm text-[var(--color-text-muted)]">{t('pure')}</dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-text-base)]">{pf(sh(main.web.pqPure, main.web.reachable), 1)}</dd>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] p-4">
                  <dt className="text-sm text-[var(--color-text-muted)]">{t('dnssec')}</dt>
                  <dd className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-text-base)]">{main.dns ? pf(sh(main.dns.signed, main.dns.answered)) : '–'}</dd>
                </div>
              </dl>
              {main.dns && main.dns.signed > 0 && (
                <p className="text-sm text-[var(--color-text-muted)]">
                  {t('dnssecAlgs')}{' '}
                  {Object.entries(main.dns.algorithms).sort((a, b) => b[1] - a[1]).slice(0, 5)
                    .map(([a, n]) => `${ALG[a] ?? `#${a}`} ${pf(n / main.dns!.signed)}`).join(' · ')}
                </p>
              )}
            </div>
          </section>

          {/* countries */}
          {view === 'eu' && (
            <section>
              <SectionTitle label="// 06" title={t('countriesTitle')}>
                <p>{t('countriesIntro')}</p>
              </SectionTitle>
              <ShareBars
                emptyLabel={t('empty')}
                data={bars(countries.map((c) => pqBar(c.region, regionNames.of(c.region) ?? c.region, c, c.region === 'DE')))}
              />
            </section>
          )}

          {/* development */}
          <section>
            <SectionTitle label={view === 'eu' ? '// 07' : '// 06'} title={t('trendTitle')} />
            {tr && previousMonthLabel ? (
              <p className="max-w-3xl leading-relaxed text-[var(--color-text-muted)]">
                {t('trendPanel', {
                  n: nf.format(tr.n), prev: previousMonthLabel,
                  before: pf(tr.pqBefore / tr.n, 1), now: pf(tr.pqNow / tr.n, 1),
                  on: nf.format(tr.switchedOn), off: nf.format(tr.switchedOff),
                })}
              </p>
            ) : (
              <p className="text-[var(--color-text-muted)]">{t('trendNone')}</p>
            )}
            {history.length >= 2 && (
              <div className="mt-8 space-y-3">
                <Legend items={[{ label: t('view.eu'), color: SERIES[0] }, { label: t('view.de'), color: SERIES[1] }]} />
                <LineChart
                  locale={locale}
                  ariaLabel={t('historyAria')}
                  xLabels={history.map((h) => h.label)}
                  series={[
                    { key: 'eu', label: 'EU', color: SERIES[0], points: history.map((h) => ({ x: h.month, y: h.eu })) },
                    { key: 'de', label: 'DE', color: SERIES[1], points: history.map((h) => ({ x: h.month, y: h.de })) },
                  ]}
                />
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

const ALG: Record<string, string> = {
  '5': 'RSA/SHA-1', '7': 'RSA/SHA-1', '8': 'RSA/SHA-256', '10': 'RSA/SHA-512',
  '13': 'ECDSA P-256', '14': 'ECDSA P-384', '15': 'Ed25519', '16': 'Ed448',
};
