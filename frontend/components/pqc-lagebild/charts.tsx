/**
 * Small, dependency-free chart primitives for the PQC-Lagebild (plain HTML/SVG).
 * Colours carry one meaning each across the whole page (COLORS below). Validated against
 * the dark surface (#0f172a) with the dataviz validate_palette.js: lightness band, chroma,
 * contrast >= 3:1, and every pair that can sit next to each other in a bar clears the CVD
 * and normal-vision floors. Grey (unreachable) is deliberately achromatic: it means "no answer".
 * Every mark has a text equivalent (aria-label / title / visible value).
 */
import type { ReactNode } from 'react';

export const COLORS = {
  pq: '#3987e5',          // quantum-safe (X25519MLKEM768 and every "share quantum-safe" bar/line)
  classic: '#d95926',     // X25519 / not quantum-safe
  p256: '#199e70',        // P-256 key exchange
  other: '#c98500',       // "other" in every breakdown
  unreachable: '#64748b', // provider did not answer
  rsa: '#a865d8',         // RSA signatures and keys
  ecdsa: '#d55181',       // ECDSA signatures and keys
} as const;

/** Badges and icons for single verdicts (tables, live check): same meaning, same hue as the bars. */
export const VERDICT = {
  pq: { icon: '#6da7ec', badge: { borderColor: `${COLORS.pq}66`, background: `${COLORS.pq}1f` } },
  classic: { icon: '#ec835a', badge: { borderColor: `${COLORS.classic}66`, background: `${COLORS.classic}1a` } },
} as const;

export function StatTile({ value, label, sub, accent = false }: { value: string; label: string; sub?: ReactNode; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-base)]/40 p-5">
      <p className="mono-label text-[var(--color-text-muted)]">{label}</p>
      <p className={`mt-2 text-4xl font-bold tabular-nums ${accent ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-base)]'}`}>{value}</p>
      {sub && <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">{sub}</p>}
    </div>
  );
}

export interface BarDatum {
  key: string;
  label: string;
  value: number | null; // 0..1
  valueLabel: string;
  detail?: string; // e.g. "1.234 von 5.678 erreichbaren Websites"
  highlight?: boolean;
}

/** Horizontal share bars (one series: share quantum-safe, in COLORS.pq). Value at the tip, details on hover/focus and for screen readers. */
export function ShareBars({ data, emptyLabel }: { data: BarDatum[]; emptyLabel: string }) {
  if (!data.length) return <p className="text-sm text-[var(--color-text-muted)]">{emptyLabel}</p>;
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.key} className="group" title={d.detail}>
          <div className="mb-1 flex items-baseline justify-between gap-4 text-sm">
            <span className={d.highlight ? 'font-semibold text-[var(--color-text-base)]' : 'text-[var(--color-text-base)]'}>{d.label}</span>
            <span className="font-mono text-xs text-[var(--color-text-muted)] tabular-nums">{d.valueLabel}</span>
          </div>
          <div
            className="relative h-2.5 w-full rounded-full bg-[var(--color-bg-elevated)]"
            role="img"
            aria-label={d.detail ? `${d.label}: ${d.valueLabel} (${d.detail})` : `${d.label}: ${d.valueLabel}`}
          >
            {d.value != null && d.value > 0 && (
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-opacity ${d.highlight ? '' : 'opacity-80 group-hover:opacity-100'}`}
                style={{ width: `${Math.max(1, d.value * 100)}%`, background: COLORS.pq }}
              />
            )}
          </div>
          {d.detail && <p className="mt-1 hidden font-mono text-[11px] text-[var(--color-text-muted)] group-hover:block group-focus-within:block">{d.detail}</p>}
        </li>
      ))}
    </ul>
  );
}

export interface Part { key: string; label: string; value: number; color: string }

/** Tall segmented bar (one whole split into parts) with legend; shares printed inside when they fit. */
export function SegmentedBar({ parts, total, locale, ariaLabel, legend = true, counts = true }: { parts: Part[]; total: number; locale: string; ariaLabel: string; legend?: boolean; counts?: boolean }) {
  const fmt = new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US', { style: 'percent', maximumFractionDigits: 0 });
  const visible = parts.filter((p) => p.value > 0);
  const described = parts.map((p) => `${p.label} ${total ? fmt.format(p.value / total) : '–'}`).join(', ');
  return (
    <div>
      <div className="flex h-7 w-full gap-[2px] overflow-hidden rounded" role="img" aria-label={`${ariaLabel}: ${described}`}>
        {visible.map((p) => {
          const s = total ? p.value / total : 0;
          return (
            <div
              key={p.key}
              className="flex h-full items-center rounded-[4px] px-2 font-mono text-[11px] font-semibold text-white"
              style={{ width: `${s * 100}%`, background: p.color, minWidth: 2 }}
              title={counts ? `${p.label}: ${fmt.format(s)} (${new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US').format(p.value)})` : `${p.label}: ${fmt.format(s)}`}
            >
              {s >= 0.08 ? fmt.format(s) : ''}
            </div>
          );
        })}
      </div>
      {legend && <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[var(--color-text-muted)]">
        {parts.map((p) => (
          <li key={p.key} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
            <span>{p.label}</span>
            {(!total || p.value / total < 0.08) && <span className="tabular-nums">{!total ? '–' : p.value / total < 0.005 ? `< ${fmt.format(0.01)}` : fmt.format(p.value / total)}</span>}
          </li>
        ))}
      </ul>}
    </div>
  );
}

export interface LinePoint { x: string; y: number | null }
export interface LineSeries { key: string; label: string; color: string; dashed?: boolean; points: LinePoint[] }

/** Share over months (0..1), one axis, 2px lines, end labels. Needs at least two months. */
export function LineChart({ series, xLabels, locale, ariaLabel }: { series: LineSeries[]; xLabels: string[]; locale: string; ariaLabel: string }) {
  const W = 640;
  const H = 220;
  const pad = { l: 40, r: 64, t: 12, b: 28 };
  const fmt = new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US', { style: 'percent', maximumFractionDigits: 0 });
  const ys = series.flatMap((s) => s.points.map((p) => p.y).filter((y): y is number => y != null));
  const max = Math.min(1, Math.max(0.1, Math.ceil((Math.max(...ys, 0) + 0.05) * 10) / 10));
  const x = (i: number) => pad.l + (xLabels.length === 1 ? 0 : (i / (xLabels.length - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  const ticks = [0, max / 2, max];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={ariaLabel}>
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--color-border-dim)" strokeWidth={1} />
          <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--color-text-muted)">{fmt.format(t)}</text>
        </g>
      ))}
      {xLabels.map((l, i) => (
        <text key={l} x={x(i)} y={H - 8} textAnchor="middle" fontSize={11} fill="var(--color-text-muted)">{l}</text>
      ))}
      {series.map((s) => {
        const pts = s.points.map((p, i) => (p.y == null ? null : [x(i), y(p.y)] as const)).filter((p): p is readonly [number, number] => !!p);
        const last = s.points.at(-1);
        return (
          <g key={s.key}>
            <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? '6 4' : undefined} strokeLinejoin="round" strokeLinecap="round" />
            {s.points.map((p, i) => p.y == null ? null : (
              <circle key={i} cx={x(i)} cy={y(p.y)} r={4} fill={s.color} stroke="var(--color-bg-surface)" strokeWidth={2}>
                <title>{`${s.label} · ${xLabels[i]}: ${fmt.format(p.y)}`}</title>
              </circle>
            ))}
            {last?.y != null && (
              <text x={x(s.points.length - 1) + 8} y={y(last.y) + 4} fontSize={11} fill="var(--color-text-base)">{s.label}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-[var(--color-text-muted)]">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span
            className="inline-block h-0 w-4 border-t-2"
            style={{ borderColor: i.color, borderTopStyle: i.dashed ? 'dashed' : 'solid' }}
            aria-hidden="true"
          />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function SectionTitle({ label, title, children }: { label: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-6 space-y-1">
      <p className="font-mono text-xs text-[var(--color-primary)]">{label}</p>
      <h2 className="text-2xl font-bold text-[var(--color-text-base)]">{title}</h2>
      {children && <div className="max-w-3xl pt-2 text-[var(--color-text-muted)] leading-relaxed">{children}</div>}
    </div>
  );
}
