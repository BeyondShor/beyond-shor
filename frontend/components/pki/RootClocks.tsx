'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Note } from './ui';

const FROM = 2024, TO = 2050;

/**
 * The three clocks of a root (cf. root-ca article): certificate notAfter, the root
 * programs' 15-year limit counted from key generation (Chrome, Mozilla for TLS), and
 * the end of classical signatures (BSI TR-02102-1: expected end of 2035; NIST IR 8547:
 * disallowed after 2035). The earliest date is the planning horizon.
 */
export default function RootClocks() {
  const t = useTranslations('pkiLab');
  const [keyYear, setKeyYear] = useState(2026);
  const [validity, setValidity] = useState(20);
  const [pq, setPq] = useState(false);
  const [delay, setDelay] = useState(3);

  const clocks = [
    { key: 'cert', end: keyYear + validity },
    { key: 'store', end: keyYear + 15 },
    ...(!pq ? [{ key: 'deadline', end: 2035 }] : []),
  ];
  const horizon = Math.min(...clocks.map((c) => c.end));
  const usableFrom = keyYear + delay;
  const usable = Math.max(0, horizon - usableFrom);
  const x = (y: number) => `${((Math.min(Math.max(y, FROM), TO) - FROM) / (TO - FROM)) * 100}%`;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5 text-xs">
          <span className="font-mono text-[var(--color-text-muted)]">{t('clocks.keyYear', { year: String(keyYear) })}</span>
          <input type="range" min={2024} max={2034} value={keyYear} onChange={(e) => setKeyYear(Number(e.target.value))} className="accent-[var(--color-primary)]" />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-xs">
          <span className="font-mono text-[var(--color-text-muted)]">{t('clocks.validity', { years: validity })}</span>
          <input type="range" min={8} max={25} value={validity} onChange={(e) => setValidity(Number(e.target.value))} className="accent-[var(--color-primary)]" />
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-xs">
          <span className="font-mono text-[var(--color-text-muted)]">{t('clocks.delay', { years: delay })}</span>
          <input type="range" min={0} max={3} value={delay} onChange={(e) => setDelay(Number(e.target.value))} className="accent-[var(--color-primary)]" />
        </label>
        <fieldset className="flex flex-col gap-1.5 text-xs">
          <legend className="font-mono text-[var(--color-text-muted)] mb-1.5">{t('clocks.alg')}</legend>
          <div className="flex gap-3">
            {[false, true].map((v) => (
              <label key={String(v)} className="flex items-center gap-1.5 text-[var(--color-text-base)]">
                <input type="radio" name="clock-alg" checked={pq === v} onChange={() => setPq(v)} />
                {t(v ? 'clocks.algPq' : 'clocks.algClassical')}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="flex flex-col gap-2" role="img" aria-label={t('clocks.aria', { horizon: String(horizon) })}>
        {clocks.map((c) => (
          <div key={c.key} className="grid grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 text-xs">
            <span className="font-mono text-[var(--color-text-muted)]">{t(`clocks.${c.key}`)}</span>
            <div className="relative h-4 rounded bg-[var(--color-bg-base)] border border-[var(--color-border-dim)]">
              <div className={`absolute inset-y-0 rounded ${c.end === horizon ? 'bg-amber-500/60' : 'bg-[var(--color-primary)]/40'}`}
                style={{ left: x(keyYear), width: `calc(${x(c.end)} - ${x(keyYear)})` }} />
              <span className="absolute -top-0.5 font-mono text-[0.65rem] text-[var(--color-text-base)]" style={{ left: `calc(${x(c.end)} + 4px)` }}>{c.end}</span>
            </div>
          </div>
        ))}
        <div className="grid grid-cols-[minmax(0,9rem)_1fr] gap-3 text-[0.65rem] font-mono text-[var(--color-text-muted)]">
          <span />
          <div className="relative h-3">
            {[2025, 2030, 2035, 2040, 2045, 2050].map((y) => (
              <span key={y} className="absolute -translate-x-1/2" style={{ left: x(y) }}>{y}</span>
            ))}
          </div>
        </div>
      </div>

      <Note tone={usable < 8 ? 'warn' : 'neutral'}>
        {t('clocks.result', { horizon: String(horizon), from: String(usableFrom), years: usable })}
      </Note>
      <Note>{t(pq ? 'clocks.notePq' : 'clocks.noteClassical')}</Note>
    </div>
  );
}
