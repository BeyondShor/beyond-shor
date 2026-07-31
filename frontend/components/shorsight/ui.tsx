'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/* ─── status → colour ─────────────────────────────────────────────────────
   ShorSight paints three independent scales: quantum status, classical
   strength and evidence grade. They share one badge shape so a row can be
   read left to right without re-learning the colours.
   ───────────────────────────────────────────────────────────────────────── */

export const STATUS_STYLE: Record<string, string> = {
  safe:    'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  secure:  'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  unsafe:  'border-red-500/30     bg-red-500/10     text-red-400',
  broken:  'border-red-500/30     bg-red-500/10     text-red-400',
  weak:    'border-amber-500/30   bg-amber-500/10   text-amber-400',
  unknown: 'border-slate-500/30   bg-slate-500/10   text-slate-400',
};

export const STATUS_FILL: Record<string, string> = {
  safe:    '#34d399',
  secure:  '#34d399',
  unsafe:  '#f87171',
  broken:  '#f87171',
  weak:    '#fbbf24',
  unknown: '#64748b',
};

/** Evidence grade → tint. `literal` (an exact API call) is the strongest. */
export const CONFIDENCE_STYLE: Record<string, string> = {
  literal:     STATUS_STYLE.safe,
  resolved:    STATUS_STYLE.unknown,
  'name-only': STATUS_STYLE.weak,
};

/** Risk category rank 1–4 → low · medium · high · very high. */
export const RANK_STYLE: Record<number, string> = {
  1: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
  2: 'border-amber-500/30   bg-amber-500/10   text-amber-400',
  3: 'border-orange-500/30  bg-orange-500/10  text-orange-400',
  4: 'border-red-500/30     bg-red-500/10     text-red-400',
};

export const RANK_FILL: Record<number, string> = {
  1: 'rgba(52, 211, 153, 0.16)',
  2: 'rgba(251, 191, 36, 0.18)',
  3: 'rgba(249, 115, 22, 0.22)',
  4: 'rgba(248, 113, 113, 0.26)',
};

export const SOURCE_ICON: Record<string, string> = {
  repository: '📦', repo: '📦', local: '📁', image: '🐳', network: '🌐',
  endpoint: '📡', certificate: '🔏', keystore: '🔑', config: '⚙️',
  manual: '✍️', imported: '📥', source: '•',
};

/* ─── primitives ──────────────────────────────────────────────────────────── */

export function Badge({ tone, children, title }: {
  tone: string; children: ReactNode; title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] leading-4 ${
        STATUS_STYLE[tone] ?? STATUS_STYLE.unknown
      }`}
    >
      {children}
    </span>
  );
}

export function Pill({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/60 px-2 py-0.5 font-mono text-[10px] leading-4 text-[var(--color-text-muted)]"
    >
      {children}
    </span>
  );
}

export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`glass-panel rounded-xl p-4 sm:p-6 ${className}`}>{children}</section>
  );
}

export function PanelTitle({ children, sub, info }: {
  children: ReactNode; sub?: string; info?: ReactNode;
}) {
  return (
    <h3 className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm font-semibold text-[var(--color-text-base)]">
      {children}
      {sub && <span className="font-mono text-[11px] font-normal text-[var(--color-text-muted)]">{sub}</span>}
      {info}
    </h3>
  );
}

export function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-5 space-y-1">
      <p className="font-mono text-xs text-[var(--color-primary)]">{label}</p>
      <h2 className="text-lg font-semibold text-[var(--color-text-base)]">{title}</h2>
    </div>
  );
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--color-border-dim)] py-1.5 last:border-0">
      <span className="shrink-0 font-mono text-[11px] text-[var(--color-text-muted)]">{label}</span>
      <span className="min-w-0 break-words text-right font-mono text-xs text-[var(--color-text-base)]">{children}</span>
    </div>
  );
}

/* ─── InfoTip ─────────────────────────────────────────────────────────────
   The circled i that carries ShorSight's explanations of how a number was
   arrived at. Rendered as a popover rather than a title attribute because
   the text is often several sentences and contains links.
   ───────────────────────────────────────────────────────────────────────── */

export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="relative inline-block align-middle">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen(o => !o)}
        className={`ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border font-mono text-[9px] leading-none transition-colors ${
          open
            ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-bg-base)]'
            : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
        }`}
      >
        i
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className="glass-panel-strong absolute left-1/2 top-6 z-30 block w-[min(20rem,calc(100vw-2rem))] -translate-x-1/2 rounded-lg p-3 text-left text-xs font-normal normal-case leading-relaxed tracking-normal text-[var(--color-text-muted)] shadow-xl [&_b]:text-[var(--color-text-base)] [&_code]:font-mono [&_code]:text-[var(--color-primary)]"
        >
          {children}
        </span>
      )}
    </span>
  );
}

/* ─── Drawer ──────────────────────────────────────────────────────────────
   Detail view for a table row. A dialog rather than an expanding row: the
   evidence list for one algorithm can be longer than the table itself.
   ───────────────────────────────────────────────────────────────────────── */

export function Drawer({ open, title, subtitle, onClose, children }: {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="glass-panel-strong relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-[var(--color-glass-border)] shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-bg-surface)]/95 px-5 py-4 backdrop-blur">
          <div className="min-w-0">
            <h3 className="break-words text-base font-semibold text-[var(--color-text-base)]">{title}</h3>
            {subtitle && <div className="mt-1.5 flex flex-wrap items-center gap-1.5">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="-mr-1 shrink-0 rounded-lg border border-[var(--color-border)] px-2 py-1 font-mono text-xs text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            ✕
          </button>
        </div>
        <div className="space-y-6 px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mono-label mb-2 text-[var(--color-primary)]">{title}</h4>
      {children}
    </section>
  );
}

/* ─── filter chip ─────────────────────────────────────────────────────────── */

export function Chip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] transition-colors ${
        active
          ? 'border-[var(--color-primary)] bg-[var(--color-primary-glow)] text-[var(--color-primary)]'
          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
      }`}
    >
      {children}
    </button>
  );
}
