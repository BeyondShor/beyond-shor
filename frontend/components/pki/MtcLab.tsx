'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ALGS } from '@/lib/pki/meta';
import type { MtcSizeRow, PkiRequest, PkiResponse } from '@/lib/pki/worker-types';
import { Button, Note, useFormat } from './ui';

type Call = <R extends PkiRequest>(req: R) => { id: number; done: Promise<PkiResponse<R['op']>> };

const FILLS = [255, 1023, 4095, 16383];
const SIG44 = ALGS.mldsa44.sigBytes, PK44 = ALGS.mldsa44.pkBytes;
// Hypothetical ML-DSA-44 X.509 chain in the Web PKI: 5 signatures + 2 public keys
const X509_WEB_LOAD = 5 * SIG44 + 2 * PK44;

export default function MtcLab({ call }: { call: Call }) {
  const t = useTranslations('pkiLab');
  const f = useFormat();
  const [rows, setRows] = useState<MtcSizeRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null);
    try { setRows(await call({ op: 'mtcSizes', fills: FILLS }).done); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="grid gap-2 sm:grid-cols-2 text-xs text-[var(--color-text-muted)] leading-relaxed list-decimal pl-5">
        {(['s1', 's2', 's3', 's4'] as const).map((s) => <li key={s}>{t(`mtc.${s}`)}</li>)}
      </ol>
      <div><Button onClick={run} busy={busy}>{t('mtc.run')}</Button></div>
      {error && <Note tone="danger">{error}</Note>}
      {rows && (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border-dim)]">
          <table className="w-full min-w-[560px] text-xs font-mono">
            <thead>
              <tr className="border-b border-[var(--color-border-dim)] bg-[var(--color-bg-base)] text-left text-[var(--color-text-muted)]">
                <th className="px-3 py-2 font-normal">{t('mtc.logSize')}</th>
                <th className="px-3 py-2 font-normal">{t('mtc.proof')}</th>
                <th className="px-3 py-2 font-normal">{t('mtc.landmarkLoad')}</th>
                <th className="px-3 py-2 font-normal">{t('mtc.standaloneCert')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.logSize} className="border-b border-[var(--color-border-dim)]/60">
                  <td className="px-3 py-1.5 tabular-nums">{f.n(r.logSize)}</td>
                  <td className="px-3 py-1.5 tabular-nums">{r.proofHashes} × 32 = {f.bytes(r.proofHashes * 32)}</td>
                  <td className="px-3 py-1.5 tabular-nums text-[var(--color-primary)]">{f.bytes(SIG44 + PK44 + r.proofHashes * 32)}</td>
                  <td className="px-3 py-1.5 tabular-nums">{f.bytes(r.standaloneBytes)}</td>
                </tr>
              ))}
              <tr className="text-[var(--color-text-muted)]">
                <td className="px-3 py-1.5">{t('mtc.webScale')}</td>
                <td className="px-3 py-1.5 tabular-nums">23 × 32 = {f.bytes(736)}</td>
                <td className="px-3 py-1.5 tabular-nums">{f.bytes(SIG44 + PK44 + 736)}</td>
                <td className="px-3 py-1.5">—</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <Note>{t('mtc.compare', { x509: f.n(X509_WEB_LOAD), landmark: f.n(SIG44 + PK44 + 736) })}</Note>
      <Note tone="warn">{t('mtc.limits')}</Note>
    </div>
  );
}
