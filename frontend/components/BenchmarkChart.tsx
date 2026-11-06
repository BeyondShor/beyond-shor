'use client';

// Box plot with 95 % confidence interval and individual measurements on a log
// scale. Shared by the KEM, signature and PKI benchmarks.
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import type { FullStats } from '@/lib/stats';

export interface ChartDataset {
  key:      string;
  /** label under the box; a second line is optional */
  label:    string;
  sublabel?: string;
  color:    string;
  values:   number[];
  stats:    FullStats;
}

const OUTLIER_CLR = '#f87171';

// 20 deterministic horizontal jitter offsets (px from the group centre)
const JITTER20 = [
  -13, -9, -6, -3, -1, 1, 3, 6, 9, 13,
   14, -12, -8, -5, -2, 0, 2, 5, 8, -4,
];

export default function BenchmarkChart({ title, datasets, unit = 'ms' }: {
  title:    string;
  datasets: ChartDataset[];
  unit?:    string;
}) {
  const t = useTranslations('playground');
  if (datasets.length === 0) return null;
  const allVals = datasets.flatMap((d) => d.values).filter((v) => v > 0);
  if (allVals.length === 0) return null;

  const ML = 60, MR = 14, MT = 30, MB = 50;
  const VW = 500, VH = 250;
  const CW = VW - ML - MR;
  const CH = VH - MT - MB;

  const logLo = Math.log10(Math.min(...allVals)) - 0.4;
  const logHi = Math.log10(Math.max(...allVals)) + 0.4;
  const logSpan = logHi - logLo;

  const toY = (v: number): number => {
    if (v <= 0) return MT + CH;
    const f = (Math.log10(v) - logLo) / logSpan;
    return MT + CH * (1 - Math.max(0, Math.min(1, f)));
  };

  // Axis ticks: 1, 2, 5 × powers of ten within the range
  const ticks: number[] = [];
  for (let e = Math.floor(logLo); e <= Math.ceil(logHi); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e);
      if (v >= Math.pow(10, logLo) * 0.92 && v <= Math.pow(10, logHi) * 1.08) ticks.push(v);
    }
  }
  const uniqueTicks = [...new Set(ticks)].sort((a, b) => a - b);

  const fmtTick = (v: number): string => {
    if (unit === 'ms' && v >= 1000) return `${+(v / 1000).toFixed(1)}s`;
    if (v >= 10) return `${v.toFixed(0)}`;
    if (v >= 1) return `${v.toFixed(1)}`;
    return `${v.toFixed(2)}`;
  };

  const GW = CW / datasets.length;
  const gCx = (i: number) => ML + GW * i + GW / 2;
  const BOX_W = Math.min(34, GW * 0.24);
  const CI_OFF = BOX_W / 2 + 13;
  const LY = VH - 7;
  const LX = ML;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ height: 'auto', maxHeight: 260 }} role="img" aria-label={title}>
      <rect x={ML} y={MT} width={CW} height={CH} fill="rgba(15,23,42,0.55)" rx="3" />

      {uniqueTicks.map((v) => {
        const y = toY(v);
        if (y < MT - 2 || y > MT + CH + 2) return null;
        return (
          <g key={v}>
            <line x1={ML} y1={y} x2={ML + CW} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={ML - 5} y={y + 3.5} textAnchor="end" fill="#94a3b8" fontSize="9" fontFamily="'JetBrains Mono',monospace">
              {fmtTick(v)}
            </text>
          </g>
        );
      })}

      <line x1={ML} y1={MT} x2={ML} y2={MT + CH} stroke="#334155" strokeWidth="1.2" />
      <text x={11} y={MT + CH / 2} textAnchor="middle" fill="#94a3b8" fontSize="9" fontFamily="'JetBrains Mono',monospace"
        transform={`rotate(-90 11 ${MT + CH / 2})`}>
        {unit} (log₁₀)
      </text>
      <text x={ML + CW / 2} y={MT - 10} textAnchor="middle" fill="#cbd5e1" fontSize="11" fontFamily="'JetBrains Mono',monospace" fontWeight="bold">
        {title}
      </text>

      {datasets.map((_, i) => i > 0 && (
        <line key={i} x1={ML + GW * i} y1={MT} x2={ML + GW * i} y2={MT + CH}
          stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="3,3" />
      ))}

      {datasets.map(({ key, label, sublabel, color: clr, values, stats: s }, gi) => {
        const cx = gCx(gi);
        const yMed = toY(s.median);
        const yQ1 = toY(s.q1), yQ3 = toY(s.q3);
        const yWLo = toY(s.whiskerLo), yWHi = toY(s.whiskerHi);
        const yMean = toY(s.mean);
        const yCiLo = toY(Math.max(s.ci95Lo, Math.pow(10, logLo + 0.02)));
        const yCiHi = toY(Math.min(s.ci95Hi, Math.pow(10, logHi - 0.02)));
        const boxTop = Math.min(yQ1, yQ3);
        const boxH = Math.max(Math.abs(yQ3 - yQ1), 1);
        return (
          <g key={key}>
            <line x1={cx} y1={yWLo} x2={cx} y2={boxTop} stroke={clr} strokeWidth="1.2" opacity="0.4" />
            <line x1={cx} y1={boxTop + boxH} x2={cx} y2={yWHi} stroke={clr} strokeWidth="1.2" opacity="0.4" />
            <line x1={cx - 6} y1={yWLo} x2={cx + 6} y2={yWLo} stroke={clr} strokeWidth="1.3" opacity="0.55" />
            <line x1={cx - 6} y1={yWHi} x2={cx + 6} y2={yWHi} stroke={clr} strokeWidth="1.3" opacity="0.55" />
            <rect x={cx - BOX_W / 2} y={boxTop} width={BOX_W} height={boxH}
              fill={clr} fillOpacity="0.13" stroke={clr} strokeOpacity="0.5" strokeWidth="1.2" rx="2" />
            <line x1={cx - BOX_W / 2} y1={yMed} x2={cx + BOX_W / 2} y2={yMed} stroke={clr} strokeWidth="2.5" opacity="0.95" />
            <polygon points={`${cx},${yMean - 4.5} ${cx + 4.5},${yMean} ${cx},${yMean + 4.5} ${cx - 4.5},${yMean}`}
              fill={clr} fillOpacity="0.55" />
            <g opacity="0.72">
              <line x1={cx + CI_OFF} y1={yCiLo} x2={cx + CI_OFF} y2={yCiHi} stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="2,1.5" />
              <line x1={cx + CI_OFF - 4} y1={yCiLo} x2={cx + CI_OFF + 4} y2={yCiLo} stroke="#e2e8f0" strokeWidth="1.5" />
              <line x1={cx + CI_OFF - 4} y1={yCiHi} x2={cx + CI_OFF + 4} y2={yCiHi} stroke="#e2e8f0" strokeWidth="1.5" />
            </g>
            {values.map((v, i) => {
              const isOut = v < s.fenceLo || v > s.fenceHi;
              return (
                <circle key={i} cx={cx + JITTER20[i % 20] * 0.6} cy={toY(v)} r={isOut ? 3.5 : 2.5}
                  fill={isOut ? OUTLIER_CLR : clr} opacity={isOut ? 0.9 : 0.4} />
              );
            })}
            <text x={cx} y={MT + CH + 14} textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontFamily="'JetBrains Mono',monospace">
              {label}
            </text>
            {sublabel && (
              <text x={cx} y={MT + CH + 26} textAnchor="middle" fill="#94a3b8" fontSize="8.5" fontFamily="'JetBrains Mono',monospace">
                {sublabel}
              </text>
            )}
          </g>
        );
      })}

      <g fontSize="8" fontFamily="'JetBrains Mono',monospace" fill="#94a3b8">
        <circle cx={LX + 4} cy={LY} r={2.5} fill="#94a3b8" opacity="0.4" />
        <text x={LX + 10} y={LY + 3}>{t('chartLegendMeasurement')}</text>
        <rect x={LX + 57} y={LY - 4} width={9} height={8} fill="#94a3b8" fillOpacity="0.13" stroke="#94a3b8" strokeOpacity="0.5" strokeWidth="1" rx="1" />
        <text x={LX + 68} y={LY + 3}>{t('chartLegendIQR')}</text>
        <line x1={LX + 90} y1={LY} x2={LX + 102} y2={LY} stroke="#94a3b8" strokeWidth="2.5" opacity="0.9" />
        <text x={LX + 105} y={LY + 3}>{t('chartLegendMedian')}</text>
        <polygon points={`${LX + 148},${LY - 3.5} ${LX + 153},${LY} ${LX + 148},${LY + 3.5} ${LX + 143},${LY}`} fill="#94a3b8" fillOpacity="0.55" />
        <text x={LX + 156} y={LY + 3}>{t('chartLegendMean')}</text>
        <line x1={LX + 191} y1={LY - 4} x2={LX + 191} y2={LY + 4} stroke="#e2e8f0" strokeWidth="1.5" opacity="0.72" />
        <text x={LX + 196} y={LY + 3}>{t('chartLegendCI95')}</text>
        <circle cx={LX + 240} cy={LY} r={3} fill={OUTLIER_CLR} opacity="0.9" />
        <text x={LX + 246} y={LY + 3}>{t('chartLegendOutliers')}</text>
      </g>
    </svg>
  );
}

/** Label with a hover tooltip rendered into a portal. */
export function StatTooltip({ label, tip }: { label: string; tip: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tooltipEl = rect ? (() => {
    const above = rect.top > 160;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - 304));
    const top = above ? rect.top - 8 : rect.bottom + 8;
    return createPortal(
      <div
        style={{ position: 'fixed', left, top, transform: above ? 'translateY(-100%)' : 'none', zIndex: 9999 }}
        className="w-72 rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-surface)] shadow-2xl px-4 py-3 pointer-events-none"
      >
        <div className="font-mono text-xs font-semibold text-[var(--color-text-base)] mb-1.5">{label}</div>
        <div className="font-sans text-xs text-[var(--color-text-muted)] leading-relaxed">{tip}</div>
      </div>,
      document.body,
    );
  })() : null;
  return (
    <span onMouseEnter={(e) => setRect((e.currentTarget as HTMLElement).getBoundingClientRect())} onMouseLeave={() => setRect(null)}
      className="inline-flex items-center gap-1.5 cursor-help">
      <span className="text-[var(--color-text-muted)] whitespace-nowrap">{label}</span>
      <span className="text-[var(--color-text-dim)] text-[0.6rem] leading-none select-none" aria-hidden="true">ⓘ</span>
      {tooltipEl}
    </span>
  );
}
