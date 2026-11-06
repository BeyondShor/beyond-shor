'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ATTACKS, PROFILES, QDAY_DEPLOYMENTS, type AttackId, type ProfileId, type QDayDeployment } from '@/lib/pki/meta';
import type { AttackView, PkiRequest, PkiResponse, QDayView } from '@/lib/pki/worker-types';
import ValidationList from './ValidationList';
import { Button, Collapsible, Note, Toggle, Verdict } from './ui';

type Call = <R extends PkiRequest>(req: R) => { id: number; done: Promise<PkiResponse<R['op']>> };

export default function AttackLab({ profileId, call, ready, attacker, onAttacker }: {
  profileId: ProfileId; call: Call; ready: boolean; attacker: boolean; onAttacker: (v: boolean) => void;
}) {
  const t = useTranslations('pkiLab');
  const p = PROFILES[profileId];
  const [quantum, setQuantum] = useState(false);
  const [blocked, setBlocked] = useState(true);
  const [attack, setAttack] = useState<AttackId | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AttackView | null>(null);
  const [qday, setQday] = useState<Partial<Record<QDayDeployment, QDayView>>>({});
  const [error, setError] = useState<string | null>(null);
  const attacks = ATTACKS.filter((a) => !p.mtc || (a !== 'stolenKey' && a !== 'misissuance'));

  async function runAttack(a: AttackId, crlBlocked = blocked) {
    setAttack(a); setBusy(a); setError(null); setOutcome(null);
    try { setOutcome(await call({ op: 'attack', attack: a, crlBlocked }).done); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  async function runQDay() {
    setBusy('qday'); setError(null); setQday({});
    try {
      for (const d of QDAY_DEPLOYMENTS) {
        const r = await call({ op: 'qday', deployment: d }).done;
        setQday((prev) => ({ ...prev, [d]: r }));
      }
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-2">
        <Toggle on={attacker} onChange={onAttacker} tone="danger">{t('attack.toggle')}</Toggle>
        <Toggle on={quantum} onChange={setQuantum} tone="danger">{t('attack.quantumToggle')}</Toggle>
      </div>

      {attacker && (
        <div className="flex flex-col gap-4">
          <Note tone="danger">{t('attack.sees')}</Note>
          <div className="grid gap-3 sm:grid-cols-2">
            {attacks.map((a) => (
              <div key={a} className={`rounded-lg border p-3 flex flex-col gap-2 ${attack === a ? 'border-red-500/50 bg-red-500/5' : 'border-[var(--color-border-dim)]'}`}>
                <span className="font-mono text-xs font-semibold text-[var(--color-text-base)]">{t(`attack.${a}.title`)}</span>
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{t(`attack.${a}.desc`)}</p>
                {a === 'stolenKey' && (
                  <label className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
                    <input type="checkbox" checked={blocked} onChange={(e) => { setBlocked(e.target.checked); if (attack === 'stolenKey') runAttack('stolenKey', e.target.checked); }} />
                    {t('attack.stolenKey.block')}
                  </label>
                )}
                <div><Button tone="danger" onClick={() => runAttack(a)} disabled={!ready} busy={busy === a}>{t('attack.run')}</Button></div>
              </div>
            ))}
          </div>
          {!ready && <p className="text-xs text-[var(--color-text-muted)]">{t('failures.needPki')}</p>}
          {outcome && (
            <div className="flex flex-col gap-3">
              <div className="grid gap-3 md:grid-cols-3">
                {outcome.results.map((r) => (
                  <div key={r.client} className="rounded-lg border border-[var(--color-border-dim)] p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-[var(--color-text-base)]">{t(`clients.${r.client}.name`)}</span>
                      <Verdict ok={!r.accepted}>{t(r.accepted ? 'attack.fooled' : 'attack.blocked')}</Verdict>
                    </div>
                    <ValidationList checks={r.validation.checks} showPassed={false} />
                  </div>
                ))}
              </div>
              <Note tone={outcome.results.some((r) => r.accepted) ? 'warn' : 'safe'}>{t(`attack.${outcome.attack}.lesson`)}</Note>
              {outcome.attack === 'misissuance' && (
                <Note tone={outcome.detectedBy ? 'safe' : 'warn'}>{t(outcome.detectedBy ? 'attack.misissuance.ct' : 'attack.misissuance.noCt')}</Note>
              )}
            </div>
          )}
        </div>
      )}

      {quantum && (
        <div className="flex flex-col gap-4">
          <Note tone="danger">{t('qday.intro')}</Note>
          <div><Button tone="danger" onClick={runQDay} busy={busy === 'qday'}>{t('qday.run')}</Button></div>
          {Object.keys(qday).length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-[var(--color-border-dim)]">
              <table className="w-full min-w-[560px] text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-border-dim)] bg-[var(--color-bg-base)]">
                    <th className="px-3 py-2 text-left mono-label text-[var(--color-text-muted)]">{t('qday.deployment')}</th>
                    {(['legacy', 'modern', 'strict'] as const).map((c) => (
                      <th key={c} className="px-3 py-2 text-left mono-label text-[var(--color-text-muted)]">{t(`clients.${c}.name`)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {QDAY_DEPLOYMENTS.map((d) => {
                    const r = qday[d];
                    return (
                      <tr key={d} className="border-b border-[var(--color-border-dim)]/60 align-top">
                        <td className="px-3 py-2">
                          <span className="block font-mono text-[var(--color-text-base)]">{t(`qday.${d}.name`)}</span>
                          <span className="block text-[var(--color-text-muted)] leading-relaxed">{t(`qday.${d}.desc`)}</span>
                        </td>
                        {(['legacy', 'modern', 'strict'] as const).map((c) => {
                          const cell = r?.cells.find((x) => x.client === c);
                          if (!cell) return <td key={c} className="px-3 py-2 text-[var(--color-text-muted)]">…</td>;
                          return (
                            <td key={c} className="px-3 py-2">
                              <div className="flex flex-col gap-1 font-mono">
                                <span className={cell.legit ? 'text-emerald-400' : 'text-[var(--color-text-muted)]'}>
                                  {cell.legit ? '✓' : '✗'} {t('qday.legit')}
                                </span>
                                <span className={cell.forged ? 'text-red-400' : 'text-emerald-400'}>
                                  {cell.forged ? `⚠ ${t('qday.forgedAccepted')}` : `✓ ${t('qday.forgedRejected')}`}
                                </span>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {qday.compositeParallel?.compositeForgeryRejected && <Note tone="safe">{t('qday.compositeAttempt')}</Note>}
          {Object.keys(qday).length === QDAY_DEPLOYMENTS.length && (
            <>
              <Note tone="warn">{t('qday.lesson')}</Note>
              <Collapsible summary={t('qday.brokenKeys')}>
                <ul className="flex flex-col gap-2 font-mono text-[0.7rem]">
                  {QDAY_DEPLOYMENTS.flatMap((d) => qday[d]!.brokenKeys.map((k, i) => (
                    <li key={`${d}-${i}`} className="break-all">
                      <span className="text-[var(--color-text-base)]">{k.owner}</span>
                      <span className="block text-[var(--color-text-muted)]">pk {k.publicKeyHex.slice(0, 32)}… → sk <span className="text-red-400">{k.recoveredSecretHex.slice(0, 32)}…</span></span>
                    </li>
                  )))}
                </ul>
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">{t('qday.simulated')}</p>
              </Collapsible>
              <Collapsible summary={t('qday.whyStrict')}>
                <ValidationList checks={qday.catalyst!.cells[2].forgedChecks.checks.filter((c) => c.status !== 'pass')} />
              </Collapsible>
            </>
          )}
        </div>
      )}
      {error && <Note tone="danger">{error}</Note>}
    </div>
  );
}
