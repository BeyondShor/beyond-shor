'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { FAILURE_VARIANTS, PROFILES, type ProfileId, type Variant } from '@/lib/pki/meta';
import type { HandshakeView, LeafView, PkiRequest, PkiResponse } from '@/lib/pki/worker-types';
import ValidationList from './ValidationList';
import { Button, Note, Verdict } from './ui';

type Call = <R extends PkiRequest>(req: R) => { id: number; done: Promise<PkiResponse<R['op']>> };

export default function FailureLab({ profileId, call, ready }: { profileId: ProfileId; call: Call; ready: boolean }) {
  const t = useTranslations('pkiLab');
  const [variant, setVariant] = useState<Variant | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ leaf: LeafView; handshakes: HandshakeView[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const p = PROFILES[profileId];

  if (p.mtc) return <Note>{t('failures.mtcNote')}</Note>;
  const variants = FAILURE_VARIANTS.filter((v) => p.scope === 'private' || v !== 'nameConstraints');

  async function run(v: Variant) {
    setVariant(v); setBusy(true); setError(null); setResult(null);
    try { setResult(await call({ op: 'issueLeaf', variant: v }).done); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('failures.pick')}>
        {variants.map((v) => (
          <Button key={v} tone={variant === v ? 'primary' : 'ghost'} onClick={() => run(v)} disabled={!ready} busy={busy && variant === v}>
            {t(`failures.${v}.label`)}
          </Button>
        ))}
      </div>
      {!ready && <p className="text-xs text-[var(--color-text-muted)]">{t('failures.needPki')}</p>}
      {variant === 'intermediateRevoked' && profileId === 'mixed' && busy && (
        <p className="text-xs text-amber-300/90">{t('failures.slowRoot')}</p>
      )}
      {variant && (
        <Note>
          <span className="block text-[var(--color-text-base)]">{t(`failures.${variant}.what`)}</span>
          <span className="block mt-1">{t(`failures.${variant}.why`)}</span>
        </Note>
      )}
      {error && <Note tone="danger">{error}</Note>}
      {result && (
        <div className="grid gap-3 md:grid-cols-3">
          {result.handshakes.map((h) => (
            <div key={h.client} className="rounded-lg border border-[var(--color-border-dim)] p-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs text-[var(--color-text-base)]">{t(`clients.${h.client}.name`)}</span>
                <Verdict ok={h.accepted}>{t(h.accepted ? 'accepted' : 'rejected')}</Verdict>
              </div>
              <ValidationList checks={h.validation.checks} showPassed={false} />
              {h.validation.checks.every((c) => c.status !== 'fail') && (
                <p className="text-xs text-[var(--color-text-muted)]">{t('failures.noFailure')}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
