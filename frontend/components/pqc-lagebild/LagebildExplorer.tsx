'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import type { Cell, MailMeta, ProviderRanking, TrendCell, View } from '@/lib/pqc-lagebild';
import { ShareBars, SegmentedBar, StatTile, SectionTitle, LineChart, Legend, SERIES, type BarDatum, type Part } from './charts';

export interface HistoryPoint { month: string; label: string; eu: number | null; de: number | null }

interface Props {
  cells: Cell[];          // EU and DE region cells per category + EU country totals
  providers: ProviderRanking[];
  mail: MailMeta | null;
  trend: TrendCell[];
  previousMonthLabel: string | null;
  history: HistoryPoint[];
  minCell: number;
}

const CATS = ['all', 'kritis', 'institutions', 'corporations', 'other'] as const;
const DNSSEC_NAMES: Record<string, string> = {
  '5': 'RSA/SHA-1', '7': 'RSA/SHA-1', '8': 'RSA/SHA-256', '10': 'RSA/SHA-512',
  '13': 'ECDSA P-256', '14': 'ECDSA P-384', '15': 'Ed25519', '16': 'Ed448',
};

export default function LagebildExplorer({ cells, providers, mail, trend, previousMonthLabel, history, minCell }: Props) {
  const t = useTranslations('pqcLagebild');
  const locale = useLocale();
  // German readers care about Germany first, everyone else about the EU.
  const [view, setView] = useState<View>(locale === 'de' ? 'de' : 'eu');
  const region = view === 'de' ? 'DE' : 'EU';

  const loc = locale === 'de' ? 'de-DE' : 'en-US';
  const nf = new Intl.NumberFormat(loc);
  const pf = (x: number | null | undefined, d = 0) =>
    (x == null || Number.isNaN(x) ? '–' : new Intl.NumberFormat(loc, { style: 'percent', maximumFractionDigits: d, minimumFractionDigits: d }).format(x));
  const sh = (a: number | null | undefined, b: number | null | undefined) => (a == null || !b ? null : a / b);
  const cell = (category: string = 'all') =>
    cells.find((c) => c.view === view && c.region === region && c.category === category && c.sector === null) ?? null;
  const regionNames = new Intl.DisplayNames([loc], { type: 'region' });
  const ranking = providers.find((p) => p.view === view && p.region === region) ?? null;

  const main = cell();
  const selfPq = main ? (() => {
    const cdnPq = main.pqByHosting.cdn ?? (main.hosting.cdn === 0 ? 0 : null);
    return cdnPq == null ? null : sh(main.web.pq - cdnPq, main.web.reachable - main.hosting.cdn);
  })() : null;

  // mail: share of domains (with MX) whose provider negotiates ML-KEM, and how many could be measured
  const mailRows = mail?.reliable ? (ranking?.mail ?? []) : [];
  const withMx = main?.mail?.withMx ?? null;
  const mailPqDomains = mailRows.filter((e) => e.answered > 0 && e.pq === e.answered).reduce((a, e) => a + e.n, 0);
  const mailMeasuredDomains = mailRows.filter((e) => e.answered > 0).reduce((a, e) => a + e.n, 0);

  const groupParts = (c: Cell): Part[] => {
    const g = c.web.groups ?? {};
    const other = Object.entries(g).filter(([k]) => !['X25519MLKEM768', 'X25519', 'P-256'].includes(k)).reduce((a, [, v]) => a + v, 0);
    return [
      { key: 'mlkem', label: 'X25519MLKEM768', value: g.X25519MLKEM768 ?? 0, color: SERIES[0] },
      { key: 'x25519', label: 'X25519', value: g.X25519 ?? 0, color: SERIES[1] },
      { key: 'p256', label: 'P-256', value: g['P-256'] ?? 0, color: SERIES[2] },
      { key: 'other', label: t('groups.other'), value: other, color: SERIES[3] },
    ];
  };

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
          {/* 01 overview */}
          <section>
            <SectionTitle label="// 01" title={t('overviewTitle')}>
              <p>{t('overviewIntro', { reachable: nf.format(main.web.reachable), n: nf.format(main.n) })}</p>
            </SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <StatTile accent value={pf(sh(main.web.pq, main.web.reachable))} label={t('kpi.pq')} sub={t('kpi.pqSub')} />
              <StatTile value={pf(selfPq)} label={t('kpi.self')} sub={t('kpi.selfSub')} />
              {mailRows.length && withMx ? (
                <StatTile value={pf(sh(mailPqDomains, withMx))} label={t('kpi.mail')} sub={t('kpi.mailSub', { covered: pf(sh(mailMeasuredDomains, withMx)) })} />
              ) : (
                <StatTile value={pf(sh(main.web.tls13, main.web.reachable))} label={t('kpi.tls13')} sub={t('kpi.tls13Sub')} />
              )}
              <StatTile value={pf(sh(main.web.cert.pq, main.web.reachable), main.web.cert.pq ? 1 : 0)} label={t('kpi.cert')} sub={t('kpi.certSub')} />
            </div>
          </section>

          {/* 02 what servers negotiate */}
          <section>
            <SectionTitle label="// 02" title={t('groupsTitle')}>
              <p>{t('groupsIntro')}</p>
            </SectionTitle>
            <div className="space-y-7">
              {CATS.map((c) => {
                const cc = cell(c);
                if (!cc) return null;
                return (
                  <div key={c}>
                    <div className="mb-2 flex items-baseline justify-between gap-4 text-sm">
                      <span className={c === 'all' ? 'font-semibold text-[var(--color-text-base)]' : 'text-[var(--color-text-base)]'}>{t(`category.${c}`)}</span>
                      <span className="font-mono text-xs text-[var(--color-text-muted)]">{t('sites', { n: nf.format(cc.web.reachable) })}</span>
                    </div>
                    <SegmentedBar locale={locale} ariaLabel={t(`category.${c}`)} total={cc.web.reachable} parts={groupParts(cc)} legend={c === 'all'} />
                  </div>
                );
              })}
            </div>
            <dl className="mt-8 grid gap-4 sm:grid-cols-3">
              <Fact label={t('groups.capable')} value={pf(sh(main.web.pqCapable - main.web.pq, main.web.reachable), 1)} />
              <Fact label={t('groups.pure')} value={pf(sh(main.web.pqPure, main.web.reachable), 1)} />
              <Fact label={t('groups.tls13')} value={pf(sh(main.web.tls13, main.web.reachable))} />
            </dl>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-[var(--color-text-muted)]">{t('groupsNote')}</p>
          </section>

          {/* 03 hosting */}
          <section>
            <SectionTitle label="// 03" title={t('hostingTitle')}>
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
            {ranking && ranking.web.length > 0 && (
              <div className="mt-8 grid gap-8 lg:grid-cols-3">
                {(['cdn', 'cloud', 'other'] as const).map((h) => {
                  const rows = ranking.web.filter((e) => e.hosting === h);
                  if (!rows.length) return null;
                  return (
                    <div key={h}>
                      <h3 className="mb-3 text-lg font-semibold text-[var(--color-text-base)]">{t(`hosting.${h}`)}</h3>
                      <ShareBars
                        emptyLabel=""
                        data={rows.map((e) => ({
                          key: e.name, label: e.name, value: sh(e.pq, e.n), valueLabel: pf(sh(e.pq, e.n)),
                          detail: t('providerDetail', { pq: nf.format(e.pq), n: nf.format(e.n) }),
                        }))}
                      />
                    </div>
                  );
                })}
              </div>
            )}
            <p className="mt-4 text-xs text-[var(--color-text-muted)]">{t('providerNote', { min: minCell })}</p>
          </section>

          {/* 04 mail */}
          <section>
            <SectionTitle label="// 04" title={t('mailTitle')}>
              <p>{t('mailIntro')}</p>
            </SectionTitle>
            {mailRows.length ? (
              <>
                <div className="relative overflow-x-auto rounded-xl border border-[var(--color-border)]">
                  <table className="min-w-full text-sm">
                    <thead className="bg-[var(--color-bg-base)]/60 text-left font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                      <tr>
                        <th scope="col" className="px-4 py-2">{t('mailTable.provider')}</th>
                        <th scope="col" className="px-4 py-2 text-right">{t('mailTable.domains')}</th>
                        <th scope="col" className="px-4 py-2">{t('mailTable.result')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mailRows.map((e) => (
                        <tr key={e.name} className="border-t border-[var(--color-border-dim)]">
                          <td className="px-4 py-2 text-[var(--color-text-base)]">{e.name}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-[var(--color-text-muted)]">{withMx ? pf(sh(e.n, withMx), 1) : nf.format(e.n)}</td>
                          <td className="px-4 py-2">
                            {e.answered === 0 ? (
                              <span className="font-mono text-xs text-[var(--color-text-muted)]">{t('mailTable.unreachable')}</span>
                            ) : e.pq === e.answered ? (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-400">✔ {e.group ?? 'ML-KEM'}</span>
                            ) : (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-slate-500/30 bg-slate-500/10 px-2 py-0.5 font-mono text-[11px] text-slate-300">✘ {e.group ?? t('matrix.classic')}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                  {t('mailCoverage', { measured: String(mail?.measured ?? 0), covered: pf(sh(mailMeasuredDomains, withMx)) })}
                </p>
              </>
            ) : (
              <p className="text-[var(--color-text-muted)]">{t('mailNone')}</p>
            )}
          </section>

          {/* 05 signatures */}
          <section>
            <SectionTitle label="// 05" title={t('sigTitle')}>
              <p>{t('sigIntro')}</p>
            </SectionTitle>
            <div className="space-y-10">
              <div>
                <h3 className="mb-1 text-lg font-semibold text-[var(--color-text-base)]">{t('sigKeysTitle')}</h3>
                <p className="mb-4 text-sm text-[var(--color-text-muted)]">{t('sigKeysNote')}</p>
                <SegmentedBar locale={locale} ariaLabel={t('sigKeysTitle')} total={sum(main.web.certKeys)} parts={topParts(Object.entries(main.web.certKeys ?? {}), t('groups.other'))} />
              </div>
              <div>
                <h3 className="mb-1 text-lg font-semibold text-[var(--color-text-base)]">{t('sigCaTitle')}</h3>
                <p className="mb-4 text-sm text-[var(--color-text-muted)]">{t('sigCaNote')}</p>
                <SegmentedBar locale={locale} ariaLabel={t('sigCaTitle')} total={sum(main.web.certSigs)} parts={topParts(Object.entries(main.web.certSigs ?? {}), t('groups.other'))} />
              </div>
              <div>
                <h3 className="mb-1 text-lg font-semibold text-[var(--color-text-base)]">{t('sigDnssecTitle')}</h3>
                <p className="mb-4 text-sm text-[var(--color-text-muted)]">
                  {main.dns ? t('sigDnssecNote', { signed: pf(sh(main.dns.signed, main.dns.answered)) }) : t('kpi.tooFew')}
                </p>
                {main.dns && main.dns.signed > 0 && (
                  <SegmentedBar locale={locale} ariaLabel={t('sigDnssecTitle')} total={sum(main.dns.algorithms)} parts={dnssecParts(main.dns.algorithms, t('groups.other'))} />
                )}
              </div>
              <p className="max-w-3xl text-sm leading-relaxed text-[var(--color-text-muted)]">{t('sigOutlook')}</p>
            </div>
          </section>

          {/* 06 countries */}
          {view === 'eu' && (
            <section>
              <SectionTitle label="// 06" title={t('countriesTitle')}>
                <p>{t('countriesIntro')}</p>
              </SectionTitle>
              <ShareBars
                emptyLabel={t('empty')}
                data={countries.map((c) => ({
                  key: c.region, label: regionNames.of(c.region) ?? c.region, highlight: c.region === 'DE',
                  value: sh(c.web.pq, c.web.reachable), valueLabel: pf(sh(c.web.pq, c.web.reachable)),
                  detail: t('barDetail', { pq: nf.format(c.web.pq), reachable: nf.format(c.web.reachable) }),
                } satisfies BarDatum))}
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] p-4">
      <dt className="text-sm text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-1 text-2xl font-bold tabular-nums text-[var(--color-text-base)]">{value}</dd>
    </div>
  );
}

const sum = (o: Record<string, number> | undefined) => Object.values(o ?? {}).reduce((a, b) => a + b, 0);

/** At most four parts (validated palette): the three largest plus "other". */
function topParts(entries: [string, number][], otherLabel: string): Part[] {
  const sorted = entries.filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, 3);
  const rest = sorted.slice(3).reduce((a, [, v]) => a + v, 0);
  const parts: Part[] = head.map(([k, v], i) => ({ key: k, label: k, value: v, color: SERIES[i] }));
  if (rest > 0) parts.push({ key: 'other', label: otherLabel, value: rest, color: SERIES[3] });
  return parts;
}

function dnssecParts(algs: Record<string, number>, otherLabel: string): Part[] {
  const merged: Record<string, number> = {};
  for (const [a, n] of Object.entries(algs)) {
    const name = DNSSEC_NAMES[a] ?? `#${a}`;
    merged[name] = (merged[name] ?? 0) + n;
  }
  return topParts(Object.entries(merged), otherLabel);
}
