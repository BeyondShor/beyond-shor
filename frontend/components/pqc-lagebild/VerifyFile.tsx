'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/** Fetches a published file and its signature and verifies both in the browser against the pinned key. */
export default function VerifyFile({ file, publicKeyHex }: { file: string; publicKeyHex: string }) {
  const t = useTranslations('pqcLagebild');
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'bad' | 'error'>('idle');

  async function verify() {
    setState('busy');
    try {
      const [body, sig] = await Promise.all([
        fetch(`/api/pqc-lagebild/${file}`, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(); return r.arrayBuffer(); }),
        fetch(`/api/pqc-lagebild/${file}.sig`, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error(); return r.text(); }),
      ]);
      const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');
      const hex = (h: string) => Uint8Array.from(h.trim().match(/.{2}/g)!.map((b) => parseInt(b, 16)));
      setState(ml_dsa65.verify(hex(sig), new Uint8Array(body), hex(publicKeyHex)) ? 'ok' : 'bad');
    } catch {
      setState('error');
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={verify}
        disabled={state === 'busy'}
        className="rounded border border-[var(--color-primary)] px-2.5 py-1 font-mono text-[11px] font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-glow)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {t('verify.button')}
      </button>
      {state === 'ok' && <span className="font-mono text-[11px] text-emerald-400">✔ {t('verify.ok')}</span>}
      {state === 'bad' && <span className="font-mono text-[11px] text-red-400">✘ {t('verify.bad')}</span>}
      {state === 'error' && <span className="font-mono text-[11px] text-[var(--color-text-muted)]">{t('verify.error')}</span>}
    </span>
  );
}
