'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import type {
  WorkerInMessage, WorkerOutMessage,
  ApiSetupResponse, ApiRegisterResponse, ApiHskResponse,
} from '@/lib/rbe-types';
import { N, Q, B } from '@/lib/rbe/params';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserKeys { pk: number[]; sk: number[] }

interface RbeState {
  // KC
  sessionId:  string | null;
  a:          number[] | null;
  // Users
  alice:      UserKeys | null;
  aliceRegistered: boolean;
  bob:        UserKeys | null;
  bobRegistered:   boolean;
  mpkAgg:     number[] | null;
  // Encryption
  plaintext:  string;
  c0:         number[] | null;
  c1:         number[] | null;
  // Decryption
  hsk:        number[] | null;
  temp:       number[] | null;
  decryptedMsg: string | null;
  // UI
  busy:       boolean;
  busyLabel:  string;
  error:      string | null;
}

const INIT: RbeState = {
  sessionId: null, a: null,
  alice: null, aliceRegistered: false,
  bob: null,   bobRegistered: false,
  mpkAgg: null,
  plaintext: 'Hallo Bob!',
  c0: null, c1: null,
  hsk: null, temp: null, decryptedMsg: null,
  busy: false, busyLabel: '', error: null,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function StepHeader({ n, title, done }: { n: number; title: string; done?: boolean }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold
        ${done ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/30'}`}>
        {done ? '✓' : n}
      </span>
      <h3 className="font-semibold text-[var(--color-text-base)]">{title}</h3>
    </div>
  );
}

function Callout({ variant, children }: { variant: 'info' | 'warn' | 'lock'; children: React.ReactNode }) {
  const styles = {
    info: 'border-[var(--color-accent)]/30 bg-[var(--color-accent)]/5 text-[var(--color-text-muted)]',
    warn: 'border-amber-500/30 bg-amber-500/5 text-amber-300',
    lock: 'border-red-500/30 bg-red-500/5 text-red-300',
  };
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${styles[variant]}`}>
      {children}
    </div>
  );
}

function PolyDisplay({ label, poly, highlight }: { label: string; poly: number[]; highlight?: boolean }) {
  const preview = poly.slice(0, 6).map(v => v.toString()).join(', ');
  const maxVal  = Math.max(...poly);
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-base)] px-4 py-3">
      <div className="flex items-center justify-between mb-1">
        <span className={`font-mono text-xs ${highlight ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-dim)]'}`}>
          {label}
        </span>
        <span className="font-mono text-xs text-[var(--color-text-dim)]">
          max={maxVal} · {N} Koeff.
        </span>
      </div>
      <code className="font-mono text-xs text-[var(--color-text-muted)] break-all">
        [{preview}, …]
      </code>
    </div>
  );
}

function ActionButton({
  onClick, disabled, busy, children,
}: {
  onClick: () => void; disabled?: boolean; busy?: boolean; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
        bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/30 text-[var(--color-accent)]
        hover:bg-[var(--color-accent)]/20 disabled:opacity-40 disabled:cursor-not-allowed
        transition-colors"
    >
      {busy && <span className="w-3 h-3 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin" />}
      {children}
    </button>
  );
}

// ── Main playground ───────────────────────────────────────────────────────────

export default function RbePlayground() {
  const [s, setS]           = useState<RbeState>(INIT);
  const workerRef           = useRef<Worker | null>(null);
  const callbacksRef        = useRef<Map<string, (msg: WorkerOutMessage) => void>>(new Map());

  // ── Worker lifecycle ───────────────────────────────────────────────────────

  useEffect(() => {
    const w = new Worker(new URL('../workers/rbe-worker.ts', import.meta.url));
    w.onmessage = (ev: MessageEvent<WorkerOutMessage>) => {
      const cb = callbacksRef.current.get(ev.data.id);
      if (cb) { callbacksRef.current.delete(ev.data.id); cb(ev.data); }
    };
    workerRef.current = w;
    return () => w.terminate();
  }, []);

  const callWorker = useCallback(<T extends WorkerOutMessage>(msg: WorkerInMessage): Promise<T> => {
    return new Promise((resolve, reject) => {
      callbacksRef.current.set(msg.id, (res) => {
        if (res.type === 'error') reject(new Error((res as { msg: string }).msg));
        else resolve(res as T);
      });
      workerRef.current!.postMessage(msg);
    });
  }, []);

  const busy = useCallback((label: string) => setS(p => ({ ...p, busy: true, busyLabel: label, error: null })), []);
  const done = useCallback(() => setS(p => ({ ...p, busy: false, busyLabel: '' })), []);
  const err  = useCallback((e: unknown) => {
    setS(p => ({ ...p, busy: false, busyLabel: '', error: e instanceof Error ? e.message : String(e) }));
  }, []);

  const uid = () => crypto.randomUUID();

  // ── Step 0: KC Setup ───────────────────────────────────────────────────────

  const doSetup = useCallback(async () => {
    busy('KC wird initialisiert…');
    try {
      const res  = await fetch('/api/rbe/session', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as ApiSetupResponse;
      setS(p => ({ ...p, sessionId: data.sessionId, a: data.a, busy: false }));
    } catch (e) { err(e); }
  }, [busy, err]);

  // ── Step 1+2: KeyGen ───────────────────────────────────────────────────────

  const doKeyGen = useCallback(async (who: 'alice' | 'bob') => {
    if (!s.a) return;
    busy(`${who === 'alice' ? 'Alice' : 'Bob'}: Schlüssel werden generiert…`);
    try {
      const res = await callWorker<{ id: string; type: 'keygen_done'; pk: number[]; sk: number[]; ms: number }>({
        id: uid(), type: 'keygen', a: s.a,
      });
      setS(p => ({
        ...p,
        [who]: { pk: res.pk, sk: res.sk },
        busy: false,
      }));
    } catch (e) { err(e); }
  }, [s.a, busy, callWorker, err]);

  // ── Step 1+2: Register ────────────────────────────────────────────────────

  const doRegister = useCallback(async (who: 'alice' | 'bob') => {
    const keys = who === 'alice' ? s.alice : s.bob;
    if (!s.sessionId || !keys) return;
    busy(`${who === 'alice' ? 'Alice' : 'Bob'} wird beim KC registriert…`);
    try {
      const res = await fetch('/api/rbe/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: s.sessionId, userId: who, pk: keys.pk }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json() as ApiRegisterResponse;
      setS(p => ({
        ...p,
        [`${who}Registered`]: true,
        mpkAgg: data.mpkAgg,
        busy: false,
      }));
    } catch (e) { err(e); }
  }, [s.sessionId, s.alice, s.bob, busy, err]);

  // ── Step 3: Encrypt ───────────────────────────────────────────────────────

  const doEncrypt = useCallback(async () => {
    if (!s.a || !s.mpkAgg) return;
    busy('Charlie verschlüsselt…');
    try {
      const res = await callWorker<{ id: string; type: 'encrypt_done'; c0: number[]; c1: number[]; ms: number }>({
        id: uid(), type: 'encrypt', a: s.a, mpkAgg: s.mpkAgg, msg: s.plaintext,
      });
      setS(p => ({ ...p, c0: res.c0, c1: res.c1, busy: false }));
    } catch (e) { err(e); }
  }, [s.a, s.mpkAgg, s.plaintext, busy, callWorker, err]);

  // ── Step 4: Fetch hsk ─────────────────────────────────────────────────────

  const doFetchHsk = useCallback(async () => {
    if (!s.sessionId) return;
    busy('hsk_bob wird vom KC geladen…');
    try {
      const res = await fetch(`/api/rbe/hsk?sessionId=${s.sessionId}&targetId=bob`);
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      const data = await res.json() as ApiHskResponse;
      setS(p => ({ ...p, hsk: data.hsk, busy: false }));
    } catch (e) { err(e); }
  }, [s.sessionId, busy, err]);

  // ── Step 5: Decrypt ───────────────────────────────────────────────────────

  const doDecryptStep1 = useCallback(async () => {
    if (!s.c0 || !s.c1 || !s.hsk) return;
    busy('Schritt 1: temp = c1 − c0·hsk');
    try {
      const res = await callWorker<{ id: string; type: 'dec_step1_done'; temp: number[]; ms: number }>({
        id: uid(), type: 'dec_step1', c0: s.c0, c1: s.c1, hsk: s.hsk,
      });
      setS(p => ({ ...p, temp: res.temp, busy: false }));
    } catch (e) { err(e); }
  }, [s.c0, s.c1, s.hsk, busy, callWorker, err]);

  const doDecryptStep2 = useCallback(async () => {
    if (!s.c0 || !s.temp || !s.bob) return;
    busy('Schritt 2: result = temp − c0·sk');
    try {
      const res = await callWorker<{ id: string; type: 'dec_step2_done'; result: number[]; msg: string; ms: number }>({
        id: uid(), type: 'dec_step2', c0: s.c0, temp: s.temp, sk: s.bob.sk,
      });
      setS(p => ({ ...p, decryptedMsg: res.msg, busy: false }));
    } catch (e) { err(e); }
  }, [s.c0, s.temp, s.bob, busy, callWorker, err]);

  // ── Render ────────────────────────────────────────────────────────────────

  const step = (
    s.decryptedMsg !== null ? 8 :
    s.temp !== null         ? 7 :
    s.hsk !== null          ? 6 :
    s.c0 !== null           ? 5 :
    s.bobRegistered         ? 4 :
    s.bob !== null          ? 3 :
    s.aliceRegistered       ? 3 :
    s.alice !== null        ? 2 :
    s.a !== null            ? 1 :
    0
  );

  return (
    <div className="space-y-6">

      {/* ── Global error ── */}
      {s.error && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300 font-mono">
          Fehler: {s.error}
        </div>
      )}

      {/* ── Loading bar ── */}
      {s.busy && (
        <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-[var(--color-accent)]/5 border border-[var(--color-accent)]/20">
          <span className="w-3 h-3 rounded-full border-2 border-[var(--color-accent)] border-t-transparent animate-spin flex-shrink-0" />
          <span className="text-sm font-mono text-[var(--color-accent)]">{s.busyLabel}</span>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Step 0 — KC Setup
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-6">
        <StepHeader n={0} title="KC-Setup: Common Reference String erzeugen" done={step >= 1} />

        <p className="text-sm text-[var(--color-text-muted)] mb-4">
          Der Key Curator initialisiert das System: Er sampelt ein zufälliges Polynom{' '}
          <code className="font-mono text-[var(--color-accent)]">a ∈ R_q</code> (öffentlich) und berechnet
          dessen Inverses <code className="font-mono text-[var(--color-accent)]">a⁻¹</code> (sein privater Trapdoor).
        </p>

        <ActionButton onClick={doSetup} disabled={step >= 1} busy={s.busy}>
          KC initialisieren
        </ActionButton>

        {s.a && (
          <div className="mt-4 space-y-3">
            <PolyDisplay label="a (CRS — öffentlich, unveränderlich)" poly={s.a} highlight />
            <Callout variant="info">
              <strong>a ist vollständig öffentlich</strong> — kein CA-Geheimnis.
              Der Trapdoor a⁻¹ existiert nur auf dem KC-Server und ist nie zugänglich.
              Demo-Session läuft 30 Minuten. N_max = 5 Nutzer.
            </Callout>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          Step 1 — Alice
      ══════════════════════════════════════════════════════════════════════ */}
      {step >= 1 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-6">
          <StepHeader n={1} title="Alice registriert sich" done={s.aliceRegistered} />

          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            Alice generiert ihr Schlüsselpaar <strong>lokal im Browser</strong> (Ring-LWE:{' '}
            <code className="font-mono text-[var(--color-accent)]">sk ← klein; pk = a·sk + e</code>).
            Nur <code className="font-mono">pk</code> wird an den KC übermittelt.
          </p>

          <div className="flex flex-wrap gap-3 mb-4">
            <ActionButton onClick={() => doKeyGen('alice')} disabled={!!s.alice} busy={s.busy}>
              KeyGen im Browser
            </ActionButton>
            <ActionButton
              onClick={() => doRegister('alice')}
              disabled={!s.alice || s.aliceRegistered}
              busy={s.busy}
            >
              Beim KC registrieren
            </ActionButton>
          </div>

          {s.alice && (
            <div className="space-y-3">
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-2">
                <span className="text-xs font-mono text-red-300 flex items-center gap-1">
                  <span>🔒</span> sk_alice — bleibt im Browser, verlässt dieses Tab nie
                </span>
                <PolyDisplay label="sk_alice (geheim)" poly={s.alice.sk} />
              </div>
              <PolyDisplay label="pk_alice (→ KC)" poly={s.alice.pk} highlight />
            </div>
          )}

          {s.aliceRegistered && s.mpkAgg && (
            <div className="mt-3">
              <PolyDisplay label="mpkAgg nach Alice = pk_alice" poly={s.mpkAgg} />
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Step 2 — Bob
      ══════════════════════════════════════════════════════════════════════ */}
      {s.aliceRegistered && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-6">
          <StepHeader n={2} title="Bob registriert sich" done={s.bobRegistered} />

          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            Bob generiert unabhängig sein eigenes Schlüsselpaar.
            Nach seiner Registrierung gilt:{' '}
            <code className="font-mono text-[var(--color-accent)]">mpkAgg = pk_alice + pk_bob</code>.
          </p>

          <div className="flex flex-wrap gap-3 mb-4">
            <ActionButton onClick={() => doKeyGen('bob')} disabled={!!s.bob} busy={s.busy}>
              KeyGen im Browser
            </ActionButton>
            <ActionButton
              onClick={() => doRegister('bob')}
              disabled={!s.bob || s.bobRegistered}
              busy={s.busy}
            >
              Beim KC registrieren
            </ActionButton>
          </div>

          {s.bob && (
            <div className="space-y-3">
              <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 space-y-2">
                <span className="text-xs font-mono text-red-300 flex items-center gap-1">
                  <span>🔒</span> sk_bob — bleibt im Browser
                </span>
                <PolyDisplay label="sk_bob (geheim)" poly={s.bob.sk} />
              </div>
              <PolyDisplay label="pk_bob (→ KC)" poly={s.bob.pk} highlight />
            </div>
          )}

          {s.bobRegistered && s.mpkAgg && (
            <div className="mt-3 space-y-2">
              <PolyDisplay label="mpkAgg = pk_alice + pk_bob (öffentlich)" poly={s.mpkAgg} highlight />
              <Callout variant="info">
                Der mpkAgg wächst mit jedem neuen Nutzer. Der Sender braucht nur diesen
                einen Wert — kein Zertifikat, keine CA-Abfrage.
              </Callout>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Step 3 — Charlie verschlüsselt
      ══════════════════════════════════════════════════════════════════════ */}
      {s.bobRegistered && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-6">
          <StepHeader n={3} title="Charlie verschlüsselt für Bob" done={!!s.c0} />

          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            Charlie kennt nur Bobs Identität (<code className="font-mono text-[var(--color-accent)]">&quot;bob&quot;</code>)
            und den öffentlichen <code className="font-mono text-[var(--color-accent)]">mpkAgg</code>.
            Kein Zertifikat, keine PKI-Abfrage.{' '}
            <code className="font-mono text-xs">c0 = r·a ; c1 = r·mpkAgg + encode(msg)</code>
          </p>

          <div className="mb-4">
            <label className="block text-xs font-mono text-[var(--color-text-dim)] mb-1">
              Nachricht (max. 32 Zeichen)
            </label>
            <input
              type="text"
              maxLength={32}
              value={s.plaintext}
              onChange={e => setS(p => ({ ...p, plaintext: e.target.value }))}
              disabled={!!s.c0}
              className="w-full max-w-sm rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-base)]
                px-3 py-2 text-sm font-mono text-[var(--color-text-base)]
                focus:outline-none focus:border-[var(--color-accent)]/60
                disabled:opacity-50"
            />
          </div>

          <ActionButton onClick={doEncrypt} disabled={!!s.c0} busy={s.busy}>
            Verschlüsseln
          </ActionButton>

          {s.c0 && s.c1 && (
            <div className="mt-4 space-y-3">
              <PolyDisplay label="c0 = r·a" poly={s.c0} />
              <PolyDisplay label="c1 = r·mpkAgg + encode(msg)" poly={s.c1} />
              <Callout variant="warn">
                Diese Koeffizienten sehen zufällig aus — der Chiffretext verrät nichts
                ohne hsk + sk. Weder der KC noch Alice können allein entschlüsseln.
              </Callout>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Step 4 — hsk laden
      ══════════════════════════════════════════════════════════════════════ */}
      {s.c0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-6">
          <StepHeader n={4} title="Bob lädt seinen Helper Decryption Key" done={!!s.hsk} />

          <p className="text-sm text-[var(--color-text-muted)] mb-4">
            Der KC berechnet mit seinem Trapdoor:{' '}
            <code className="font-mono text-[var(--color-accent)] text-xs">
              hsk_bob = a⁻¹ · (mpkAgg − pk_bob) = a⁻¹ · pk_alice
            </code>.{' '}
            Eigenschaft: <code className="font-mono text-xs">a · hsk_bob = pk_alice</code> (exakt).
          </p>

          <ActionButton onClick={doFetchHsk} disabled={!!s.hsk} busy={s.busy}>
            hsk_bob vom KC laden
          </ActionButton>

          {s.hsk && (
            <div className="mt-4 space-y-3">
              <PolyDisplay label="hsk_bob (öffentlich übertragbar)" poly={s.hsk} highlight />
              <Callout variant="info">
                <strong>hsk ist kein Geheimnis</strong> — jeder darf ihn sehen.
                Allein reicht er trotzdem nicht zur Entschlüsselung: der Zwischenwert
                im nächsten Schritt ist noch Ring-LWE-verschlüsselt unter pk_bob.
              </Callout>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          Step 5 — Entschlüsselung (zwei Schritte)
      ══════════════════════════════════════════════════════════════════════ */}
      {s.hsk && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-6">
          <StepHeader n={5} title="Bob entschlüsselt — Zwei-Faktor-Dekryption" done={s.decryptedMsg !== null} />

          {/* Step 5a */}
          <div className="mb-6">
            <p className="text-sm text-[var(--color-text-muted)] mb-3">
              <span className="font-mono text-[var(--color-accent)]">Schritt 1</span>{' '}
              hsk transformiert den Chiffretext:{' '}
              <code className="font-mono text-xs">temp = c1 − c0·hsk_bob = r·pk_bob + encode(msg)</code>
            </p>
            <ActionButton onClick={doDecryptStep1} disabled={!!s.temp} busy={s.busy}>
              temp berechnen
            </ActionButton>
            {s.temp && (
              <div className="mt-3 space-y-2">
                <PolyDisplay label="temp = r·pk_bob + encode(msg)" poly={s.temp} />
                <Callout variant="warn">
                  Dies ist eine Ring-LWE-Verschlüsselung von encode(msg) unter pk_bob.
                  Ohne sk_bob ist das immer noch nicht lesbar — hsk allein reicht nicht.
                </Callout>
              </div>
            )}
          </div>

          {/* Step 5b */}
          {s.temp && (
            <div>
              <p className="text-sm text-[var(--color-text-muted)] mb-3">
                <span className="font-mono text-[var(--color-accent)]">Schritt 2</span>{' '}
                sk_bob löst die letzte Schicht:{' '}
                <code className="font-mono text-xs">result = temp − c0·sk_bob = r·e_bob + encode(msg) ≈ encode(msg)</code>
              </p>
              <ActionButton onClick={doDecryptStep2} disabled={s.decryptedMsg !== null} busy={s.busy}>
                Mit sk_bob entschlüsseln
              </ActionButton>

              {s.decryptedMsg !== null && (
                <div className="mt-4 space-y-3">
                  <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-4">
                    <p className="text-xs font-mono text-emerald-400 mb-1">// Entschlüsselte Nachricht</p>
                    <p className="text-xl font-mono text-emerald-300 tracking-wide">
                      &quot;{s.decryptedMsg}&quot;
                    </p>
                  </div>
                  <Callout variant="info">
                    <strong>Zusammenfassung:</strong> Alice hat sich registriert, ohne dass der
                    KC ihre sk je gesehen hat. Charlie hat unter mpkAgg verschlüsselt — ohne
                    Zertifikat. Bob hat hsk (öffentlich) + sk (privat) kombiniert. Weder der KC
                    noch Alice konnten allein entschlüsseln.
                  </Callout>
                  <button
                    onClick={() => setS({ ...INIT })}
                    className="text-xs font-mono text-[var(--color-text-dim)] hover:text-[var(--color-text-muted)] underline"
                  >
                    Demo zurücksetzen
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
