'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';

type StepStatus = 'done' | 'error';
type VerifyStatus = 'idle' | 'verifying' | 'valid' | 'invalid' | 'error';

interface Step {
  label: string;
  value: string;
  status: StepStatus;
}

const PUBLIC_KEY_HEX = process.env.NEXT_PUBLIC_ML_DSA_PUBLIC_KEY ?? '';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function truncateHex(hex: string, start = 28, end = 12): string {
  if (hex.length <= start + end + 3) return hex;
  return `${hex.slice(0, start)}…${hex.slice(-end)}`;
}


// ─── Canonical block serialization ───────────────────────────────────────────
// Must be identical to the logic in lifecycles.ts and sign-articles.mjs.

async function hashFileWeb(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return bytesToHex(new Uint8Array(hashBuffer));
}

async function processBlock(block: any): Promise<any> {
  switch (block.__component) {
    case 'shared.rich-text':
      return { __component: 'shared.rich-text', body: block.body ?? '' };

    case 'shared.quote':
      return { __component: 'shared.quote', body: block.body ?? '', title: block.title ?? '' };

    case 'shared.media': {
      const sha256 = block.file?.url ? await hashFileWeb(block.file.url) : null;
      return { __component: 'shared.media', file: sha256 ? { sha256 } : null };
    }

    case 'shared.slider': {
      const files = Array.isArray(block.files) ? block.files : [];
      const hashes = await Promise.all(
        files.map((f: any) => (f.url ? hashFileWeb(f.url) : Promise.resolve(null))),
      );
      return { __component: 'shared.slider', files: hashes.map((sha256) => (sha256 ? { sha256 } : null)) };
    }

    default:
      return { __component: block.__component };
  }
}

async function serializeBlocks(blocks: any[]): Promise<string> {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  const processed = await Promise.all(blocks.map(processBlock));
  return JSON.stringify(processed);
}

// ─────────────────────────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-3 py-2 text-xs font-mono ' +
  'text-[var(--color-text-base)] placeholder:text-[var(--color-text-dim)] ' +
  'focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]/30 transition-colors';

interface Props {
  defaultSig?: string;
  defaultDocId?: string;
}

export default function SignatureVerifier({ defaultSig = '', defaultDocId = '' }: Props) {
  const t = useTranslations('verifier');

  const locale = useLocale();

  const [copied, setCopied] = useState(false);
  const [sig, setSig]       = useState(defaultSig);
  const [docId, setDocId]   = useState(defaultDocId);
  const [status, setStatus] = useState<VerifyStatus>('idle');
  const [steps, setSteps]   = useState<Step[]>([]);

  async function copyKey() {
    await navigator.clipboard.writeText(PUBLIC_KEY_HEX);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function verify(sigValue: string, docIdValue: string) {
    setStatus('verifying');
    setSteps([]);

    try {
      // Step 1 — fetch article fields from Strapi via Next.js API route
      const res = await fetch(
        `/api/article-fields?documentId=${encodeURIComponent(docIdValue.trim())}&locale=${locale}`,
      );
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
        setSteps([{ label: t('stepFetch'), value: error ?? t('fetchError'), status: 'error' }]);
        setStatus('error');
        return;
      }
      const { title, blocks } = await res.json();
      setSteps([{ label: t('stepFetch'), value: title, status: 'done' }]);

      // Step 2 — hash any media files in blocks
      const mediaCount = (blocks as any[]).filter(
        (b) => b.__component === 'shared.media' || b.__component === 'shared.slider',
      ).length;
      if (mediaCount > 0) {
        setSteps((s) => [
          ...s,
          { label: t('stepMedia'), value: `${mediaCount} file(s)…`, status: 'done' },
        ]);
      }

      const { ml_dsa65 } = await import('@noble/post-quantum/ml-dsa.js');

      // Step 3 — construct canonical message
      const blocksJson = await serializeBlocks(blocks);
      const message    = [docIdValue.trim(), locale, title, blocksJson].join('|');

      // Raw UTF-8 bytes — passed directly to ML-DSA-65 without pre-hashing.
      // ML-DSA processes them internally with SHAKE-256 per FIPS 204 §5.2.
      const rawBytes = new TextEncoder().encode(message);
      const nBlocks  = (blocks as any[]).length;
      const nMedia   = (blocks as any[]).filter(
        (b) => b.__component === 'shared.media' || b.__component === 'shared.slider',
      ).length;
      const msgInfo  = `${rawBytes.length.toLocaleString()} B · ${nBlocks} Block(s)${nMedia > 0 ? ` · ${nMedia}× media SHA-256` : ''}`;
      setSteps((s) => [...s, { label: t('stepMessage'), value: msgInfo, status: 'done' }]);

      // Step 4 — show the signature that was provided
      const sigClean = sigValue.replace(/\s+/g, '');
      setSteps((s) => [
        ...s,
        {
          label:  t('stepSig'),
          value:  `${truncateHex(sigClean, 16, 16)} (${(sigClean.length / 2).toLocaleString()} B)`,
          status: 'done',
        },
      ]);

      // Step 5 — ML-DSA-65.verify(msg, sig, pubKey)
      // Raw bytes go in directly; SHAKE-256 happens inside the library.
      const publicKey = hexToBytes(PUBLIC_KEY_HEX);
      const sigBytes  = hexToBytes(sigValue);
      const valid     = ml_dsa65.verify(sigBytes, rawBytes, publicKey);

      setSteps((s) => [
        ...s,
        {
          label:  'ML-DSA-65.verify(msg, sig, pubKey)',
          value:  valid ? t('resultValid') : t('resultInvalid'),
          status: valid ? 'done' : 'error',
        },
      ]);
      setStatus(valid ? 'valid' : 'invalid');
    } catch (err) {
      console.error('[pqc-verifier]', err);
      setSteps((s) => [
        ...s,
        { label: t('stepVerify'), value: t('resultError'), status: 'error' },
      ]);
      setStatus('error');
    }
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    await verify(sig, docId);
  }

  return (
    <section
      aria-labelledby="verifier-heading"
      className="mt-16 border-t border-[var(--color-border)] pt-12"
    >
      {/* Heading */}
      <p className="mono-label text-[var(--color-primary)] mb-2">{t('label')}</p>
      <h2
        id="verifier-heading"
        className="text-2xl font-bold text-[var(--color-text-base)] mb-3"
      >
        {t('title')}
      </h2>
      <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mb-10">
        {t('description')}
      </p>

      {/* ── Public key ───────────────────────────────────────────────── */}
      <div className="mb-8">
        <p className="mono-label text-[var(--color-text-muted)] mb-2">{t('pubKeyLabel')}</p>
        <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3">
          <code className="min-w-0 flex-1 break-all text-xs font-mono leading-relaxed text-[var(--color-primary)]">
            {PUBLIC_KEY_HEX
              ? truncateHex(PUBLIC_KEY_HEX, 40, 16)
              : t('pubKeyNotConfigured')}
          </code>
          {PUBLIC_KEY_HEX && (
            <button
              type="button"
              onClick={copyKey}
              className="shrink-0 rounded border border-[var(--color-border)] px-3 py-1 text-xs font-mono text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              {copied ? t('pubKeyCopied') : t('pubKeyCopy')}
            </button>
          )}
        </div>
      </div>

      {/* ── Message format ───────────────────────────────────────────── */}
      <div className="mb-10">
        <p className="mono-label text-[var(--color-text-muted)] mb-2">{t('messageFormatLabel')}</p>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3">
          <code className="text-xs font-mono text-[var(--color-text-muted)]">
            documentId{' '}
            <span className="text-[var(--color-primary)]">|</span>{' '}
            locale{' '}
            <span className="text-[var(--color-primary)]">|</span>{' '}
            title{' '}
            <span className="text-[var(--color-primary)]">|</span>{' '}
            blocks (JSON, media = SHA-256 hashes)
          </code>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">
            {t('messageFormatDesc')}
          </p>
        </div>
      </div>

      {/* ── Intro ────────────────────────────────────────────────────── */}
      <p className="text-sm text-[var(--color-text-muted)] leading-relaxed mb-8">
        {t('intro')}
      </p>

      {/* ── Verify form ──────────────────────────────────────────────── */}
      <form onSubmit={handleVerify} className="space-y-4">
        <p className="mono-label text-[var(--color-text-muted)] mb-1">{t('formLabel')}</p>

        {/* Signature */}
        <div>
          <label className="mb-1 block text-xs font-mono text-[var(--color-text-muted)]">
            {t('fieldSignature')}
          </label>
          <textarea
            value={sig}
            onChange={(e) => setSig(e.target.value)}
            rows={3}
            required
            spellCheck={false}
            placeholder="3f8b2a04e1…"
            className={`${inputCls} resize-y`}
          />
        </div>

        {/* Document ID */}
        <div>
          <label className="mb-1 block text-xs font-mono text-[var(--color-text-muted)]">
            {t('fieldDocumentId')}
          </label>
          <input
            value={docId}
            onChange={(e) => setDocId(e.target.value)}
            required
            spellCheck={false}
            placeholder="abc123xyz"
            className={inputCls}
          />
        </div>

        <button
          type="submit"
          disabled={status === 'verifying'}
          className="rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)]/10 px-6 py-2.5 text-sm font-mono font-semibold text-[var(--color-primary)] transition-all hover:bg-[var(--color-primary)]/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === 'verifying' ? t('verifying') : t('submitButton')}
        </button>
      </form>

      {/* ── Verification steps ───────────────────────────────────────── */}
      {steps.length > 0 && (
        <div className="mt-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-5 space-y-3">
          <p className="mono-label text-[var(--color-text-muted)] mb-4">{t('stepsLabel')}</p>

          {steps.map((step, i) => (
            <div key={i} className="flex gap-3 text-xs font-mono">
              <span
                className={`mt-0.5 shrink-0 ${
                  step.status === 'done' ? 'text-emerald-400' : 'text-red-400'
                }`}
                aria-hidden="true"
              >
                {step.status === 'done' ? '✓' : '✗'}
              </span>
              <div className="min-w-0">
                <span className="text-[var(--color-text-muted)]">{step.label}&nbsp;&nbsp;</span>
                <span
                  className={`break-all ${
                    i === steps.length - 1
                      ? step.status === 'done'
                        ? 'text-emerald-400 font-semibold'
                        : 'text-red-400 font-semibold'
                      : 'text-[var(--color-text-base)]'
                  }`}
                >
                  {step.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
