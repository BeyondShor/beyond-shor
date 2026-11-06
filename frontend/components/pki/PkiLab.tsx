'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ALGS, PRIVATE_PROFILES, PROFILES, WEB_PROFILES, type ProfileId, type Scope } from '@/lib/pki/meta';
import { usePkiWorker } from '@/lib/pki/use-pki-worker';
import type { HandshakeView, LeafView, PkiView } from '@/lib/pki/worker-types';
import Architecture, { type Stage } from './Architecture';
import CertViewer from './CertViewer';
import ValidationList from './ValidationList';
import ByteBudget from './ByteBudget';
import FailureLab from './FailureLab';
import AttackLab from './AttackLab';
import RevocationLab from './RevocationLab';
import MtcLab from './MtcLab';
import RootClocks from './RootClocks';
import PkiBenchmark from './PkiBenchmark';
import { ArticleHint, Badge, Button, Collapsible, Note, Section, Verdict, useFormat } from './ui';

export interface ArticleRef { slug: string; title: string }

const PROFILE_BADGES: Record<ProfileId, { key: string; tone: 'safe' | 'warn' | 'danger' | 'violet' | 'neutral' }[]> = {
  classical: [{ key: 'notQuantumSafe', tone: 'danger' }],
  mldsa44: [{ key: 'quantumSafe', tone: 'safe' }, { key: 'notInTr', tone: 'warn' }],
  mldsa65: [{ key: 'quantumSafe', tone: 'safe' }, { key: 'notHybrid', tone: 'warn' }],
  composite: [{ key: 'quantumSafe', tone: 'safe' }, { key: 'trConform', tone: 'safe' }, { key: 'draft', tone: 'violet' }],
  mixed: [{ key: 'quantumSafe', tone: 'safe' }, { key: 'notHybridBelow', tone: 'warn' }],
  'web-classical': [{ key: 'today', tone: 'neutral' }, { key: 'notQuantumSafe', tone: 'danger' }],
  'web-mldsa44': [{ key: 'hypothetical', tone: 'warn' }],
  'web-mtc': [{ key: 'planned', tone: 'violet' }, { key: 'quantumSafe', tone: 'safe' }],
};

export default function PkiLab({ articles }: { articles: ArticleRef[] }) {
  const t = useTranslations('pkiLab');
  const f = useFormat();
  const { call, cancel } = usePkiWorker();
  const [scope, setScope] = useState<Scope>('private');
  const [profile, setProfile] = useState<ProfileId>('mldsa65');
  const [pki, setPki] = useState<PkiView | null>(null);
  const [leaf, setLeaf] = useState<LeafView | null>(null);
  const [handshakes, setHandshakes] = useState<HandshakeView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attacker, setAttacker] = useState(false);
  const [pkiKey, setPkiKey] = useState(0);

  const p = PROFILES[profile];
  const stage: Stage = handshakes ? 'connected' : leaf ? 'issued' : pki ? 'ceremony' : 'none';
  const ready = !!pki && pki.profile === profile;

  function choose(next: ProfileId) {
    setProfile(next); setPki(null); setLeaf(null); setHandshakes(null); setError(null);
  }

  function switchScope(s: Scope) {
    setScope(s);
    choose(s === 'private' ? 'mldsa65' : 'web-classical');
  }

  async function ceremony() {
    setBusy('ceremony'); setError(null); setLeaf(null); setHandshakes(null);
    try {
      setPki(await call({ op: 'createPki', profile }).done);
      setPkiKey((k) => k + 1);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  async function issue() {
    setBusy('issue'); setError(null); setHandshakes(null);
    try {
      const r = await call({ op: 'issueLeaf', variant: 'ok' }).done;
      setLeaf(r.leaf);
      setPkiKey((k) => k + 1);
      return r;
    } catch (e) { setError((e as Error).message); return null; }
    finally { setBusy(null); }
  }

  async function connect() {
    setBusy('connect'); setError(null);
    try { setHandshakes(await call({ op: 'handshakes', crlReachable: true }).done); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }

  const profiles = scope === 'private' ? PRIVATE_PROFILES : WEB_PROFILES;

  return (
    <div className="flex flex-col gap-8">
      {/* ── Scope and profile ── */}
      <div className="flex flex-col gap-4">
        <div role="tablist" aria-label={t('scope.label')} className="grid gap-3 sm:grid-cols-2">
          {(['private', 'web'] as Scope[]).map((s) => (
            <button key={s} role="tab" type="button" aria-selected={scope === s} onClick={() => switchScope(s)}
              className={`rounded-xl border p-4 text-left transition-all ${scope === s
                ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/50'
                : 'bg-[var(--color-bg-base)] border-[var(--color-glass-border)] hover:border-[var(--color-primary)]/30'}`}>
              <span className={`block font-mono text-sm ${scope === s ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-base)]'}`}>{t(`scope.${s}`)}</span>
              <span className="mt-1 block text-xs text-[var(--color-text-muted)] leading-relaxed">{t(`scope.${s}Desc`)}</span>
            </button>
          ))}
        </div>

        <fieldset>
          <legend className="font-mono text-xs text-[var(--color-text-muted)] mb-2">{t('profiles.label')}</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {profiles.map((id) => {
              const pr = PROFILES[id];
              const on = profile === id;
              return (
                <label key={id} className={`cursor-pointer rounded-xl border p-4 flex flex-col gap-2 transition-colors ${on
                  ? 'border-[var(--color-primary)]/60 bg-[var(--color-primary)]/5' : 'border-[var(--color-glass-border)] hover:border-[var(--color-primary)]/30'}`}>
                  <span className="flex items-center gap-2">
                    <input type="radio" name="pki-profile" checked={on} onChange={() => choose(id)} className="accent-[var(--color-primary)]" />
                    <span className="font-mono text-sm text-[var(--color-text-base)]">{t(`profiles.${id}.name`)}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {PROFILE_BADGES[id].map((b) => <Badge key={b.key} tone={b.tone}>{t(`badges.${b.key}`)}</Badge>)}
                  </span>
                  <span className="font-mono text-[0.7rem] text-[var(--color-text-muted)]">
                    {pr.mtc ? t('profiles.mtcRoles') : t('profiles.roles', { root: ALGS[pr.root].name, intermediate: ALGS[pr.intermediate].name, leaf: ALGS[pr.leaf].name })}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)] leading-relaxed">{t(`profiles.${id}.desc`)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      <Architecture profileId={profile} stage={stage} attacker={attacker} handshakes={handshakes ?? undefined} />

      {error && <Note tone="danger">{t('error', { message: error })}</Note>}

      {/* ── 01 Key ceremony ── */}
      <Section id="ceremony" number="// step 01" title={t('step1.title')} intro={t(p.mtc ? 'step1.introMtc' : 'step1.intro')}>
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={ceremony} busy={busy === 'ceremony'}>{t(ready ? 'step1.again' : 'step1.run')}</Button>
          {profile === 'mixed' && <span className="text-xs text-amber-300/90">{t('step1.slowNote')}</span>}
        </div>
        {ready && pki && (
          <div className="flex flex-col gap-3">
            {pki.root && (
              <Collapsible summary={`${t('step1.root')} · ${pki.root.parsed.subject.CN} · ${f.ms(pki.ceremonyMs.root)}`} defaultOpen>
                <CertViewer cert={pki.root} fileName="root.pem" role={t('roles.root')} />
              </Collapsible>
            )}
            {pki.issuing && (
              <Collapsible summary={`${t('step1.issuing')} · ${pki.issuing.parsed.subject.CN} · ${f.ms(pki.ceremonyMs.intermediate)}`}>
                <CertViewer cert={pki.issuing} fileName="issuing-ca.pem" role={t('roles.issuing')} />
              </Collapsible>
            )}
            {pki.logs && (
              <Note>{t('step1.logs', { names: pki.logs.map((l) => l.name).join(', '), alg: pki.logs[0].alg })}</Note>
            )}
            {pki.cosigners && (
              <Note>{t('step1.cosigners', { alg: pki.cosigners[0].alg, bytes: f.n(pki.cosigners[0].publicKeyBytes) })}</Note>
            )}
            <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{t(p.scope === 'private' ? 'step1.hsmPrivate' : 'step1.hsmWeb')}</p>
          </div>
        )}
        <ArticleHint slug="root-ca" articles={articles} />
      </Section>

      {/* ── 02 Issuance ── */}
      <Section id="issuance" number="// step 02" title={t('step2.title')} intro={t('step2.intro')}>
        <div><Button onClick={issue} disabled={!ready} busy={busy === 'issue'}>{t(leaf ? 'step2.again' : 'step2.run')}</Button></div>
        {!ready && <p className="text-xs text-[var(--color-text-muted)]">{t('step2.needPki')}</p>}
        {leaf && ready && (
          <div className="flex flex-col gap-3">
            <ol className="flex flex-col gap-1.5 text-xs">
              <li className="flex gap-2"><span className="font-mono text-[var(--color-primary)]">1</span><span className="text-[var(--color-text-muted)]">{t('step2.keygen', { alg: ALGS[p.leaf].name, ms: f.ms(leaf.timings.keygen) })}</span></li>
              <li className="flex gap-2"><span className="font-mono text-[var(--color-primary)]">2</span><span className="text-[var(--color-text-muted)]">{t('step2.csr', { bytes: f.n(leaf.csrBytes) })} <Verdict ok={leaf.csrValid}>{t('step2.pop')}</Verdict></span></li>
              <li className="flex gap-2"><span className="font-mono text-[var(--color-primary)]">3</span><span className="text-[var(--color-text-muted)]">{t(p.scope === 'private' ? 'step2.raPrivate' : 'step2.raWeb')}</span></li>
              <li className="flex gap-2"><span className="font-mono text-[var(--color-primary)]">4</span><span className="text-[var(--color-text-muted)]">{t(p.mtc ? 'step2.issueMtc' : p.scope === 'web' ? 'step2.issueWeb' : 'step2.issuePrivate', { ms: f.ms(leaf.timings.issue), size: leaf.mtc ? f.n(leaf.mtc.logSize) : '' })}</span></li>
            </ol>
            {leaf.mtc ? (
              <>
                <Collapsible summary={`${t('presented.landmark')} · ${f.bytes(leaf.mtc.landmark.der.length)}`} defaultOpen>
                  <CertViewer cert={leaf.mtc.landmark} fileName="mtc-landmark.pem" role={t('roles.mtcLandmark')} />
                </Collapsible>
                <Collapsible summary={`${t('presented.standalone')} · ${f.bytes(leaf.mtc.standalone.der.length)}`}>
                  <CertViewer cert={leaf.mtc.standalone} fileName="mtc-standalone.pem" role={t('roles.mtcStandalone')} />
                </Collapsible>
              </>
            ) : (
              <Collapsible summary={`${t('step2.leaf')} · ${f.bytes(leaf.leaf.der.length)}`} defaultOpen>
                <CertViewer cert={leaf.leaf} fileName="server.pem" role={t('roles.leaf')} />
              </Collapsible>
            )}
            <Collapsible summary={t('step2.csrPem')}>
              <pre className="max-h-40 overflow-auto font-mono text-[0.65rem] text-[var(--color-text-muted)]">{leaf.csrPem}</pre>
            </Collapsible>
          </div>
        )}
        <ArticleHint slug="pki" articles={articles} />
      </Section>

      {/* ── 03 Handshake ── */}
      <Section id="handshake" number="// step 03" title={t('step3.title')} intro={t(p.mtc ? 'step3.introMtc' : p.scope === 'private' ? 'step3.introPrivate' : 'step3.introWeb')}>
        <div><Button onClick={connect} disabled={!leaf || !ready} busy={busy === 'connect'}>{t('step3.run')}</Button></div>
        {!leaf && <p className="text-xs text-[var(--color-text-muted)]">{t('step3.needLeaf')}</p>}
        {handshakes && ready && (
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 md:grid-cols-3">
              {handshakes.map((h) => (
                <div key={h.client} className="rounded-lg border border-[var(--color-border-dim)] p-3 flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="block font-mono text-xs text-[var(--color-text-base)]">{t(`clients.${h.client}.name`)}</span>
                      <span className="block text-[0.7rem] text-[var(--color-text-muted)] leading-snug">{t(`clients.${h.client}.desc`)}</span>
                    </div>
                    <Verdict ok={h.accepted}>{t(h.accepted ? 'accepted' : 'rejected')}</Verdict>
                  </div>
                  {h.presented !== 'chain' && <Badge tone="violet">{t(`presented.${h.presented}`)}</Badge>}
                  <Collapsible summary={t('step3.checks')} defaultOpen={!h.accepted}>
                    <ValidationList checks={h.validation.checks} />
                    <p className="mt-2 text-xs text-[var(--color-text-muted)]">
                      CertificateVerify: {t(`step3.cv.${h.certVerify}`)}
                    </p>
                  </Collapsible>
                </div>
              ))}
            </div>
            <Note>{t(`step3.summary.${profile}`)}</Note>
            <h3 className="font-mono text-sm text-[var(--color-primary)]">{t('budget.title')}</h3>
            <ByteBudget handshakes={handshakes} />
          </div>
        )}
        <ArticleHint slug="pqc-zertifikate" articles={articles} />
      </Section>

      {/* ── 04 Failure cases ── */}
      <Section id="failures" number="// step 04" title={t('failures.title')} intro={t('failures.intro')}>
        <FailureLab profileId={profile} call={call} ready={ready} />
      </Section>

      {/* ── 05 Attacker ── */}
      <Section id="attacker" number="// step 05" title={t('attack.title')} intro={t('attack.intro')}>
        <AttackLab profileId={profile} call={call} ready={ready} attacker={attacker} onAttacker={setAttacker} />
        <ArticleHint slug="pqc-zertifikatsarten" articles={articles} />
      </Section>

      {/* ── 06 Revocation ── */}
      <Section id="revocation" number="// step 06" title={t('revocation.title')} intro={t('revocation.intro')}>
        <RevocationLab call={call} crlAvailable={ready && !p.mtc} pkiKey={`${profile}-${pkiKey}`} />
        <ArticleHint slug="pki" articles={articles} />
      </Section>

      {/* ── 07 MTC ── */}
      <Section id="mtc" number="// step 07" title={t('mtc.title')} intro={t('mtc.intro')}>
        <MtcLab call={call} />
        <ArticleHint slug="pqc-zertifikate" articles={articles} />
      </Section>

      {/* ── 08 Root clocks ── */}
      <Section id="clocks" number="// step 08" title={t('clocks.title')} intro={t('clocks.intro')}>
        <RootClocks />
        <ArticleHint slug="root-ca" articles={articles} />
      </Section>

      {/* ── 09 Statistics ── */}
      <Section id="statistics" number="// step 09" title={t('bench.title')} intro={t('bench.intro')}>
        <PkiBenchmark call={call} cancel={cancel} />
      </Section>
    </div>
  );
}
