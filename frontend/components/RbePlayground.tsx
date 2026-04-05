'use client';

import { useRef, useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import katex from 'katex';
import type {
  WorkerInMessage, WorkerOutMessage,
  ApiSetupResponse, ApiRegisterResponse, ApiHskResponse,
} from '@/lib/rbe-types';
import { N, Q, B, N_MAX } from '@/lib/rbe/params';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserKeys  { pk: number[]; sk: number[] }
interface HskPair   { hsk0: number[]; hsk1: number[] }
interface EncResult { c0_0: number[]; c0_1: number[]; c1: number[] }
interface DecState  { hsk: HskPair | null; temp: number[] | null; msg: string | null }

type UserId = 'alice' | 'bob' | 'charlie';

interface RbeState {
  sessionId:   string | null;
  a0:          number[] | null;   // public CRS
  a1:          number[] | null;   // complement (for encrypt)
  alice:       UserKeys | null;  aliceReg:   boolean;
  bob:         UserKeys | null;  bobReg:     boolean;
  charlie:     UserKeys | null;  charlieReg: boolean;
  mpkAgg:      number[] | null;
  msgForBob:   string;
  msgForAlice: string;
  ctBob:       EncResult | null;
  ctAlice:     EncResult | null;
  decBob:      DecState;
  decAlice:    DecState;
  // Alice's attack on Bob's ciphertext (step 6)
  aliceAttackTemp: number[] | null;
  aliceAttackMsg:  string | null;
  busy:        boolean;
  busyLabel:   string;
  error:       string | null;
}

const EMPTY_DEC: DecState = { hsk: null, temp: null, msg: null };
const INIT: RbeState = {
  sessionId: null, a0: null, a1: null,
  alice: null, aliceReg: false,
  bob:   null, bobReg:   false,
  charlie: null, charlieReg: false,
  mpkAgg: null,
  msgForBob:   '',
  msgForAlice: '',
  ctBob: null, ctAlice: null,
  decBob: EMPTY_DEC, decAlice: EMPTY_DEC,
  aliceAttackTemp: null, aliceAttackMsg: null,
  busy: false, busyLabel: '', error: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid() { return crypto.randomUUID(); }
function fmtPoly(poly: number[], n = 5): string {
  return `[${poly.slice(0, n).join(', ')}, …]`;
}
function maxCoeff(poly: number[]): number { return Math.max(...poly); }
function polyDiffers(a: number[], b: number[]): boolean {
  return a.slice(0, 5).some((v, i) => v !== b[i]);
}

// ── Design primitives ─────────────────────────────────────────────────────────

function Card({ children, active, done }: {
  children: React.ReactNode; active?: boolean; done?: boolean;
}) {
  return (
    <div className={`rounded-xl border p-6 transition-colors
      ${done  ? 'border-[var(--color-primary)]/20 bg-[var(--color-bg-surface)]'
      : active ? 'border-[var(--color-primary)]/40 bg-[var(--color-bg-surface)]'
               : 'border-[var(--color-glass-border)] bg-[var(--color-bg-surface)]'}`}>
      {children}
    </div>
  );
}

function StepBadge({ n, done }: { n: number | string; done?: boolean }) {
  return (
    <span className={`inline-flex w-6 h-6 rounded-full items-center justify-center
      text-xs font-mono font-bold flex-shrink-0
      ${done
        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
        : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/30'
      }`}>
      {done ? '✓' : n}
    </span>
  );
}

function StepTitle({ n, title, done, doneLbl }: {
  n: number | string; title: string; done?: boolean; doneLbl: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <StepBadge n={n} done={done} />
      <h3 className="font-semibold text-[var(--color-text-base)]">{title}</h3>
      {done && <span className="ml-auto text-xs font-mono text-emerald-400/70">{doneLbl}</span>}
    </div>
  );
}

type CalloutVariant = 'info' | 'warn' | 'success' | 'secret' | 'danger';
function Callout({ variant = 'info', children }: { variant?: CalloutVariant; children: React.ReactNode }) {
  const cls: Record<CalloutVariant, string> = {
    info:    'border-[var(--color-primary)]/25 bg-[var(--color-primary)]/5 text-[var(--color-text-muted)]',
    warn:    'border-amber-500/30 bg-amber-500/5 text-amber-300/90',
    success: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
    secret:  'border-red-500/30 bg-red-500/5 text-red-300',
    danger:  'border-red-500/40 bg-red-500/8 text-red-300',
  };
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${cls[variant]}`}>
      {children}
    </div>
  );
}

function Mono({ children, dim }: { children: React.ReactNode; dim?: boolean }) {
  return (
    <code className={`font-mono text-xs ${dim ? 'text-[var(--color-text-dim)]' : 'text-[var(--color-primary)]'}`}>
      {children}
    </code>
  );
}

// Inline KaTeX math — re-uses the katex CSS already loaded globally in layout.tsx
function M({ children }: { children: string }) {
  const html = katex.renderToString(children, { throwOnError: false, output: 'html' });
  return (
    <span
      className="text-[var(--color-primary)]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-xs text-[var(--color-text-dim)] uppercase tracking-wider">
      {children}
    </span>
  );
}

function PolyBox({ label, poly, equation, secret, garbled }: {
  label: string; poly: number[]; equation?: string; secret?: boolean; garbled?: boolean;
}) {
  const max = maxCoeff(poly);
  const borderCls = garbled
    ? 'border-red-500/30 bg-red-500/5'
    : secret
      ? 'border-red-500/25 bg-red-500/5'
      : 'border-[var(--color-glass-border)] bg-[var(--color-bg-base)]';
  const textCls = garbled
    ? 'text-red-300/70'
    : secret
      ? 'text-red-300/80'
      : 'text-[var(--color-text-muted)]';
  return (
    <div className={`rounded-lg border px-4 py-3 space-y-1.5 ${borderCls}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          {/* Kein uppercase hier — Labels enthalten Variablennamen wie a0, r, hsk0 */}
          <span className="font-mono text-xs text-[var(--color-text-dim)] tracking-wide">{label}</span>
          {equation && (
            <span className="ml-2 font-mono text-xs text-[var(--color-text-dim)]">= {equation}</span>
          )}
        </div>
        <span className="font-mono text-xs text-[var(--color-text-dim)] flex-shrink-0">
          N={N} · max={max}
        </span>
      </div>
      <code className={`font-mono text-xs break-all leading-relaxed block ${textCls}`}>
        {fmtPoly(poly)}
      </code>
    </div>
  );
}

function BtnPrimary({ onClick, disabled, busy, children }: {
  onClick: () => void; disabled?: boolean; busy?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="inline-flex items-center gap-2 rounded-lg
        bg-[var(--color-primary)] px-5 py-2.5
        font-mono text-sm font-semibold text-[var(--color-bg-base)]
        hover:opacity-90 transition-opacity
        disabled:opacity-40 disabled:cursor-not-allowed
        cursor-pointer"
    >
      {busy && (
        <span className="w-3 h-3 rounded-full border-2 border-[var(--color-bg-base)]
          border-t-transparent animate-spin" />
      )}
      {children}
    </button>
  );
}

function BtnOutline({ onClick, disabled, busy, children }: {
  onClick: () => void; disabled?: boolean; busy?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="inline-flex items-center gap-2 rounded-lg
        border border-[var(--color-glass-border)] px-4 py-2.5
        font-mono text-sm text-[var(--color-text-muted)]
        hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]
        transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        cursor-pointer"
    >
      {busy && (
        <span className="w-3 h-3 rounded-full border-2 border-current
          border-t-transparent animate-spin" />
      )}
      {children}
    </button>
  );
}

function BtnDanger({ onClick, disabled, busy, children }: {
  onClick: () => void; disabled?: boolean; busy?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="inline-flex items-center gap-2 rounded-lg
        border border-red-500/40 px-4 py-2.5
        font-mono text-sm text-red-400/80
        hover:border-red-500/70 hover:text-red-300
        transition-colors
        disabled:opacity-40 disabled:cursor-not-allowed
        cursor-pointer"
    >
      {busy && (
        <span className="w-3 h-3 rounded-full border-2 border-current
          border-t-transparent animate-spin" />
      )}
      {children}
    </button>
  );
}

function MsgInput({ value, onChange, disabled, label, maxCharsLabel }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; label: string; maxCharsLabel: string;
}) {
  return (
    <div>
      <label className="block mb-1.5"><Label>{label}</Label></label>
      <input
        type="text"
        maxLength={100}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className="w-full max-w-sm rounded-lg border border-[var(--color-glass-border)]
          bg-[var(--color-bg-base)] px-3 py-2
          font-mono text-sm text-[var(--color-text-base)]
          placeholder:text-[var(--color-text-dim)]
          focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30
          disabled:opacity-40 disabled:cursor-not-allowed"
      />
      <span className="ml-2 font-mono text-xs text-[var(--color-text-dim)]">{maxCharsLabel}</span>
    </div>
  );
}

// ── Main Playground ───────────────────────────────────────────────────────────

export default function RbePlayground() {
  const t      = useTranslations('rbePlayground');
  const locale = useLocale();

  const [s, setS]  = useState<RbeState>(() => ({
    ...INIT,
    msgForBob:   t('defaultMsgForBob'),
    msgForAlice: t('defaultMsgForAlice'),
  }));
  const workerRef  = useRef<Worker | null>(null);
  const cbRef      = useRef(new Map<string, (m: WorkerOutMessage) => void>());

  useEffect(() => {
    const w = new Worker(new URL('../workers/rbe-worker.ts', import.meta.url));
    w.onmessage = (ev: MessageEvent<WorkerOutMessage>) => {
      const cb = cbRef.current.get(ev.data.id);
      if (cb) { cbRef.current.delete(ev.data.id); cb(ev.data); }
    };
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  function callWorker<T extends WorkerOutMessage>(msg: WorkerInMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cbRef.current.delete(msg.id);
        reject(new Error('Worker timeout'));
      }, 30_000);
      cbRef.current.set(msg.id, (res) => {
        clearTimeout(timer);
        if (res.type === 'error') reject(new Error((res as { msg: string }).msg));
        else resolve(res as T);
      });
      workerRef.current!.postMessage(msg);
    });
  }

  const setBusy = (label: string) => setS(p => ({ ...p, busy: true, busyLabel: label, error: null }));
  const setDone = ()               => setS(p => ({ ...p, busy: false, busyLabel: '' }));
  const setErr  = (e: unknown)     => setS(p => ({
    ...p, busy: false, busyLabel: '',
    error: e instanceof Error ? e.message : String(e),
  }));

  // ── Actions ───────────────────────────────────────────────────────────────

  async function doSetup() {
    setBusy(t('busyKcInit'));
    try {
      const res  = await fetch('/api/rbe/session', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as ApiSetupResponse;
      setS(p => ({ ...p, sessionId: data.sessionId, a0: data.a0, a1: data.a1, busy: false }));
    } catch (e) { setErr(e); }
  }

  async function doKeyGen(who: UserId) {
    if (!s.a0) return;
    const name = who === 'alice' ? 'Alice' : who === 'bob' ? 'Bob' : 'Charlie';
    setBusy(t('busyKeyGen', { name }));
    try {
      type KgDone = { id: string; type: 'keygen_done'; pk: number[]; sk: number[]; ms: number };
      const res = await callWorker<KgDone>({ id: uid(), type: 'keygen', a0: s.a0 });
      setS(p => ({ ...p, [who]: { pk: res.pk, sk: res.sk }, busy: false }));
    } catch (e) { setErr(e); }
  }

  async function doRegister(who: UserId) {
    const keys = who === 'alice' ? s.alice : who === 'bob' ? s.bob : s.charlie;
    if (!s.sessionId || !keys) return;
    const name = who === 'alice' ? 'Alice' : who === 'bob' ? 'Bob' : 'Charlie';
    setBusy(t('busyRegister', { name }));
    try {
      const res = await fetch('/api/rbe/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: s.sessionId, userId: who, pk: keys.pk }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json() as ApiRegisterResponse;
      setS(p => ({ ...p, [`${who}Reg`]: true, mpkAgg: data.mpkAgg, busy: false }));
    } catch (e) { setErr(e); }
  }

  async function doEncrypt(target: 'alice' | 'bob') {
    if (!s.a0 || !s.a1 || !s.mpkAgg) return;
    const name  = target === 'bob' ? 'Bob' : 'Alice';
    const msg   = target === 'bob' ? s.msgForBob : s.msgForAlice;
    setBusy(t('busyEncrypt', { name }));
    try {
      type EncDone = { id: string; type: 'encrypt_done'; c0_0: number[]; c0_1: number[]; c1: number[]; ms: number };
      const res = await callWorker<EncDone>({
        id: uid(), type: 'encrypt',
        a0: s.a0, a1: s.a1, mpkAgg: s.mpkAgg, msg, targetId: target,
      });
      const ct: EncResult = { c0_0: res.c0_0, c0_1: res.c0_1, c1: res.c1 };
      setS(p => ({ ...p, [target === 'bob' ? 'ctBob' : 'ctAlice']: ct, busy: false }));
    } catch (e) { setErr(e); }
  }

  async function doFetchHsk(target: 'alice' | 'bob') {
    if (!s.sessionId) return;
    setBusy(t('busyFetchHsk', { target }));
    try {
      const qs  = new URLSearchParams({ sessionId: s.sessionId, targetId: target });
      const res = await fetch(`/api/rbe/hsk?${qs}`);
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json() as ApiHskResponse;
      const hsk: HskPair = { hsk0: data.hsk0, hsk1: data.hsk1 };
      setS(p => ({
        ...p,
        [target === 'bob' ? 'decBob' : 'decAlice']: {
          ...(target === 'bob' ? p.decBob : p.decAlice),
          hsk,
        },
        busy: false,
      }));
    } catch (e) { setErr(e); }
  }

  async function doDecStep1(target: 'alice' | 'bob') {
    const ct  = target === 'bob' ? s.ctBob   : s.ctAlice;
    const dec = target === 'bob' ? s.decBob  : s.decAlice;
    if (!ct || !dec.hsk) return;
    const name = target === 'bob' ? 'Bob' : 'Alice';
    setBusy(t('busyDecStep1', { name }));
    try {
      type S1Done = { id: string; type: 'dec_step1_done'; temp: number[]; ms: number };
      const res = await callWorker<S1Done>({
        id: uid(), type: 'dec_step1',
        c0_0: ct.c0_0, c0_1: ct.c0_1, hsk0: dec.hsk.hsk0, hsk1: dec.hsk.hsk1, c1: ct.c1,
      });
      setS(p => ({
        ...p,
        [target === 'bob' ? 'decBob' : 'decAlice']: {
          ...(target === 'bob' ? p.decBob : p.decAlice),
          temp: res.temp,
        },
        busy: false,
      }));
    } catch (e) { setErr(e); }
  }

  async function doDecStep2(target: 'alice' | 'bob') {
    const ct   = target === 'bob' ? s.ctBob  : s.ctAlice;
    const dec  = target === 'bob' ? s.decBob : s.decAlice;
    const keys = target === 'bob' ? s.bob    : s.alice;
    if (!ct || !dec.temp || !keys) return;
    const name = target === 'bob' ? 'Bob' : 'Alice';
    setBusy(t('busyDecStep2', { name }));
    try {
      type S2Done = { id: string; type: 'dec_step2_done'; result: number[]; msg: string; ms: number };
      const res = await callWorker<S2Done>({
        id: uid(), type: 'dec_step2', c0_0: ct.c0_0, temp: dec.temp, sk: keys.sk,
      });
      setS(p => ({
        ...p,
        [target === 'bob' ? 'decBob' : 'decAlice']: {
          ...(target === 'bob' ? p.decBob : p.decAlice),
          msg: res.msg,
        },
        busy: false,
      }));
    } catch (e) { setErr(e); }
  }

  // Alice's attack: use hsk_alice (bound to Alice) on c_bob (bound to Bob)
  async function doAliceAttackStep1() {
    if (!s.ctBob || !s.decAlice.hsk) return;
    setBusy(t('busyAttack1'));
    try {
      type S1Done = { id: string; type: 'dec_step1_done'; temp: number[]; ms: number };
      const res = await callWorker<S1Done>({
        id: uid(), type: 'dec_step1',
        c0_0: s.ctBob.c0_0,
        c0_1: s.ctBob.c0_1,         // ← bound to H("bob")
        hsk0: s.decAlice.hsk.hsk0,
        hsk1: s.decAlice.hsk.hsk1,  // ← bound to H("alice")
        c1:   s.ctBob.c1,
      });
      setS(p => ({ ...p, aliceAttackTemp: res.temp, busy: false }));
    } catch (e) { setErr(e); }
  }

  async function doAliceAttackStep2() {
    if (!s.ctBob || !s.aliceAttackTemp || !s.alice) return;
    setBusy(t('busyAttack2'));
    try {
      type S2Done = { id: string; type: 'dec_step2_done'; result: number[]; msg: string; ms: number };
      const res = await callWorker<S2Done>({
        id: uid(), type: 'dec_step2',
        c0_0: s.ctBob.c0_0,
        temp: s.aliceAttackTemp,
        sk:   s.alice.sk,
      });
      setS(p => ({ ...p, aliceAttackMsg: res.msg, busy: false }));
    } catch (e) { setErr(e); }
  }

  // ── Progress ──────────────────────────────────────────────────────────────

  const hasSetup    = !!s.a0;
  const allReg      = s.aliceReg && s.bobReg && s.charlieReg;
  const bothCts     = !!s.ctBob && !!s.ctAlice;
  const bothDecoded = s.decBob.msg !== null && s.decAlice.msg !== null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">

      {/* Global error */}
      {s.error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3
          font-mono text-sm text-red-300">
          {t('errorLabel')} {s.error}
        </div>
      )}

      {/* Loading indicator */}
      {s.busy && (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-primary)]/20
          bg-[var(--color-primary)]/5 px-4 py-2.5">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--color-primary)]
            border-t-transparent animate-spin flex-shrink-0" />
          <span className="font-mono text-sm text-[var(--color-primary)]">{s.busyLabel}</span>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          Context intro
      ════════════════════════════════════════════════════════════════════ */}
      <Card>
        <p className="font-mono text-xs text-[var(--color-primary)] mb-2">{t('introComment')}</p>
        <div className="text-sm text-[var(--color-text-muted)] leading-relaxed space-y-3">
          <p>
            {locale === 'de' ? (
              <>
                In klassischer PKI muss Alice ein <strong className="text-[var(--color-text-base)]">Zertifikat</strong> von
                einer Zertifizierungsstelle (CA) signieren lassen. Bob muss dieses Zertifikat prüfen,
                bevor er Alice schreiben kann — die CA ist ein zentraler <strong className="text-[var(--color-text-base)]">Vertrauensanker</strong> mit weitreichenden Befugnissen.
              </>
            ) : (
              <>
                In classical PKI, Alice must have a <strong className="text-[var(--color-text-base)]">certificate</strong> signed
                by a Certificate Authority (CA). Bob must verify that certificate before he can write to Alice —
                the CA is a central <strong className="text-[var(--color-text-base)]">trust anchor</strong> with far-reaching powers.
              </>
            )}
          </p>
          <p>
            {locale === 'de' ? (
              <>
                <strong className="text-[var(--color-text-base)]">Registration-Based Encryption (RBE)</strong> geht
                einen anderen Weg: Ein <strong className="text-[var(--color-text-base)]">Key Curator (KC)</strong> übernimmt
                die Registrierung, kennt aber <em>keinen einzigen Secret Key</em>. Jeder Nutzer generiert sein Schlüsselpaar
                lokal auf seinem Gerät und übergibt nur den Public Key an den KC. Dieser addiert alle Public Keys zu einem
                einzigen aggregierten Wert <Mono>mpkAgg</Mono> auf — der Sender braucht nur diesen einen Wert
                und den <strong className="text-[var(--color-text-base)]">Namen des Empfängers</strong> (seine Identität).
              </>
            ) : (
              <>
                <strong className="text-[var(--color-text-base)]">Registration-Based Encryption (RBE)</strong> takes
                a different approach: a <strong className="text-[var(--color-text-base)]">Key Curator (KC)</strong> handles
                registration but <em>knows not a single secret key</em>. Each user generates their key pair
                locally on their device and submits only the public key to the KC. The KC adds all public keys into
                a single aggregated value <Mono>mpkAgg</Mono> — the sender needs only this one value
                and the <strong className="text-[var(--color-text-base)]">recipient&apos;s name</strong> (their identity).
              </>
            )}
          </p>
          <p>
            {locale === 'de' ? (
              <>
                Eine <strong className="text-[var(--color-text-base)]">Identität</strong> ist dabei einfach ein
                eindeutiger String — hier die Namen{' '}
                <Mono>&quot;alice&quot;</Mono>, <Mono>&quot;bob&quot;</Mono>, <Mono>&quot;charlie&quot;</Mono>. Ein deterministischer
                Hash-Algorithmus wandelt diesen String in ein Polynom um, das mathematisch in den Chiffretext
                eingebacken wird. Dadurch kann Charlie nachweisbar <em>nicht</em> Bobs Nachricht lesen,
                selbst wenn er seinen eigenen legitimen Schlüssel kennt — das wird in Schritt 6 live demonstriert.
              </>
            ) : (
              <>
                An <strong className="text-[var(--color-text-base)]">identity</strong> is simply a
                unique string — here the names{' '}
                <Mono>&quot;alice&quot;</Mono>, <Mono>&quot;bob&quot;</Mono>, <Mono>&quot;charlie&quot;</Mono>. A deterministic
                hash algorithm turns this string into a polynomial that is mathematically baked into the ciphertext.
                This means Charlie demonstrably <em>cannot</em> read Bob&apos;s message,
                even though he is a legitimate user with his own valid key — this is demonstrated live in step 6.
              </>
            )}
          </p>
        </div>
      </Card>

      {/* ════════════════════════════════════════════════════════════════════
          STEP 0 — KC Setup
      ════════════════════════════════════════════════════════════════════ */}
      <Card active={!hasSetup} done={hasSetup}>
        <StepTitle n={0} title={t('step0Title')} done={hasSetup} doneLbl={t('stepDone')} />

        <div className="text-sm text-[var(--color-text-muted)] mb-4 leading-relaxed space-y-2">
          {/* Paragraph 1 — polynomial ring definition (math-heavy) */}
          <p>
            {locale === 'de' ? (
              <>
                Die gesamte Arithmetik findet im <strong className="text-[var(--color-text-base)]">Polynomring{' '}
                <M>{`R_q = \\mathbb{Z}_q[X]/(X^N+1)`}</M></strong> statt: ganzzahlige Polynome vom Grad{' '}
                {'<'} <M>{`N = ${N}`}</M>, deren Koeffizienten modulo <M>{`q = ${Q}`}</M> gerechnet werden.
                Multiplikation wird modulo <M>{`X^{${N}}+1`}</M> reduziert — das macht den Ring für gitterbasierte Kryptografie geeignet.
              </>
            ) : (
              <>
                All arithmetic takes place in the <strong className="text-[var(--color-text-base)]">polynomial ring{' '}
                <M>{`R_q = \\mathbb{Z}_q[X]/(X^N+1)`}</M></strong>: integer polynomials of degree{' '}
                {'<'} <M>{`N = ${N}`}</M>, whose coefficients are computed modulo <M>{`q = ${Q}`}</M>.
                Multiplication is reduced modulo <M>{`X^{${N}}+1`}</M> — making the ring well-suited for lattice-based cryptography.
              </>
            )}
          </p>
          {/* Paragraph 2 — trapdoor construction (math-heavy) */}
          <p>
            {locale === 'de' ? (
              <>
                Der KC wählt zunächst ein <strong className="text-[var(--color-text-base)]">uniformes
                Polynom</strong> <M>{'a_0'}</M> — alle {N} Koeffizienten gleichverteilt in{' '}
                <M>{`[0, ${Q})`}</M>. Das ist der öffentliche Referenzpunkt für alle Nutzer (Common Reference String).
                Dann zieht er ein <strong className="text-[var(--color-text-base)]">kurzes Polynom</strong>{' '}
                <M>r</M> mit Koeffizienten nur aus <M>{`\\{-${B}, \\ldots, +${B}\\}`}</M> und berechnet{' '}
                <M>{'a_1 = 1 - a_0 \\cdot r'}</M>. Dadurch gilt die{' '}
                <strong className="text-[var(--color-text-base)]">Trapdoor-Relation</strong>{' '}
                <M>{'a_0 \\cdot r + a_1 = 1'}</M> (das Einheitspolynom).{' '}
                <M>{'a_0'}</M> und <M>{'a_1'}</M> sind vollständig öffentlich —
                nur <M>r</M> bleibt als Geheimnis auf dem Server.
              </>
            ) : (
              <>
                The KC first chooses a <strong className="text-[var(--color-text-base)]">uniform
                polynomial</strong> <M>{'a_0'}</M> — all {N} coefficients uniformly distributed in{' '}
                <M>{`[0, ${Q})`}</M>. This is the public reference point for all users (Common Reference String).
                It then draws a <strong className="text-[var(--color-text-base)]">short polynomial</strong>{' '}
                <M>r</M> with coefficients only from <M>{`\\{-${B}, \\ldots, +${B}\\}`}</M> and computes{' '}
                <M>{'a_1 = 1 - a_0 \\cdot r'}</M>. This yields the{' '}
                <strong className="text-[var(--color-text-base)]">trapdoor relation</strong>{' '}
                <M>{'a_0 \\cdot r + a_1 = 1'}</M> (the unit polynomial).{' '}
                <M>{'a_0'}</M> and <M>{'a_1'}</M> are fully public —
                only <M>r</M> remains secret on the server.
              </>
            )}
          </p>
        </div>

        <BtnPrimary onClick={doSetup} disabled={hasSetup} busy={s.busy}>
          {t('step0BtnInit')}
        </BtnPrimary>

        {s.a0 && s.a1 && (
          <div className="mt-5 space-y-3">
            <PolyBox label={t('step0LabelA0')} poly={s.a0} equation="uniform ∈ R_q" />
            <PolyBox label={t('step0LabelA1')} poly={s.a1} equation="1 − a0·r" />
            <Callout variant="info">
              <strong>{t('step0CalloutQ')}</strong>{' '}
              {locale === 'de' ? (
                <>
                  Wer <M>r</M> kennt, kann aus <M>{'a_0'}</M> und <M>{'a_1'}</M>
                  für jeden Empfänger einen maßgeschneiderten Hilfschlüssel berechnen.
                  Wer <M>r</M> nicht kennt, müsste dafür das Ring-LWE-Problem lösen —
                  das gilt als quantencomputersicher schwer.{' '}
                  <M>{`N_{\\max} = ${N_MAX}`}</M>: {t('step0CalloutNmaxPre')} {N_MAX} {t('step0CalloutNmaxPost')}
                </>
              ) : (
                <>
                  Anyone who knows <M>r</M> can compute a tailored helper key from <M>{'a_0'}</M> and <M>{'a_1'}</M>
                  for any recipient.
                  Anyone who does not know <M>r</M> would have to solve the Ring-LWE problem —
                  which is considered hard even for quantum computers.{' '}
                  <M>{`N_{\\max} = ${N_MAX}`}</M>: {t('step0CalloutNmaxPre')} {N_MAX} {t('step0CalloutNmaxPost')}
                </>
              )}
            </Callout>
          </div>
        )}
      </Card>

      {/* ════════════════════════════════════════════════════════════════════
          STEPS 1–3 — Registration
      ════════════════════════════════════════════════════════════════════ */}
      {hasSetup && (
        <Card active={!allReg} done={allReg}>
          <StepTitle n="1–3" title={t('step13Title')} done={allReg} doneLbl={t('stepDone')} />

          <div className="text-sm text-[var(--color-text-muted)] mb-5 leading-relaxed space-y-2">
            {/* Paragraph 1 — Ring-LWE key generation (math-heavy) */}
            <p>
              {locale === 'de' ? (
                <>
                  Jeder Nutzer generiert sein Schlüsselpaar <strong>lokal auf seinem Gerät</strong>{' '}
                  (in dieser Demo: im Browser — es könnte genauso gut eine App, ein Desktop-Programm
                  oder ein Hardware-Token sein), basierend auf dem Sicherheitsprinzip{' '}
                  <strong className="text-[var(--color-text-base)]">Ring-LWE</strong> (Ring Learning With Errors):
                  Man zieht einen geheimen Schlüssel <M>sk</M> und einen Fehlerterm <M>e</M> —
                  beide mit Koeffizienten nur aus <M>{`\\{-${B}, \\ldots, +${B}\\}`}</M> (also sehr kleine Werte).
                  Der Public Key ergibt sich dann als <M>{'pk = a_0 \\cdot sk + e'}</M>.
                  Die Sicherheit beruht darauf, dass es ohne Kenntnis von <M>sk</M> rechnerisch
                  nicht möglich ist, den kleinen Fehler <M>e</M> vom Ergebnis zu trennen —
                  selbst mit einem Quantencomputer (unter der Ring-LWE-Annahme).
                </>
              ) : (
                <>
                  Each user generates their key pair <strong>locally on their device</strong>{' '}
                  (in this demo: in the browser — it could just as well be an app, desktop program,
                  or hardware token), based on the security principle{' '}
                  <strong className="text-[var(--color-text-base)]">Ring-LWE</strong> (Ring Learning With Errors):
                  draw a secret key <M>sk</M> and an error term <M>e</M> —
                  both with coefficients only from <M>{`\\{-${B}, \\ldots, +${B}\\}`}</M> (very small values).
                  The public key is then <M>{'pk = a_0 \\cdot sk + e'}</M>.
                  The security rests on the fact that without knowledge of <M>sk</M> it is computationally
                  infeasible to separate the small error <M>e</M> from the result —
                  even with a quantum computer (under the Ring-LWE assumption).
                </>
              )}
            </p>
            {/* Paragraph 2 — mpkAgg aggregation */}
            <p>
              {locale === 'de' ? (
                <>
                  Nur <M>pk</M> wird an den KC geschickt. Dieser addiert ihn zum aggregierten
                  Public Key <M>{'\\mathit{mpkAgg} = pk_{\\text{alice}} + pk_{\\text{bob}} + pk_{\\text{charlie}}'}</M>.
                  Der Secret Key verlässt niemals das Gerät des Nutzers.
                </>
              ) : (
                <>
                  Only <M>pk</M> is sent to the KC. It is added to the aggregated
                  public key <M>{'\\mathit{mpkAgg} = pk_{\\text{alice}} + pk_{\\text{bob}} + pk_{\\text{charlie}}'}</M>.
                  The secret key never leaves the user&apos;s device.
                </>
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UserColumn name="Alice" who="alice" keys={s.alice} registered={s.aliceReg}
              busy={s.busy} onKeyGen={() => doKeyGen('alice')} onRegister={() => doRegister('alice')}
              t={t} />
            <UserColumn name="Bob"   who="bob"   keys={s.bob}   registered={s.bobReg}
              busy={s.busy} onKeyGen={() => doKeyGen('bob')}   onRegister={() => doRegister('bob')}
              t={t} />
            <UserColumn name="Charlie" who="charlie" keys={s.charlie} registered={s.charlieReg}
              busy={s.busy} onKeyGen={() => doKeyGen('charlie')} onRegister={() => doRegister('charlie')}
              t={t} />
          </div>

          {s.mpkAgg && (
            <div className="mt-5 space-y-3">
              <PolyBox
                label={`mpkAgg — ${t('step13MpkLabelPre')} (${t('step13Users', {
                  count: [s.aliceReg, s.bobReg, s.charlieReg].filter(Boolean).length,
                  max: N_MAX,
                })})`}
                poly={s.mpkAgg}
                equation={[
                  s.aliceReg   ? 'pk_alice'   : null,
                  s.bobReg     ? 'pk_bob'     : null,
                  s.charlieReg ? 'pk_charlie' : null,
                ].filter(Boolean).join(' + ') || ''}
              />
              {allReg && (
                <Callout variant="success">
                  <strong>{t('step13Nmax', { nMax: N_MAX })}</strong>{' '}
                  {t('step13CalloutSuffix')} <Mono>mpkAgg</Mono>.
                </Callout>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          STEP 4 — Encryption
      ════════════════════════════════════════════════════════════════════ */}
      {allReg && (
        <Card active={!bothCts} done={bothCts}>
          <StepTitle n={4} title={t('step4Title')} done={bothCts} doneLbl={t('stepDone')} />

          <div className="text-sm text-[var(--color-text-muted)] mb-4 leading-relaxed space-y-2">
            <p>
              {locale === 'de' ? (
                <>
                  Charlie braucht zum Verschlüsseln nur öffentlich bekannte Daten:{' '}
                  <Mono>a0</Mono>, <Mono>a1</Mono>, <Mono>mpkAgg</Mono> — und den{' '}
                  <strong className="text-[var(--color-text-base)]">Namen des Empfängers</strong>{' '}
                  als Identität (hier der String <Mono>&quot;bob&quot;</Mono> bzw. <Mono>&quot;alice&quot;</Mono>).
                  Keine CA-Abfrage, kein Zertifikat, kein vorab ausgetauschter Schlüssel.
                </>
              ) : (
                <>
                  To encrypt, Charlie only needs publicly known data:{' '}
                  <Mono>a0</Mono>, <Mono>a1</Mono>, <Mono>mpkAgg</Mono> — and the{' '}
                  <strong className="text-[var(--color-text-base)]">recipient&apos;s name</strong>{' '}
                  as identity (here the string <Mono>&quot;bob&quot;</Mono> or <Mono>&quot;alice&quot;</Mono>).
                  No CA query, no certificate, no pre-shared key.
                </>
              )}
            </p>
            <p>
              {locale === 'de' ? (
                <>
                  Der entscheidende Schritt ist die{' '}
                  <strong className="text-[var(--color-text-base)]">Identitätsbindung</strong>:
                  Eine Hash-Funktion <Mono>H</Mono> wandelt den Empfänger-String deterministisch in ein
                  Polynom in R_q um. Dieses Polynom wird in die zweite Chiffretext-Komponente eingebacken,
                  sodass nur der KC mit Kenntnis von <Mono>r</Mono> den passenden Hilfschlüssel für genau
                  diesen Empfänger berechnen kann.
                </>
              ) : (
                <>
                  The key step is{' '}
                  <strong className="text-[var(--color-text-base)]">identity binding</strong>:
                  a hash function <Mono>H</Mono> deterministically maps the recipient string to a
                  polynomial in R_q. This polynomial is baked into the second ciphertext component,
                  so only the KC — knowing <Mono>r</Mono> — can compute the matching helper key for
                  exactly this recipient.
                </>
              )}
            </p>
          </div>
          <div className="mb-4 rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-base)]
            px-4 py-3 font-mono text-xs text-[var(--color-text-muted)] space-y-1.5 leading-loose">
            <div className="text-[var(--color-text-dim)]">{t('step4CommentR')}</div>
            <div><Mono>r</Mono><span className="text-[var(--color-text-dim)] ml-2">— {locale === 'de' ? `kurzes Polynom mit Koeffizienten ∈ {-${B}, …, +${B}}` : `short polynomial with coefficients ∈ {-${B}, …, +${B}}`}</span></div>
            <div className="pt-1 text-[var(--color-text-dim)]">{t('step4CommentCt')}</div>
            <div><Mono>c0_0 = r · a0</Mono></div>
            <div><Mono>c0_1 = r · (a1 + H(id_target))</Mono>
              <span className="text-amber-400/80 ml-2">{t('step4IdentityBinding')}</span>
            </div>
            <div><Mono>c1 &nbsp;&nbsp;= r · mpkAgg + encode(msg)</Mono><span className="text-[var(--color-text-dim)] ml-2">{t('step4EncMsg')}</span></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Message for Bob */}
            <div className="space-y-3">
              <Label>{t('msgForBobLabel')}</Label>
              <MsgInput label={t('plaintextLabel')} value={s.msgForBob}
                onChange={v => setS(p => ({ ...p, msgForBob: v }))} disabled={!!s.ctBob}
                maxCharsLabel={t('maxChars')} />
              <BtnPrimary onClick={() => doEncrypt('bob')} disabled={!!s.ctBob} busy={s.busy}>
                {t('btnEncryptBob')}
              </BtnPrimary>
              {s.ctBob && (
                <div className="space-y-2">
                  <PolyBox label="c0_0 = r · a0" poly={s.ctBob.c0_0} />
                  <PolyBox label='c0_1 = r · (a1 + H("bob"))' poly={s.ctBob.c0_1}
                    equation={t('c0_1BobEq')} />
                  <PolyBox label="c1 = r · mpkAgg + encode(msg)" poly={s.ctBob.c1} />
                </div>
              )}
            </div>

            {/* Message for Alice */}
            <div className="space-y-3">
              <Label>{t('msgForAliceLabel')}</Label>
              <MsgInput label={t('plaintextLabel')} value={s.msgForAlice}
                onChange={v => setS(p => ({ ...p, msgForAlice: v }))} disabled={!!s.ctAlice}
                maxCharsLabel={t('maxChars')} />
              <BtnPrimary onClick={() => doEncrypt('alice')} disabled={!!s.ctAlice} busy={s.busy}>
                {t('btnEncryptAlice')}
              </BtnPrimary>
              {s.ctAlice && (
                <div className="space-y-2">
                  <PolyBox label="c0_0 = r · a0" poly={s.ctAlice.c0_0} />
                  <PolyBox label='c0_1 = r · (a1 + H("alice"))' poly={s.ctAlice.c0_1}
                    equation={t('c0_1AliceEq')} />
                  <PolyBox label="c1 = r · mpkAgg + encode(msg)" poly={s.ctAlice.c1} />
                </div>
              )}
            </div>
          </div>

          {bothCts && s.ctBob && s.ctAlice && (
            <div className="mt-5">
              <Callout variant="warn">
                <strong>{t('step4ObsTitle')}</strong>{' '}
                {locale === 'de' ? (
                  <>
                    Beide c0_1-Komponenten sind durch unterschiedliche
                    Identitäts-Hashes <Mono>H(&quot;bob&quot;) ≠ H(&quot;alice&quot;)</Mono> verschieden gebunden —{' '}
                    {polyDiffers(s.ctBob.c0_1, s.ctAlice.c0_1)
                      ? t('step4ObsDiffResult')
                      : t('step4ObsCollideResult')}.{' '}
                    Diese Bindung ist es, die verhindert, dass Charlie Bobs Nachricht lesen kann.
                  </>
                ) : (
                  <>
                    Both c0_1 components are bound differently via distinct
                    identity hashes <Mono>H(&quot;bob&quot;) ≠ H(&quot;alice&quot;)</Mono> —{' '}
                    {polyDiffers(s.ctBob.c0_1, s.ctAlice.c0_1)
                      ? t('step4ObsDiffResult')
                      : t('step4ObsCollideResult')}.{' '}
                    This binding is exactly what prevents Charlie from reading Bob&apos;s message.
                  </>
                )}
              </Callout>
            </div>
          )}
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          STEP 5 — Decryption
      ════════════════════════════════════════════════════════════════════ */}
      {bothCts && (
        <Card active={!bothDecoded} done={bothDecoded}>
          <StepTitle n={5} title={t('step5Title')} done={bothDecoded} doneLbl={t('stepDone')} />

          <div className="text-sm text-[var(--color-text-muted)] mb-4 leading-relaxed space-y-2">
            <p>
              {locale === 'de' ? (
                <>
                  Der KC berechnet für jeden Empfänger mit seinem geheimen Trapdoor <Mono>r</Mono>
                  einen <strong className="text-[var(--color-text-base)]">Helper Decryption Key (hsk)</strong> —
                  ein Schlüsselpaar aus zwei Polynomen <Mono>(hsk0, hsk1)</Mono>, das identitätsspezifisch ist:
                </>
              ) : (
                <>
                  The KC computes a <strong className="text-[var(--color-text-base)]">Helper Decryption Key (hsk)</strong> for
                  each recipient using its secret trapdoor <Mono>r</Mono> —
                  a key pair of two polynomials <Mono>(hsk0, hsk1)</Mono> that is identity-specific:
                </>
              )}
            </p>
            <div className="rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-base)]
              px-4 py-3 font-mono text-xs text-[var(--color-text-muted)] space-y-1.5 leading-loose">
              <div className="text-[var(--color-text-dim)]">{t('step5CommentGt')}</div>
              <div><Mono>g_t = 1 + H(id_t)</Mono></div>
              <div className="text-[var(--color-text-dim)] pt-1">{t('step5CommentGtInv')}</div>
              <div><Mono>hsk1 = g_t⁻¹ · (mpkAgg − pk_t)</Mono></div>
              <div><Mono>hsk0 = r · hsk1</Mono></div>
              <div className="text-[var(--color-text-dim)] pt-1">{t('step5CommentResult')}</div>
              <div><Mono>a0·hsk0 + (a1 + H(id_t))·hsk1 = mpkAgg − pk_t</Mono></div>
            </div>
            <p>
              {locale === 'de' ? (
                <>
                  <Mono>hsk</Mono> darf öffentlich übertragen werden — er ist für sich allein nutzlos,
                  weil er nach Schritt 1 nur eine Ring-LWE-Verschlüsselung unter <Mono>pk_t</Mono> liefert.
                  Erst der geheime Schlüssel <Mono>sk</Mono> (der niemals den Browser verlässt) entschlüsselt
                  in Schritt 2 vollständig. Daher der Begriff{' '}
                  <strong className="text-[var(--color-text-base)]">Zwei-Faktor-Entschlüsselung</strong>:
                  KC-Seite (hsk) + Nutzer-Seite (sk).
                </>
              ) : (
                <>
                  <Mono>hsk</Mono> may be transmitted publicly — it is useless on its own,
                  because after step 1 it only yields a Ring-LWE encryption under <Mono>pk_t</Mono>.
                  Only the secret key <Mono>sk</Mono> (which never leaves the browser) completes
                  decryption in step 2. Hence the term{' '}
                  <strong className="text-[var(--color-text-base)]">two-factor decryption</strong>:
                  KC-side (hsk) + user-side (sk).
                </>
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DecryptColumn name="Bob"   target="bob"   ct={s.ctBob!}   dec={s.decBob}
              busy={s.busy} onFetchHsk={() => doFetchHsk('bob')}
              onStep1={() => doDecStep1('bob')} onStep2={() => doDecStep2('bob')}
              locale={locale} t={t} />
            <DecryptColumn name="Alice" target="alice" ct={s.ctAlice!} dec={s.decAlice}
              busy={s.busy} onFetchHsk={() => doFetchHsk('alice')}
              onStep1={() => doDecStep1('alice')} onStep2={() => doDecStep2('alice')}
              locale={locale} t={t} />
          </div>

          {bothDecoded && (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ResultBox name="Bob"   msg={s.decBob.msg!}   t={t} />
                <ResultBox name="Alice" msg={s.decAlice.msg!} t={t} />
              </div>
              <Callout variant="success">
                <strong>{t('step5CalloutTitle')}</strong>{' '}
                {locale === 'de' ? (
                  <>
                    Weder der KC (kennt kein <Mono>sk</Mono>)
                    noch ein Angreifer mit nur <Mono>hsk</Mono> kann die Nachricht lesen.
                    Erst die Kombination aus dem server-seitigen <Mono>hsk</Mono> und dem
                    browser-lokalen <Mono>sk</Mono> kollabiert das Rauschen auf <Mono>r·e ≈ 0</Mono>.
                    Kein Master-Geheimnis. Kein Key Escrow.
                  </>
                ) : (
                  <>
                    Neither the KC (it knows no <Mono>sk</Mono>)
                    nor an attacker with only <Mono>hsk</Mono> can read the message.
                    Only the combination of the server-side <Mono>hsk</Mono> and the
                    browser-local <Mono>sk</Mono> collapses the noise to <Mono>r·e ≈ 0</Mono>.
                    No master secret. No key escrow.
                  </>
                )}
              </Callout>
            </div>
          )}
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          STEP 6 — Security proof: Alice fails
      ════════════════════════════════════════════════════════════════════ */}
      {bothDecoded && s.alice && s.ctBob && s.decAlice.hsk && (
        <Card active={s.aliceAttackMsg === null}>
          <StepTitle n={6}
            title={t('step6Title')}
            done={s.aliceAttackMsg !== null}
            doneLbl={t('stepDone')} />

          <div className="text-sm text-[var(--color-text-muted)] mb-4 leading-relaxed space-y-2">
            <p>
              {locale === 'de' ? (
                <>
                  Alice hat in Schritt 5 ihre eigene Nachricht erfolgreich entschlüsselt —
                  sie ist eine <em>legitime</em> Nutzerin mit einem gültig vom KC ausgestellten{' '}
                  <Mono>hsk_alice</Mono>. Jetzt versucht sie, denselben Schlüssel zu benutzen,
                  um auch Bobs Nachricht zu lesen.
                </>
              ) : (
                <>
                  In step 5, Alice successfully decrypted her own message —
                  she is a <em>legitimate</em> user with a valid <Mono>hsk_alice</Mono> issued by the KC.
                  Now she tries to use that same key to read Bob&apos;s message too.
                </>
              )}
            </p>
            <p>
              {locale === 'de' ? (
                <>
                  Das schlägt fehl, weil <Mono>hsk_alice</Mono> mit dem Identitätspolynom{' '}
                  <Mono>H(&quot;alice&quot;)</Mono> berechnet wurde und die Gleichung{' '}
                  <Mono>a0·hsk0 + (a1 + H(&quot;alice&quot;))·hsk1 = mpkAgg − pk_alice</Mono> erfüllt.{' '}
                  Bobs Chiffretext enthält aber <Mono>H(&quot;bob&quot;)</Mono> in <Mono>c0_1</Mono>.{' '}
                  Da <Mono>H(&quot;alice&quot;) ≠ H(&quot;bob&quot;)</Mono>, geht die Gleichung nicht auf:
                </>
              ) : (
                <>
                  This fails because <Mono>hsk_alice</Mono> was computed using the identity polynomial{' '}
                  <Mono>H(&quot;alice&quot;)</Mono> and satisfies{' '}
                  <Mono>a0·hsk0 + (a1 + H(&quot;alice&quot;))·hsk1 = mpkAgg − pk_alice</Mono>.{' '}
                  But Bob&apos;s ciphertext contains <Mono>H(&quot;bob&quot;)</Mono> in <Mono>c0_1</Mono>.{' '}
                  Since <Mono>H(&quot;alice&quot;) ≠ H(&quot;bob&quot;)</Mono>, the equation does not hold:
                </>
              )}
            </p>
          </div>

          <div className="rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-base)]
            px-4 py-3 mb-5 font-mono text-xs text-[var(--color-text-muted)] space-y-1.5 leading-loose">
            <div className="text-[var(--color-text-dim)]">
              {locale === 'de'
                ? '// Alice versucht Schritt 1 mit hsk_alice auf c_bob:'
                : '// Alice attempts step 1 with hsk_alice on c_bob:'}
            </div>
            <div><Mono>c0_0·hsk0_alice + c0_1·hsk1_alice</Mono></div>
            <div className="pl-4 text-[var(--color-text-dim)]">
              {locale === 'de'
                ? '// c0_1 enthält H("bob"), hsk1_alice enthält H("alice"):'
                : '// c0_1 contains H("bob"), hsk1_alice contains H("alice"):'}
            </div>
            <div className="pl-4"><Mono dim>= r_e · hsk1_alice · (a0·r + a1 + H(&quot;bob&quot;))</Mono></div>
            <div className="pl-4"><Mono dim>= r_e · (1+H(&quot;alice&quot;))⁻¹·(mpkAgg−pk_alice) · (1 + H(&quot;bob&quot;))</Mono></div>
            <div className="pl-4 text-red-400/80 pt-1">
              ≠ r_e · (mpkAgg − pk_alice){' '}
              <span className="text-[var(--color-text-dim)]">
                {locale === 'de'
                  ? '← würde für korrekten Schritt 1 benötigt'
                  : '← required for a correct step 1'}
              </span>
            </div>
            <div className="pl-4 text-red-400/50 text-xs">
              {locale === 'de'
                ? '[Differenz: der Faktor (1+H("bob")) ≠ 1 verbleibt als irreduzibles Rauschen]'
                : '[Difference: the factor (1+H("bob")) ≠ 1 remains as irreducible noise]'}
            </div>
          </div>

          <div className="space-y-3">

            {/* hsk_alice already available from step 5 */}
            <Callout variant="info">
              <Mono>hsk_alice</Mono> {t('step6AttackHskNote')}
            </Callout>

            {/* Step 1 with wrong identity binding */}
            <div className="space-y-2">
              <BtnDanger onClick={doAliceAttackStep1} disabled={!!s.aliceAttackTemp} busy={s.busy}>
                {t('btnAttack1')}
              </BtnDanger>
              {s.aliceAttackTemp && (
                <div className="space-y-2">
                  <PolyBox label={
                    locale === 'de'
                      ? 'temp_alice_attack — kein r_e·pk_alice + encode(msg)!'
                      : 'temp_alice_attack — not r_e·pk_alice + encode(msg)!'
                  } poly={s.aliceAttackTemp} garbled />
                  <Callout variant="danger">
                    <strong>{t('step6DangerTitle')}</strong>{' '}
                    {locale === 'de' ? (
                      <>
                        Das Ergebnis ist <Mono>r_e · (1+H(&quot;alice&quot;))⁻¹·(mpkAgg−pk_alice) · (1+H(&quot;bob&quot;))</Mono> —
                        kein gültiger Ring-LWE-Chiffretext unter <Mono>pk_alice</Mono>.{' '}
                        Schritt 2 kann dieses Rauschen nicht herausrechnen.
                      </>
                    ) : (
                      <>
                        The result is <Mono>r_e · (1+H(&quot;alice&quot;))⁻¹·(mpkAgg−pk_alice) · (1+H(&quot;bob&quot;))</Mono> —
                        not a valid Ring-LWE ciphertext under <Mono>pk_alice</Mono>.{' '}
                        Step 2 cannot remove this noise.
                      </>
                    )}
                  </Callout>
                </div>
              )}
            </div>

            {/* Step 2 with sk_alice */}
            {s.aliceAttackTemp && (
              <div className="space-y-2">
                <BtnDanger onClick={doAliceAttackStep2} disabled={s.aliceAttackMsg !== null} busy={s.busy}>
                  {t('btnAttack2')}
                </BtnDanger>
                {s.aliceAttackMsg !== null && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
                      <p className="font-mono text-xs text-red-400/70 mb-1">{t('aliceReadsLabel')}</p>
                      <p className="font-mono text-red-300 break-all leading-relaxed
                        text-sm tracking-wide">
                        {s.aliceAttackMsg.length > 0
                          ? `"${s.aliceAttackMsg}"`
                          : <span className="text-red-400/50 italic">{t('emptyOutput')}</span>
                        }
                      </p>
                    </div>
                    <Callout variant="success">
                      <strong>{t('step6SuccessTitle')}</strong>{' '}
                      {s.aliceAttackMsg.length === 0
                        ? t('step6SuccessEmpty')
                        : (locale === 'de'
                            ? `Alice liest "${s.aliceAttackMsg}" — reiner Datenmüll, nicht Bobs Nachricht.`
                            : `Alice reads "${s.aliceAttackMsg}" — pure garbage, not Bob's message.`)
                      }{' '}
                      {locale === 'de' ? (
                        <>
                          Obwohl Alice eine legitime Empfängerin ist und ihren eigenen Chiffretext
                          korrekt entschlüsseln kann, schützt die Identitätsbindung in <Mono>c0_1</Mono>{' '}
                          Bobs Nachricht vor ihr. Kein Empfänger kann fremde Nachrichten lesen.
                        </>
                      ) : (
                        <>
                          Even though Alice is a legitimate recipient who can correctly decrypt her own ciphertext,
                          the identity binding in <Mono>c0_1</Mono> protects Bob&apos;s message from her.
                          No recipient can read messages intended for others.
                        </>
                      )}
                    </Callout>
                  </div>
                )}
              </div>
            )}
          </div>

          {s.aliceAttackMsg !== null && (
            <div className="mt-6">
              <button
                onClick={() => setS({ ...INIT, msgForBob: t('defaultMsgForBob'), msgForAlice: t('defaultMsgForAlice') })}
                className="font-mono text-xs text-[var(--color-text-dim)]
                  hover:text-[var(--color-text-muted)] underline cursor-pointer"
              >
                {t('resetDemo')}
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

type TFn = ReturnType<typeof useTranslations<'rbePlayground'>>;

function UserColumn({ name, who, keys, registered, busy, onKeyGen, onRegister, t }: {
  name: string; who: UserId;
  keys: UserKeys | null; registered: boolean;
  busy: boolean;
  onKeyGen: () => void; onRegister: () => void;
  t: TFn;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-glass-border)] p-4 space-y-3
      bg-[var(--color-bg-base)]">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-[var(--color-text-base)]">{name}</span>
        {registered && (
          <span className="text-xs font-mono text-emerald-400 border border-emerald-500/30
            bg-emerald-500/10 px-2 py-0.5 rounded-full">
            {t('userRegistered')}
          </span>
        )}
      </div>

      {!keys ? (
        <BtnOutline onClick={onKeyGen} disabled={false} busy={busy}>
          KeyGen
        </BtnOutline>
      ) : (
        <div className="space-y-2">
          <div className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2">
            <span className="font-mono text-xs text-red-300/80 block mb-1">{t('userSkLabel')}</span>
            <code className="font-mono text-xs text-red-300/60 break-all leading-relaxed">
              {fmtPoly(keys.sk, 3)}
            </code>
          </div>
          <div className="px-3 py-2 rounded border border-[var(--color-glass-border)]">
            <span className="font-mono text-xs text-[var(--color-text-dim)] block mb-1">pk → KC</span>
            <code className="font-mono text-xs text-[var(--color-text-muted)] break-all leading-relaxed">
              {fmtPoly(keys.pk, 3)}
            </code>
          </div>
          {!registered && (
            <BtnOutline onClick={onRegister} busy={busy}>
              {t('userBtnRegister')}
            </BtnOutline>
          )}
        </div>
      )}
    </div>
  );
}

function DecryptColumn({ name, target, ct, dec, busy, onFetchHsk, onStep1, onStep2, locale, t }: {
  name: string; target: 'alice' | 'bob';
  ct: EncResult; dec: DecState;
  busy: boolean;
  onFetchHsk: () => void; onStep1: () => void; onStep2: () => void;
  locale: string; t: TFn;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-glass-border)] p-4 space-y-4
      bg-[var(--color-bg-base)]">
      <span className="font-mono text-sm font-semibold text-[var(--color-text-base)]">{name}</span>

      {/* hsk fetch */}
      <div className="space-y-2">
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          {locale === 'de' ? (
            <>
              Der KC benutzt seinen geheimen Trapdoor <Mono>r</Mono>, um den identitätsgebundenen
              Hilfschlüssel zu berechnen:{' '}
              <Mono>g = 1 + H(&quot;{target}&quot;)</Mono> → <Mono>hsk1 = g⁻¹ · (mpkAgg − pk_{target})</Mono> →{' '}
              <Mono>hsk0 = r · hsk1</Mono>.
              Der hsk wird öffentlich übermittelt — er enthüllt weder <Mono>sk</Mono> noch <Mono>r</Mono>.
            </>
          ) : (
            <>
              The KC uses its secret trapdoor <Mono>r</Mono> to compute the identity-bound
              helper key:{' '}
              <Mono>g = 1 + H(&quot;{target}&quot;)</Mono> → <Mono>hsk1 = g⁻¹ · (mpkAgg − pk_{target})</Mono> →{' '}
              <Mono>hsk0 = r · hsk1</Mono>.
              The hsk is transmitted publicly — it reveals neither <Mono>sk</Mono> nor <Mono>r</Mono>.
            </>
          )}
        </p>
        <BtnOutline onClick={onFetchHsk} disabled={!!dec.hsk} busy={busy}>
          {t('decBtnFetchHsk', { target })}
        </BtnOutline>
        {dec.hsk && (
          <div className="space-y-1">
            <PolyBox label={`hsk0_${target} = r · hsk1`} poly={dec.hsk.hsk0} />
            <PolyBox label={`hsk1_${target} = (1+H("${target}"))⁻¹ · (mpkAgg − pk_${target})`} poly={dec.hsk.hsk1} />
          </div>
        )}
      </div>

      {/* Step 1 */}
      {dec.hsk && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            {locale === 'de' ? (
              <>
                <strong>Schritt 1</strong> subtrahiert mit dem hsk-Paar den &quot;alle anderen Nutzer&quot;-Anteil
                aus dem Chiffretext heraus. Das Ergebnis ist eine gewöhnliche Ring-LWE-Verschlüsselung
                von <Mono>msg</Mono> unter dem persönlichen Public Key <Mono>pk_{target}</Mono>:{' '}
                <Mono>temp = c1 − (c0_0·hsk0 + c0_1·hsk1) = r_e·pk_{target} + encode(msg)</Mono>.
              </>
            ) : (
              <>
                <strong>Step 1</strong> uses the hsk pair to subtract the &quot;all other users&quot; component
                from the ciphertext. The result is an ordinary Ring-LWE encryption
                of <Mono>msg</Mono> under the personal public key <Mono>pk_{target}</Mono>:{' '}
                <Mono>temp = c1 − (c0_0·hsk0 + c0_1·hsk1) = r_e·pk_{target} + encode(msg)</Mono>.
              </>
            )}
          </p>
          <BtnOutline onClick={onStep1} disabled={!!dec.temp} busy={busy}>
            {t('decBtnStep1')}
          </BtnOutline>
          {dec.temp && (
            <div className="space-y-1">
              <PolyBox label={
                locale === 'de'
                  ? 'temp = r_e·pk + encode(msg) — noch verschlüsselt!'
                  : 'temp = r_e·pk + encode(msg) — still encrypted!'
              } poly={dec.temp} />
              <p className="text-xs text-[var(--color-text-dim)]">{t('decStep1OnlyHsk')}</p>
            </div>
          )}
        </div>
      )}

      {/* Step 2 */}
      {dec.temp && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            {locale === 'de' ? (
              <>
                <strong>Schritt 2</strong> wendet den geheimen Schlüssel <Mono>sk_{target}</Mono>
                (nur im Browser bekannt) an:{' '}
                <Mono>result = temp − c0_0·sk = r_e·e + encode(msg)</Mono>.{' '}
                Da <Mono>e</Mono> sehr kleine Koeffizienten hat, rundet jede Stelle auf den
                nächsten Bit-Wert — die Nachricht ist wiederhergestellt.
              </>
            ) : (
              <>
                <strong>Step 2</strong> applies the secret key <Mono>sk_{target}</Mono>
                (known only in the browser):{' '}
                <Mono>result = temp − c0_0·sk = r_e·e + encode(msg)</Mono>.{' '}
                Since <Mono>e</Mono> has very small coefficients, each position rounds to the
                nearest bit — the message is recovered.
              </>
            )}
          </p>
          <BtnPrimary onClick={onStep2} disabled={dec.msg !== null} busy={busy}>
            {t('decBtnStep2')}
          </BtnPrimary>
          {dec.msg !== null && <ResultBox name={name} msg={dec.msg} compact t={t} />}
        </div>
      )}
    </div>
  );
}

function ResultBox({ name, msg, compact, t }: { name: string; msg: string; compact?: boolean; t: TFn }) {
  const isLong = msg.length > 32;
  return (
    <div className={`rounded-lg border border-emerald-500/30 bg-emerald-500/8
      ${compact ? 'px-3 py-2' : 'px-4 py-4'}`}>
      {!compact && (
        <p className="font-mono text-xs text-emerald-400/70 mb-1">{t('readsLabel', { name })}</p>
      )}
      <p className={`font-mono text-emerald-300 break-all leading-relaxed
        ${compact || isLong ? 'text-sm' : 'text-lg'} tracking-wide`}>
        &quot;{msg}&quot;
      </p>
    </div>
  );
}
