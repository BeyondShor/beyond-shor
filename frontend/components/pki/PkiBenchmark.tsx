'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PRIVATE_PROFILES, WEB_PROFILES, type ProfileId } from '@/lib/pki/meta';
import type { BenchRunView, PkiRequest, PkiResponse } from '@/lib/pki/worker-types';
import { computeFullStats, fmtMs, type FullStats } from '@/lib/stats';
import BenchmarkChart, { StatTooltip, type ChartDataset } from '@/components/BenchmarkChart';
import { Button, Note, useFormat } from './ui';

type Call = <R extends PkiRequest>(req: R, onProgress?: (p: { done: number; total: number; run?: BenchRunView }) => void) =>
  { id: number; done: Promise<PkiResponse<R['op']>> };

const METRICS = ['leafKeygen', 'csrSign', 'popCheck', 'issue', 'validate', 'cvSign', 'cvVerify'] as const;
type Metric = (typeof METRICS)[number];

const COLORS: Record<ProfileId, string> = {
  classical: '#94a3b8', mldsa44: '#06b6d4', mldsa65: '#22d3ee', composite: '#a78bfa', mixed: '#fbbf24',
  'web-classical': '#cbd5e1', 'web-mldsa44': '#38bdf8', 'web-mtc': '#34d399',
};

const STAT_ROWS: [string, string, (s: FullStats) => string][] = [
  ['statMean', 'tooltipMean', (s) => fmtMs(s.mean)],
  ['statMedian', 'tooltipMedian', (s) => fmtMs(s.median)],
  ['statStd', 'tooltipStd', (s) => fmtMs(s.std)],
  ['statCV', 'tooltipCV', (s) => `${s.cv.toFixed(1)} %`],
  ['statCI95', 'tooltipCI95', (s) => `± ${fmtMs(s.ci95Half)}`],
  ['statMinMax', 'tooltipMinMax', (s) => `${fmtMs(s.min)} – ${fmtMs(s.max)}`],
  ['statIQR', 'tooltipIQR', (s) => fmtMs(s.iqr)],
  ['statOutliers', 'tooltipOutliers', (s) => (s.outlierCount === 0 ? '–' : String(s.outlierCount))],
];

interface ProfileRuns { status: 'waiting' | 'running' | 'done' | 'error'; ceremonyMs?: Record<string, number>; runs: BenchRunView[] }

export default function PkiBenchmark({ call, cancel }: { call: Call; cancel: (id: number) => void }) {
  const t = useTranslations('pkiLab');
  const tp = useTranslations('playground');
  const f = useFormat();
  const [selected, setSelected] = useState<ProfileId[]>(['classical', 'mldsa44', 'mldsa65', 'composite']);
  const [runs, setRuns] = useState(20);
  const [metric, setMetric] = useState<Metric>('validate');
  const [data, setData] = useState<Partial<Record<ProfileId, ProfileRuns>>>({});
  const [active, setActive] = useState(false);
  const current = useRef<number | null>(null);
  const stop = useRef(false);

  async function start() {
    setActive(true); stop.current = false;
    setData(Object.fromEntries(selected.map((p) => [p, { status: 'waiting', runs: [] }])));
    for (const p of selected) {
      if (stop.current) break;
      setData((d) => ({ ...d, [p]: { status: 'running', runs: [] } }));
      const job = call({ op: 'benchmark', profile: p, runs }, (prog) => {
        if (prog.run) setData((d) => ({ ...d, [p]: { ...d[p]!, runs: [...(d[p]?.runs ?? []), prog.run!] } }));
      });
      current.current = job.id;
      try {
        const r = await job.done;
        setData((d) => ({ ...d, [p]: { status: 'done', ceremonyMs: r.ceremonyMs, runs: r.runs } }));
      } catch {
        setData((d) => ({ ...d, [p]: { ...d[p]!, status: 'error' } }));
      }
    }
    current.current = null;
    setActive(false);
  }

  function halt() {
    stop.current = true;
    if (current.current !== null) cancel(current.current);
  }

  function exportFile(kind: 'csv' | 'json') {
    const entries = Object.entries(data) as [ProfileId, ProfileRuns][];
    let body: string, type: string;
    if (kind === 'csv') {
      const head = ['profile', 'run', ...METRICS.map((m) => `${m}_ms`), 'chain_bytes', 'handshake_bytes'];
      const lines = entries.flatMap(([p, d]) => d.runs.map((r, i) => [p, i + 1, ...METRICS.map((m) => r[m].toFixed(4)), r.chainBytes, r.handshakeBytes].join(',')));
      body = [head.join(','), ...lines].join('\n') + '\n';
      type = 'text/csv';
    } else {
      body = JSON.stringify({
        generated: new Date().toISOString(),
        environment: { userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency },
        note: 'Times in milliseconds, measured with performance.now() in a Web Worker; sizes in bytes.',
        profiles: Object.fromEntries(entries.map(([p, d]) => [p, { ceremonyMs: d.ceremonyMs, runs: d.runs }])),
      }, null, 2);
      type = 'application/json';
    }
    const url = URL.createObjectURL(new Blob([body], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = `pki-benchmark.${kind}`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const profiles = (Object.keys(data) as ProfileId[]).filter((p) => (data[p]?.runs.length ?? 0) >= 2);
  const datasets: ChartDataset[] = profiles.map((p) => {
    const values = data[p]!.runs.map((r) => r[metric]);
    return { key: p, label: t(`profiles.${p}.short`), color: COLORS[p], values, stats: computeFullStats(values)! };
  });
  const hasRuns = Object.values(data).some((d) => (d?.runs.length ?? 0) > 0);

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="font-mono text-xs text-[var(--color-text-muted)] mb-1">{t('bench.profiles')}</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {[...PRIVATE_PROFILES, ...WEB_PROFILES].map((p) => (
            <label key={p} className="flex items-center gap-1.5 text-xs text-[var(--color-text-base)]">
              <input type="checkbox" disabled={active} checked={selected.includes(p)}
                onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p] : s.filter((x) => x !== p)))} />
              {t(`profiles.${p}.short`)}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-mono text-[var(--color-text-muted)]">{t('bench.runs')}</span>
          <select value={runs} disabled={active} onChange={(e) => setRuns(Number(e.target.value))}
            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 font-mono text-sm text-[var(--color-text-base)]">
            {[10, 20, 50].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        {active
          ? <Button tone="ghost" onClick={halt}>{t('bench.stop')}</Button>
          : <Button onClick={start} disabled={selected.length === 0}>{t('bench.start')}</Button>}
        {hasRuns && !active && (
          <>
            <Button tone="ghost" onClick={() => exportFile('csv')}>CSV</Button>
            <Button tone="ghost" onClick={() => exportFile('json')}>JSON</Button>
          </>
        )}
      </div>
      {selected.includes('mixed') && <p className="text-xs text-[var(--color-text-muted)]">{t('bench.mixedNote')}</p>}

      {hasRuns && (
        <ul className="grid gap-1 text-xs font-mono sm:grid-cols-2">
          {(Object.keys(data) as ProfileId[]).map((p) => (
            <li key={p} className="flex justify-between gap-2">
              <span style={{ color: COLORS[p] }}>{t(`profiles.${p}.short`)}</span>
              <span className="text-[var(--color-text-muted)]">
                {data[p]!.status === 'error' ? t('bench.error') : `${data[p]!.runs.length}/${runs}`}
                {data[p]!.runs[0] && ` · ${f.bytes(data[p]!.runs[0].chainBytes)} ${t('bench.chain')}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      {datasets.length > 0 && (
        <>
          <div className="flex flex-wrap gap-1" role="tablist">
            {METRICS.map((m) => (
              <button key={m} type="button" role="tab" aria-selected={metric === m} onClick={() => setMetric(m)}
                className={`rounded-md px-2.5 py-1 font-mono text-xs border ${metric === m
                  ? 'border-[var(--color-primary)]/50 bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-base)]'}`}>
                {t(`bench.metric.${m}`)}
              </button>
            ))}
          </div>
          <BenchmarkChart title={t(`bench.metric.${metric}`)} datasets={datasets} />
          <div className="overflow-x-auto rounded-lg border border-[var(--color-border-dim)]">
            <table className="w-full min-w-[520px] font-mono text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border-dim)]">
                  <th className="px-3 py-1.5 text-left font-normal text-[var(--color-text-muted)]">{tp('statMetric')}</th>
                  {datasets.map((d) => <th key={d.key} className="px-3 py-1.5 text-right font-normal" style={{ color: d.color }}>{d.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {STAT_ROWS.map(([label, tip, fn]) => (
                  <tr key={label} className="border-b border-[var(--color-border-dim)]/40">
                    <td className="px-3 py-1.5"><StatTooltip label={tp(label)} tip={tp(tip)} /></td>
                    {datasets.map((d) => <td key={d.key} className="px-3 py-1.5 text-right tabular-nums text-[var(--color-text-base)]">{fn(d.stats)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Note>{t('bench.note')}</Note>
    </div>
  );
}
