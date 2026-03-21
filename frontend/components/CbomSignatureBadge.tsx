'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

function truncateHex(hex: string): string {
  if (hex.length <= 20) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

export default function CbomSignatureBadge({ sig }: { sig: string }) {
  const t = useTranslations('cbom');
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(sig);
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4 text-sm">

      {/* Header row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-[var(--color-primary)] text-xs font-mono font-semibold tracking-widest uppercase">
            ML-DSA-65
          </span>
          <span className="text-[var(--color-text-muted)] text-xs font-mono">
            NIST FIPS 204
          </span>
        </div>
        <Link
          href="/verify?mode=cbom"
          className="rounded px-3 py-1 text-xs font-mono font-semibold border transition-colors border-[var(--color-primary)] text-[var(--color-primary)] hover:bg-[var(--color-primary-glow)]"
        >
          {t('sigVerifyLink')}
        </Link>
      </div>

      {/* Signed artifact + truncated signature */}
      <div className="mt-2 space-y-1.5 font-mono text-xs leading-relaxed">
        <p className="break-all">
          <span className="text-[var(--color-text-muted)]">signed: </span>
          <span className="text-[var(--color-text-base)]">cbom.json</span>
        </p>
        <div className="flex items-center gap-2">
          <p className="min-w-0 flex-1 break-all text-[var(--color-text-muted)]">
            <span>sig: </span>
            {truncateHex(sig)}
          </p>
          <button
            type="button"
            onClick={handleCopy}
            className="shrink-0 rounded border border-[var(--color-border)] px-2 py-0.5 text-[10px] font-mono text-[var(--color-text-muted)] transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
          >
            {copied ? '✓' : 'copy sig'}
          </button>
        </div>
      </div>

    </div>
  );
}
