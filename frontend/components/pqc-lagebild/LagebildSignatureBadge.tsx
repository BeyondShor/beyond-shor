'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

function truncateHex(hex: string): string {
  if (hex.length <= 20) return hex;
  return `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

/** Same look and flow as CbomSignatureBadge: the check itself happens on /verify, prefilled. */
export default function LagebildSignatureBadge({ file, sig }: { file: string; sig: string }) {
  const t = useTranslations('pqcLagebild');
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(sig);
    setCopied(true);
    setTimeout(() => setCopied(false), 2_000);
  }

  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-surface)] p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono font-semibold uppercase tracking-widest text-[var(--color-primary)]">ML-DSA-65</span>
          <span className="text-xs font-mono text-[var(--color-text-muted)]">NIST FIPS 204</span>
        </div>
        <Link
          href={{ pathname: '/verify', query: { mode: 'lagebild', file } }}
          className="rounded border border-[var(--color-primary)] px-3 py-1 text-xs font-mono font-semibold text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary-glow)]"
        >
          {t('sigVerifyLink')}
        </Link>
      </div>
      <div className="mt-2 space-y-1.5 font-mono text-xs leading-relaxed">
        <p className="break-all">
          <span className="text-[var(--color-text-muted)]">signed: </span>
          <a href={`/api/pqc-lagebild/${file}`} download={file} className="text-[var(--color-text-base)] hover:text-[var(--color-primary)]">{file}</a>
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
