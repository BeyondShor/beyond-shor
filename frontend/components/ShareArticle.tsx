'use client';

import { useState } from 'react';

interface Props {
  title: string;
  url: string;
  labelShare: string;
  labelCopied: string;
  labelLinkedIn: string;
  labelX: string;
  labelCopy: string;
}

export default function ShareArticle({ title, url, labelShare, labelCopied, labelLinkedIn, labelX, labelCopy }: Props) {
  const [open, setOpen]     = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, url });
        return;
      } catch {
        // user cancelled or API not supported — fall through to manual menu
      }
    }
    setOpen(v => !v);
  }

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => { setCopied(false); setOpen(false); }, 2000);
  }

  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  const xUrl        = `https://x.com/intent/post?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;

  return (
    <div className="relative">
      <button
        onClick={handleShare}
        aria-label={labelShare}
        className="flex items-center gap-1.5 font-mono text-xs px-3 py-1.5 rounded-lg border border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors"
      >
        {/* share icon */}
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="w-3.5 h-3.5" aria-hidden="true">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>
        {labelShare}
      </button>

      {open && (
        <div className="absolute bottom-full mb-2 right-0 z-10 min-w-[160px] rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-surface)] shadow-lg py-1">
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-xs font-mono text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] hover:bg-white/5 transition-colors"
          >
            {/* LinkedIn icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
              className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
            {labelLinkedIn}
          </a>
          <a
            href={xUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-xs font-mono text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] hover:bg-white/5 transition-colors"
          >
            {/* X / Twitter icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"
              className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.261 5.632 5.903-5.632zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
            {labelX}
          </a>
          <button
            onClick={copyLink}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-mono text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] hover:bg-white/5 transition-colors"
          >
            {/* copy icon */}
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="w-3.5 h-3.5 shrink-0" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            {copied ? labelCopied : labelCopy}
          </button>
        </div>
      )}
    </div>
  );
}
