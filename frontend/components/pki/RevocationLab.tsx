'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { CrlInfo, PkiRequest, PkiResponse } from '@/lib/pki/worker-types';
import { BudgetBar, Note, useFormat } from './ui';

type Call = <R extends PkiRequest>(req: R) => { id: number; done: Promise<PkiResponse<R['op']>> };

// Maximum lifetimes of public TLS certificates by issuance date (CA/B Forum Ballot SC-081)
// plus Let's Encrypt's optional 160-hour certificates.
const LIFETIMES = [
  { key: 'd398', days: 398 },
  { key: 'd200', days: 200 },
  { key: 'd100', days: 100 },
  { key: 'd47', days: 47 },
  { key: 'h160', days: 160 / 24 },
] as const;

const BEHAVIOURS = ['local', 'online', 'softBlocked', 'none'] as const;

/** Exposure window = min(notAfter, effective revocation) − compromise, in days. */
function exposure(lifetime: number, compromise: number, reaches: boolean, delay = 1): number {
  const effective = reaches ? Math.min(lifetime, compromise + delay) : lifetime;
  return Math.max(0, effective - compromise);
}

export default function RevocationLab({ call, crlAvailable, pkiKey }: { call: Call; crlAvailable: boolean; pkiKey: string }) {
  const t = useTranslations('pkiLab');
  const f = useFormat();
  const [life, setLife] = useState<(typeof LIFETIMES)[number]['key']>('d200');
  const [pos, setPos] = useState(25);       // compromise at % of the lifetime
  // CRL info belongs to one PKI state; stale info is simply not shown
  const [crlState, setCrlState] = useState<{ key: string; info: CrlInfo } | null>(null);

  useEffect(() => {
    if (!crlAvailable) return;
    let alive = true;
    call({ op: 'crlInfo' }).done.then((info) => { if (alive) setCrlState({ key: pkiKey, info }); }).catch(() => {});
    return () => { alive = false; };
  }, [call, crlAvailable, pkiKey]);
  const crl = crlAvailable && crlState?.key === pkiKey ? crlState.info : null;

  const lifetime = LIFETIMES.find((l) => l.key === life)!.days;
  const compromise = (lifetime * pos) / 100;
  const fmtDays = (d: number) => (d < 2 ? t('revocation.hours', { n: f.n(d * 24) }) : t('revocation.days', { n: d.toLocaleString(f.locale, { maximumFractionDigits: 1 }) }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex min-w-0 flex-col gap-1.5 text-xs">
          <span className="font-mono text-[var(--color-text-muted)]">{t('revocation.lifetime')}</span>
          <select value={life} onChange={(e) => setLife(e.target.value as typeof life)}
            className="w-full min-w-0 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 font-mono text-sm text-[var(--color-text-base)]">
            {LIFETIMES.map((l) => <option key={l.key} value={l.key}>{t(`revocation.life.${l.key}`)}</option>)}
          </select>
        </label>
        <label className="flex min-w-0 flex-col gap-1.5 text-xs">
          <span className="font-mono text-[var(--color-text-muted)]">{t('revocation.compromise', { when: fmtDays(compromise), pct: pos })}</span>
          <input type="range" min={0} max={95} step={5} value={pos} onChange={(e) => setPos(Number(e.target.value))} className="accent-[var(--color-primary)]" />
        </label>
      </div>
      <div className="flex flex-col gap-3">
        {BEHAVIOURS.map((b) => {
          const reaches = b === 'local' || b === 'online';
          const days = exposure(lifetime, compromise, reaches);
          return (
            <div key={b} className="flex flex-col gap-1">
              <BudgetBar value={days} max={lifetime} label={t(`revocation.behaviour.${b}`)} limitLabel={fmtDays(days)} />
            </div>
          );
        })}
      </div>
      <Note>{t('revocation.formula')}</Note>
      {life === 'h160' && <Note tone="safe">{t('revocation.shortLived')}</Note>}
      {crl && (
        <Note>{t('revocation.crlSize', { bytes: f.n(crl.bytes), sig: f.n(crl.signatureBytes), revoked: crl.revoked })}</Note>
      )}
    </div>
  );
}
