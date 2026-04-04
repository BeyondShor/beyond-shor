'use client';

import { useRef, useState, useEffect } from 'react';
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
  // Charlie's attack on Bob's ciphertext
  charlieHsk:       HskPair | null;
  charlieAttackTemp: number[] | null;
  charlieAttackMsg:  string | null;
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
  msgForBob:   'Hallo Bob! Geheime Nachricht.',
  msgForAlice: 'Hallo Alice! Nur für dich.',
  ctBob: null, ctAlice: null,
  decBob: EMPTY_DEC, decAlice: EMPTY_DEC,
  charlieHsk: null, charlieAttackTemp: null, charlieAttackMsg: null,
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

function StepTitle({ n, title, done }: { n: number | string; title: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <StepBadge n={n} done={done} />
      <h3 className="font-semibold text-[var(--color-text-base)]">{title}</h3>
      {done && <span className="ml-auto text-xs font-mono text-emerald-400/70">abgeschlossen</span>}
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
          <Label>{label}</Label>
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

function MsgInput({ value, onChange, disabled, label }: {
  value: string; onChange: (v: string) => void; disabled?: boolean; label: string;
}) {
  return (
    <div>
      <label className="block mb-1.5"><Label>{label}</Label></label>
      <input
        type="text"
        maxLength={32}
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
      <span className="ml-2 font-mono text-xs text-[var(--color-text-dim)]">max. 32 Zeichen</span>
    </div>
  );
}

// ── Main Playground ───────────────────────────────────────────────────────────

export default function RbePlayground() {
  const [s, setS]  = useState<RbeState>(INIT);
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
      cbRef.current.set(msg.id, (res) => {
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
    setBusy('KC wird initialisiert…');
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
    setBusy(`${name}: Schlüsselpaar wird im Browser generiert…`);
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
    setBusy(`${name} wird beim KC registriert…`);
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
    const name = target === 'bob' ? 'Bob' : 'Alice';
    const msg  = target === 'bob' ? s.msgForBob : s.msgForAlice;
    setBusy(`Charlie verschlüsselt für ${name}…`);
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
    setBusy(`hsk_${target} vom KC laden…`);
    try {
      const res = await fetch(`/api/rbe/hsk?sessionId=${s.sessionId}&targetId=${target}`);
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
    setBusy(`Schritt 1 für ${target === 'bob' ? 'Bob' : 'Alice'}: temp = c1 − (c0_0·hsk0 + c0_1·hsk1)`);
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
    setBusy(`Schritt 2 für ${name}: result = temp − c0_0·sk`);
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

  // Charlie's attack: use hsk_charlie (bound to Charlie) on c_bob (bound to Bob)
  async function doFetchCharlieHsk() {
    if (!s.sessionId) return;
    setBusy('hsk_charlie vom KC laden (für Angriffsdemonstration)…');
    try {
      const res = await fetch(`/api/rbe/hsk?sessionId=${s.sessionId}&targetId=charlie`);
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json() as ApiHskResponse;
      setS(p => ({ ...p, charlieHsk: { hsk0: data.hsk0, hsk1: data.hsk1 }, busy: false }));
    } catch (e) { setErr(e); }
  }

  async function doCharlieAttackStep1() {
    if (!s.ctBob || !s.charlieHsk) return;
    setBusy('Charlie wendet hsk_charlie auf c_bob an (falsche Identitätsbindung!)…');
    try {
      type S1Done = { id: string; type: 'dec_step1_done'; temp: number[]; ms: number };
      const res = await callWorker<S1Done>({
        id: uid(), type: 'dec_step1',
        c0_0: s.ctBob.c0_0,
        c0_1: s.ctBob.c0_1,   // ← bound to H("bob")
        hsk0: s.charlieHsk.hsk0,
        hsk1: s.charlieHsk.hsk1,  // ← bound to H("charlie")
        c1:   s.ctBob.c1,
      });
      setS(p => ({ ...p, charlieAttackTemp: res.temp, busy: false }));
    } catch (e) { setErr(e); }
  }

  async function doCharlieAttackStep2() {
    if (!s.ctBob || !s.charlieAttackTemp || !s.charlie) return;
    setBusy('Charlie wendet sk_charlie an (liest seinen eigenen Schlüssel aus)…');
    try {
      type S2Done = { id: string; type: 'dec_step2_done'; result: number[]; msg: string; ms: number };
      const res = await callWorker<S2Done>({
        id: uid(), type: 'dec_step2',
        c0_0: s.ctBob.c0_0,
        temp: s.charlieAttackTemp,
        sk:   s.charlie.sk,
      });
      setS(p => ({ ...p, charlieAttackMsg: res.msg, busy: false }));
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
          Fehler: {s.error}
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
          Kontext-Einleitung
      ════════════════════════════════════════════════════════════════════ */}
      <Card>
        <p className="font-mono text-xs text-[var(--color-primary)] mb-2">// was ist rbe — und warum kein zertifikat?</p>
        <div className="text-sm text-[var(--color-text-muted)] leading-relaxed space-y-3">
          <p>
            In klassischer PKI muss Alice ein <strong className="text-[var(--color-text-base)]">Zertifikat</strong> von
            einer Zertifizierungsstelle (CA) signieren lassen. Bob muss dieses Zertifikat prüfen,
            bevor er Alice schreiben kann — die CA ist ein zentraler Vertrauensanker mit weitreichenden Befugnissen.
          </p>
          <p>
            <strong className="text-[var(--color-text-base)]">Registration-Based Encryption (RBE)</strong> geht
            einen anderen Weg: Ein <strong className="text-[var(--color-text-base)]">Key Curator (KC)</strong> übernimmt
            die Registrierung, kennt aber <em>keinen einzigen Secret Key</em>. Jeder Nutzer generiert sein Schlüsselpaar
            lokal im Browser und übergibt nur den Public Key an den KC. Dieser addiert alle Public Keys zu einem
            einzigen aggregierten Wert <Mono>mpkAgg</Mono> auf — der Sender braucht nur diesen einen Wert
            und den <strong className="text-[var(--color-text-base)]">Namen des Empfängers</strong> (seine Identität).
          </p>
          <p>
            Eine <strong className="text-[var(--color-text-base)]">Identität</strong> ist dabei einfach ein
            eindeutiger String — hier die Namen{' '}
            <Mono>"alice"</Mono>, <Mono>"bob"</Mono>, <Mono>"charlie"</Mono>. Ein deterministischer
            Hash-Algorithmus wandelt diesen String in ein Polynom um, das mathematisch in den Chiffretext
            eingebacken wird. Dadurch kann Charlie nachweisbar <em>nicht</em> Bobs Nachricht lesen,
            selbst wenn er seinen eigenen legitimen Schlüssel kennt — das wird in Schritt 6 live demonstriert.
          </p>
        </div>
      </Card>

      {/* ════════════════════════════════════════════════════════════════════
          SCHRITT 0 — KC Setup
      ════════════════════════════════════════════════════════════════════ */}
      <Card active={!hasSetup} done={hasSetup}>
        <StepTitle n={0} title="KC-Setup: Trapdoor-Schlüsselpaar" done={hasSetup} />

        <div className="text-sm text-[var(--color-text-muted)] mb-4 leading-relaxed space-y-2">
          <p>
            Die gesamte Arithmetik findet im <strong className="text-[var(--color-text-base)]">Polynomring
            R_q = Z_q[X]/(X^N+1)</strong> statt: ganzzahlige Polynome vom Grad &lt; N = {N},
            deren Koeffizienten modulo q = {Q} gerechnet werden. Multiplikation wird modulo
            X^{N}+1 reduziert — das macht den Ring für gitterbasierte Kryptografie geeignet.
          </p>
          <p>
            Der KC wählt zunächst ein <strong className="text-[var(--color-text-base)]">uniformes
            Polynom</strong> <Mono>a0</Mono> — alle {N} Koeffizienten gleichverteilt in [0, {Q}).
            Das ist der öffentliche Referenzpunkt für alle Nutzer (Common Reference String).
            Dann zieht er ein <strong className="text-[var(--color-text-base)]">kurzes Polynom</strong>{' '}
            <Mono>r</Mono> mit Koeffizienten nur aus {'{'}-{B}, …, +{B}{'}'} und berechnet{' '}
            <Mono>a1 = 1 − a0·r</Mono>. Dadurch gilt die{' '}
            <strong className="text-[var(--color-text-base)]">Trapdoor-Relation</strong>{' '}
            <Mono>a0·r + a1 = 1</Mono> (das Einheitspolynom).{' '}
            <Mono>a0</Mono> und <Mono>a1</Mono> sind vollständig öffentlich —
            nur <Mono>r</Mono> bleibt als Geheimnis auf dem Server.
          </p>
        </div>

        <BtnPrimary onClick={doSetup} disabled={hasSetup} busy={s.busy}>
          KC initialisieren
        </BtnPrimary>

        {s.a0 && s.a1 && (
          <div className="mt-5 space-y-3">
            <PolyBox label="a0 — öffentlicher Referenzpunkt (Common Reference String)" poly={s.a0}
              equation="uniform ∈ R_q" />
            <PolyBox label="a1 — öffentliches Komplement" poly={s.a1}
              equation="1 − a0·r" />
            <Callout variant="info">
              <strong>Warum ist das ein Trapdoor?</strong>{' '}
              Wer <Mono>r</Mono> kennt, kann aus <Mono>a0</Mono> und <Mono>a1</Mono>
              für jeden Empfänger einen maßgeschneiderten Hilfschlüssel berechnen.
              Wer <Mono>r</Mono> nicht kennt, müsste dafür das
              Ring-LWE-Problem lösen — das gilt als quantencomputersicher schwer.
              N_max = {N_MAX}: In dieser Demo können maximal {N_MAX} Nutzer registriert werden
              (die sogenannte Bounded-N-Eigenschaft von RBE).
            </Callout>
          </div>
        )}
      </Card>

      {/* ════════════════════════════════════════════════════════════════════
          SCHRITTE 1–3 — Registrierung
      ════════════════════════════════════════════════════════════════════ */}
      {hasSetup && (
        <Card active={!allReg} done={allReg}>
          <StepTitle n="1–3" title="Registrierung: Alice, Bob, Charlie" done={allReg} />

          <div className="text-sm text-[var(--color-text-muted)] mb-5 leading-relaxed space-y-2">
            <p>
              Jeder Nutzer generiert sein Schlüsselpaar <strong>lokal im Browser</strong>,
              basierend auf dem Sicherheitsprinzip{' '}
              <strong className="text-[var(--color-text-base)]">Ring-LWE</strong> (Ring Learning With Errors):
              Man zieht einen geheimen Schlüssel <Mono>sk</Mono> und einen Fehlerterm <Mono>e</Mono> —
              beide mit Koeffizienten nur aus {'{'}-{B}, …, +{B}{'}'}  (also sehr kleine Werte).
              Der Public Key ergibt sich dann als{' '}
              <Mono>pk = a0·sk + e</Mono>. Die Sicherheit beruht darauf, dass es ohne Kenntnis
              von <Mono>sk</Mono> rechnerisch nicht möglich ist, den kleinen Fehler <Mono>e</Mono>
              vom Ergebnis zu trennen — selbst mit einem Quantencomputer (unter der Ring-LWE-Annahme).
            </p>
            <p>
              Nur der Public Key <Mono>pk</Mono> wird an den KC geschickt. Dieser addiert ihn
              zum aggregierten Public Key <Mono>mpkAgg = pk_alice + pk_bob + pk_charlie</Mono>.
              Der Secret Key verlässt niemals den Browser.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <UserColumn name="Alice" who="alice" keys={s.alice} registered={s.aliceReg}
              busy={s.busy} onKeyGen={() => doKeyGen('alice')} onRegister={() => doRegister('alice')} />
            <UserColumn name="Bob"   who="bob"   keys={s.bob}   registered={s.bobReg}
              busy={s.busy} onKeyGen={() => doKeyGen('bob')}   onRegister={() => doRegister('bob')} />
            <UserColumn name="Charlie" who="charlie" keys={s.charlie} registered={s.charlieReg}
              busy={s.busy} onKeyGen={() => doKeyGen('charlie')} onRegister={() => doRegister('charlie')} />
          </div>

          {s.mpkAgg && (
            <div className="mt-5 space-y-3">
              <PolyBox
                label={`mpkAgg — aggregierter Public Key (${[s.aliceReg, s.bobReg, s.charlieReg].filter(Boolean).length}/${N_MAX} Nutzer)`}
                poly={s.mpkAgg}
                equation={[
                  s.aliceReg   ? 'pk_alice'   : null,
                  s.bobReg     ? 'pk_bob'     : null,
                  s.charlieReg ? 'pk_charlie' : null,
                ].filter(Boolean).join(' + ') || ''}
              />
              {allReg && (
                <Callout variant="success">
                  <strong>N_max = {N_MAX} erreicht.</strong> Alle drei Nutzer haben nur ihren Public Key
                  übermittelt — der KC hat keinen einzigen Secret Key gesehen. Ein klassischer PKI-Ansatz
                  hätte drei CA-Signaturen, drei Zertifikate und drei CRL-Einträge erfordert.
                  Hier: ein einzelnes <Mono>mpkAgg</Mono>.
                </Callout>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SCHRITT 4 — Verschlüsselung (zwei Nachrichten)
      ════════════════════════════════════════════════════════════════════ */}
      {allReg && (
        <Card active={!bothCts} done={bothCts}>
          <StepTitle n={4} title="Verschlüsselung: Charlie schreibt an Bob und Alice" done={bothCts} />

          <div className="text-sm text-[var(--color-text-muted)] mb-4 leading-relaxed space-y-2">
            <p>
              Charlie braucht zum Verschlüsseln nur öffentlich bekannte Daten:{' '}
              <Mono>a0</Mono>, <Mono>a1</Mono>, <Mono>mpkAgg</Mono> — und den{' '}
              <strong className="text-[var(--color-text-base)]">Namen des Empfängers</strong>{' '}
              als Identität (hier der String <Mono>"bob"</Mono> bzw. <Mono>"alice"</Mono>).
              Keine CA-Abfrage, kein Zertifikat, kein vorab ausgetauschter Schlüssel.
            </p>
            <p>
              Der entscheidende Schritt ist die{' '}
              <strong className="text-[var(--color-text-base)]">Identitätsbindung</strong>:
              Eine Hash-Funktion <Mono>H</Mono> wandelt den Empfänger-String deterministisch in ein
              Polynom in R_q um. Dieses Polynom wird in die zweite Chiffretext-Komponente eingebacken,
              sodass nur der KC mit Kenntnis von <Mono>r</Mono> den passenden Hilfschlüssel für genau
              diesen Empfänger berechnen kann.
            </p>
          </div>
          <div className="mb-4 rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-base)]
            px-4 py-3 font-mono text-xs text-[var(--color-text-muted)] space-y-1.5 leading-loose">
            <div className="text-[var(--color-text-dim)]">// r wird frisch für jede Nachricht gewählt:</div>
            <div><Mono>r</Mono><span className="text-[var(--color-text-dim)] ml-2">— kurzes Polynom mit Koeffizienten ∈ {'{'}-{B}, …, +{B}{'}'}</span></div>
            <div className="pt-1 text-[var(--color-text-dim)]">// drei Komponenten des Chiffretexts:</div>
            <div><Mono>c0_0 = r · a0</Mono></div>
            <div><Mono>c0_1 = r · (a1 + H(id_target))</Mono>
              <span className="text-amber-400/80 ml-2">← Identitätsbindung</span>
            </div>
            <div><Mono>c1 &nbsp;&nbsp;= r · mpkAgg + encode(msg)</Mono><span className="text-[var(--color-text-dim)] ml-2">← verschlüsselte Nachricht</span></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Nachricht für Bob */}
            <div className="space-y-3">
              <Label>Nachricht für Bob</Label>
              <MsgInput label="Klartext" value={s.msgForBob}
                onChange={v => setS(p => ({ ...p, msgForBob: v }))} disabled={!!s.ctBob} />
              <BtnPrimary onClick={() => doEncrypt('bob')} disabled={!!s.ctBob} busy={s.busy}>
                Für Bob verschlüsseln
              </BtnPrimary>
              {s.ctBob && (
                <div className="space-y-2">
                  <PolyBox label="c0_0 = r · a0" poly={s.ctBob.c0_0} />
                  <PolyBox label='c0_1 = r · (a1 + H("bob"))' poly={s.ctBob.c0_1}
                    equation='Identitätsbindung an "bob"' />
                  <PolyBox label="c1 = r · mpkAgg + encode(msg)" poly={s.ctBob.c1} />
                </div>
              )}
            </div>

            {/* Nachricht für Alice */}
            <div className="space-y-3">
              <Label>Nachricht für Alice</Label>
              <MsgInput label="Klartext" value={s.msgForAlice}
                onChange={v => setS(p => ({ ...p, msgForAlice: v }))} disabled={!!s.ctAlice} />
              <BtnPrimary onClick={() => doEncrypt('alice')} disabled={!!s.ctAlice} busy={s.busy}>
                Für Alice verschlüsseln
              </BtnPrimary>
              {s.ctAlice && (
                <div className="space-y-2">
                  <PolyBox label="c0_0 = r · a0" poly={s.ctAlice.c0_0} />
                  <PolyBox label='c0_1 = r · (a1 + H("alice"))' poly={s.ctAlice.c0_1}
                    equation='Identitätsbindung an "alice"' />
                  <PolyBox label="c1 = r · mpkAgg + encode(msg)" poly={s.ctAlice.c1} />
                </div>
              )}
            </div>
          </div>

          {bothCts && s.ctBob && s.ctAlice && (
            <div className="mt-5">
              <Callout variant="warn">
                <strong>Beobachtung:</strong> Beide c0_1-Komponenten sind durch unterschiedliche
                Identitäts-Hashes <Mono>H("bob") ≠ H("alice")</Mono> verschieden gebunden —{' '}
                {polyDiffers(s.ctBob.c0_1, s.ctAlice.c0_1)
                  ? 'c0_1_bob ≠ c0_1_alice ✓'
                  : 'c0_1_bob = c0_1_alice (zufällige Kollision)'}.
                Diese Bindung ist es, die verhindert, dass Charlie Bobs Nachricht lesen kann.
              </Callout>
            </div>
          )}
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SCHRITT 5 — Entschlüsselung (Bob und Alice)
      ════════════════════════════════════════════════════════════════════ */}
      {bothCts && (
        <Card active={!bothDecoded} done={bothDecoded}>
          <StepTitle n={5} title="Entschlüsselung: Zwei Faktoren — hsk + sk" done={bothDecoded} />

          <div className="text-sm text-[var(--color-text-muted)] mb-4 leading-relaxed space-y-2">
            <p>
              Der KC berechnet für jeden Empfänger mit seinem geheimen Trapdoor <Mono>r</Mono>
              einen <strong className="text-[var(--color-text-base)]">Helper Decryption Key (hsk)</strong> —
              ein Schlüsselpaar aus zwei Polynomen <Mono>(hsk0, hsk1)</Mono>, das identitätsspezifisch ist:
            </p>
            <div className="rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-base)]
              px-4 py-3 font-mono text-xs text-[var(--color-text-muted)] space-y-1.5 leading-loose">
              <div className="text-[var(--color-text-dim)]">// g_t = Identitätspolynom des Empfängers:</div>
              <div><Mono>g_t = 1 + H(id_t)</Mono></div>
              <div className="text-[var(--color-text-dim)] pt-1">// g_t⁻¹ ist das multiplikative Inverse von g_t in R_q:</div>
              <div><Mono>hsk1 = g_t⁻¹ · (mpkAgg − pk_t)</Mono></div>
              <div><Mono>hsk0 = r · hsk1</Mono></div>
              <div className="text-[var(--color-text-dim)] pt-1">// Daraus folgt die Schlüsseleigenschaft (leicht nachzurechnen):</div>
              <div><Mono>a0·hsk0 + (a1 + H(id_t))·hsk1 = mpkAgg − pk_t</Mono></div>
            </div>
            <p>
              <Mono>hsk</Mono> darf öffentlich übertragen werden — er ist für sich allein nutzlos,
              weil er nach Schritt 1 nur eine Ring-LWE-Verschlüsselung unter <Mono>pk_t</Mono> liefert.
              Erst der geheime Schlüssel <Mono>sk</Mono> (der niemals den Browser verlässt) entschlüsselt
              in Schritt 2 vollständig. Daher der Begriff{' '}
              <strong className="text-[var(--color-text-base)]">Zwei-Faktor-Entschlüsselung</strong>:
              KC-Seite (hsk) + Nutzer-Seite (sk).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DecryptColumn name="Bob"   target="bob"   ct={s.ctBob!}   dec={s.decBob}
              busy={s.busy} onFetchHsk={() => doFetchHsk('bob')}
              onStep1={() => doDecStep1('bob')} onStep2={() => doDecStep2('bob')} />
            <DecryptColumn name="Alice" target="alice" ct={s.ctAlice!} dec={s.decAlice}
              busy={s.busy} onFetchHsk={() => doFetchHsk('alice')}
              onStep1={() => doDecStep1('alice')} onStep2={() => doDecStep2('alice')} />
          </div>

          {bothDecoded && (
            <div className="mt-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <ResultBox name="Bob"   msg={s.decBob.msg!} />
                <ResultBox name="Alice" msg={s.decAlice.msg!} />
              </div>
              <Callout variant="success">
                <strong>Zwei-Faktor-Eigenschaft bestätigt:</strong> Weder der KC (kennt kein <Mono>sk</Mono>)
                noch ein Angreifer mit nur <Mono>hsk</Mono> kann die Nachricht lesen.
                Erst die Kombination aus dem server-seitigen <Mono>hsk</Mono> und dem
                browser-lokalen <Mono>sk</Mono> kollabiert das Rauschen auf <Mono>r·e ≈ 0</Mono>.
                Kein Master-Geheimnis. Kein Key Escrow.
              </Callout>
            </div>
          )}
        </Card>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SCHRITT 6 — Sicherheitsnachweis: Charlie schlägt fehl
      ════════════════════════════════════════════════════════════════════ */}
      {bothDecoded && s.charlie && s.ctBob && (
        <Card active={s.charlieAttackMsg === null}>
          <StepTitle n={6}
            title="Sicherheitsnachweis: Charlie versucht, Bobs Nachricht zu lesen"
            done={s.charlieAttackMsg !== null} />

          <div className="text-sm text-[var(--color-text-muted)] mb-4 leading-relaxed space-y-2">
            <p>
              Charlie ist ein <em>legitimer</em>, registrierter Nutzer mit einem gültig vom KC
              ausgestellten <Mono>hsk_charlie</Mono>. Trotzdem kann er Bobs Nachricht nicht lesen —
              und genau das wollen wir jetzt nachweisen.
            </p>
            <p>
              Der Grund liegt in der Identitätsbindung:{' '}
              <Mono>hsk_charlie</Mono> wurde mit dem Identitätspolynom <Mono>H("charlie")</Mono> berechnet
              und erfüllt die Gleichung <Mono>a0·hsk0 + (a1 + H("charlie"))·hsk1 = mpkAgg − pk_charlie</Mono>.{' '}
              Bobs Chiffretext <Mono>c0_1</Mono> enthält aber <Mono>H("bob")</Mono>.
              Die beiden Polynome sind verschieden — die Gleichung geht nicht auf:
            </p>
          </div>

          <div className="rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-base)]
            px-4 py-3 mb-5 font-mono text-xs text-[var(--color-text-muted)] space-y-1.5 leading-loose">
            <div className="text-[var(--color-text-dim)]">// Charlie versucht Schritt 1 mit hsk_charlie auf c_bob:</div>
            <div><Mono>c0_0·hsk0_charlie + c0_1·hsk1_charlie</Mono></div>
            <div className="pl-4 text-[var(--color-text-dim)]">// c0_1 enthält H("bob"), hsk1_charlie enthält H("charlie"):</div>
            <div className="pl-4"><Mono dim>= r_e · hsk1_charlie · (a0·r + a1 + H("bob"))</Mono></div>
            <div className="pl-4"><Mono dim>= r_e · (1+H("charlie"))⁻¹·(mpkAgg−pk_charlie) · (1 + H("bob"))</Mono></div>
            <div className="pl-4 text-red-400/80 pt-1">
              ≠ r_e · (mpkAgg − pk_charlie){' '}
              <span className="text-[var(--color-text-dim)]">← würde für korrekten Schritt 1 benötigt</span>
            </div>
            <div className="pl-4 text-red-400/50 text-xs">
              [Differenz: der Faktor (1+H("bob")) ≠ 1 verbleibt als irreduzibles Rauschen]
            </div>
          </div>

          <div className="space-y-3">

            {/* 1. hsk_charlie laden */}
            <div className="space-y-2">
              <BtnDanger onClick={doFetchCharlieHsk} disabled={!!s.charlieHsk} busy={s.busy}>
                hsk_charlie laden (legitim, aber falsch gebunden)
              </BtnDanger>
              {s.charlieHsk && (
                <div className="space-y-2">
                  <PolyBox label='hsk0_charlie (gebunden an H("charlie"))' poly={s.charlieHsk.hsk0} />
                  <PolyBox label='hsk1_charlie (gebunden an H("charlie"))' poly={s.charlieHsk.hsk1} />
                </div>
              )}
            </div>

            {/* 2. Schritt 1 mit falscher Identitätsbindung */}
            {s.charlieHsk && (
              <div className="space-y-2">
                <BtnDanger onClick={doCharlieAttackStep1} disabled={!!s.charlieAttackTemp} busy={s.busy}>
                  Schritt 1: hsk_charlie auf c_bob anwenden (Identitätsfehler!)
                </BtnDanger>
                {s.charlieAttackTemp && (
                  <div className="space-y-2">
                    <PolyBox label="temp_charlie (garbled — kein Ring-LWE unter pk_charlie!)"
                      poly={s.charlieAttackTemp} garbled />
                    <Callout variant="danger">
                      <strong>Identitätsbindung greift.</strong> Das Ergebnis ist{' '}
                      <Mono>r_e · (1+H("charlie"))⁻¹ · target_charlie · (1+H("bob"))</Mono> —
                      ein von <Mono>r_e·pk_charlie</Mono> völlig verschiedenes Polynom.
                      Schritt 2 kann dieses Rauschen nicht kompensieren.
                    </Callout>
                  </div>
                )}
              </div>
            )}

            {/* 3. Schritt 2 mit sk_charlie */}
            {s.charlieAttackTemp && (
              <div className="space-y-2">
                <BtnDanger onClick={doCharlieAttackStep2} disabled={s.charlieAttackMsg !== null} busy={s.busy}>
                  Schritt 2: sk_charlie anwenden
                </BtnDanger>
                {s.charlieAttackMsg !== null && (
                  <div className="space-y-3">
                    <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
                      <p className="font-mono text-xs text-red-400/70 mb-1">// Charlie liest</p>
                      <p className="font-mono text-red-300 text-lg tracking-wide">
                        {s.charlieAttackMsg.length > 0
                          ? `"${s.charlieAttackMsg}"`
                          : <span className="text-red-400/50 italic text-sm">— leere Ausgabe (Datenmüll) —</span>
                        }
                      </p>
                    </div>
                    <Callout variant="success">
                      <strong>Sicherheitsnachweis abgeschlossen.</strong>{' '}
                      {s.charlieAttackMsg.length === 0
                        ? 'Charlie erhält eine leere Ausgabe — das Rauschen überwältigt die Nachricht vollständig.'
                        : `Charlie liest "${s.charlieAttackMsg}" — reiner Datenmüll, nicht Bobs Nachricht "${s.msgForBob}".`
                      }{' '}
                      Die Identitätsbindung in <Mono>c0_1</Mono> hat verhindert, dass
                      Charlies <Mono>hsk</Mono> das Polynom korrekt reduziert.
                      Selbst ein legitimer, registrierter Nutzer kann fremde Chiffretexte nicht entschlüsseln.
                    </Callout>
                  </div>
                )}
              </div>
            )}
          </div>

          {s.charlieAttackMsg !== null && (
            <div className="mt-6">
              <button
                onClick={() => setS({ ...INIT })}
                className="font-mono text-xs text-[var(--color-text-dim)]
                  hover:text-[var(--color-text-muted)] underline cursor-pointer"
              >
                Demo zurücksetzen
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function UserColumn({ name, who, keys, registered, busy, onKeyGen, onRegister }: {
  name: string; who: UserId;
  keys: UserKeys | null; registered: boolean;
  busy: boolean;
  onKeyGen: () => void; onRegister: () => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-glass-border)] p-4 space-y-3
      bg-[var(--color-bg-base)]">
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-semibold text-[var(--color-text-base)]">{name}</span>
        {registered && (
          <span className="text-xs font-mono text-emerald-400 border border-emerald-500/30
            bg-emerald-500/10 px-2 py-0.5 rounded-full">
            registriert ✓
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
            <span className="font-mono text-xs text-red-300/80 block mb-1">sk (bleibt hier)</span>
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
              Beim KC registrieren
            </BtnOutline>
          )}
        </div>
      )}
    </div>
  );
}

function DecryptColumn({ name, target, ct, dec, busy, onFetchHsk, onStep1, onStep2 }: {
  name: string; target: 'alice' | 'bob';
  ct: EncResult; dec: DecState;
  busy: boolean;
  onFetchHsk: () => void; onStep1: () => void; onStep2: () => void;
}) {
  return (
    <div className="rounded-lg border border-[var(--color-glass-border)] p-4 space-y-4
      bg-[var(--color-bg-base)]">
      <span className="font-mono text-sm font-semibold text-[var(--color-text-base)]">{name}</span>

      {/* hsk fetch */}
      <div className="space-y-2">
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          Der KC benutzt seinen geheimen Trapdoor <Mono>r</Mono>, um den identitätsgebundenen
          Hilfschlüssel zu berechnen:{' '}
          <Mono>g = 1 + H("{target}")</Mono> → <Mono>hsk1 = g⁻¹ · (mpkAgg − pk_{target})</Mono> →{' '}
          <Mono>hsk0 = r · hsk1</Mono>.
          Der hsk wird öffentlich übermittelt — er enthüllt weder <Mono>sk</Mono> noch <Mono>r</Mono>.
        </p>
        <BtnOutline onClick={onFetchHsk} disabled={!!dec.hsk} busy={busy}>
          hsk_{target} vom KC laden
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
            <strong>Schritt 1</strong> subtrahiert mit dem hsk-Paar den "alle anderen Nutzer"-Anteil
            aus dem Chiffretext heraus. Das Ergebnis ist eine gewöhnliche Ring-LWE-Verschlüsselung
            von <Mono>msg</Mono> unter dem persönlichen Public Key <Mono>pk_{target}</Mono>:{' '}
            <Mono>temp = c1 − (c0_0·hsk0 + c0_1·hsk1) = r_e·pk_{target} + encode(msg)</Mono>.
          </p>
          <BtnOutline onClick={onStep1} disabled={!!dec.temp} busy={busy}>
            Schritt 1: hsk anwenden
          </BtnOutline>
          {dec.temp && (
            <div className="space-y-1">
              <PolyBox label="temp = r_e·pk + encode(msg) — noch verschlüsselt!" poly={dec.temp} />
              <p className="text-xs text-[var(--color-text-dim)]">
                Nur mit hsk lässt sich die Nachricht noch nicht lesen — sk fehlt noch.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Step 2 */}
      {dec.temp && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            <strong>Schritt 2</strong> wendet den geheimen Schlüssel <Mono>sk_{target}</Mono>
            (nur im Browser bekannt) an:{' '}
            <Mono>result = temp − c0_0·sk = r_e·e + encode(msg)</Mono>.{' '}
            Da <Mono>e</Mono> sehr kleine Koeffizienten hat, rundet jede Stelle auf den
            nächsten Bit-Wert — die Nachricht ist wiederhergestellt.
          </p>
          <BtnPrimary onClick={onStep2} disabled={dec.msg !== null} busy={busy}>
            Schritt 2: sk anwenden
          </BtnPrimary>
          {dec.msg !== null && <ResultBox name={name} msg={dec.msg} compact />}
        </div>
      )}
    </div>
  );
}

function ResultBox({ name, msg, compact }: { name: string; msg: string; compact?: boolean }) {
  return (
    <div className={`rounded-lg border border-emerald-500/30 bg-emerald-500/8
      ${compact ? 'px-3 py-2' : 'px-4 py-4'}`}>
      {!compact && (
        <p className="font-mono text-xs text-emerald-400/70 mb-1">// {name} liest</p>
      )}
      <p className={`font-mono text-emerald-300 ${compact ? 'text-sm' : 'text-lg'} tracking-wide`}>
        &quot;{msg}&quot;
      </p>
    </div>
  );
}
