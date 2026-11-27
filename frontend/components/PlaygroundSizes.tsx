'use client';

// Byte sizes in the playgrounds: always the exact count, with a rounded decimal
// (SI) value next to large ones, so nobody has to guess whether "KB" meant 1000 or 1024.

import { useLocale } from 'next-intl';

/** [exact, rounded] — the rounded SI value only for 10 000 bytes and more */
export function formatBytesParts(n: number, locale: string): [string, string | null] {
  const tag = locale === 'de' ? 'de-DE' : 'en-US';
  const unit = locale === 'de' ? 'Byte' : n === 1 ? 'byte' : 'bytes';
  const exact = `${n.toLocaleString(tag)} ${unit}`;
  if (n < 10_000) return [exact, null];
  const approx = n >= 1_000_000
    ? `${(n / 1_000_000).toLocaleString(tag, { maximumFractionDigits: 2 })} MB`
    : `${(n / 1000).toLocaleString(tag, { maximumFractionDigits: n >= 100_000 ? 0 : 1 })} kB`;
  return [exact, `≈ ${approx}`];
}

export function formatBytes(n: number, locale: string): string {
  const [exact, approx] = formatBytesParts(n, locale);
  return approx ? `${exact} (${approx})` : exact;
}

export function useFormatBytes(): (n: number) => string {
  const locale = useLocale();
  return (n: number) => formatBytes(n, locale);
}

export interface SizeRow {
  label: string;
  bytes: number;
}

export interface SizeGroup {
  title: string;
  rows:  SizeRow[];
  total?: string;   // label of a sum row, if the group should show one
}

export function SizeSummary({ title, intro, groups, note }: {
  title: string; intro: string; groups: SizeGroup[]; note?: string;
}) {
  const locale = useLocale();
  // the rounded value moves to its own line on narrow screens, so labels keep their room
  const cell = (n: number) => {
    const [exact, approx] = formatBytesParts(n, locale);
    return (
      <>
        <span className="whitespace-nowrap">{exact}</span>
        {approx && <span className="block sm:inline sm:ml-1 whitespace-nowrap text-[var(--color-text-muted)]">({approx})</span>}
      </>
    );
  };
  return (
    <div className="glass-panel rounded-xl border border-[var(--color-glass-border)] p-5 flex flex-col gap-4 animate-fade-up">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-[var(--color-primary)]">{title}</span>
        <p className="font-mono text-xs text-[var(--color-text-muted)]">{intro}</p>
      </div>
      {groups.map(({ title: groupTitle, rows, total }) => (
        <table key={groupTitle} className="w-full border-collapse font-mono text-xs">
          <caption className="text-left pb-1.5 text-[var(--color-text-base)]">{groupTitle}</caption>
          <tbody>
            {rows.map(({ label, bytes }) => (
              <tr key={label} className="border-b border-[var(--color-glass-border)]/40 align-top">
                <td className="py-1.5 pr-4 text-[var(--color-text-muted)]">{label}</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--color-text-base)]">{cell(bytes)}</td>
              </tr>
            ))}
            {total && (
              <tr className="align-top">
                <td className="py-1.5 pr-4 font-semibold text-[var(--color-text-base)]">{total}</td>
                <td className="py-1.5 text-right tabular-nums font-semibold text-[var(--color-primary)]">
                  {cell(rows.reduce((s, r) => s + r.bytes, 0))}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      ))}
      {note && <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{note}</p>}
    </div>
  );
}
