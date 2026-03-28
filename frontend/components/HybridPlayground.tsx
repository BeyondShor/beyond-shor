'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type {
  KemAlgorithm,
  Step1Data, Step2Data, Step3Data, Step4Data, Step5Data, Step6Data,
  WorkerInMessage, WorkerOutMessage,
  TamperField, RaceEntry,
  BenchmarkRun, BenchmarkKemState,
} from '@/lib/playground-types';
import { AttackerContext, useAttackerContext } from '@/lib/playground-attacker-context';
import {
  encodeShareState,
  type KemRunShareState, type KemBenchmarkShareState,
} from '@/lib/share-state';

// ── Timing constants ────────────────────────────────────────────────────────

const COPY_TIMEOUT_MS   = 2_000; // ms — how long the "✓" feedback shows on copy buttons
const SHARE_TIMEOUT_MS  = 2_500; // ms — how long the "Link kopiert ✓" feedback shows
const TIMER_INTERVAL_MS = 100;   // ms — elapsed-time ticker interval
const TIMER_INCREMENT_S = 0.1;   // s  — elapsed-time increment per tick

// ── Types ──────────────────────────────────────────────────────────────────

type Phase = 'idle' | 'running' | 'done' | 'error';

interface TamperReplay {
  field:    TamperField;
  step3?:   { kemSecretServer: Uint8Array };
  step4?:   { combinedKeyServer: Uint8Array };
  step6Error?: string; // i18n key
}

export interface RealWorldItem {
  name:        string;
  description: string;
  link:        string;
}

interface PlaygroundSteps {
  1?: Step1Data;
  2?: Step2Data;
  3?: Step3Data;
  4?: Step4Data;
  5?: Step5Data;
  6?: Step6Data;
}

export interface HybridPlaygroundProps {
  snippetHtmls:    Record<KemAlgorithm, string>;
  realWorldItems?: RealWorldItem[];
  initialState?:   KemRunShareState | KemBenchmarkShareState;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
  const clean = hex.replace(/\s/g, '');
  const arr = new Uint8Array(clean.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

function isValidHex(s: string): boolean {
  return s.length > 0 && /^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0;
}

function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  if (n >= 1024)        return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function fmtMs(ms: number | undefined): string {
  if (ms === undefined) return '…';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

function truncateHex(hex: string, head = 32, tail = 16): string {
  if (hex.length <= head + tail + 3) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

// ── KEM label keys ─────────────────────────────────────────────────────────

const KEM_LABEL_KEYS: Record<KemAlgorithm, string> = {
  mlkem:    'kemMlKem',
  mceliece: 'kemMcEliece',
  frodokem: 'kemFrodoKem',
};

const KEM_DISPLAY_NAMES: Record<KemAlgorithm, string> = {
  mlkem:    'ML-KEM-1024',
  mceliece: 'McEliece 8192128',
  frodokem: 'FrodoKEM-1344-AES',
};

// ── ImplInfoPanel ──────────────────────────────────────────────────────────

interface ImplInfoPanelProps {
  toggleLabel: string; packageLabel: string; snippetLabel: string;
  packageName: string; packageUrl: string; snippetHtml: string; prose: string;
  articleIntro: string; articleSlug: string | null; articleLinkText: string;
  articleComingSoon: string;
}

function ImplInfoPanel({ toggleLabel, packageLabel, snippetLabel, packageName, packageUrl,
  snippetHtml, prose, articleIntro, articleSlug, articleLinkText, articleComingSoon,
}: ImplInfoPanelProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass-panel rounded-lg overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 font-mono text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] transition-colors text-left"
      >
        <span>{toggleLabel}</span>
        <span aria-hidden="true">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="border-t border-[var(--color-glass-border)] px-4 py-4 flex flex-col gap-4">
          <div className="flex items-baseline gap-2 font-mono text-xs">
            <span className="text-[var(--color-text-muted)] shrink-0">{packageLabel}:</span>
            <a href={packageUrl} target="_blank" rel="noopener noreferrer"
              className="text-[var(--color-primary)] hover:underline">{packageName}</a>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="font-mono text-xs text-[var(--color-text-muted)]">{snippetLabel}:</span>
            <div className="text-xs overflow-x-auto rounded-lg border border-[var(--color-glass-border)] [&_pre]:p-4 [&_pre]:rounded-lg [&_pre]:overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: snippetHtml }} />
          </div>
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{prose}</p>
          <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
            {articleSlug
              ? <>{articleIntro}{' '}<Link href={{ pathname: '/blog/[slug]', params: { slug: articleSlug } }} className="text-[var(--color-primary)] hover:underline">{articleLinkText}</Link>.</>
              : <span className="text-[var(--color-text-muted)]">{articleComingSoon}</span>}
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
  variant?:        'normal' | 'wrong'; // 'wrong' = tamper cascade, shown in red
  onReset?:        () => void;         // called when user resets a tamper edit → clears cascade
  // tamper support
  tamperField?:    TamperField;
  onTamper?:       (field: TamperField, bytes: Uint8Array, hex: string) => void;
  tamperActive?:   boolean;
}

function HexField({ label, bytes, isPrivate, alwaysExpanded = false,
  variant = 'normal', onReset, tamperField, onTamper, tamperActive = false }: HexFieldProps) {
  const [expanded,   setExpanded]   = useState(alwaysExpanded);
  const [copied,     setCopied]     = useState(false);
  const [editHex,    setEditHex]    = useState<string | null>(null);
  const [hexError,   setHexError]   = useState(false);
  const { attackerMode } = useAttackerContext();
  const t = useTranslations('playground');

  const hex = toHex(bytes);
  const needsTruncate = !alwaysExpanded && hex.length > 32 + 16 + 3;
  const displayHex    = needsTruncate && !expanded ? truncateHex(hex) : hex;

  async function handleCopy() {
    await navigator.clipboard.writeText(editHex ?? hex);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_TIMEOUT_MS);
  }

  const isEditing   = tamperActive && tamperField && editHex !== null;
  const currentHex  = editHex ?? hex;

  function handleEdit(val: string) {
    const clean = val.replace(/\s/g, '');
    setEditHex(clean);
    setHexError(!isValidHex(clean));
  }

  function handleTamperSubmit() {
    if (!tamperField || !onTamper || !editHex) return;
    if (!isValidHex(editHex)) { setHexError(true); return; }
    if (editHex === hex) { setEditHex(null); return; } // nothing changed — close edit mode silently
    onTamper(tamperField, fromHex(editHex), editHex);
  }

  return (
    <div className={`flex flex-col gap-1.5 transition-all ${attackerMode && isPrivate ? 'opacity-20 blur-[1px]' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span aria-label={isPrivate ? t('hexPrivateLabel') : t('hexPublicLabel')}
          title={attackerMode && isPrivate ? t('attackerCannotSeeThis')
            : attackerMode && !isPrivate ? t('attackerSeesThis')
            : isPrivate ? t('hexPrivateTitle') : t('hexPublicTitle')}
          className="text-sm leading-none">
          {isPrivate ? '🔒' : '📢'}
        </span>
        {attackerMode && !isPrivate && (
          <span className="font-mono text-[0.65rem] text-red-400/70 leading-none">👁</span>
        )}
        <span className="font-mono text-xs text-[var(--color-text-muted)]">{label}</span>
        <span className="font-mono text-xs text-[var(--color-text-muted)]">{formatBytes(bytes.length)}</span>
        <div className="ml-auto flex items-center gap-1">
          {tamperActive && tamperField && editHex === null && (
            <button onClick={() => { setEditHex(hex); setExpanded(true); }}
              className="font-mono text-xs text-amber-400/80 hover:text-amber-300 transition-colors px-1.5 py-0.5 rounded border border-amber-500/30 hover:border-amber-400">
              edit
            </button>
          )}
          {tamperActive && tamperField && editHex !== null && (
            <button onClick={() => { setEditHex(null); setHexError(false); onReset?.(); }}
              className="font-mono text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] transition-colors px-1.5 py-0.5 rounded border border-[var(--color-glass-border)]">
              reset
            </button>
          )}
          {needsTruncate && (
            <button onClick={() => setExpanded(v => !v)}
              className="font-mono text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors px-1.5 py-0.5 rounded border border-[var(--color-glass-border)] hover:border-[var(--color-primary)]">
              {expanded ? '↑' : '↓'}
            </button>
          )}
          <button onClick={handleCopy}
            className="font-mono text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors px-1.5 py-0.5 rounded border border-[var(--color-glass-border)] hover:border-[var(--color-primary)]">
            {copied ? '✓' : 'copy'}
          </button>
        </div>
      </div>

      {isEditing ? (
        <div className="flex flex-col gap-1">
          <textarea
            value={editHex ?? ''}
            onChange={e => handleEdit(e.target.value)}
            rows={3}
            className={`font-mono text-xs break-all leading-relaxed px-3 py-2 rounded-lg border w-full bg-[var(--color-bg-base)] text-amber-300 focus:outline-none resize-none ${
              hexError ? 'border-red-500/60' : 'border-amber-500/40'
            }`}
            spellCheck={false}
          />
          <div className="flex items-center gap-2">
            <button onClick={handleTamperSubmit} disabled={hexError}
              className="font-mono text-xs px-3 py-1 rounded border border-amber-500/40 text-amber-400 hover:border-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {t('tamperButton')}
            </button>
            {hexError && <span className="font-mono text-xs text-red-400/70">{t('invalidHexInput')}</span>}
          </div>
        </div>
      ) : (
        <div className={`font-mono text-xs break-all leading-relaxed px-3 py-2 rounded-lg border ${
          variant === 'wrong'
            ? 'text-red-300/90 border-red-500/40 bg-red-500/8'
            : isPrivate
              ? 'text-[var(--color-text-dim)] border-[var(--color-glass-border)] bg-[var(--color-bg-base)]'
              : attackerMode
                ? 'text-[var(--color-primary)] border-red-500/40 bg-red-500/5'
                : tamperActive && tamperField && editHex === null
                  ? 'text-amber-300/80 border-amber-500/30 bg-amber-500/5 cursor-pointer'
                  : 'text-[var(--color-primary)] border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5'
        }`}
          onClick={tamperActive && tamperField ? () => { setEditHex(hex); setExpanded(true); } : undefined}
        >
          {needsTruncate && !expanded ? truncateHex(currentHex) : currentHex}
        </div>
      )}
    </div>
  );
}

// ── IdenticalBadge / BreachedBadge ─────────────────────────────────────────

function IdenticalBadge({ label, quantumSafe = false }: { label: string; quantumSafe?: boolean }) {
  return (
    <div className="flex justify-center">
      <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-xs whitespace-nowrap ${
        quantumSafe
          ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-300'
          : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
      }`}>{label}</span>
    </div>
  );
}

function BreachedBadge({ label }: { label: string }) {
  return (
    <div className="flex justify-center">
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-0.5 font-mono text-xs text-red-400 whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

// ── SplitStepCard ──────────────────────────────────────────────────────────

function SplitStepCard({ number, title, desc, left, right, leftLabel, rightLabel, exchange, badge }: {
  number: string; title: string; desc: string;
  left: React.ReactNode; right: React.ReactNode;
  leftLabel: string; rightLabel: string;
  exchange?: Array<{ label: string; direction: '→' | '←' | '↔' }>;
  badge?: React.ReactNode;
}) {
  return (
    <div className="glass-panel rounded-xl border border-[var(--color-glass-border)] p-5 flex flex-col gap-4 animate-fade-up">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-[var(--color-primary)]">{number}</span>
        <h2 className="text-[var(--color-text-base)] font-semibold text-lg">{title}</h2>
        <p className="text-[var(--color-text-muted)] text-sm leading-relaxed">{desc}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_112px_1fr] gap-3">
        <div className="glass-panel rounded-lg p-3 flex flex-col gap-3">
          <span className="mono-label text-[var(--color-text-dim)] border-b border-[var(--color-glass-border)] pb-1.5">{leftLabel}</span>
          {left}
        </div>
        <div className="flex sm:flex-col items-center justify-center gap-3 py-1">
          {exchange?.map((item, i) => (
            <div key={i} className="flex flex-col items-center gap-1 text-center">
              <span className="font-mono text-base text-[var(--color-primary)]/80" aria-hidden="true">{item.direction}</span>
              <span className="font-mono text-[0.7rem] leading-tight text-[var(--color-text-muted)] whitespace-nowrap">{item.label}</span>
            </div>
          ))}
          {badge}
        </div>
        <div className="glass-panel rounded-lg p-3 flex flex-col gap-3">
          <span className="mono-label text-[var(--color-text-dim)] border-b border-[var(--color-glass-border)] pb-1.5">{rightLabel}</span>
          {right}
        </div>
      </div>
    </div>
  );
}

// ── StepCard (full-width) ──────────────────────────────────────────────────

function StepCard({ number, title, desc, children }: {
  number: string; title: string; desc: string; children: React.ReactNode;
}) {
  return (
    <div className="glass-panel rounded-xl border border-[var(--color-glass-border)] p-5 flex flex-col gap-4 animate-fade-up">
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
    <div aria-hidden="true"
      className={`w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin ${className ?? ''}`} />
  );
}

// ── RaceCard ───────────────────────────────────────────────────────────────

function RaceCard({ kem, entry }: { kem: KemAlgorithm; entry: RaceEntry }) {
  const t = useTranslations('playground');
  const isRunning = entry.phase === 'running';
  const isDone    = entry.phase === 'done';
  const isWaiting = entry.phase === 'waiting';

  return (
    <div className={`glass-panel rounded-lg border p-3 flex flex-col gap-2 ${
      isDone  ? 'border-emerald-500/20'
      : isRunning ? (kem === 'mceliece' ? 'border-amber-500/30' : 'border-[var(--color-primary)]/20')
      : 'border-[var(--color-glass-border)]'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono text-xs ${isDone ? 'text-emerald-400' : 'text-[var(--color-text-muted)]'}`}>
          {KEM_DISPLAY_NAMES[kem]}
        </span>
        {isRunning && <Spinner className={kem === 'mceliece' ? 'text-amber-400' : 'text-[var(--color-primary)]'} />}
        {isDone    && <span className="font-mono text-xs text-emerald-400">{t('raceDone')}</span>}
        {isWaiting && <span className="font-mono text-xs text-[var(--color-text-dim)]">{t('raceWaiting')}</span>}
        {entry.phase === 'error' && <span className="font-mono text-xs text-red-400">{t('raceError')}</span>}
      </div>
      {(isDone || entry.keygenMs !== undefined) && (
        <div className="flex flex-col gap-0.5">
          {entry.keygenMs !== undefined && (
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {t('raceKeygen', { t: fmtMs(entry.keygenMs) })}
            </span>
          )}
          {entry.encapMs !== undefined && (
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {t('raceEncap', { t: fmtMs(entry.encapMs) })}
            </span>
          )}
          {entry.decapMs !== undefined && (
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {t('raceDecap', { t: fmtMs(entry.decapMs) })}
            </span>
          )}
          {entry.totalMs !== undefined && (
            <span className={`font-mono text-xs font-semibold mt-0.5 ${
              entry.totalMs > 1000 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {t('raceTotal', { t: fmtMs(entry.totalMs) })}
            </span>
          )}
          {entry.pubKeyBytes !== undefined && (
            <span className="font-mono text-xs text-[var(--color-text-dim)] mt-0.5">
              {t('racePubKey', { size: formatBytes(entry.pubKeyBytes) })}
              {entry.ciphertextBytes !== undefined && ` · ${t('raceCiphertext', { size: formatBytes(entry.ciphertextBytes) })}`}
            </span>
          )}
        </div>
      )}
      {isRunning && entry.totalMs === undefined && (
        <span className="font-mono text-xs text-[var(--color-text-dim)]">{t('raceRunning')}</span>
      )}
    </div>
  );
}

// ── MallorySummaryCard ─────────────────────────────────────────────────────

const MALLORY_HAS_KEYS = [
  'mallorySummaryHas1', 'mallorySummaryHas2', 'mallorySummaryHas3',
  'mallorySummaryHas4', 'mallorySummaryHas5', 'mallorySummaryHas6', 'mallorySummaryHas7',
] as const;

function MallorySummaryCard({ kem, attackerMode, quantumMode }: {
  kem: KemAlgorithm; attackerMode: boolean; quantumMode: boolean;
}) {
  const t = useTranslations('playground');
  const cantBreakKey =
    kem === 'mlkem'    ? 'malloryCantBreakMlkem' :
    kem === 'mceliece' ? 'malloryCantBreakMceliece' : 'malloryCantBreakFrodokem';

  return (
    <div className="glass-panel rounded-xl border border-red-500/20 p-5 flex flex-col gap-4 animate-fade-up">
      {attackerMode && (
        <>
          <span className="font-mono text-xs text-red-400/80">{t('mallorySummaryTitle')}</span>
          <div className="flex flex-wrap gap-2">
            {MALLORY_HAS_KEYS.map(key => (
              <span key={key} className="font-mono text-xs px-2 py-0.5 rounded border border-red-500/20 bg-red-500/5 text-red-400/70">
                👁 {t(key)}
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-1.5 border-t border-[var(--color-glass-border)] pt-3">
            <span className="font-mono text-xs text-[var(--color-text-muted)]">{t('mallorySummaryNeeds')}</span>
            <p className="font-mono text-xs text-[var(--color-text-muted)] leading-relaxed">{t(cantBreakKey)}</p>
          </div>
        </>
      )}
      {quantumMode && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2.5 font-mono text-xs text-red-400/80 leading-relaxed">
          {t('mallorySummaryQuantum')}
        </div>
      )}
    </div>
  );
}

// ── RealWorldCard ──────────────────────────────────────────────────────────

const REAL_WORLD_ENTRIES = [
  {
    nameKey: 'realWorldChromeName',
    descKey: 'realWorldChromeDesc',
    href:    'https://security.googleblog.com/2023/08/towards-quantum-resilient-security-keys.html',
  },
  {
    nameKey: 'realWorldSignalName',
    descKey: 'realWorldSignalDesc',
    href:    'https://signal.org/blog/pqxdh/',
  },
  {
    nameKey: 'realWorldAppleName',
    descKey: 'realWorldAppleDesc',
    href:    'https://security.apple.com/blog/imessage-pq3/',
  },
  {
    nameKey: 'realWorldNistName',
    descKey: 'realWorldNistDesc',
    href:    'https://csrc.nist.gov/pubs/fips/203/final',
  },
  {
    nameKey: 'realWorldMetaName',
    descKey: 'realWorldMetaDesc',
    href:    'https://engineering.fb.com/2024/05/22/security/post-quantum-ready-encryption-signal-protocol/',
  },
] as const;

function RealWorldCard({ items }: { items?: RealWorldItem[] }) {
  const t = useTranslations('playground');
  // Use Strapi-sourced items if available; fall back to hardcoded i18n entries
  const entries: RealWorldItem[] = items && items.length > 0
    ? items
    : REAL_WORLD_ENTRIES.map(({ nameKey, descKey, href }) => ({
        name:        t(nameKey),
        description: t(descKey),
        link:        href,
      }));
  return (
    <div className="glass-panel rounded-xl border border-[var(--color-glass-border)] p-5 flex flex-col gap-4 animate-fade-up">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-[var(--color-primary)]">{t('realWorldTitle')}</span>
        <p className="font-mono text-xs text-[var(--color-text-muted)]">{t('realWorldIntro')}</p>
      </div>
      <table className="w-full border-collapse">
        <tbody>
          {entries.map(({ name, description, link }) => (
            <tr key={name} className="border-b border-[var(--color-glass-border)]/40 last:border-0 align-top">
              <td className="py-2 pr-5 shrink-0 w-px whitespace-nowrap">
                {link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer"
                    className="font-mono text-xs text-[var(--color-primary)] hover:underline">
                    {name}
                  </a>
                ) : (
                  <span className="font-mono text-xs text-[var(--color-primary)]">{name}</span>
                )}
              </td>
              <td className="py-2 font-mono text-xs text-[var(--color-text-muted)] leading-relaxed">
                {description}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── runOnce — single benchmark run via a fresh worker ───────────────────────

function runOnce(kem: KemAlgorithm, input: string): Promise<BenchmarkRun> {
  return new Promise((resolve, reject) => {
    const w = new Worker(
      new URL('../workers/playground-worker.ts', import.meta.url),
      { type: 'module' },
    );
    let keygenMs = 0, encapMs = 0, decapMs = 0;
    let pubKeyBytes = 0, ciphertextBytes = 0, ssBytes = 0;
    w.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;
      if (msg.type === 'step1') { keygenMs = msg.data.kemKeygenMs; pubKeyBytes = msg.data.kemServerPub.length; }
      if (msg.type === 'step3') { encapMs = msg.data.encapMs; decapMs = msg.data.decapMs; ciphertextBytes = msg.data.kemCiphertext.length; ssBytes = msg.data.kemSecret.length; }
      if (msg.type === 'step6') { w.terminate(); resolve({ keygenMs, encapMs, decapMs, pubKeyBytes, ciphertextBytes, ssBytes }); }
      if (msg.type === 'error') { w.terminate(); reject(new Error(msg.message)); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message ?? 'Worker error')); };
    w.postMessage({ type: 'start', plaintext: input, kem } satisfies WorkerInMessage);
  });
}

// ── Full statistical engine (no external deps) ──────────────────────────────

interface FullStats {
  mean:         number;
  median:       number;
  std:          number;   // sample std dev (df = n-1)
  cv:           number;   // coefficient of variation (%)
  min:          number;
  max:          number;
  ci95Half:     number;   // half-width of 95% CI (t-distribution)
  ci95Lo:       number;
  ci95Hi:       number;
  q1:           number;
  q3:           number;
  iqr:          number;
  fenceLo:      number;   // Q1 - 1.5 * IQR
  fenceHi:      number;   // Q3 + 1.5 * IQR
  whiskerLo:    number;   // farthest inlier ≥ fenceLo
  whiskerHi:    number;   // farthest inlier ≤ fenceHi
  outlierCount: number;
  trimmedMean:  number;   // mean of inliers only
  n:            number;
}

// Two-tailed t(0.025, df=n-1) critical values for 95% CI
const T95_TABLE: Record<number, number> = {
  4: 2.776, 5: 2.571, 6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262,
  10: 2.228, 11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145,
  15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093,
  24: 2.064, 29: 2.045,
};

function computeFullStats(vals: number[]): FullStats | null {
  const n = vals.length;
  if (n < 2) return null;
  const sorted = [...vals].sort((a, b) => a - b);
  const lerp = (t: number) => {
    const i = Math.floor(t), f = t - i;
    return f === 0 ? sorted[i] : sorted[i] + f * (sorted[Math.min(i + 1, n - 1)] - sorted[i]);
  };

  const mean     = vals.reduce((s, v) => s + v, 0) / n;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const std      = Math.sqrt(variance);
  const cv       = mean > 0 ? (std / mean) * 100 : 0;
  const median   = lerp((n - 1) * 0.50);
  const q1       = lerp((n - 1) * 0.25);
  const q3       = lerp((n - 1) * 0.75);
  const iqr      = q3 - q1;
  const fenceLo  = q1 - 1.5 * iqr;
  const fenceHi  = q3 + 1.5 * iqr;
  const inliers  = sorted.filter(v => v >= fenceLo && v <= fenceHi);
  const whiskerLo    = inliers[0]                    ?? sorted[0];
  const whiskerHi    = inliers[inliers.length - 1]   ?? sorted[n - 1];
  const outlierCount = n - inliers.length;
  const trimmedMean  = inliers.length > 0
    ? inliers.reduce((s, v) => s + v, 0) / inliers.length : mean;

  const tVal    = T95_TABLE[n - 1] ?? 2.093;
  const se      = std / Math.sqrt(n);
  const ci95Half = tVal * se;

  return {
    mean, median, std, cv,
    min: sorted[0], max: sorted[n - 1],
    ci95Half, ci95Lo: mean - ci95Half, ci95Hi: mean + ci95Half,
    q1, q3, iqr, fenceLo, fenceHi,
    whiskerLo, whiskerHi, outlierCount, trimmedMean, n,
  };
}

// ── Chart constants ─────────────────────────────────────────────────────────

const KEM_CLR: Record<KemAlgorithm, string> = {
  mlkem:    '#06b6d4',
  frodokem: '#a78bfa',
  mceliece: '#fbbf24',
};
const OUTLIER_CLR = '#f87171';

// 20 deterministic horizontal jitter offsets (px from group centre)
const JITTER20 = [
  -13, -9, -6, -3, -1, 1, 3, 6, 9, 13,
   14, -12, -8, -5, -2, 0, 2, 5, 8, -4,
];

// ── Grouped log-scale SVG chart ─────────────────────────────────────────────

interface ChartDataset {
  kem:    KemAlgorithm;
  values: number[];
  stats:  FullStats;
}

function BenchmarkChart({ title, datasets }: {
  title:    string;
  datasets: ChartDataset[];
}) {
  const t = useTranslations('playground');
  if (datasets.length === 0) return null;
  const allVals = datasets.flatMap(d => d.values).filter(v => v > 0);
  if (allVals.length === 0) return null;

  // Chart geometry
  const ML = 60, MR = 14, MT = 30, MB = 50;
  const VW = 500, VH = 250;
  const CW = VW - ML - MR;
  const CH = VH - MT - MB;

  // Log scale domain with padding
  const gMin = Math.min(...allVals);
  const gMax = Math.max(...allVals);
  const logLo = Math.log10(gMin) - 0.4;
  const logHi = Math.log10(gMax) + 0.4;
  const logSpan = logHi - logLo;

  const toY = (v: number): number => {
    if (v <= 0) return MT + CH;
    const t = (Math.log10(v) - logLo) / logSpan;
    return MT + CH * (1 - Math.max(0, Math.min(1, t)));
  };

  // Axis ticks: 1, 2, 5 × powers of 10 within range
  const ticks: number[] = [];
  for (let e = Math.floor(logLo); e <= Math.ceil(logHi); e++) {
    for (const m of [1, 2, 5]) {
      const v = m * Math.pow(10, e);
      if (v >= Math.pow(10, logLo) * 0.92 && v <= Math.pow(10, logHi) * 1.08) ticks.push(v);
    }
  }
  const uniqueTicks = [...new Set(ticks)].sort((a, b) => a - b);

  const fmtTick = (v: number): string => {
    if (v >= 1000) return `${+(v / 1000).toFixed(1)}s`;
    if (v >= 10)   return `${v.toFixed(0)}`;
    if (v >= 1)    return `${v.toFixed(1)}`;
    return `${v.toFixed(2)}`;
  };

  const GW    = CW / datasets.length;
  const gCx   = (i: number) => ML + GW * i + GW / 2;
  const BOX_W = Math.min(34, GW * 0.24);
  const CI_OFF = BOX_W / 2 + 13;

  // Legend items
  const LY = VH - 7;
  const LX = ML;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ height: 'auto', maxHeight: 260 }} aria-label={title}>
      {/* chart area */}
      <rect x={ML} y={MT} width={CW} height={CH} fill="rgba(15,23,42,0.55)" rx="3" />

      {/* grid + Y-axis ticks */}
      {uniqueTicks.map(v => {
        const y = toY(v);
        if (y < MT - 2 || y > MT + CH + 2) return null;
        return (
          <g key={v}>
            <line x1={ML} y1={y} x2={ML + CW} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={ML - 5} y={y + 3.5} textAnchor="end" fill="#94a3b8"
              fontSize="9" fontFamily="'JetBrains Mono',monospace">
              {fmtTick(v)}
            </text>
          </g>
        );
      })}

      {/* Y-axis */}
      <line x1={ML} y1={MT} x2={ML} y2={MT + CH} stroke="#334155" strokeWidth="1.2" />

      {/* Y-axis unit label (rotated) */}
      <text x={11} y={MT + CH / 2} textAnchor="middle" fill="#64748b"
        fontSize="9" fontFamily="'JetBrains Mono',monospace"
        transform={`rotate(-90 11 ${MT + CH / 2})`}>
        ms (log₁₀)
      </text>

      {/* Chart title */}
      <text x={ML + CW / 2} y={MT - 10} textAnchor="middle" fill="#cbd5e1"
        fontSize="11" fontFamily="'JetBrains Mono',monospace" fontWeight="bold">
        {title}
      </text>

      {/* Vertical group separators */}
      {datasets.map((_, i) => i > 0 && (
        <line key={i} x1={ML + GW * i} y1={MT} x2={ML + GW * i} y2={MT + CH}
          stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="3,3" />
      ))}

      {/* Per-dataset: box plot + CI + jitter */}
      {datasets.map(({ kem, values, stats: s }, gi) => {
        const cx   = gCx(gi);
        const clr  = KEM_CLR[kem];
        const yMed  = toY(s.median);
        const yQ1   = toY(s.q1);
        const yQ3   = toY(s.q3);
        const yWLo  = toY(s.whiskerLo);
        const yWHi  = toY(s.whiskerHi);
        const yMean = toY(s.mean);
        const ciLo  = Math.max(s.ci95Lo, Math.pow(10, logLo + 0.02));
        const ciHi  = Math.min(s.ci95Hi, Math.pow(10, logHi - 0.02));
        const yCiLo = toY(ciLo);
        const yCiHi = toY(ciHi);
        const boxTop = Math.min(yQ1, yQ3);
        const boxH   = Math.max(Math.abs(yQ3 - yQ1), 1);

        return (
          <g key={kem}>
            {/* Whisker lines */}
            <line x1={cx} y1={yWLo} x2={cx} y2={boxTop}
              stroke={clr} strokeWidth="1.2" opacity="0.4" />
            <line x1={cx} y1={boxTop + boxH} x2={cx} y2={yWHi}
              stroke={clr} strokeWidth="1.2" opacity="0.4" />
            {/* Whisker caps */}
            <line x1={cx - 6} y1={yWLo} x2={cx + 6} y2={yWLo}
              stroke={clr} strokeWidth="1.3" opacity="0.55" />
            <line x1={cx - 6} y1={yWHi} x2={cx + 6} y2={yWHi}
              stroke={clr} strokeWidth="1.3" opacity="0.55" />
            {/* IQR box */}
            <rect x={cx - BOX_W / 2} y={boxTop} width={BOX_W} height={boxH}
              fill={clr} fillOpacity="0.13" stroke={clr} strokeOpacity="0.5" strokeWidth="1.2" rx="2" />
            {/* Median line */}
            <line x1={cx - BOX_W / 2} y1={yMed} x2={cx + BOX_W / 2} y2={yMed}
              stroke={clr} strokeWidth="2.5" opacity="0.95" />
            {/* Mean diamond */}
            <polygon
              points={`${cx},${yMean - 4.5} ${cx + 4.5},${yMean} ${cx},${yMean + 4.5} ${cx - 4.5},${yMean}`}
              fill={clr} fillOpacity="0.55" />
            {/* 95% CI error bar (dashed, offset right of box) */}
            <g opacity="0.72">
              <line x1={cx + CI_OFF} y1={yCiLo} x2={cx + CI_OFF} y2={yCiHi}
                stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="2,1.5" />
              <line x1={cx + CI_OFF - 4} y1={yCiLo} x2={cx + CI_OFF + 4} y2={yCiLo}
                stroke="#e2e8f0" strokeWidth="1.5" />
              <line x1={cx + CI_OFF - 4} y1={yCiHi} x2={cx + CI_OFF + 4} y2={yCiHi}
                stroke="#e2e8f0" strokeWidth="1.5" />
            </g>
            {/* Jittered individual measurements */}
            {values.map((v, i) => {
              const y    = toY(v);
              const isOut = v < s.fenceLo || v > s.fenceHi;
              const jx   = cx + (JITTER20[i] ?? 0) * 0.6;
              return (
                <circle key={i} cx={jx} cy={y} r={isOut ? 3.5 : 2.5}
                  fill={isOut ? OUTLIER_CLR : clr}
                  opacity={isOut ? 0.9 : 0.4} />
              );
            })}
            {/* X-axis label */}
            <text x={cx} y={MT + CH + 14} textAnchor="middle" fill="#94a3b8"
              fontSize="9.5" fontFamily="'JetBrains Mono',monospace">
              {KEM_DISPLAY_NAMES[kem].split(' ').slice(0, 2).join('\u00A0')}
            </text>
            <text x={cx} y={MT + CH + 26} textAnchor="middle" fill="#64748b"
              fontSize="8.5" fontFamily="'JetBrains Mono',monospace">
              {KEM_DISPLAY_NAMES[kem].split(' ').slice(2).join('\u00A0')}
            </text>
          </g>
        );
      })}

      {/* Legend row */}
      <g fontSize="8" fontFamily="'JetBrains Mono',monospace" fill="#64748b">
        <circle cx={LX + 4}   cy={LY} r={2.5} fill="#94a3b8" opacity="0.4" />
        <text   x={LX + 10}  y={LY + 3}>{t('chartLegendMeasurement')}</text>
        <rect   x={LX + 57}  y={LY - 4} width={9} height={8}
          fill="#94a3b8" fillOpacity="0.13" stroke="#94a3b8" strokeOpacity="0.5" strokeWidth="1" rx="1" />
        <text   x={LX + 68}  y={LY + 3}>{t('chartLegendIQR')}</text>
        <line   x1={LX + 90} y1={LY} x2={LX + 102} y2={LY} stroke="#94a3b8" strokeWidth="2.5" opacity="0.9" />
        <text   x={LX + 105} y={LY + 3}>{t('chartLegendMedian')}</text>
        <polygon
          points={`${LX + 148},${LY - 3.5} ${LX + 153},${LY} ${LX + 148},${LY + 3.5} ${LX + 143},${LY}`}
          fill="#94a3b8" fillOpacity="0.55" />
        <text   x={LX + 156} y={LY + 3}>{t('chartLegendMean')}</text>
        <line   x1={LX + 191} y1={LY - 4} x2={LX + 191} y2={LY + 4}
          stroke="#e2e8f0" strokeWidth="1.5" opacity="0.72" />
        <text   x={LX + 196} y={LY + 3}>{t('chartLegendCI95')}</text>
        <circle cx={LX + 240} cy={LY} r={3} fill={OUTLIER_CLR} opacity="0.9" />
        <text   x={LX + 246} y={LY + 3}>{t('chartLegendOutliers')}</text>
      </g>
    </svg>
  );
}

// ── Numeric stats table (collapsible per KEM) ────────────────────────────────

function fmt2(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(2)}s`;
  if (v >= 100)  return `${v.toFixed(1)} ms`;
  if (v >= 1)    return `${v.toFixed(2)} ms`;
  return `${v.toFixed(3)} ms`;
}

// ── StatTooltip — label with hover tooltip ───────────────────────────────────

function StatTooltip({ label, tip }: { label: string; tip: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  function onEnter(e: React.MouseEvent) {
    setRect((e.currentTarget as HTMLElement).getBoundingClientRect());
  }

  const tooltipEl = mounted && rect ? (() => {
    const above = rect.top > 160;
    const left  = Math.max(8, Math.min(rect.left, window.innerWidth - 304));
    const top   = above ? rect.top - 8 : rect.bottom + 8;
    return createPortal(
      <div
        style={{ position: 'fixed', left, top, transform: above ? 'translateY(-100%)' : 'none', zIndex: 9999 }}
        className="w-72 rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-surface)] shadow-2xl px-4 py-3 pointer-events-none"
      >
        <div className="font-mono text-xs font-semibold text-[var(--color-text-base)] mb-1.5">{label}</div>
        <div className="font-sans text-xs text-[var(--color-text-muted)] leading-relaxed">{tip}</div>
      </div>,
      document.body,
    );
  })() : null;

  return (
    <span
      onMouseEnter={onEnter}
      onMouseLeave={() => setRect(null)}
      className="inline-flex items-center gap-1.5 cursor-help"
    >
      <span className="text-[var(--color-text-muted)] whitespace-nowrap">{label}</span>
      <span className="text-[var(--color-text-dim)] text-[0.6rem] leading-none select-none" aria-hidden="true">ⓘ</span>
      {tooltipEl}
    </span>
  );
}

// ── AbbrevTooltip — hoverable abbreviation with portal tooltip ───────────────

function AbbrevTooltip({ abbrev, full }: { abbrev: string; full: string }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const tooltipEl = mounted && rect ? createPortal(
    <div
      style={{ position: 'fixed', left: rect.left + rect.width / 2, top: rect.top - 6, transform: 'translate(-50%, -100%)', zIndex: 9999 }}
      className="rounded border border-[var(--color-glass-border)] bg-[var(--color-bg-surface)] shadow-xl px-2 py-1 pointer-events-none font-mono text-xs text-[var(--color-text-base)] whitespace-nowrap"
    >
      {full}
    </div>,
    document.body,
  ) : null;
  return (
    <span
      onMouseEnter={e => setRect((e.currentTarget as HTMLElement).getBoundingClientRect())}
      onMouseLeave={() => setRect(null)}
      className="cursor-help border-b border-dotted border-[var(--color-text-dim)]"
    >
      {abbrev}{tooltipEl}
    </span>
  );
}

// ── Stats rows: [display label, tooltip i18n key, value formatter] ───────────

// [labelKey, tooltipKey, valueFormatter]
const STAT_ROWS: [string, string, (s: FullStats) => string][] = [
  ['statMean',     'tooltipMean',     s => fmt2(s.mean)],
  ['statMedian',   'tooltipMedian',   s => fmt2(s.median)],
  ['statStd',      'tooltipStd',      s => fmt2(s.std)],
  ['statCV',       'tooltipCV',       s => `${s.cv.toFixed(1)} %`],
  ['statCI95',     'tooltipCI95',     s => `± ${fmt2(s.ci95Half)}`],
  ['statMinMax',   'tooltipMinMax',   s => `${fmt2(s.min)} – ${fmt2(s.max)}`],
  ['statIQR',      'tooltipIQR',      s => fmt2(s.iqr)],
  ['statOutliers', 'tooltipOutliers', s => s.outlierCount === 0 ? '–' : `${s.outlierCount}`],
  ['statTrimmed',  'tooltipTrimmed',  s => fmt2(s.trimmedMean)],
];

function StatsTable({ kem, kg, ec, dc, pubKeyBytes, ciphertextBytes, ssBytes }: {
  kem: KemAlgorithm; kg: FullStats; ec: FullStats; dc: FullStats;
  pubKeyBytes: number; ciphertextBytes: number; ssBytes: number;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('playground');
  const isMc    = kem === 'mceliece';
  const isFrodo = kem === 'frodokem';
  const clr     = isMc ? 'text-amber-400' : isFrodo ? 'text-violet-400' : 'text-[var(--color-primary)]';
  const border  = isMc ? 'border-amber-500/20' : isFrodo ? 'border-violet-500/20' : 'border-[var(--color-primary)]/20';

  return (
    <div className={`rounded-lg border overflow-hidden ${border}`}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/2 transition-colors">
        <span className={`font-mono text-xs font-semibold ${clr}`}>{KEM_DISPLAY_NAMES[kem]}</span>
        <div className="flex items-center gap-3 font-mono text-xs text-[var(--color-text-muted)]">
          <span className="hidden sm:inline tabular-nums opacity-70">
            <AbbrevTooltip abbrev="PK" full="Public Key" /> {formatBytes(pubKeyBytes)} · <AbbrevTooltip abbrev="CT" full="Ciphertext" /> {formatBytes(ciphertextBytes)} · <AbbrevTooltip abbrev="SS" full="Shared Secret" /> {formatBytes(ssBytes)}
          </span>
          <span className="tabular-nums">Keygen {fmt2(kg.median)} <span className="opacity-50">med</span></span>
          <span>{open ? '−' : '+'}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-[var(--color-glass-border)] overflow-x-auto">
          <table className="w-full font-mono text-xs">
            <thead>
              <tr className="border-b border-[var(--color-glass-border)]">
                <th className="text-left px-4 py-1.5 text-[var(--color-text-muted)] font-normal whitespace-nowrap">{t('statMetric')}</th>
                <th className="text-right px-3 py-1.5 font-normal whitespace-nowrap">
                  <span className={clr}>Keygen</span>
                </th>
                <th className="text-right px-3 py-1.5 text-[var(--color-text-muted)] font-normal whitespace-nowrap">Encap</th>
                <th className="text-right px-4 py-1.5 text-[var(--color-text-muted)] font-normal whitespace-nowrap">Decap</th>
              </tr>
            </thead>
            <tbody>
              {STAT_ROWS.map(([labelKey, tipKey, fn]) => (
                <tr key={labelKey} className="border-b border-[var(--color-glass-border)]/30 hover:bg-white/[0.02]">
                  <td className="px-4 py-1.5">
                    <StatTooltip label={t(labelKey as Parameters<typeof t>[0])} tip={t(tipKey as Parameters<typeof t>[0])} />
                  </td>
                  <td className={`text-right px-3 py-1.5 tabular-nums ${clr}`}>{fn(kg)}</td>
                  <td className="text-right px-3 py-1.5 tabular-nums text-[var(--color-text-base)]">{fn(ec)}</td>
                  <td className="text-right px-4 py-1.5 tabular-nums text-[var(--color-text-base)]">{fn(dc)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── BenchmarkPanel ──────────────────────────────────────────────────────────

const BENCH_KEMS: KemAlgorithm[] = ['mlkem', 'frodokem', 'mceliece'];

function BenchmarkPanel({ benchmark, active, onStop, onClose, onShare, shareCopied }: {
  benchmark:   Partial<Record<KemAlgorithm, BenchmarkKemState>>;
  active:      boolean;
  onStop:      () => void;
  onClose:     () => void;
  onShare?:    () => void;
  shareCopied?: boolean;
}) {
  const t = useTranslations('playground');

  // Compute full stats per KEM (fast for n=20, no memoization needed)
  function getStats(k: KemAlgorithm) {
    const state = benchmark[k];
    if (!state || state.runs.length < 2) return null;
    const kg = computeFullStats(state.runs.map(r => r.keygenMs));
    const ec = computeFullStats(state.runs.map(r => r.encapMs));
    const dc = computeFullStats(state.runs.map(r => r.decapMs));
    if (!kg || !ec || !dc) return null;
    const first = state.runs[0];
    return { kg, ec, dc, runs: state.runs, n: state.runs.length,
      pubKeyBytes: first.pubKeyBytes, ciphertextBytes: first.ciphertextBytes, ssBytes: first.ssBytes };
  }

  function chartDatasets(op: keyof BenchmarkRun): ChartDataset[] {
    return BENCH_KEMS.flatMap(k => {
      const s = getStats(k);
      if (!s || s.n < 3) return [];
      const vals  = s.runs.map(r => r[op]);
      const stats = op === 'keygenMs' ? s.kg : op === 'encapMs' ? s.ec : s.dc;
      return [{ kem: k, values: vals, stats }];
    });
  }

  const hasCharts = BENCH_KEMS.some(k => (benchmark[k]?.runs.length ?? 0) >= 3);
  const allDone   = BENCH_KEMS.every(k => {
    const s = benchmark[k];
    return s && (s.status === 'done' || s.status === 'error');
  });

  return (
    <div className="glass-panel rounded-xl border border-[var(--color-glass-border)] p-5 flex flex-col gap-5 animate-fade-up">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-[var(--color-primary)]">{t('benchmarkTitle')}</span>
        <div className="flex items-center gap-2">
          {active && (
            <button onClick={onStop}
              className="font-mono text-xs px-2.5 py-1 rounded border border-red-500/30 text-red-400/70 hover:border-red-400 hover:text-red-400 transition-colors">
              {t('benchmarkStop')}
            </button>
          )}
          {!active && onShare && allDone && (
            <button onClick={onShare}
              className="font-mono text-xs px-2.5 py-1 rounded border border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors">
              {shareCopied ? t('shareCopied') : t('shareButton')}
            </button>
          )}
          {!active && (
            <button onClick={onClose}
              className="font-mono text-xs px-2.5 py-1 rounded border border-[var(--color-glass-border)] text-[var(--color-text-dim)] hover:border-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] transition-colors">
              {t('benchmarkClose')}
            </button>
          )}
        </div>
      </div>

      {/* ── Progress row (while still running) ── */}
      {!allDone && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {BENCH_KEMS.map(k => {
            const state = benchmark[k];
            if (!state) return null;
            const isMc = k === 'mceliece';
            const clr  = isMc ? 'text-amber-400' : k === 'frodokem' ? 'text-violet-400' : 'text-[var(--color-primary)]';
            const isDone    = state.status === 'done';
            const isRunning = state.status === 'running';
            const isWaiting = state.status === 'waiting';
            return (
              <div key={k} className={`rounded-lg border p-3 flex flex-col gap-1 ${
                isDone    ? 'border-emerald-500/20'
                : isRunning ? (isMc ? 'border-amber-500/30' : 'border-[var(--color-primary)]/20')
                : 'border-[var(--color-glass-border)]'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-mono text-xs font-semibold ${clr}`}>{KEM_DISPLAY_NAMES[k]}</span>
                  {isRunning && <Spinner className={isMc ? 'text-amber-400' : 'text-[var(--color-primary)]'} />}
                </div>
                <span className={`font-mono text-xs tabular-nums ${
                  isDone ? 'text-emerald-400' : isWaiting ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text-base)]'
                }`}>
                  {isWaiting ? t('benchmarkWaiting')
                  : state.status === 'error' ? t('benchmarkError')
                  : t('benchmarkProgress', { current: state.runs.length, total: state.total })}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Three charts: Keygen / Encap / Decap ── */}
      {hasCharts && (
        <div className="flex flex-col gap-3">
          {([
            { op: 'keygenMs' as const, label: t('benchmarkKeygen') },
            { op: 'encapMs'  as const, label: t('benchmarkEncap') },
            { op: 'decapMs'  as const, label: t('benchmarkDecap') },
          ] as const).map(({ op, label }) => {
            const ds = chartDatasets(op);
            if (ds.length === 0) return null;
            return (
              <div key={op} className="rounded-lg border border-[var(--color-glass-border)] overflow-hidden p-1">
                <BenchmarkChart title={`// ${label}`} datasets={ds} />
              </div>
            );
          })}
        </div>
      )}

      {/* ── Numeric stats tables (collapsible per KEM) ── */}
      {allDone && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs text-[var(--color-text-muted)]">{t('benchmarkStatsTitle')}</span>
          {BENCH_KEMS.map(k => {
            const s = getStats(k);
            if (!s) return null;
            return <StatsTable key={k} kem={k} kg={s.kg} ec={s.ec} dc={s.dc}
              pubKeyBytes={s.pubKeyBytes} ciphertextBytes={s.ciphertextBytes} ssBytes={s.ssBytes} />;
          })}
        </div>
      )}

      <span className="font-mono text-xs text-[var(--color-text-muted)] leading-relaxed">
        {t('benchmarkNote')}
      </span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function HybridPlayground({ snippetHtmls, realWorldItems, initialState }: HybridPlaygroundProps) {
  const t = useTranslations('playground');

  const [plaintext,    setPlaintext]    = useState('');
  const [kem,          setKem]          = useState<KemAlgorithm>('mlkem');
  const [phase,        setPhase]        = useState<Phase>('idle');
  const [steps,        setSteps]        = useState<PlaygroundSteps>({});
  const [error,        setError]        = useState('');
  const [elapsed,      setElapsed]      = useState(0);
  const [attackerMode, setAttackerMode] = useState(false);
  const [quantumMode,  setQuantumMode]  = useState(false);
  const [tamperMode,    setTamperMode]    = useState(false);
  const [tamperReplay,  setTamperReplay]  = useState<TamperReplay | null>(null);
  const [tamperRunning, setTamperRunning] = useState(false);
  const [race,          setRace]          = useState<Partial<Record<KemAlgorithm, RaceEntry>>>({});
  const [raceActive,   setRaceActive]   = useState(false);
  const [shareCopied,          setShareCopied]          = useState(false);
  const [benchmarkShareCopied, setBenchmarkShareCopied] = useState(false);
  const [benchmark,    setBenchmark]    = useState<Partial<Record<KemAlgorithm, BenchmarkKemState>>>({});
  const [benchmarkActive, setBenchmarkActive] = useState(false);

  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef       = useRef(0);
  const workerRef        = useRef<Worker | null>(null);
  const raceWorkers      = useRef<Partial<Record<KemAlgorithm, Worker>>>({});
  const benchmarkAbortRef = useRef(false);

  const stopTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  // Restore shared state from URL
  useEffect(() => {
    if (!initialState) return;
    if (initialState.type === 'run') {
      setKem(initialState.kem);
      setSteps({
        1: {
          clientX25519Priv: fromHex(initialState.s1.cxPriv),
          clientX25519Pub:  fromHex(initialState.s1.cxPub),
          serverX25519Priv: fromHex(initialState.s1.sxPriv),
          serverX25519Pub:  fromHex(initialState.s1.sxPub),
          kemServerPriv:    fromHex(initialState.s1.kemPriv),
          kemServerPub:     fromHex(initialState.s1.kemPub),
          kemKeygenMs:      initialState.s1.keygenMs,
          kem:              initialState.kem,
        } satisfies Step1Data,
        2: {
          x25519Secret:       fromHex(initialState.s2.secret),
          x25519SecretServer: fromHex(initialState.s2.secret),
        } satisfies Step2Data,
        3: {
          kemCiphertext:   fromHex(initialState.s3.ct),
          kemSecret:       fromHex(initialState.s3.kemSecret),
          kemSecretServer: fromHex(initialState.s3.kemSecret),
          encapMs:         initialState.s3.encapMs,
          decapMs:         initialState.s3.decapMs,
        } satisfies Step3Data,
        4: {
          hkdfSalt:          fromHex(initialState.s4.salt),
          combinedKey:       fromHex(initialState.s4.key),
          combinedKeyServer: fromHex(initialState.s4.key),
        } satisfies Step4Data,
        5: {
          iv:            fromHex(initialState.s5.iv),
          ciphertext:    fromHex(initialState.s5.ct),
          plaintextUsed: initialState.s5.plaintext,
        } satisfies Step5Data,
        6: { decrypted: initialState.s6.decrypted } satisfies Step6Data,
      });
      setPhase('done');
    } else {
      setBenchmark(initialState.benchmark);
    }
  }, [initialState]);

  useEffect(() => () => {
    stopTimer();
    workerRef.current?.terminate();
    workerRef.current = null;
    Object.values(raceWorkers.current).forEach(w => w?.terminate());
    raceWorkers.current = {};
    benchmarkAbortRef.current = true;
  }, []);

  // ── Main run ────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    const input = plaintext.trim() || t('defaultPlaintext');

    workerRef.current?.terminate();
    workerRef.current = null;
    stopTimer();
    setPhase('running');
    setSteps({});
    setError('');
    setElapsed(0);
    setTamperMode(false);
    setTamperReplay(null);
    setTamperRunning(false);
    elapsedRef.current = 0;

    timerRef.current = setInterval(() => {
      elapsedRef.current = Math.round((elapsedRef.current + TIMER_INCREMENT_S) * 10) / 10;
      setElapsed(elapsedRef.current);
    }, TIMER_INTERVAL_MS);

    const worker = new Worker(
      new URL('../workers/playground-worker.ts', import.meta.url),
      { type: 'module' },
    );
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;
      if (msg.type === 'error') {
        stopTimer(); setError(msg.message); setPhase('error'); worker.terminate(); return;
      }
      // Tamper cascade messages — update step overlays progressively
      if (msg.type === 'tamper-step3') {
        setTamperReplay(prev => prev ? { ...prev, step3: { kemSecretServer: msg.kemSecretServer } } : prev);
        return;
      }
      if (msg.type === 'tamper-step4') {
        setTamperReplay(prev => prev ? { ...prev, step4: { combinedKeyServer: msg.combinedKeyServer } } : prev);
        return;
      }
      if (msg.type === 'tamper-step6') {
        setTamperReplay(prev => prev ? { ...prev, step6Error: msg.errorKey } : prev);
        setTamperRunning(false);
        return;
      }
      const step = parseInt(msg.type.replace('step', ''), 10) as keyof PlaygroundSteps;
      setSteps(prev => ({ ...prev, [step]: (msg as { data: unknown }).data }));
      if (msg.type === 'step6') {
        stopTimer();
        setPhase('done');
        // Worker stays alive for tamper mode — NOT terminated here
      }
    };

    worker.onerror = (e) => {
      stopTimer(); setError(e.message ?? 'Worker error'); setPhase('error'); worker.terminate();
    };

    worker.postMessage({ type: 'start', plaintext: input, kem } satisfies WorkerInMessage);
  }, [plaintext, kem, t]);

  // ── Tamper ──────────────────────────────────────────────────────────────

  function handleTamper(field: TamperField, bytes: Uint8Array) {
    if (!workerRef.current) return;
    // Start a fresh replay for this field — steps arrive progressively
    setTamperReplay({ field });
    setTamperRunning(true);
    workerRef.current.postMessage({ type: 'tamper', field, bytes } satisfies WorkerInMessage);
  }

  function handleTamperReset() {
    setTamperReplay(null);
    setTamperRunning(false);
  }

  // ── KEM Race ────────────────────────────────────────────────────────────

  const handleRace = useCallback(() => {
    // Terminate any previous race workers
    Object.values(raceWorkers.current).forEach(w => w?.terminate());
    raceWorkers.current = {};

    const kems: KemAlgorithm[] = ['mlkem', 'mceliece', 'frodokem'];
    const raceStart = performance.now();
    setRaceActive(true);
    setRace(Object.fromEntries(kems.map(k => [k, { phase: 'waiting' as const }])));

    kems.forEach(k => {
      setRace(prev => ({ ...prev, [k]: { phase: 'running' } }));
      const w = new Worker(
        new URL('../workers/playground-worker.ts', import.meta.url),
        { type: 'module' },
      );
      raceWorkers.current[k] = w;
      const input = plaintext.trim() || t('defaultPlaintext');

      w.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
        const msg = e.data;
        if (msg.type === 'error') {
          setRace(prev => ({ ...prev, [k]: { phase: 'error' } }));
          w.terminate();
          return;
        }
        if (msg.type === 'step1') {
          setRace(prev => ({
            ...prev,
            [k]: { ...(prev[k] ?? {}), phase: 'running', keygenMs: msg.data.kemKeygenMs, pubKeyBytes: msg.data.kemServerPub.length },
          }));
        }
        if (msg.type === 'step3') {
          setRace(prev => ({
            ...prev,
            [k]: { ...(prev[k] ?? {}), encapMs: msg.data.encapMs, decapMs: msg.data.decapMs, ciphertextBytes: msg.data.kemCiphertext.length },
          }));
        }
        if (msg.type === 'step6') {
          const elapsed = performance.now() - raceStart;
          setRace(prev => ({ ...prev, [k]: { ...(prev[k] ?? {}), phase: 'done', totalMs: elapsed } }));
          // Accumulate stats for comparison table
          if (msg.type === 'step6') {
            // stats will be filled from step1/step3 already collected above
          }
          w.terminate();
        }
      };

      w.onerror = () => { setRace(prev => ({ ...prev, [k]: { phase: 'error' } })); w.terminate(); };
      w.postMessage({ type: 'start', plaintext: input, kem: k } satisfies WorkerInMessage);
    });
  }, [plaintext, t]);

  // ── Benchmark ───────────────────────────────────────────────────────────

  const handleBenchmark = useCallback(async () => {
    benchmarkAbortRef.current = false;
    setBenchmarkActive(true);
    const N = 20;
    const kems: KemAlgorithm[] = ['mlkem', 'frodokem', 'mceliece'];
    const input = plaintext.trim() || t('defaultPlaintext');

    setBenchmark(Object.fromEntries(kems.map(k => [k, { status: 'waiting' as const, runs: [], total: N }])));

    for (const k of kems) {
      if (benchmarkAbortRef.current) break;
      setBenchmark(prev => ({ ...prev, [k]: { ...(prev[k]!), status: 'running' } }));

      let hadError = false;
      for (let i = 0; i < N; i++) {
        if (benchmarkAbortRef.current) break;
        try {
          const run = await runOnce(k, input);
          setBenchmark(prev => {
            const existing = prev[k]!;
            return { ...prev, [k]: { ...existing, runs: [...existing.runs, run] } };
          });
        } catch {
          setBenchmark(prev => ({ ...prev, [k]: { ...(prev[k]!), status: 'error' } }));
          hadError = true;
          break;
        }
      }

      if (!hadError) {
        setBenchmark(prev => ({ ...prev, [k]: { ...(prev[k]!), status: 'done' } }));
      }
    }

    setBenchmarkActive(false);
  }, [plaintext, t]);

  // ── URL Share ───────────────────────────────────────────────────────────

  function handleShare() {
    if (!steps[1] || !steps[2] || !steps[3] || !steps[4] || !steps[5] || !steps[6]) return;
    const state: KemRunShareState = {
      v: 1, mode: 'encryption', type: 'run', kem: steps[1].kem,
      s1: {
        cxPub:   toHex(steps[1].clientX25519Pub),
        cxPriv:  toHex(steps[1].clientX25519Priv),
        sxPub:   toHex(steps[1].serverX25519Pub),
        sxPriv:  toHex(steps[1].serverX25519Priv),
        kemPub:  toHex(steps[1].kemServerPub),
        kemPriv: toHex(steps[1].kemServerPriv),
        keygenMs: steps[1].kemKeygenMs,
      },
      s2: { secret: toHex(steps[2].x25519Secret) },
      s3: {
        ct:        toHex(steps[3].kemCiphertext),
        kemSecret: toHex(steps[3].kemSecret),
        encapMs:   steps[3].encapMs,
        decapMs:   steps[3].decapMs,
      },
      s4: { salt: toHex(steps[4].hkdfSalt), key: toHex(steps[4].combinedKey) },
      s5: { iv: toHex(steps[5].iv), ct: toHex(steps[5].ciphertext), plaintext: steps[5].plaintextUsed },
      s6: { decrypted: steps[6].decrypted },
    };
    const encoded = encodeShareState(state);
    history.replaceState(null, '', `${window.location.pathname}#state=${encoded}`);
    navigator.clipboard.writeText(window.location.href).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), SHARE_TIMEOUT_MS);
    });
  }

  function handleBenchmarkShare() {
    const state: KemBenchmarkShareState = { v: 1, mode: 'encryption', type: 'benchmark', benchmark };
    const encoded = encodeShareState(state);
    history.replaceState(null, '', `${window.location.pathname}#state=${encoded}`);
    navigator.clipboard.writeText(window.location.href).then(() => {
      setBenchmarkShareCopied(true);
      setTimeout(() => setBenchmarkShareCopied(false), SHARE_TIMEOUT_MS);
    });
  }

  const isMcEliece = kem === 'mceliece';
  const isRunning  = phase === 'running';

  const s1 = steps[1], s2 = steps[2], s3 = steps[3];
  const s4 = steps[4], s5 = steps[5], s6 = steps[6];

  const kemSectionKey =
    s1?.kem === 'mlkem' ? 'mlkemSection' : s1?.kem === 'mceliece' ? 'mcElieceSection' : 'frodoKemSection';
  const kemCtKey =
    s1?.kem === 'mlkem' ? 'kemCiphertextMlKem' : s1?.kem === 'mceliece' ? 'kemCiphertextMcEliece' : 'kemCiphertextFrodoKem';
  const kemSsKey =
    s1?.kem === 'mlkem' ? 'kemSharedSecretMlKem' : s1?.kem === 'mceliece' ? 'kemSharedSecretMcEliece' : 'kemSharedSecretFrodoKem';

  return (
    <div>
      {/* ── Header ── */}
      <header className="mb-8">
        <p className="mono-label text-[var(--color-primary)] mb-2">{t('label')}</p>
        <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-text-base)]">{t('title')}</h1>
        <p className="mt-4 text-[var(--color-text-muted)] leading-relaxed">{t('intro')}</p>
      </header>

      <div className="flex flex-col gap-8">

        {/* ── Input + Config panel ── */}
        <div className="glass-panel rounded-xl border border-[var(--color-glass-border)] p-5 flex flex-col gap-5">

          {/* KEM selector */}
          <div className="flex flex-col gap-2">
            <span className="mono-label text-[var(--color-text-muted)]">{t('kemLabel')}</span>
            <div className="flex flex-wrap gap-2">
              {(['mlkem', 'mceliece', 'frodokem'] as KemAlgorithm[]).map(k => (
                <button key={k}
                  onClick={() => { setKem(k); setSteps({}); setPhase('idle'); setTamperMode(false); setTamperReplay(null); setTamperRunning(false); }}
                  disabled={isRunning}
                  className={`font-mono text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                    kem === k
                      ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                      : 'border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                  }`}>
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
            <ImplInfoPanel toggleLabel={t('implToggle')} packageLabel={t('implPackageLabel')}
              snippetLabel={t('implSnippetLabel')} packageName="@noble/post-quantum"
              packageUrl="https://github.com/paulmillr/noble-post-quantum"
              snippetHtml={snippetHtmls.mlkem} prose={t('mlkemImplProse')}
              articleIntro={t('implArticleIntro')} articleSlug="ML-KEM"
              articleLinkText={t('implArticleLink')} articleComingSoon="" />
          )}
          {kem === 'mceliece' && (
            <ImplInfoPanel toggleLabel={t('implToggle')} packageLabel={t('implPackageLabel')}
              snippetLabel={t('implSnippetLabel')} packageName="mceliece"
              packageUrl="https://github.com/cyph/pqcrypto.js/tree/master/packages/mceliece"
              snippetHtml={snippetHtmls.mceliece} prose={t('mcElieceImplProse')}
              articleIntro={t('implArticleIntro')} articleSlug={null}
              articleLinkText={t('implArticleLink')} articleComingSoon={t('implArticleComingSoon')} />
          )}
          {kem === 'frodokem' && (
            <ImplInfoPanel toggleLabel={t('implToggle')} packageLabel={t('implPackageLabel')}
              snippetLabel={t('implSnippetLabel')} packageName="@oqs/liboqs-js"
              packageUrl="https://github.com/openforge-sh/liboqs-node"
              snippetHtml={snippetHtmls.frodokem} prose={t('frodoKemImplProse')}
              articleIntro={t('implArticleIntro')} articleSlug={null}
              articleLinkText={t('implArticleLink')} articleComingSoon={t('implArticleComingSoonFrodoKem')} />
          )}

          {/* Plaintext input */}
          <div className="flex flex-col gap-2">
            <label htmlFor="pg-input" className="mono-label text-[var(--color-text-muted)]">{t('inputLabel')}</label>
            <input id="pg-input" type="text" value={plaintext}
              onChange={e => setPlaintext(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !isRunning) handleGenerate(); }}
              placeholder={t('inputPlaceholder')}
              className="w-full rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-base)] px-4 py-3 font-mono text-sm text-[var(--color-text-base)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]" />
          </div>

          {/* Generate + Race buttons + legend */}
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => handleGenerate()} disabled={isRunning}
              className="rounded-lg bg-[var(--color-primary)] px-5 py-2.5 font-mono text-sm font-semibold text-[var(--color-bg-base)] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
              {isRunning ? t('generating') : t('generateButton')}
            </button>
            <button onClick={handleRace} disabled={isRunning}
              className="rounded-lg border border-[var(--color-glass-border)] px-4 py-2.5 font-mono text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {t('raceButton')}
            </button>
            <button onClick={() => void handleBenchmark()} disabled={isRunning || benchmarkActive}
              className="rounded-lg border border-[var(--color-glass-border)] px-4 py-2.5 font-mono text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {t('benchmarkButton')}
            </button>
            <div className="flex gap-4 text-xs text-[var(--color-text-muted)] ml-auto">
              <span className="flex items-center gap-1.5">🔒 {t('legendPrivate')}</span>
              <span className="flex items-center gap-1.5">
                <span className="text-[var(--color-primary)]">📢</span> {t('legendPublic')}
              </span>
            </div>
          </div>
        </div>

        {/* ── KEM Race Panel ── */}
        {raceActive && Object.keys(race).length > 0 && (
          <div className="glass-panel rounded-xl border border-[var(--color-glass-border)] p-5 flex flex-col gap-4 animate-fade-up">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-xs text-[var(--color-primary)]">{t('raceTitle')}</span>
              <button
                onClick={() => { setRace({}); setRaceActive(false); }}
                className="font-mono text-xs px-2.5 py-1 rounded border border-[var(--color-glass-border)] text-[var(--color-text-dim)] hover:border-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] transition-colors">
                {t('benchmarkClose')}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(['mlkem', 'frodokem', 'mceliece'] as KemAlgorithm[]).map(k => (
                <RaceCard key={k} kem={k} entry={race[k] ?? { phase: 'waiting' }} />
              ))}
            </div>
          </div>
        )}

        {/* ── Benchmark Panel ── */}
        {Object.keys(benchmark).length > 0 && (
          <BenchmarkPanel
            benchmark={benchmark}
            active={benchmarkActive}
            onStop={() => { benchmarkAbortRef.current = true; }}
            onClose={() => { setBenchmark({}); history.replaceState(null, '', '#encryption'); }}
            onShare={handleBenchmarkShare}
            shareCopied={benchmarkShareCopied}
          />
        )}

        {/* ── Loading indicator ── */}
        {isRunning && (
          <div className={`glass-panel rounded-xl p-5 flex flex-col gap-3 border ${
            isMcEliece ? 'border-amber-500/30 bg-amber-500/5' : 'border-[var(--color-glass-border)]'
          }`}>
            <div className={`flex items-center gap-3 ${isMcEliece ? 'text-amber-400' : 'text-[var(--color-primary)]'}`}>
              <Spinner />
              <span className="font-mono text-sm">{isMcEliece ? t('mcElieceGenerating') : t('generating')}</span>
              {elapsed > 0 && (
                <span className="ml-auto font-mono text-xs opacity-70">
                  {t('mcElieceTimer', { elapsed: elapsed.toFixed(1) })}
                </span>
              )}
            </div>
            {isMcEliece && (
              <p className="font-mono text-xs text-[var(--color-text-muted)]">{t('mcElieceGeneratingNote')}</p>
            )}
          </div>
        )}

        {/* ── Error ── */}
        {phase === 'error' && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 font-mono text-sm text-red-400">
            // error: {error}
          </div>
        )}

        {/* ── Mode Toggles + Share ── */}
        {(phase === 'running' || phase === 'done') && (
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setAttackerMode(v => !v)}
              className={`font-mono text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                attackerMode
                  ? 'border-red-500/40 text-red-400 bg-red-500/10'
                  : 'border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:border-red-500/40 hover:text-red-400'
              }`}>
              {t(attackerMode ? 'attackerModeOff' : 'attackerModeOn')}
            </button>
            <button onClick={() => setQuantumMode(v => !v)}
              className={`font-mono text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                quantumMode
                  ? 'border-red-500/40 text-red-400 bg-red-500/10'
                  : 'border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:border-red-500/40 hover:text-red-400'
              }`}>
              {t(quantumMode ? 'quantumModeOff' : 'quantumModeOn')}
            </button>
            {phase === 'done' && (
              <>
                <button onClick={() => { setTamperMode(v => !v); setTamperReplay(null); setTamperRunning(false); }}
                  className={`font-mono text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                    tamperMode
                      ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                      : 'border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:border-amber-500/40 hover:text-amber-400'
                  }`}>
                  {t(tamperMode ? 'tamperToggleActive' : 'tamperToggle')}
                </button>
                <button onClick={handleShare} className="ml-auto font-mono text-xs px-3 py-1.5 rounded-lg border border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors">
                  {shareCopied ? t('shareCopied') : t('shareButton')}
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Tamper Mode hint ── */}
        {tamperMode && phase === 'done' && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 font-mono text-xs text-amber-400/80">
            {t('tamperHint')}
          </div>
        )}

        {/* ── Steps ── */}
        <AttackerContext.Provider value={{ attackerMode, quantumMode }}>
          <div className="flex flex-col gap-6">

            {/* Step 1 — Key generation */}
            {s1 && (
              <SplitStepCard number="// step 01" title={t('step1Title')} desc={t('step1Desc')}
                leftLabel={t('keyClient')} rightLabel={t('keyServer')}
                exchange={[
                  { label: t('exchangeX25519Pubs'), direction: '↔' },
                  { label: t('exchangeKemPub'),     direction: '←' },
                ]}
                left={
                  <div className="flex flex-col gap-2">
                    <span className="font-mono text-xs text-[var(--color-text-muted)] border-b border-[var(--color-glass-border)] pb-1">
                      {t('x25519Section')}
                    </span>
                    <HexField label={t('keyClient')} bytes={s1.clientX25519Priv} isPrivate={true} />
                    <HexField label={t('keyClient')} bytes={s1.clientX25519Pub}  isPrivate={false} />
                  </div>
                }
                right={
                  <>
                    <div className="flex flex-col gap-2">
                      <span className="font-mono text-xs text-[var(--color-text-muted)] border-b border-[var(--color-glass-border)] pb-1">
                        {t('x25519Section')}
                      </span>
                      <HexField label={t('keyServer')} bytes={s1.serverX25519Priv} isPrivate={true} />
                      <HexField label={t('keyServer')} bytes={s1.serverX25519Pub}  isPrivate={false} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-baseline justify-between border-b border-[var(--color-glass-border)] pb-1">
                        <span className="font-mono text-xs text-[var(--color-text-muted)]">
                          {t(kemSectionKey as Parameters<typeof t>[0])}
                        </span>
                        <span title={t('keygenTimeTitle')}
                          className={`font-mono text-xs ${s1.kemKeygenMs > 1000 ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {t('keygenTime', { ms: Math.round(s1.kemKeygenMs).toLocaleString() })}
                        </span>
                      </div>
                      <HexField label={t('keyServer')} bytes={s1.kemServerPriv} isPrivate={true} />
                      <HexField label={t('keyServer')} bytes={s1.kemServerPub}  isPrivate={false} />
                    </div>
                  </>
                }
              />
            )}

            {/* Step 2 — X25519 DH */}
            {s2 && (
              <SplitStepCard number="// step 02" title={t('step2Title')} desc={t('step2Desc')}
                leftLabel={t('keyClient')} rightLabel={t('keyServer')}
                badge={
                  quantumMode
                    ? <BreachedBadge label={t('step2QuantumBadge')} />
                    : <IdenticalBadge label={t('identicalBadge')} />
                }
                left={<HexField label={t('x25519SharedSecret')} bytes={s2.x25519Secret} isPrivate={true} alwaysExpanded />}
                right={<HexField label={t('x25519SecretServer')} bytes={s2.x25519SecretServer} isPrivate={true} alwaysExpanded />}
              />
            )}

            {/* Step 3 — KEM encapsulation / decapsulation */}
            {s3 && s1 && (
              <SplitStepCard number="// step 03"
                title={t(s1.kem === 'mlkem' ? 'step3Title' : s1.kem === 'mceliece' ? 'step3TitleMcEliece' : 'step3TitleFrodoKem')}
                desc={t(s1.kem === 'mlkem' ? 'step3Desc' : s1.kem === 'mceliece' ? 'step3DescMcEliece' : 'step3DescFrodoKem')}
                leftLabel={t('keyClient')} rightLabel={t('keyServer')}
                exchange={[{ label: t('exchangeKemCiphertext'), direction: '→' }]}
                badge={
                  <div className="flex flex-col items-center gap-1">
                    {tamperReplay?.field === 'kemCiphertext' && tamperReplay.step3
                      ? (
                        <div className="flex justify-center">
                          <span className="inline-flex items-center justify-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-0.5 font-mono text-xs text-red-400 text-center whitespace-pre-line leading-tight">
                            {t('tamperMismatchBadge')}
                          </span>
                        </div>
                      )
                      : <IdenticalBadge
                          label={quantumMode ? t('step3QuantumSafe') : t('identicalBadge')}
                          quantumSafe={quantumMode}
                        />
                    }
                    {tamperRunning && tamperReplay?.field === 'kemCiphertext' && !tamperReplay.step3 && (
                      <Spinner className="text-amber-400 mt-1" />
                    )}
                    <span className="font-mono text-[0.6rem] text-[var(--color-text-dim)] text-center">
                      {t('encapTime', { ms: Math.round(s3.encapMs) })}
                    </span>
                    <span className="font-mono text-[0.6rem] text-[var(--color-text-dim)] text-center">
                      {t('decapTime', { ms: Math.round(s3.decapMs) })}
                    </span>
                  </div>
                }
                left={
                  <>
                    <HexField label={t(kemCtKey as Parameters<typeof t>[0])} bytes={s3.kemCiphertext} isPrivate={false}
                      tamperField="kemCiphertext" onTamper={handleTamper} tamperActive={tamperMode} onReset={handleTamperReset} />
                    <HexField label={t(kemSsKey as Parameters<typeof t>[0])} bytes={s3.kemSecret} isPrivate={true} alwaysExpanded />
                  </>
                }
                right={
                  tamperReplay?.field === 'kemCiphertext' && tamperReplay.step3
                    ? (
                      <div className="flex flex-col gap-2">
                        <span className="font-mono text-xs text-red-400/70 border-b border-red-500/20 pb-1.5">
                          {t('tamperStep3WrongNote')}
                        </span>
                        <HexField label={t('kemSecretServerLabel')} bytes={tamperReplay.step3.kemSecretServer}
                          isPrivate={true} alwaysExpanded variant="wrong" />
                      </div>
                    )
                    : <HexField label={t('kemSecretServerLabel')} bytes={s3.kemSecretServer} isPrivate={true} alwaysExpanded />
                }
              />
            )}

            {/* Step 4 — HKDF */}
            {s4 && (
              <SplitStepCard number="// step 04" title={t('step4Title')} desc={t('step4Desc')}
                leftLabel={t('keyClient')} rightLabel={t('keyServer')}
                exchange={[{ label: t('exchangeHkdfSalt'), direction: '↔' }]}
                badge={
                  tamperReplay?.field === 'kemCiphertext' && tamperReplay.step4
                    ? <BreachedBadge label="≠" />
                    : <IdenticalBadge label={t('identicalBadge')} />
                }
                left={
                  <>
                    {quantumMode && (
                      <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 font-mono text-xs text-red-400/80 leading-relaxed">
                        {t('step4QuantumNote')}
                      </div>
                    )}
                    <HexField label={t('hkdfSalt')}          bytes={s4.hkdfSalt}    isPrivate={false} alwaysExpanded />
                    <HexField label={t('combinedKeyClient')}  bytes={s4.combinedKey} isPrivate={true}  alwaysExpanded />
                  </>
                }
                right={
                  tamperReplay?.field === 'kemCiphertext' && tamperReplay.step4
                    ? (
                      <div className="flex flex-col gap-2">
                        <span className="font-mono text-xs text-red-400/70 border-b border-red-500/20 pb-1.5">
                          {t('tamperStep4WrongNote')}
                        </span>
                        <HexField label={t('combinedKeyServer')} bytes={tamperReplay.step4.combinedKeyServer}
                          isPrivate={true} alwaysExpanded variant="wrong" />
                      </div>
                    )
                    : <HexField label={t('combinedKeyServer')} bytes={s4.combinedKeyServer} isPrivate={true} alwaysExpanded />
                }
              />
            )}

            {/* Step 5 — AES-256-GCM */}
            {s5 && (
              <StepCard number="// step 05" title={t('step5Title')} desc={t('step5Desc')}>
                <HexField label={t('aesIv')} bytes={s5.iv} isPrivate={false} alwaysExpanded
                  tamperField="iv" onTamper={handleTamper} tamperActive={tamperMode} onReset={handleTamperReset} />
                <HexField label={t('aesCiphertext')} bytes={s5.ciphertext} isPrivate={false}
                  tamperField="aesCiphertext" onTamper={handleTamper} tamperActive={tamperMode} onReset={handleTamperReset} />
              </StepCard>
            )}

            {/* Step 6 — Decryption */}
            {s6 && (
              <StepCard number="// step 06" title={t('step6Title')} desc={t('step6Desc')}>
                {/* Tamper replay: show running indicator or error */}
                {tamperRunning && (tamperReplay?.field === 'aesCiphertext' || tamperReplay?.field === 'iv' || (tamperReplay?.field === 'kemCiphertext' && tamperReplay.step4)) && (
                  <div className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                    <Spinner className="text-amber-400" />
                    <span className="font-mono text-xs text-amber-400/80">{t('tamperRunning')}</span>
                  </div>
                )}
                {tamperReplay?.step6Error ? (
                  <>
                    <div className="flex items-start gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                      <span className="text-red-400 text-xl mt-0.5" aria-hidden="true">✗</span>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs text-red-400/70">{t('step6SuccessServer')}</span>
                        <span className="font-mono text-sm text-red-300 leading-relaxed">
                          {t(tamperReplay.step6Error as Parameters<typeof t>[0])}
                        </span>
                      </div>
                    </div>
                    {/* Original success dimmed */}
                    <div className="flex items-start gap-3 rounded-lg border border-emerald-500/10 bg-emerald-500/5 px-4 py-3 opacity-30">
                      <span className="text-emerald-400 text-xl mt-0.5" aria-hidden="true">✓</span>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs text-emerald-400/70">{t('step6SuccessServer')}</span>
                        <span className="font-mono text-base text-emerald-300 break-all">{s6.decrypted}</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                    <span className="text-emerald-400 text-xl mt-0.5" aria-hidden="true">✓</span>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-mono text-xs text-emerald-400/70">{t('step6SuccessServer')}</span>
                      <span className="font-mono text-base text-emerald-300 break-all">{s6.decrypted}</span>
                    </div>
                  </div>
                )}
              </StepCard>
            )}

            {/* Real-World context */}
            {phase === 'done' && <RealWorldCard items={realWorldItems} />}

            {/* Mallory Summary */}
            {(attackerMode || quantumMode) && phase === 'done' && s1 && (
              <MallorySummaryCard kem={s1.kem} attackerMode={attackerMode} quantumMode={quantumMode} />
            )}

          </div>
        </AttackerContext.Provider>
      </div>
    </div>
  );
}
