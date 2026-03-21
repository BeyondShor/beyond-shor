'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import HybridPlayground, { type RealWorldItem } from '@/components/HybridPlayground';
import SignaturePlayground from '@/components/SignaturePlayground';
import type { KemAlgorithm } from '@/lib/playground-types';
import type { DsaAlgorithm } from '@/lib/signature-types';
import { decodeShareState, type ShareState } from '@/lib/share-state';

type PlaygroundMode = 'encryption' | 'signatures';

export interface PlaygroundWrapperProps {
  kemSnippetHtmls:    Record<KemAlgorithm, string>;
  dsaSnippetHtmls:    Record<DsaAlgorithm, string>;
  realWorldItems?:    RealWorldItem[];
  sigRealWorldItems?: RealWorldItem[];
}

export default function PlaygroundWrapper({
  kemSnippetHtmls, dsaSnippetHtmls, realWorldItems, sigRealWorldItems,
}: PlaygroundWrapperProps) {
  const t = useTranslations('playground');
  const [mode, setMode] = useState<PlaygroundMode>('encryption');
  const [initialState, setInitialState] = useState<ShareState | null>(null);

  // Parse URL hash on mount — restore shared state if present, else set mode
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash.startsWith('state=')) {
      const decoded = decodeShareState(hash.slice(6));
      if (decoded) {
        setInitialState(decoded);
        setMode(decoded.mode);
        return;
      }
    }
    if (hash === 'signatures') setMode('signatures');
    else if (hash === 'encryption') setMode('encryption');
  }, []);

  function switchMode(newMode: PlaygroundMode) {
    setMode(newMode);
    setInitialState(null);
    history.replaceState(null, '', `#${newMode}`);
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Mode toggle */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--color-bg-base)] border border-[var(--color-glass-border)] self-start">
        <button
          onClick={() => switchMode('encryption')}
          className={`px-5 py-2 rounded-lg font-mono text-sm transition-all ${
            mode === 'encryption'
              ? 'bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/40 text-[var(--color-primary)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-base)]'
          }`}>
          {t('modeToggleEncryption')}
        </button>
        <button
          onClick={() => switchMode('signatures')}
          className={`px-5 py-2 rounded-lg font-mono text-sm transition-all ${
            mode === 'signatures'
              ? 'bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/40 text-[var(--color-primary)]'
              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-base)]'
          }`}>
          {t('modeToggleSignatures')}
        </button>
      </div>

      {/* Content */}
      {mode === 'encryption' && (
        <HybridPlayground
          snippetHtmls={kemSnippetHtmls}
          realWorldItems={realWorldItems}
          initialState={initialState?.mode === 'encryption' ? initialState : undefined}
        />
      )}
      {mode === 'signatures' && (
        <SignaturePlayground
          snippetHtmls={dsaSnippetHtmls}
          realWorldItems={sigRealWorldItems}
          initialState={initialState?.mode === 'signatures' ? initialState : undefined}
        />
      )}
    </div>
  );
}
