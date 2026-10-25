'use client';

import { useRef, useState, useEffect, type ReactNode } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import katex from 'katex';
import type {
  WorkerInMessage, WorkerOutMessage, WireMat, WireCiphertext, UserName,
  ApiSessionResponse, ApiRegisterResponse, ApiHskResponse,
} from '@/lib/rbe-types';
import { USER_NAMES } from '@/lib/rbe-types';
import { createContext, identityOf, maxMessageBytes } from '@/lib/rbe/scheme';

const CTX = createContext();
const { p: P, dv: DV } = CTX;
const MAX_BYTES = maxMessageBytes(CTX);
const DISPLAY: Record<UserName, string> = { alice: 'Alice', bob: 'Bob', charlie: 'Charlie' };
const IDENTITY: Record<UserName, number> = {
  alice: identityOf('alice'), bob: identityOf('bob'), charlie: identityOf('charlie'),
};
const bits = (id: number) => id.toString(2).padStart(P.ell, '0');

// ── State ─────────────────────────────────────────────────────────────────────

type Recipient = 'alice' | 'bob';

interface UserState {
  keys: { pk: WireMat; sk: WireMat } | null;
  registered: boolean;
}

interface DecState {
  hsk: WireMat | null;
  hskNorm: number | null;
  ctReg: WireMat | null;
  message: string | null;
  noise: number | null;
}

interface RbeState {
  sessionId: string | null;
  seed: string | null;
  crsPreview: number[] | null;
  crsMs: number | null;
  users: Record<UserName, UserState>;
  mpk: WireMat | null;
  audit: { match: boolean; ms: number } | null;
  msg: Record<Recipient, string>;
  ct: Record<Recipient, { ct: WireCiphertext; ms: number } | null>;
  dec: Record<Recipient, DecState>;
  attack: { message: string; noise: number } | null;
  busy: boolean;
  busyLabel: string;
  error: string | null;
}

const EMPTY_DEC: DecState = { hsk: null, hskNorm: null, ctReg: null, message: null, noise: null };
const EMPTY_USER: UserState = { keys: null, registered: false };

function initialState(msgBob: string, msgAlice: string): RbeState {
  return {
    sessionId: null, seed: null, crsPreview: null, crsMs: null,
    users: { alice: EMPTY_USER, bob: EMPTY_USER, charlie: EMPTY_USER },
    mpk: null, audit: null,
    msg: { bob: msgBob, alice: msgAlice },
    ct: { bob: null, alice: null },
    dec: { bob: EMPTY_DEC, alice: EMPTY_DEC },
    attack: null,
    busy: false, busyLabel: '', error: null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type WorkerRequest = WorkerInMessage extends infer T ? T extends unknown ? Omit<T, 'id'> : never : never;
type WorkerReply<K extends WorkerOutMessage['type']> = Extract<WorkerOutMessage, { type: K }>;

function wireValues(w: WireMat, count: number): number[] {
  const bytes = Uint8Array.from(atob(w.data.slice(0, Math.ceil((count * 4) / 3) * 4 + 4)), (c) => c.charCodeAt(0));
  if (w.enc === 'i16') return Array.from(new Int16Array(bytes.buffer, 0, count));
  return Array.from(new Uint32Array(bytes.buffer, 0, count));
}

function centeredPreview(w: WireMat, count = 4): string {
  const vals = wireValues(w, count).map((v) => (w.enc === 'u32' && v > P.q / 2 ? v - P.q : v));
  return `[${vals.join(', ')}, …]`;
}

// Size of a matrix when packed at 26 bits per coefficient
function kib(...ws: WireMat[]): string {
  const coeffs = ws.reduce((s, w) => s + w.rows * w.cols * P.nR, 0);
  return ((coeffs * Math.ceil(Math.log2(P.q))) / 8 / 1024).toFixed(0);
}

const utf8Length = (s: string) => new TextEncoder().encode(s).length;

// ── Design primitives ─────────────────────────────────────────────────────────

function Card({ children, active, done }: { children: ReactNode; active?: boolean; done?: boolean }) {
  return (
    <div className={`rounded-xl border p-6 transition-colors bg-[var(--color-bg-surface)]
      ${done ? 'border-[var(--color-primary)]/20' : active ? 'border-[var(--color-primary)]/40' : 'border-[var(--color-glass-border)]'}`}>
      {children}
    </div>
  );
}

function StepTitle({ n, title, done, doneLbl }: { n: number | string; title: string; done?: boolean; doneLbl: string }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className={`inline-flex w-6 h-6 rounded-full items-center justify-center text-xs font-mono font-bold flex-shrink-0
        ${done
          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
          : 'bg-[var(--color-primary)]/10 text-[var(--color-primary)] border border-[var(--color-primary)]/30'}`}>
        {done ? '✓' : n}
      </span>
      <h3 className="font-semibold text-[var(--color-text-base)]">{title}</h3>
      {done && <span className="ml-auto text-xs font-mono text-emerald-400/70">{doneLbl}</span>}
    </div>
  );
}

type CalloutVariant = 'info' | 'warn' | 'success' | 'danger';
function Callout({ variant = 'info', children }: { variant?: CalloutVariant; children: ReactNode }) {
  const cls: Record<CalloutVariant, string> = {
    info:    'border-[var(--color-primary)]/25 bg-[var(--color-primary)]/5 text-[var(--color-text-muted)]',
    warn:    'border-amber-500/30 bg-amber-500/5 text-amber-300/90',
    success: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-300',
    danger:  'border-red-500/40 bg-red-500/8 text-red-300',
  };
  return <div className={`rounded-lg border px-4 py-3 text-sm leading-relaxed ${cls[variant]}`}>{children}</div>;
}

function Mono({ children }: { children: ReactNode }) {
  return <code className="font-mono text-xs text-[var(--color-primary)]">{children}</code>;
}

// Display-mode KaTeX; the katex CSS is loaded globally in app/layout.tsx
function Formula({ tex }: { tex: string }) {
  const html = katex.renderToString(tex, { throwOnError: false, displayMode: true, output: 'html' });
  return (
    <div
      className="my-4 overflow-x-auto rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-base)] px-4 text-[var(--color-text-base)]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ValueBox({ label, value, secret, garbled }: { label: string; value: string; secret?: boolean; garbled?: boolean }) {
  const tone = garbled || secret ? 'border-red-500/25 bg-red-500/5 text-red-300/80' : 'border-[var(--color-glass-border)] bg-[var(--color-bg-base)] text-[var(--color-text-muted)]';
  return (
    <div className={`rounded-lg border px-3 py-2 ${tone}`}>
      {/* No uppercase here: labels contain variable names such as sk, pk, A_0 */}
      <span className="block font-mono text-xs text-[var(--color-text-muted)] mb-1">{label}</span>
      <code className="block font-mono text-xs break-all leading-relaxed">{value}</code>
    </div>
  );
}

function NoiseBar({ noise, label }: { noise: number; label: (pct: number) => string }) {
  const ratio = Math.min(noise / (P.q / 4), 1);
  const color = ratio < 0.5 ? 'bg-emerald-400' : ratio < 0.9 ? 'bg-amber-400' : 'bg-red-400';
  return (
    <div className="space-y-1">
      <div className="h-1.5 w-full rounded-full bg-[var(--color-bg-base)] border border-[var(--color-glass-border)] overflow-hidden">
        <div className={`h-full ${color}`} style={{ width: `${Math.max(ratio * 100, 1)}%` }} />
      </div>
      <p className="font-mono text-xs text-[var(--color-text-muted)]">{label(ratio * 100)}</p>
    </div>
  );
}

function Btn({ onClick, disabled, busy, variant = 'outline', children }: {
  onClick: () => void; disabled?: boolean; busy?: boolean; variant?: 'primary' | 'outline' | 'danger'; children: ReactNode;
}) {
  const cls = {
    primary: 'bg-[var(--color-primary)] px-5 font-semibold text-[var(--color-bg-base)] hover:opacity-90',
    outline: 'border border-[var(--color-glass-border)] px-4 text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]',
    danger:  'border border-red-500/40 px-4 text-red-400/80 hover:border-red-500/70 hover:text-red-300',
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className={`inline-flex items-center gap-2 rounded-lg py-2.5 font-mono text-sm transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${cls}`}
    >
      {busy && <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />}
      {children}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RbePlayground() {
  const t = useTranslations('rbePlayground');
  const locale = useLocale();
  const fmt = (v: number, digits = 0) =>
    v.toLocaleString(locale === 'de' ? 'de-DE' : 'en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const rich = (key: Parameters<typeof t.rich>[0], values: Record<string, string | number> = {}) =>
    t.rich(key, {
      ...values,
      b: (c) => <strong className="text-[var(--color-text-base)]">{c}</strong>,
      c: (c) => <Mono>{c}</Mono>,
    });

  const [s, setS] = useState<RbeState>(() => initialState(t('defaultMsgForBob'), t('defaultMsgForAlice')));
  const workerRef = useRef<Worker | null>(null);
  const callbacks = useRef(new Map<string, (m: WorkerOutMessage) => void>());

  useEffect(() => {
    const w = new Worker(new URL('../workers/rbe-worker.ts', import.meta.url));
    w.onmessage = (ev: MessageEvent<WorkerOutMessage>) => {
      const cb = callbacks.current.get(ev.data.id);
      if (cb) { callbacks.current.delete(ev.data.id); cb(ev.data); }
    };
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  function callWorker<K extends WorkerOutMessage['type']>(req: WorkerRequest): Promise<WorkerReply<K>> {
    const id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { callbacks.current.delete(id); reject(new Error('worker timeout')); }, 30_000);
      callbacks.current.set(id, (res) => {
        clearTimeout(timer);
        if (res.type === 'error') reject(new Error(res.msg));
        else resolve(res as WorkerReply<K>);
      });
      workerRef.current!.postMessage({ ...req, id } as WorkerInMessage);
    });
  }

  async function run(label: string, action: () => Promise<Partial<RbeState> | ((prev: RbeState) => Partial<RbeState>)>) {
    setS((prev) => ({ ...prev, busy: true, busyLabel: label, error: null }));
    try {
      const patch = await action();
      setS((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch), busy: false, busyLabel: '' }));
    } catch (e) {
      setS((prev) => ({ ...prev, busy: false, busyLabel: '', error: e instanceof Error ? e.message : String(e) }));
    }
  }

  async function api<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
    return data as T;
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  const doSetup = () => run(t('busyInit'), async () => {
    const session = await api<ApiSessionResponse>('/api/rbe/session', { method: 'POST' });
    const res = await callWorker<'init_done'>({ type: 'init', seed: session.seed });
    return { sessionId: session.sessionId, seed: session.seed, crsPreview: res.preview, crsMs: res.ms };
  });

  const doKeyGen = (who: UserName) => run(t('busyKeyGen', { name: DISPLAY[who] }), async () => {
    const res = await callWorker<'keygen_done'>({ type: 'keygen' });
    return (prev) => ({ users: { ...prev.users, [who]: { keys: { pk: res.pk, sk: res.sk }, registered: false } } });
  });

  const doRegister = (who: UserName) => run(t('busyRegister', { name: DISPLAY[who] }), async () => {
    const keys = s.users[who].keys!;
    const res = await api<ApiRegisterResponse>('/api/rbe/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: s.sessionId, name: who, pk: keys.pk }),
    });
    return (prev) => ({ mpk: res.mpk, users: { ...prev.users, [who]: { ...prev.users[who], registered: true } } });
  });

  const doAudit = () => run(t('busyAudit'), async () => {
    const res = await callWorker<'verify_mpk_done'>({
      type: 'verify_mpk',
      users: USER_NAMES.map((u) => ({ id: IDENTITY[u], pk: s.users[u].keys!.pk })),
      mpk: s.mpk!,
    });
    return { audit: { match: res.match, ms: res.ms } };
  });

  const doEncrypt = (to: Recipient) => run(t('busyEncrypt', { name: DISPLAY[to] }), async () => {
    const res = await callWorker<'encrypt_done'>({ type: 'encrypt', mpk: s.mpk!, target: IDENTITY[to], message: s.msg[to] });
    return (prev) => ({ ct: { ...prev.ct, [to]: { ct: res.ct, ms: res.ms } } });
  });

  const updateDec = (to: Recipient, patch: Partial<DecState>) => (prev: RbeState) =>
    ({ dec: { ...prev.dec, [to]: { ...prev.dec[to], ...patch } } });

  const doFetchHsk = (to: Recipient) => run(t('busyFetchHsk', { name: DISPLAY[to] }), async () => {
    const qs = new URLSearchParams({ sessionId: s.sessionId!, name: to });
    const res = await api<ApiHskResponse>(`/api/rbe/hsk?${qs}`);
    return updateDec(to, { hsk: res.hsk, hskNorm: res.norm });
  });

  const doDecStep1 = (to: Recipient) => run(t('busyDecStep1', { name: DISPLAY[to] }), async () => {
    const res = await callWorker<'dec_step1_done'>({ type: 'dec_step1', ct: s.ct[to]!.ct, hsk: s.dec[to].hsk! });
    return updateDec(to, { ctReg: res.ctReg });
  });

  const doDecStep2 = (to: Recipient) => run(t('busyDecStep2', { name: DISPLAY[to] }), async () => {
    const res = await callWorker<'dec_step2_done'>({ type: 'dec_step2', ctReg: s.dec[to].ctReg!, sk: s.users[to].keys!.sk });
    return updateDec(to, { message: res.message, noise: res.noise });
  });

  // Alice applies her own hsk and sk to Bob's ciphertext
  const doAttack = () => run(t('busyAttack'), async () => {
    const step1 = await callWorker<'dec_step1_done'>({ type: 'dec_step1', ct: s.ct.bob!.ct, hsk: s.dec.alice.hsk! });
    const step2 = await callWorker<'dec_step2_done'>({ type: 'dec_step2', ctReg: step1.ctReg, sk: s.users.alice.keys!.sk });
    return { attack: { message: step2.message, noise: step2.noise } };
  });

  const reset = () => setS(initialState(t('defaultMsgForBob'), t('defaultMsgForAlice')));

  // ── Progress ────────────────────────────────────────────────────────────────

  const hasSetup = !!s.seed;
  const regCount = USER_NAMES.filter((u) => s.users[u].registered).length;
  const allReg = regCount === USER_NAMES.length;
  const bothCts = !!s.ct.bob && !!s.ct.alice;
  const bothDecoded = s.dec.bob.message !== null && s.dec.alice.message !== null;
  const noiseLabel = (pct: number) => t('noiseLabel', { pct: fmt(pct, 1) });

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {s.error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 font-mono text-sm text-red-300">
          {t('errorLabel')} {s.error}
        </div>
      )}
      {s.busy && (
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-4 py-2.5" aria-live="polite">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--color-primary)] border-t-transparent animate-spin flex-shrink-0" />
          <span className="font-mono text-sm text-[var(--color-primary)]">{s.busyLabel}</span>
        </div>
      )}

      {/* ── Intro ── */}
      <Card>
        <p className="font-mono text-xs text-[var(--color-primary)] mb-2">{t('introComment')}</p>
        <div className="text-sm text-[var(--color-text-muted)] leading-relaxed space-y-3">
          <p>{t('intro1')}</p>
          <p>{rich('intro2')}</p>
          <p>{rich('intro3')}</p>
        </div>
      </Card>

      {/* ── Step 0: Setup ── */}
      <Card active={!hasSetup} done={hasSetup}>
        <StepTitle n={0} title={t('step0Title')} done={hasSetup} doneLbl={t('stepDone')} />
        <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{rich('step0Text', { blocks: P.ell + 1 })}</p>
        <Formula tex={`R_q = \\mathbb{Z}_q[X]/(X^{${P.nR}}+1),\\quad q = ${P.q.toLocaleString('en').replace(/,/g, '\\,')},\\qquad A = [A_0 \\mid \\dots \\mid A_{${P.ell}}] \\in R_q^{${P.n}\\times ${DV.width}}`} />
        <Btn variant="primary" onClick={doSetup} disabled={hasSetup} busy={s.busy}>{t('step0Btn')}</Btn>
        {s.seed && s.crsPreview && (
          <div className="mt-5 space-y-3">
            <ValueBox label={t('step0Seed')} value={s.seed} />
            <ValueBox label={t('step0Expanded', { ms: fmt(s.crsMs ?? 0) })} value={`[${s.crsPreview.join(', ')}, …]`} />
            <Callout>{rich('step0Callout')}</Callout>
          </div>
        )}
      </Card>

      {/* ── Steps 1–3: Registration ── */}
      {hasSetup && (
        <Card active={!allReg} done={allReg}>
          <StepTitle n="1–3" title={t('step13Title')} done={allReg} doneLbl={t('stepDone')} />
          <div className="text-sm text-[var(--color-text-muted)] leading-relaxed space-y-2">
            <p>{rich('step13Text1')}</p>
            <p>{rich('step13Text2', { ell: P.ell, d: DV.d })}</p>
          </div>
          <Formula tex={'\\mathit{pk}_i = (B_i \\mid B_i s_i + e_i),\\qquad \\mathit{mpk} = \\sum_i A_{\\delta_i}\\, G^{-1}(\\mathit{pk}_i)'} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {USER_NAMES.map((u) => (
              <div key={u} className="rounded-lg border border-[var(--color-glass-border)] p-4 space-y-3 bg-[var(--color-bg-base)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-sm font-semibold text-[var(--color-text-base)]">{DISPLAY[u]}</span>
                  {s.users[u].registered && (
                    <span className="text-xs font-mono text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      {t('userRegistered')}
                    </span>
                  )}
                </div>
                <p className="font-mono text-xs text-[var(--color-text-muted)]">
                  {t('identityLabel', { id: IDENTITY[u], bits: bits(IDENTITY[u]) })}
                </p>
                {!s.users[u].keys ? (
                  <Btn onClick={() => doKeyGen(u)} busy={s.busy}>{t('userBtnKeyGen')}</Btn>
                ) : (
                  <div className="space-y-2">
                    <ValueBox label={t('userSkLabel')} value={centeredPreview(s.users[u].keys!.sk, 3)} secret />
                    <ValueBox label={t('userPkLabel')} value={centeredPreview(s.users[u].keys!.pk, 3)} />
                    {!s.users[u].registered && (
                      <Btn onClick={() => doRegister(u)} busy={s.busy}>{t('userBtnRegister')}</Btn>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          {s.mpk && (
            <div className="mt-5 space-y-3">
              <ValueBox label={t('mpkLabel', { count: regCount, max: P.nMax })} value={centeredPreview(s.mpk, 5)} />
              {allReg && (
                <>
                  <Callout variant="success">{rich('step13Done', { max: P.nMax, k: P.n * P.k })}</Callout>
                  {!s.audit ? (
                    <Btn onClick={doAudit} busy={s.busy}>{t('auditBtn')}</Btn>
                  ) : (
                    <Callout variant={s.audit.match ? 'success' : 'danger'}>
                      {s.audit.match ? rich('auditMatch', { ms: fmt(s.audit.ms) }) : rich('auditMismatch')}
                    </Callout>
                  )}
                </>
              )}
            </div>
          )}
        </Card>
      )}

      {/* ── Step 4: Encryption ── */}
      {allReg && (
        <Card active={!bothCts} done={bothCts}>
          <StepTitle n={4} title={t('step4Title')} done={bothCts} doneLbl={t('stepDone')} />
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{rich('step4Text')}</p>
          <Formula tex={'\\mathit{ct}_0 = r\\,(A - \\tilde{\\imath}\\otimes G) + e_0,\\qquad \\mathit{ct}_1 = r\\cdot\\mathit{mpk} + \\lfloor q/2\\rfloor\\,(0,\\ \\mathit{msg}) + e_1'} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(['bob', 'alice'] as const).map((to) => {
              const used = utf8Length(s.msg[to]);
              const ct = s.ct[to];
              return (
                <div key={to} className="space-y-3">
                  <label className="block">
                    <span className="block mb-1.5 font-mono text-xs text-[var(--color-text-muted)]">
                      {t(to === 'bob' ? 'msgForBobLabel' : 'msgForAliceLabel')}
                    </span>
                    <input
                      type="text"
                      value={s.msg[to]}
                      disabled={!!ct}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (utf8Length(v) <= MAX_BYTES) setS((prev) => ({ ...prev, msg: { ...prev.msg, [to]: v } }));
                      }}
                      className="w-full rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-base)] px-3 py-2
                        font-mono text-sm text-[var(--color-text-base)]
                        focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30
                        disabled:opacity-40 disabled:cursor-not-allowed"
                    />
                    <span className="mt-1 block font-mono text-xs text-[var(--color-text-muted)]">
                      {t('bytesLeft', { used, max: MAX_BYTES })}
                    </span>
                  </label>
                  <Btn variant="primary" onClick={() => doEncrypt(to)} disabled={!!ct || used === 0} busy={s.busy}>
                    {t(to === 'bob' ? 'btnEncryptBob' : 'btnEncryptAlice')}
                  </Btn>
                  {ct && (
                    <div className="space-y-2">
                      <p className="font-mono text-xs text-amber-300/90">{t('ctBoundTo', { id: IDENTITY[to], bits: bits(IDENTITY[to]) })}</p>
                      <ValueBox label="ct0" value={centeredPreview(ct.ct.ct0, 4)} />
                      <ValueBox label="ct1" value={centeredPreview(ct.ct.ct1, 4)} />
                      <p className="font-mono text-xs text-[var(--color-text-muted)]">
                        {t('ctSummary', { ct0: ct.ct.ct0.cols, ct1: ct.ct.ct1.cols, kib: kib(ct.ct.ct0, ct.ct.ct1), ms: fmt(ct.ms) })}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {bothCts && (
            <div className="mt-5">
              <Callout variant="warn">{rich('step4Obs', { bob: bits(IDENTITY.bob), alice: bits(IDENTITY.alice) })}</Callout>
            </div>
          )}
        </Card>
      )}

      {/* ── Step 5: Decryption ── */}
      {bothCts && (
        <Card active={!bothDecoded} done={bothDecoded}>
          <StepTitle n={5} title={t('step5Title')} done={bothDecoded} doneLbl={t('stepDone')} />
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{rich('step5Text')}</p>
          <Formula tex={'\\mathit{hsk}_i = \\sum_j H_{\\delta_j,i}\\, G^{-1}(\\mathit{pk}_j),\\qquad (A - \\tilde{\\imath}\\otimes G)\\cdot\\mathit{hsk}_i = \\mathit{mpk} - \\mathit{pk}_i'} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {(['bob', 'alice'] as const).map((to) => {
              const d = s.dec[to];
              return (
                <div key={to} className="rounded-lg border border-[var(--color-glass-border)] p-4 space-y-4 bg-[var(--color-bg-base)]">
                  <span className="font-mono text-sm font-semibold text-[var(--color-text-base)]">{DISPLAY[to]}</span>
                  <div className="space-y-2">
                    <Btn onClick={() => doFetchHsk(to)} disabled={!!d.hsk} busy={s.busy}>{t('decBtnFetchHsk')}</Btn>
                    {d.hsk && (
                      <p className="font-mono text-xs text-[var(--color-text-muted)]">
                        {t('hskSummary', { name: to, rows: d.hsk.rows, cols: d.hsk.cols, norm: fmt(d.hskNorm ?? 0) })}
                      </p>
                    )}
                  </div>
                  {d.hsk && (
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{rich('decStep1Text')}</p>
                      <Btn onClick={() => doDecStep1(to)} disabled={!!d.ctReg} busy={s.busy}>{t('decBtnStep1')}</Btn>
                      {d.ctReg && <ValueBox label={t('decStep1Result', { name: to })} value={centeredPreview(d.ctReg, 4)} />}
                    </div>
                  )}
                  {d.ctReg && (
                    <div className="space-y-2">
                      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">{rich('decStep2Text')}</p>
                      <Btn variant="primary" onClick={() => doDecStep2(to)} disabled={d.message !== null} busy={s.busy}>{t('decBtnStep2')}</Btn>
                      {d.message !== null && (
                        <div className="space-y-2">
                          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/8 px-3 py-2">
                            <p className="font-mono text-xs text-emerald-400/70 mb-1">{t('readsLabel', { name: DISPLAY[to] })}</p>
                            <p className="font-mono text-sm text-emerald-300 break-all">&quot;{d.message}&quot;</p>
                          </div>
                          <NoiseBar noise={d.noise ?? 0} label={noiseLabel} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {bothDecoded && <div className="mt-5"><Callout variant="success">{rich('step5Done')}</Callout></div>}
        </Card>
      )}

      {/* ── Step 6: Alice tries Bob's ciphertext ── */}
      {bothDecoded && (
        <Card active={!s.attack} done={!!s.attack}>
          <StepTitle n={6} title={t('step6Title')} done={!!s.attack} doneLbl={t('stepDone')} />
          <div className="text-sm text-[var(--color-text-muted)] leading-relaxed space-y-2 mb-4">
            <p>{rich('step6Text1')}</p>
            <p>{rich('step6Text2')}</p>
          </div>
          <Btn variant="danger" onClick={doAttack} disabled={!!s.attack} busy={s.busy}>{t('btnAttack')}</Btn>
          {s.attack && (
            <div className="mt-4 space-y-3">
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3">
                <p className="font-mono text-xs text-red-400/70 mb-1">{t('aliceReadsLabel')}</p>
                <p className="font-mono text-sm text-red-300 break-all">
                  {s.attack.message.length > 0 ? `"${s.attack.message}"` : <span className="italic">{t('emptyOutput')}</span>}
                </p>
              </div>
              <NoiseBar noise={s.attack.noise} label={noiseLabel} />
              <Callout variant="success">{rich('step6Done')}</Callout>
              <button
                onClick={reset}
                className="font-mono text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] underline cursor-pointer"
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
