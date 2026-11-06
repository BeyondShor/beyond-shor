'use client';

// Small building blocks shared by the PKI playground sections.
import type { ReactNode } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { CheckStatus } from '@/lib/pki/validate';

export function useFormat() {
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US');
  const df = new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', { dateStyle: 'medium', timeZone: 'UTC' });
  return {
    n: (v: number) => nf.format(Math.round(v)),
    bytes: (v: number) => `${nf.format(Math.round(v))} B`,
    ms: (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString(locale, { maximumFractionDigits: 2 })} s`
      : `${v.toLocaleString(locale, { maximumFractionDigits: v >= 100 ? 0 : v >= 10 ? 1 : 2 })} ms`),
    date: (d: Date | string) => df.format(typeof d === 'string' ? new Date(d) : d),
    locale,
  };
}

export function Section({ id, number, title, intro, children, aside }: {
  id?: string; number: string; title: string; intro?: ReactNode; children: ReactNode; aside?: ReactNode;
}) {
  return (
    <section id={id} className="glass-panel rounded-xl p-5 sm:p-6 flex flex-col gap-4 scroll-mt-24" aria-labelledby={id ? `${id}-title` : undefined}>
      <div className="flex flex-col gap-1.5">
        <span className="font-mono text-xs text-[var(--color-primary)]">{number}</span>
        <h2 id={id ? `${id}-title` : undefined} className="text-xl font-semibold text-[var(--color-text-base)] leading-snug">{title}</h2>
        {intro && <div className="text-sm text-[var(--color-text-muted)] leading-relaxed max-w-3xl">{intro}</div>}
      </div>
      {children}
      {aside}
    </section>
  );
}

export function Badge({ children, tone = 'neutral', title }: {
  children: ReactNode; tone?: 'neutral' | 'primary' | 'safe' | 'warn' | 'danger' | 'violet'; title?: string;
}) {
  const cls = {
    neutral: 'border-[var(--color-border)] text-[var(--color-text-muted)]',
    primary: 'border-[var(--color-primary)]/40 text-[var(--color-primary)] bg-[var(--color-primary)]/5',
    safe: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/5',
    warn: 'border-amber-500/40 text-amber-400 bg-amber-500/5',
    danger: 'border-red-500/40 text-red-400 bg-red-500/5',
    violet: 'border-violet-500/40 text-violet-300 bg-violet-500/5',
  }[tone];
  return <span title={title} className={`inline-flex items-center rounded border px-1.5 py-0.5 font-mono text-[0.7rem] leading-tight ${cls}`}>{children}</span>;
}

export function StatusIcon({ status }: { status: CheckStatus | 'ok' | 'no' }) {
  const map = {
    pass: ['✓', 'text-emerald-400'], ok: ['✓', 'text-emerald-400'],
    fail: ['✗', 'text-red-400'], no: ['✗', 'text-red-400'],
    warn: ['!', 'text-amber-400'], skip: ['–', 'text-[var(--color-text-muted)]'],
  } as const;
  const [g, c] = map[status];
  return <span aria-hidden="true" className={`inline-block w-4 text-center font-mono font-bold ${c}`}>{g}</span>;
}

export function Verdict({ ok, children }: { ok: boolean; children?: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-xs ${ok
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' : 'border-red-500/40 bg-red-500/10 text-red-400'}`}>
      {ok ? '✓' : '✗'} {children}
    </span>
  );
}

export function Button({ onClick, disabled, children, tone = 'primary', busy }: {
  onClick: () => void; disabled?: boolean; children: ReactNode; tone?: 'primary' | 'ghost' | 'danger'; busy?: boolean;
}) {
  const cls = {
    primary: 'bg-[var(--color-primary)] text-[var(--color-bg-base)] hover:opacity-90 border-transparent',
    ghost: 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
    danger: 'border-red-500/40 text-red-400 bg-red-500/10 hover:bg-red-500/20',
  }[tone];
  return (
    <button type="button" onClick={onClick} disabled={disabled || busy}
      className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 font-mono text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}>
      {busy && <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

export function Toggle({ on, onChange, children, tone = 'primary' }: {
  on: boolean; onChange: (v: boolean) => void; children: ReactNode; tone?: 'primary' | 'danger';
}) {
  const active = tone === 'danger' ? 'border-red-500/40 text-red-400 bg-red-500/10' : 'border-[var(--color-primary)]/50 text-[var(--color-primary)] bg-[var(--color-primary)]/10';
  return (
    <button type="button" aria-pressed={on} onClick={() => onChange(!on)}
      className={`font-mono text-xs px-3 py-1.5 rounded-lg border transition-colors ${on ? active
        : 'border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-base)]'}`}>
      {children}
    </button>
  );
}

export function Collapsible({ summary, children, defaultOpen = false }: { summary: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-base)]/40">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 font-mono text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-base)]">
        <span className="min-w-0">{summary}</span>
        <span aria-hidden="true" className="transition-transform group-open:rotate-45">+</span>
      </summary>
      <div className="border-t border-[var(--color-glass-border)] px-3 py-3">{children}</div>
    </details>
  );
}

/** "More in the article" link, shown only for published articles. */
export function ArticleHint({ slug, articles }: { slug: string; articles: { slug: string; title: string }[] }) {
  const t = useTranslations('pkiLab');
  const a = articles.find((x) => x.slug === slug);
  if (!a) return null;
  return (
    <p className="font-mono text-xs text-[var(--color-text-muted)]">
      {t('moreInArticle')}{' '}
      <Link href={{ pathname: '/blog/[slug]', params: { slug: a.slug } }} className="text-[var(--color-primary)] hover:underline">
        {a.title}
      </Link>
    </p>
  );
}

export function Note({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warn' | 'danger' | 'safe' }) {
  const cls = {
    neutral: 'border-[var(--color-glass-border)] bg-[var(--color-bg-base)]/40 text-[var(--color-text-muted)]',
    warn: 'border-amber-500/25 bg-amber-500/5 text-amber-200/90',
    danger: 'border-red-500/25 bg-red-500/5 text-red-200/90',
    safe: 'border-emerald-500/25 bg-emerald-500/5 text-emerald-200/90',
  }[tone];
  return <div className={`rounded-lg border px-3 py-2.5 text-sm leading-relaxed ${cls}`}>{children}</div>;
}

/** Horizontal bar with an optional limit marker. */
export function BudgetBar({ value, limit, max, label, limitLabel }: { value: number; limit?: number; max: number; label: string; limitLabel?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  const lim = limit !== undefined ? Math.min(100, (limit / max) * 100) : undefined;
  const over = limit !== undefined && value > limit;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between gap-3 font-mono text-xs">
        <span className="text-[var(--color-text-muted)]">{label}</span>
        <span className={over ? 'text-red-400' : 'text-[var(--color-text-base)]'}>{limitLabel}</span>
      </div>
      <div className="relative h-3 rounded bg-[var(--color-bg-base)] border border-[var(--color-border-dim)]" role="presentation">
        <div className={`absolute inset-y-0 left-0 rounded ${over ? 'bg-red-500/60' : 'bg-[var(--color-primary)]/60'}`} style={{ width: `${pct}%` }} />
        {lim !== undefined && <div className="absolute inset-y-[-3px] w-0.5 bg-amber-400" style={{ left: `${lim}%` }} />}
      </div>
    </div>
  );
}
