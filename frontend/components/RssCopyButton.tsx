'use client';

import { useState } from 'react';

interface Props {
  url: string;
  copyLabel: string;
  copiedLabel: string;
}

export default function RssCopyButton({ url, copyLabel, copiedLabel }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex items-stretch gap-0 rounded-lg overflow-hidden border border-[var(--color-glass-border)] focus-within:border-[var(--color-primary)] transition-colors">
      <code className="flex-1 px-4 py-3 font-mono text-sm text-[var(--color-text-muted)] bg-[var(--color-bg-base)] truncate select-all">
        {url}
      </code>
      <button
        onClick={handleCopy}
        className="px-4 py-3 mono-label text-[var(--color-primary)] bg-[var(--color-bg-surface)] hover:bg-[var(--color-glass-border)] transition-colors whitespace-nowrap border-l border-[var(--color-glass-border)] cursor-pointer"
        aria-label={copied ? copiedLabel : copyLabel}
      >
        {copied ? copiedLabel : copyLabel}
      </button>
    </div>
  );
}
