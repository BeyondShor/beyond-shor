'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
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

interface View {
  track:  PlaygroundTrack;
  mode:   PlaygroundMode;
  shared: ShareState | null;
}

// #state=… restores a shared run, #pki / #signatures / #encryption pick the view
function viewFromHash(hash: string): View {
  if (hash.startsWith('state=')) {
    const decoded = decodeShareState(hash.slice(6));
    if (decoded) return { track: 'pqc', mode: decoded.mode, shared: decoded };
  }
  if (hash === 'pki')        return { track: 'pki', mode: 'encryption', shared: null };
  if (hash === 'signatures') return { track: 'pqc', mode: 'signatures', shared: null };
  return { track: 'pqc', mode: 'encryption', shared: null };
}

// The hash is read once per mount. Later changes come from this page itself
// (switching views, share links), which already holds that state.
let hashAtMount: string | null = null;
const readHash = () => (hashAtMount ??= window.location.hash.slice(1));
const subscribeHash = () => () => { hashAtMount = null; };

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
  // the server renders the default view; the client then applies the hash
  const hash = useSyncExternalStore(subscribeHash, readHash, () => '');
  const fromHash = useMemo(() => viewFromHash(hash), [hash]);
  const [chosen, setChosen] = useState<View | null>(null);
  const { track, mode, shared: initialState } = chosen ?? fromHash;

  function switchMode(newMode: PlaygroundMode) {
    setChosen({ track, mode: newMode, shared: null });
    history.replaceState(null, '', `#${newMode}`);
  }

  function switchTrack(newTrack: PlaygroundTrack) {
    setChosen({ track: newTrack, mode, shared: null });
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
              key={initialState ? 'shared' : 'fresh'}
              snippetHtmls={kemSnippetHtmls}
              realWorldItems={realWorldItems}
              initialState={initialState?.mode === 'encryption' ? initialState : undefined}
            />
          )}
          {mode === 'signatures' && (
            <SignaturePlayground
              key={initialState ? 'shared' : 'fresh'}
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
