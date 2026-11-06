'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ALGS, PRIVATE_CLIENTS, PROFILES, WEB_CLIENTS, type ProfileId } from '@/lib/pki/meta';
import type { HandshakeView } from '@/lib/pki/worker-types';
import { Badge } from './ui';

export type Stage = 'none' | 'ceremony' | 'issued' | 'connected';

function Node({ title, sub, alg, tone = 'neutral', active, children }: {
  title: string; sub?: string; alg?: string; tone?: 'neutral' | 'ca' | 'server' | 'client' | 'attacker' | 'service';
  active?: boolean; children?: ReactNode;
}) {
  const border = {
    neutral: 'border-[var(--color-border)]',
    ca: 'border-[var(--color-primary)]/50',
    server: 'border-violet-500/50',
    client: 'border-emerald-500/40',
    attacker: 'border-red-500/50 bg-red-500/5',
    service: 'border-[var(--color-border)] border-dashed',
  }[tone];
  return (
    <div className={`rounded-lg border ${border} bg-[var(--color-bg-base)]/60 px-3 py-2 transition-opacity ${active === false ? 'opacity-45' : ''}`}>
      <div className="font-mono text-xs font-semibold text-[var(--color-text-base)]">{title}</div>
      {sub && <div className="text-[0.7rem] text-[var(--color-text-muted)] leading-snug">{sub}</div>}
      {alg && <div className="mt-1"><Badge tone={tone === 'attacker' ? 'danger' : 'primary'}>{alg}</Badge></div>}
      {children}
    </div>
  );
}

const Arrow = ({ label }: { label?: string }) => (
  <div className="flex items-center justify-center gap-2 py-1 font-mono text-[0.7rem] text-[var(--color-text-muted)]" aria-hidden="true">
    <span>↓</span>{label && <span>{label}</span>}
  </div>
);

export default function Architecture({ profileId, stage, attacker, handshakes }: {
  profileId: ProfileId; stage: Stage; attacker: boolean; handshakes?: HandshakeView[];
}) {
  const t = useTranslations('pkiLab');
  const p = PROFILES[profileId];
  const priv = p.scope === 'private';
  const clients = priv ? PRIVATE_CLIENTS : WEB_CLIENTS;
  const caActive = stage !== 'none';
  const leafActive = stage === 'issued' || stage === 'connected';

  return (
    <figure className="rounded-xl border border-[var(--color-glass-border)] bg-[var(--color-bg-surface)]/60 p-4">
      <figcaption className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs text-[var(--color-primary)]">{t('arch.title')}</span>
        <Badge tone={priv ? 'violet' : 'primary'}>{t(priv ? 'scope.private' : 'scope.web')}</Badge>
      </figcaption>

      <div className="grid gap-3 md:grid-cols-[1fr_minmax(0,14rem)]">
        <div className="flex flex-col">
          {p.mtc ? (
            <Node tone="ca" active={caActive} title={t('arch.mtcCa')} sub={t('arch.mtcCaSub')} alg={`${ALGS.mldsa44.name} (${t('arch.cosignature')})`} />
          ) : (
            <>
              <Node tone="ca" active={caActive} title={t(priv ? 'arch.rootPrivate' : 'arch.rootWeb')} sub={t('arch.rootSub')} alg={ALGS[p.root].name} />
              <Arrow label={t('arch.signs')} />
              <Node tone="ca" active={caActive} title={t(priv ? 'arch.issuingPrivate' : 'arch.issuingWeb')} sub={t(priv ? 'arch.issuingSubPrivate' : 'arch.issuingSubWeb')} alg={ALGS[p.intermediate].name} />
            </>
          )}
          <Arrow label={t(p.mtc ? 'arch.logs' : 'arch.issues')} />
          <Node tone="server" active={leafActive} title={t('arch.server')} sub={priv ? 'portal.muster.example' : 'shop.example.com'} alg={ALGS[p.leaf].name} />
          <Arrow label={t('arch.handshake')} />
          {attacker && (
            <>
              <Node tone="attacker" title={t('arch.mallory')} sub={t('arch.mallorySub')} />
              <Arrow />
            </>
          )}
          <div className="grid gap-2 sm:grid-cols-3">
            {clients.map((c) => {
              const h = handshakes?.find((x) => x.client === c);
              return (
                <Node key={c} tone="client" title={t(`clients.${c}.name`)} sub={t(`clients.${c}.short`)}>
                  {h && (
                    <div className={`mt-1 font-mono text-[0.7rem] ${h.accepted ? 'text-emerald-400' : 'text-red-400'}`}>
                      {h.accepted ? `✓ ${t('accepted')}` : `✗ ${t('rejected')}`}
                    </div>
                  )}
                </Node>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Node tone="service" title={t('arch.ra')} sub={t(priv ? 'arch.raSubPrivate' : 'arch.raSubWeb')} />
          {!p.mtc && <Node tone="service" title={t('arch.crl')} sub={t('arch.crlSub')} />}
          {p.scope === 'web' && !p.mtc && <Node tone="service" title={t('arch.ct')} sub={t('arch.ctSub')} alg={p.ct ? ALGS[p.ct].name : undefined} />}
          {p.mtc && <Node tone="service" title={t('arch.mirror')} sub={t('arch.mirrorSub')} alg={ALGS.mldsa44.name} />}
          {p.mtc && <Node tone="service" title={t('arch.updateChannel')} sub={t('arch.updateChannelSub')} />}
          {priv && <Node tone="service" title={t('arch.issuanceLog')} sub={t('arch.issuanceLogSub')} />}
          <Node tone="service" title={t('arch.trustStore')} sub={t(priv ? 'arch.trustStorePrivate' : 'arch.trustStoreWeb')} />
        </div>
      </div>
    </figure>
  );
}
