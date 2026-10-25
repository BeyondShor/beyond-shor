'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import HybridPlayground, { type RealWorldItem } from '@/components/HybridPlayground';
import SignaturePlayground from '@/components/SignaturePlayground';
import PkiPlayground from '@/components/PkiPlayground';
import type { KemAlgorithm } from '@/lib/playground-types';
import type { DsaAlgorithm } from '@/lib/signature-types';
import { decodeShareState, type ShareState } from '@/lib/share-state';

type PlaygroundMode = 'encryption' | 'signatures';
// Two tracks: the PQC building blocks themselves, and what they mean for a PKI
type PlaygroundTrack = 'pqc' | 'pki';

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
  const [track, setTrack] = useState<PlaygroundTrack>('pqc');
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
    if (hash === 'pki') setTrack('pki');
    else if (hash === 'signatures') setMode('signatures');
    else if (hash === 'encryption') setMode('encryption');
  }, []);

  function switchMode(newMode: PlaygroundMode) {
    setMode(newMode);
    setInitialState(null);
    history.replaceState(null, '', `#${newMode}`);
  }

  function switchTrack(newTrack: PlaygroundTrack) {
    setTrack(newTrack);
    setInitialState(null);
    history.replaceState(null, '', `#${newTrack === 'pki' ? 'pki' : mode}`);
  }

  const tracks: { id: PlaygroundTrack; title: string; desc: string }[] = [
    { id: 'pqc', title: t('trackPqcTitle'), desc: t('trackPqcDesc') },
    { id: 'pki', title: t('trackPkiTitle'), desc: t('trackPkiDesc') },
  ];

  return (
    <div className="flex flex-col gap-10">
      {/* Track selector */}
      <div role="tablist" aria-label={t('trackLabel')} className="grid gap-3 sm:grid-cols-2">
        {tracks.map(({ id, title, desc }) => {
          const active = track === id;
          return (
            <button
              key={id}
              role="tab"
              id={`track-${id}`}
              aria-selected={active}
              aria-controls={`track-panel-${id}`}
              onClick={() => switchTrack(id)}
              className={`rounded-xl border p-4 text-left transition-all ${
                active
                  ? 'bg-[var(--color-primary)]/10 border-[var(--color-primary)]/50'
                  : 'bg-[var(--color-bg-base)] border-[var(--color-glass-border)] hover:border-[var(--color-primary)]/30'
              }`}>
              <span className={`block font-mono text-sm ${active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-base)]'}`}>
                {title}
              </span>
              <span className="mt-1 block text-xs text-[var(--color-text-muted)] leading-relaxed">{desc}</span>
            </button>
          );
        })}
      </div>

      {track === 'pki' && (
        <div role="tabpanel" id="track-panel-pki" aria-labelledby="track-pki">
          <PkiPlayground />
        </div>
      )}

      {track === 'pqc' && (
        <div role="tabpanel" id="track-panel-pqc" aria-labelledby="track-pqc" className="flex flex-col gap-10">
          {/* Mode toggle */}
          <div className="flex w-fit gap-1 p-1 rounded-xl bg-[var(--color-bg-base)] border border-[var(--color-glass-border)]">
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
      )}
    </div>
  );
}
