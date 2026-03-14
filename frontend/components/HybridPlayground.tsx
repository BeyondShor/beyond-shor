'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { x25519 } from '@noble/curves/ed25519.js';
import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';
import { mceliece } from 'mceliece';
import { createFrodoKEM1344AES } from '@oqs/liboqs-js';

// ── Snippet constants ──────────────────────────────────────────────────────

const MLKEM_SNIPPET = `import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';

const { publicKey, secretKey } = ml_kem1024.keygen();
const { cipherText, sharedSecret } = ml_kem1024.encapsulate(publicKey);`;

const MCELIECE_SNIPPET = `import { mceliece } from 'mceliece';

// Yield so the loading UI renders before the WASM call
// blocks the JS event loop for up to 30 seconds
await new Promise(r => setTimeout(r, 80));

const { publicKey, privateKey } = await mceliece.keyPair();
const { cyphertext, secret } = await mceliece.encrypt(publicKey);`;

const FRODOKEM_SNIPPET = `import { createFrodoKEM1344AES } from '@oqs/liboqs-js';

// Factory initialises the WASM module (async, ~fast)
const kem = await createFrodoKEM1344AES();

const { publicKey, secretKey } = kem.generateKeyPair();
const { ciphertext, sharedSecret } = kem.encapsulate(publicKey);

kem.destroy(); // free WASM heap memory`;

// ── Types ──────────────────────────────────────────────────────────────────

type KemAlgorithm = 'mlkem' | 'mceliece' | 'frodokem';

interface PlaygroundState {
  clientX25519Priv: Uint8Array;
  clientX25519Pub:  Uint8Array;
  serverX25519Priv: Uint8Array;
  serverX25519Pub:  Uint8Array;
  kemServerPriv:    Uint8Array;
  kemServerPub:     Uint8Array;
  x25519Secret:     Uint8Array;
  kemCiphertext:    Uint8Array;
  kemSecret:        Uint8Array;
  combinedKey:      Uint8Array;
  iv:               Uint8Array;
  ciphertext:       Uint8Array;
  decrypted:        string;
  kem:              KemAlgorithm;
  kemKeygenMs:      number;
}

type Phase = 'idle' | 'running' | 'done' | 'error';

// ── Helpers ────────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024)        return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function truncateHex(hex: string, head = 32, tail = 16): string {
  if (hex.length <= head + tail + 3) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

async function runCrypto(plaintext: string, kem: KemAlgorithm): Promise<PlaygroundState> {
  // Step 1 — X25519 key generation (both sides)
  const clientX25519Priv = x25519.utils.randomSecretKey();
  const clientX25519Pub  = x25519.getPublicKey(clientX25519Priv);
  const serverX25519Priv = x25519.utils.randomSecretKey();
  const serverX25519Pub  = x25519.getPublicKey(serverX25519Priv);

  // Step 1 — KEM key generation (server side)
  let kemServerPriv: Uint8Array;
  let kemServerPub:  Uint8Array;
  let kemCiphertext: Uint8Array;
  let kemSecret:     Uint8Array;

  let kemKeygenMs: number;

  if (kem === 'mlkem') {
    const t0 = performance.now();
    const { publicKey, secretKey } = ml_kem1024.keygen();
    kemKeygenMs   = performance.now() - t0;
    kemServerPub  = publicKey;
    kemServerPriv = secretKey;
    const { cipherText, sharedSecret } = ml_kem1024.encapsulate(kemServerPub);
    kemCiphertext = cipherText;
    kemSecret     = sharedSecret;
  } else if (kem === 'mceliece') {
    // Yield to the browser so the "running" UI paints before blocking computation
    await new Promise(r => setTimeout(r, 80));
    const t0 = performance.now();
    const { publicKey, privateKey } = await mceliece.keyPair();
    kemKeygenMs   = performance.now() - t0;
    kemServerPub  = publicKey;
    kemServerPriv = privateKey;
    const { cyphertext, secret } = await mceliece.encrypt(kemServerPub);
    kemCiphertext = cyphertext;
    kemSecret     = secret;
  } else {
    // FrodoKEM-1344-AES
    const t0 = performance.now();
    const frodo = await createFrodoKEM1344AES();
    const { publicKey, secretKey } = frodo.generateKeyPair();
    kemKeygenMs   = performance.now() - t0;
    kemServerPub  = publicKey;
    kemServerPriv = secretKey;
    const { ciphertext, sharedSecret } = frodo.encapsulate(kemServerPub);
    kemCiphertext = ciphertext;
    kemSecret     = sharedSecret;
    frodo.destroy();
  }

  // Step 2 — X25519 DH
  const x25519Secret = x25519.getSharedSecret(clientX25519Priv, serverX25519Pub);

  // Step 4 — HKDF-SHA256 (combines both shared secrets)
  const ikm = new Uint8Array(x25519Secret.length + kemSecret.length);
  ikm.set(x25519Secret, 0);
  ikm.set(kemSecret, x25519Secret.length);

  const ikmKey = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveKey']);
  const combinedKeyObj = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32),
      info: new TextEncoder().encode('hybrid-pqc-playground-v1'),
    },
    ikmKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt'],
  );
  const combinedKey = new Uint8Array(await crypto.subtle.exportKey('raw', combinedKeyObj));

  // Step 5 — AES-256-GCM encrypt
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintextBytes = new TextEncoder().encode(plaintext);
  const ciphertextBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    combinedKeyObj,
    plaintextBytes,
  );
  const ciphertext = new Uint8Array(ciphertextBuf);

  // Step 6 — AES-256-GCM decrypt (verification)
  const decryptedBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    combinedKeyObj,
    ciphertext,
  );
  const decrypted = new TextDecoder().decode(decryptedBuf);

  return {
    clientX25519Priv, clientX25519Pub,
    serverX25519Priv, serverX25519Pub,
    kemServerPriv,    kemServerPub,
    x25519Secret,
    kemCiphertext,    kemSecret,
    combinedKey,
    iv, ciphertext,
    decrypted,
    kem,
    kemKeygenMs,
  };
}

// ── ImplInfoPanel ──────────────────────────────────────────────────────────

interface ImplInfoPanelProps {
  toggleLabel:      string;
  packageLabel:     string;
  snippetLabel:     string;
  packageName:      string;
  packageUrl:       string;
  snippet:          string;
  prose:            string;
  articleIntro:     string;
  articleHref:      string | null; // null = article not yet published
  articleLinkText:  string;
  articleComingSoon: string;
}

function ImplInfoPanel({
  toggleLabel, packageLabel, snippetLabel,
  packageName, packageUrl, snippet, prose,
  articleIntro, articleHref, articleLinkText, articleComingSoon,
}: ImplInfoPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="glass-panel rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 font-mono text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] transition-colors text-left"
      >
        <span>{toggleLabel}</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>

      {open && (
        <div className="border-t border-[var(--color-glass-border)] px-4 py-4 flex flex-col gap-4">

          {/* Package link */}
          <div className="flex items-baseline gap-2 font-mono text-xs">
            <span className="text-[var(--color-text-dim)] shrink-0">{packageLabel}:</span>
            <a
              href={packageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-primary)] hover:underline"
            >
              {packageName}
            </a>
          </div>

          {/* Minimal snippet */}
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-xs text-[var(--color-text-dim)]">{snippetLabel}:</span>
            <pre className="font-mono text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-base)] border border-[var(--color-glass-border)] rounded-lg px-3 py-3 overflow-x-auto leading-relaxed whitespace-pre">
              {snippet}
            </pre>
          </div>

          {/* Prose */}
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{prose}</p>

          {/* Article link */}
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            {articleHref
              ? <>{articleIntro}{' '}<Link href={articleHref} className="text-[var(--color-primary)] hover:underline">{articleLinkText}</Link>.</>
              : <span className="text-[var(--color-text-dim)]">{articleComingSoon}</span>
            }
          </p>

        </div>
      )}
    </div>
  );
}

// ── HexField ───────────────────────────────────────────────────────────────

interface HexFieldProps {
  label:           string;
  bytes:           Uint8Array;
  isPrivate:       boolean;
  alwaysExpanded?: boolean;
}

function HexField({ label, bytes, isPrivate, alwaysExpanded = false }: HexFieldProps) {
  const [expanded, setExpanded] = useState(alwaysExpanded);
  const [copied,   setCopied]   = useState(false);

  const hex = toHex(bytes);
  const needsTruncate = !alwaysExpanded && hex.length > 32 + 16 + 3;
  const displayHex    = needsTruncate && !expanded ? truncateHex(hex) : hex;

  async function handleCopy() {
    await navigator.clipboard.writeText(hex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <span
          aria-label={isPrivate ? 'privat' : 'öffentlich'}
          title={isPrivate ? 'Privat — nie übertragen' : 'Öffentlich — wird übertragen'}
          className="text-sm leading-none"
        >
          {isPrivate ? '🔒' : '📢'}
        </span>
        <span className="font-mono text-xs text-[var(--color-text-muted)]">{label}</span>
        <span className="font-mono text-xs text-[var(--color-text-dim)]">{formatBytes(bytes.length)}</span>
        <div className="ml-auto flex items-center gap-1">
          {needsTruncate && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="font-mono text-xs text-[var(--color-text-dim)] hover:text-[var(--color-primary)] transition-colors px-1.5 py-0.5 rounded border border-[var(--color-glass-border)] hover:border-[var(--color-primary)]"
            >
              {expanded ? '↑' : '↓'}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="font-mono text-xs text-[var(--color-text-dim)] hover:text-[var(--color-primary)] transition-colors px-1.5 py-0.5 rounded border border-[var(--color-glass-border)] hover:border-[var(--color-primary)]"
          >
            {copied ? '✓' : 'copy'}
          </button>
        </div>
      </div>
      <div
        className={`font-mono text-xs break-all leading-relaxed px-3 py-2 rounded-lg border ${
          isPrivate
            ? 'text-[var(--color-text-dim)] border-[var(--color-glass-border)] bg-[var(--color-bg-base)]'
            : 'text-[var(--color-primary)] border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5'
        }`}
      >
        {displayHex}
      </div>
    </div>
  );
}

// ── StepCard ───────────────────────────────────────────────────────────────

interface StepCardProps {
  number:   string;
  title:    string;
  desc:     string;
  children: React.ReactNode;
}

function StepCard({ number, title, desc, children }: StepCardProps) {
  return (
    <div className="glass-panel rounded-xl border border-[var(--color-glass-border)] p-5 flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-[var(--color-primary)]">{number}</span>
        <h2 className="text-[var(--color-text-base)] font-semibold text-lg">{title}</h2>
        <p className="text-[var(--color-text-muted)] text-sm leading-relaxed">{desc}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

// ── Spinner ────────────────────────────────────────────────────────────────

function Spinner({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin ${className ?? ''}`}
    />
  );
}

// ── KEM label key map ──────────────────────────────────────────────────────

const KEM_LABEL_KEYS: Record<KemAlgorithm, string> = {
  mlkem:    'kemMlKem',
  mceliece: 'kemMcEliece',
  frodokem: 'kemFrodoKem',
};

// ── Main Component ─────────────────────────────────────────────────────────

export default function HybridPlayground() {
  const t = useTranslations('playground');

  const [plaintext, setPlaintext] = useState('');
  const [kem,       setKem]       = useState<KemAlgorithm>('mlkem');
  const [phase,     setPhase]     = useState<Phase>('idle');
  const [state,     setState]     = useState<PlaygroundState | null>(null);
  const [error,     setError]     = useState('');

  const handleGenerate = useCallback(async () => {
    const input = plaintext.trim() || t('defaultPlaintext');
    setPhase('running');
    setError('');
    try {
      const result = await runCrypto(input, kem);
      setState(result);
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, [plaintext, kem, t]);

  const isMcEliece  = kem === 'mceliece';
  const isRunning   = phase === 'running';

  return (
    <div className="flex flex-col gap-8">

      {/* ── Header ── */}
      <div className="flex flex-col gap-3">
        <span className="font-mono text-xs text-[var(--color-primary)] tracking-widest uppercase">
          {t('label')}
        </span>
        <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-text-base)]">
          {t('title')}
        </h1>
        <p className="text-[var(--color-text-muted)] leading-relaxed max-w-2xl">{t('intro')}</p>
      </div>

      {/* ── Input + Config panel ── */}
      <div className="glass-panel rounded-xl border border-[var(--color-glass-border)] p-5 flex flex-col gap-5">

        {/* KEM selector */}
        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs text-[var(--color-text-muted)] tracking-widest uppercase">
            {t('kemLabel')}
          </span>
          <div className="flex flex-wrap gap-2">
            {(['mlkem', 'mceliece', 'frodokem'] as KemAlgorithm[]).map(k => (
              <button
                key={k}
                onClick={() => { setKem(k); setState(null); setPhase('idle'); }}
                disabled={isRunning}
                className={`font-mono text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                  kem === k
                    ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                    : 'border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                }`}
              >
                {t(KEM_LABEL_KEYS[k] as Parameters<typeof t>[0])}
              </button>
            ))}
          </div>
        </div>

        {/* McEliece warning */}
        {isMcEliece && (
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-400/90">
            <span aria-hidden="true" className="mt-0.5 shrink-0">⚠</span>
            <span>{t('mcElieceWarning')}</span>
          </div>
        )}

        {/* Implementation info */}
        {kem === 'mlkem' && (
          <ImplInfoPanel
            toggleLabel={t('implToggle')}
            packageLabel={t('implPackageLabel')}
            snippetLabel={t('implSnippetLabel')}
            packageName="@noble/post-quantum"
            packageUrl="https://github.com/paulmillr/noble-post-quantum"
            snippet={MLKEM_SNIPPET}
            prose={t('mlkemImplProse')}
            articleIntro={t('implArticleIntro')}
            articleHref="/blog/ML-KEM"
            articleLinkText={t('implArticleLink')}
            articleComingSoon=""
          />
        )}
        {kem === 'mceliece' && (
          <ImplInfoPanel
            toggleLabel={t('implToggle')}
            packageLabel={t('implPackageLabel')}
            snippetLabel={t('implSnippetLabel')}
            packageName="mceliece"
            packageUrl="https://github.com/cyph/pqcrypto.js/tree/master/packages/mceliece"
            snippet={MCELIECE_SNIPPET}
            prose={t('mcElieceImplProse')}
            articleIntro={t('implArticleIntro')}
            articleHref={null /* TODO: replace with McEliece deep-dive article slug */}
            articleLinkText={t('implArticleLink')}
            articleComingSoon={t('implArticleComingSoon')}
          />
        )}
        {kem === 'frodokem' && (
          <ImplInfoPanel
            toggleLabel={t('implToggle')}
            packageLabel={t('implPackageLabel')}
            snippetLabel={t('implSnippetLabel')}
            packageName="@oqs/liboqs-js"
            packageUrl="https://github.com/openforge-sh/liboqs-node"
            snippet={FRODOKEM_SNIPPET}
            prose={t('frodoKemImplProse')}
            articleIntro={t('implArticleIntro')}
            articleHref={null /* TODO: replace with FrodoKEM deep-dive article slug */}
            articleLinkText={t('implArticleLink')}
            articleComingSoon={t('implArticleComingSoonFrodoKem')}
          />
        )}

        {/* Plaintext input */}
        <div className="flex flex-col gap-2">
          <label htmlFor="pg-input" className="font-mono text-xs text-[var(--color-text-muted)] tracking-widest uppercase">
            {t('inputLabel')}
          </label>
          <input
            id="pg-input"
            type="text"
            value={plaintext}
            onChange={e => setPlaintext(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !isRunning) void handleGenerate(); }}
            placeholder={t('inputPlaceholder')}
            className="w-full rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-base)] px-4 py-3 font-mono text-sm text-[var(--color-text-base)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
          />
        </div>

        {/* Generate button + legend */}
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={() => void handleGenerate()}
            disabled={isRunning}
            className="rounded-lg bg-[var(--color-primary)] px-5 py-2.5 font-mono text-sm font-semibold text-[var(--color-bg-base)] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRunning ? t('generating') : t('generateButton')}
          </button>
          <div className="flex gap-4 text-xs text-[var(--color-text-dim)]">
            <span className="flex items-center gap-1.5">🔒 {t('legendPrivate')}</span>
            <span className="flex items-center gap-1.5 text-[var(--color-text-muted)]">
              <span className="text-[var(--color-primary)]">📢</span> {t('legendPublic')}
            </span>
          </div>
        </div>
      </div>

      {/* ── McEliece loading indicator ── */}
      {isRunning && isMcEliece && (
        <div className="glass-panel rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 flex flex-col gap-3">
          <div className="flex items-center gap-3 text-amber-400">
            <Spinner />
            <span className="font-mono text-sm">{t('mcElieceGenerating')}</span>
          </div>
          <p className="font-mono text-xs text-[var(--color-text-dim)]">{t('mcElieceGeneratingNote')}</p>
        </div>
      )}

      {/* ── Error ── */}
      {phase === 'error' && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 font-mono text-sm text-red-400">
          // error: {error}
        </div>
      )}

      {/* ── Steps ── */}
      {state && phase === 'done' && (
        <div className="flex flex-col gap-6">

          {/* Step 1 — Key generation */}
          <StepCard number="// step 01" title={t('step1Title')} desc={t('step1Desc')}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* X25519 column */}
              <div className="flex flex-col gap-3">
                <span className="font-mono text-xs text-[var(--color-text-muted)] border-b border-[var(--color-glass-border)] pb-1.5">
                  {t('x25519Section')}
                </span>
                <HexField label={t('keyClient')} bytes={state.clientX25519Priv} isPrivate={true}  />
                <HexField label={t('keyClient')} bytes={state.clientX25519Pub}  isPrivate={false} />
                <HexField label={t('keyServer')} bytes={state.serverX25519Priv} isPrivate={true}  />
                <HexField label={t('keyServer')} bytes={state.serverX25519Pub}  isPrivate={false} />
              </div>
              {/* KEM column */}
              <div className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between border-b border-[var(--color-glass-border)] pb-1.5">
                  <span className="font-mono text-xs text-[var(--color-text-muted)]">
                    {t(
                      state.kem === 'mlkem'    ? 'mlkemSection'    :
                      state.kem === 'mceliece' ? 'mcElieceSection' :
                                                 'frodoKemSection'
                    )}
                  </span>
                  <span
                    title={t('keygenTimeTitle')}
                    className={`font-mono text-xs ${state.kemKeygenMs > 1000 ? 'text-amber-400' : 'text-emerald-400'}`}
                  >
                    {t('keygenTime', { ms: Math.round(state.kemKeygenMs).toLocaleString() })}
                  </span>
                </div>
                <HexField label={t('keyServer')} bytes={state.kemServerPriv} isPrivate={true}  />
                <HexField label={t('keyServer')} bytes={state.kemServerPub}  isPrivate={false} />
              </div>
            </div>
          </StepCard>

          {/* Step 2 — X25519 DH */}
          <StepCard number="// step 02" title={t('step2Title')} desc={t('step2Desc')}>
            <HexField label={t('x25519SharedSecret')} bytes={state.x25519Secret} isPrivate={true} alwaysExpanded />
          </StepCard>

          {/* Step 3 — KEM encapsulation */}
          <StepCard
            number="// step 03"
            title={t(
              state.kem === 'mlkem'    ? 'step3Title'         :
              state.kem === 'mceliece' ? 'step3TitleMcEliece' :
                                         'step3TitleFrodoKem'
            )}
            desc={t(
              state.kem === 'mlkem'    ? 'step3Desc'         :
              state.kem === 'mceliece' ? 'step3DescMcEliece' :
                                         'step3DescFrodoKem'
            )}
          >
            <HexField
              label={t(
                state.kem === 'mlkem'    ? 'kemCiphertextMlKem'    :
                state.kem === 'mceliece' ? 'kemCiphertextMcEliece' :
                                           'kemCiphertextFrodoKem'
              )}
              bytes={state.kemCiphertext}
              isPrivate={false}
            />
            <HexField
              label={t(
                state.kem === 'mlkem'    ? 'kemSharedSecretMlKem'    :
                state.kem === 'mceliece' ? 'kemSharedSecretMcEliece' :
                                           'kemSharedSecretFrodoKem'
              )}
              bytes={state.kemSecret}
              isPrivate={true}
              alwaysExpanded
            />
          </StepCard>

          {/* Step 4 — HKDF */}
          <StepCard number="// step 04" title={t('step4Title')} desc={t('step4Desc')}>
            <HexField label={t('combinedKey')} bytes={state.combinedKey} isPrivate={true} alwaysExpanded />
          </StepCard>

          {/* Step 5 — AES-256-GCM */}
          <StepCard number="// step 05" title={t('step5Title')} desc={t('step5Desc')}>
            <HexField label={t('aesIv')}         bytes={state.iv}         isPrivate={false} alwaysExpanded />
            <HexField label={t('aesCiphertext')} bytes={state.ciphertext} isPrivate={false} />
          </StepCard>

          {/* Step 6 — Decryption */}
          <StepCard number="// step 06" title={t('step6Title')} desc={t('step6Desc')}>
            <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <span className="text-emerald-400 text-xl mt-0.5" aria-hidden="true">✓</span>
              <div className="flex flex-col gap-0.5">
                <span className="font-mono text-xs text-emerald-400/70">{t('step6Success')}</span>
                <span className="font-mono text-base text-emerald-300 break-all">{state.decrypted}</span>
              </div>
            </div>
          </StepCard>

        </div>
      )}
    </div>
  );
}
