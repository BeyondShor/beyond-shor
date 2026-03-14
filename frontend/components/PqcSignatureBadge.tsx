'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

interface PqcSignatureBadgeProps {
  signature: string;
  documentId: string;
}

type CopyState = 'idle' | 'copied';

// Truncate a long hex string: first 8 + … + last 8 chars
function truncateHex(hex: string): string {
  if (hex.length <= 20) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

export default function PqcSignatureBadge({
  signature,
  documentId,
}: PqcSignatureBadgeProps) {
  const t = useTranslations('article');
  const [copied, setCopied] = useState<CopyState>('idle');

  async function handleCopySig() {
    await navigator.clipboard.writeText(signature);
    setCopied('copied');
    setTimeout(() => setCopied('idle'), 2000);
  }

  return (
    <div className="my-6 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4 text-sm">
      {/* Header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-primary)] text-xs font-mono font-semibold tracking-widest uppercase">
            ML-DSA-65
          </span>
          <span className="text-[var(--color-text-dim)] text-xs font-mono">
            NIST FIPS 204
          </span>
        </div>

        <Link
          href={`/verify?sig=${encodeURIComponent(signature)}&docId=${encodeURIComponent(documentId)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded px-3 py-1 text-xs font-mono font-semibold border transition-colors
            border-[var(--color-primary)] text-[var(--color-primary)]
            hover:bg-[var(--color-primary-glow)]"
        >
          {t('verifyLearnMore')}
        </Link>
      </div>

      {/* Document ID + Signature */}
      <div className="mt-2 space-y-1.5 font-mono text-xs leading-relaxed">
        <p className="break-all">
          <span className="text-[var(--color-text-muted)]">doc: </span>
          <span className="text-[var(--color-text-base)]">{documentId}</span>
        </p>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 break-all text-[var(--color-text-muted)]">
            <span>sig: </span>
            {truncateHex(signature)}
          </p>
          <button
            type="button"
            onClick={handleCopySig}
            className="shrink-0 rounded border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-mono text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            {copied === 'copied' ? '✓' : 'copy sig'}
          </button>
        </div>
      </div>
    </div>
  );
}
