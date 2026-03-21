'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { AttackerContext, useAttackerContext } from '@/lib/playground-attacker-context';
import type {
  DsaAlgorithm,
  SigStep1Data, SigStep2Data, SigStep3Data,
  SigWorkerInMessage, SigWorkerOutMessage,
  SigTamperField,
  SigRaceEntry, SigBenchmarkRun, SigBenchmarkDsaState,
} from '@/lib/signature-types';
import {
  encodeShareState,
  type SigRunShareState, type SigBenchmarkShareState,
} from '@/lib/share-state';

// ── Constants ─────────────────────────────────────────────────────────────────

const COPY_TIMEOUT_MS = 2_000;

// ── Types ─────────────────────────────────────────────────────────────────────

type SigPhase = 'idle' | 'running' | 'done' | 'error';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function truncateHex(hex: string, head = 32, tail = 16): string {
  if (hex.length <= head + tail + 3) return hex;
  return `${hex.slice(0, head)}…${hex.slice(-tail)}`;
}

function fmtMs(ms: number): string {
  if (ms < 1)   return '<1 ms';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.round(ms)} ms`;
}

function fmt2(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(2)}s`;
  if (v >= 100)  return `${v.toFixed(1)} ms`;
  if (v >= 1)    return `${v.toFixed(2)} ms`;
  return `${v.toFixed(3)} ms`;
}

// ── DSA metadata ─────────────────────────────────────────────────────────────

const DSA_IS_QUANTUM_SAFE: Record<DsaAlgorithm, boolean> = {
  ecdsa:      false,
  mldsa65:    true,
  slhdsa128s: true,
  slhdsa128f: true,
};

const DSA_STANDARD: Record<DsaAlgorithm, string> = {
  ecdsa:      '—',
  mldsa65:    'FIPS 204',
  slhdsa128s: 'FIPS 205',
  slhdsa128f: 'FIPS 205',
};

const DSA_DISPLAY_NAMES: Record<DsaAlgorithm, string> = {
  ecdsa:      'ECDSA P-256',
  mldsa65:    'ML-DSA-65',
  slhdsa128s: 'SLH-DSA-128s',
  slhdsa128f: 'SLH-DSA-128f',
};

const DSA_LABEL_KEYS: Record<DsaAlgorithm, string> = {
  ecdsa:      'sigDsaEcdsa',
  mldsa65:    'sigDsaMldsa65',
  slhdsa128s: 'sigDsaSlhdsa128s',
  slhdsa128f: 'sigDsaSlhdsa128f',
};

const DSA_STEP2_DESC_KEYS: Record<DsaAlgorithm, string> = {
  ecdsa:      'sigStep2DescEcdsa',
  mldsa65:    'sigStep2DescMlDsa65',
  slhdsa128s: 'sigStep2DescSlhDsa',
  slhdsa128f: 'sigStep2DescSlhDsa',
};

const DSA_CLR: Record<DsaAlgorithm, string> = {
  ecdsa:      '#06b6d4',
  mldsa65:    '#a78bfa',
  slhdsa128s: '#34d399',
  slhdsa128f: '#fbbf24',
};

function getDsaTextColor(dsa: DsaAlgorithm): string {
  if (dsa === 'mldsa65')    return 'text-violet-400';
  if (dsa === 'slhdsa128s') return 'text-emerald-400';
  if (dsa === 'slhdsa128f') return 'text-amber-400';
  return 'text-[var(--color-primary)]';
}

function getDsaBorderColor(dsa: DsaAlgorithm): string {
  if (dsa === 'mldsa65')    return 'border-violet-500/20';
  if (dsa === 'slhdsa128s') return 'border-emerald-500/20';
  if (dsa === 'slhdsa128f') return 'border-amber-500/20';
  return 'border-[var(--color-primary)]/20';
}

function getDsaSpinnerColor(dsa: DsaAlgorithm): string {
  if (dsa === 'mldsa65')    return 'text-violet-400';
  if (dsa === 'slhdsa128s') return 'text-emerald-400';
  if (dsa === 'slhdsa128f') return 'text-amber-400';
  return 'text-[var(--color-primary)]';
}

// Benchmark order: fast → slow (by sign time)
const BENCH_DSAS: DsaAlgorithm[] = ['ecdsa', 'mldsa65', 'slhdsa128f', 'slhdsa128s'];

// ── Statistics ────────────────────────────────────────────────────────────────

interface FullStats {
  mean:         number;
  median:       number;
  std:          number;
  cv:           number;
  min:          number;
  max:          number;
  ci95Half:     number;
  ci95Lo:       number;
  ci95Hi:       number;
  q1:           number;
  q3:           number;
  iqr:          number;
  fenceLo:      number;
  fenceHi:      number;
  whiskerLo:    number;
  whiskerHi:    number;
  outlierCount: number;
  trimmedMean:  number;
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
  const whiskerLo    = inliers[0]                  ?? sorted[0];
  const whiskerHi    = inliers[inliers.length - 1] ?? sorted[n - 1];
  const outlierCount = n - inliers.length;
  const trimmedMean  = inliers.length > 0
    ? inliers.reduce((s, v) => s + v, 0) / inliers.length : mean;
  const tVal     = T95_TABLE[n - 1] ?? 2.093;
  const se       = std / Math.sqrt(n);
  const ci95Half = tVal * se;
  return {
    mean, median, std, cv,
    min: sorted[0], max: sorted[n - 1],
    ci95Half, ci95Lo: mean - ci95Half, ci95Hi: mean + ci95Half,
    q1, q3, iqr, fenceLo, fenceHi,
    whiskerLo, whiskerHi, outlierCount, trimmedMean, n,
  };
}

// ── Chart helpers ─────────────────────────────────────────────────────────────

const OUTLIER_CLR = '#f87171';

// 20 deterministic horizontal jitter offsets (px from group centre)
const JITTER20 = [
  -13, -9, -6, -3, -1, 1, 3, 6, 9, 13,
   14, -12, -8, -5, -2, 0, 2, 5, 8, -4,
];

interface SigChartDataset {
  dsa:    DsaAlgorithm;
  values: number[];
  stats:  FullStats;
}

// ── Spinner ───────────────────────────────────────────────────────────────────

function Spinner({ className }: { className?: string }) {
  return (
    <div aria-hidden="true"
      className={`w-4 h-4 rounded-full border-2 border-current/30 border-t-current animate-spin ${className ?? ''}`} />
  );
}

// ── Badges ────────────────────────────────────────────────────────────────────

function BreachedBadge({ label }: { label: string }) {
  return (
    <div className="flex justify-center">
      <span className="inline-flex items-center justify-center gap-1 rounded-full border border-red-500/40 bg-red-500/10 px-2.5 py-0.5 font-mono text-xs text-red-400 whitespace-pre-line text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

function SafeBadge({ label }: { label: string }) {
  return (
    <div className="flex justify-center">
      <span className="inline-flex items-center justify-center gap-1 rounded-full border border-emerald-400/60 bg-emerald-500/15 px-2.5 py-0.5 font-mono text-xs text-emerald-300 whitespace-pre-line text-center leading-tight">
        {label}
      </span>
    </div>
  );
}

// ── ImplInfoPanel ─────────────────────────────────────────────────────────────

interface ImplInfoPanelProps {
  toggleLabel:    string;
  packageLabel:   string;
  snippetLabel:   string;
  packageName:    string;
  packageUrl:     string;
  snippetHtml:    string;
  prose:          string;
  articleComingSoon: string;
}

function ImplInfoPanel({
  toggleLabel, packageLabel, snippetLabel, packageName, packageUrl,
  snippetHtml, prose, articleComingSoon,
}: ImplInfoPanelProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass-panel rounded-lg overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 font-mono text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] transition-colors text-left">
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
            <span className="text-[var(--color-text-muted)]">{articleComingSoon}</span>
          </p>
        </div>
      )}
    </div>
  );
}

// ── SigHexField ───────────────────────────────────────────────────────────────

interface SigHexFieldProps {
  label:           string;
  bytes:           Uint8Array;
  isPrivate:       boolean;
  alwaysExpanded?: boolean;
  variant?:        'normal' | 'wrong';
  tamperField?:    SigTamperField;
  onTamper?:       (field: SigTamperField, bytes: Uint8Array) => void;
  tamperActive?:   boolean;
  onReset?:        () => void;
}

function SigHexField({
  label, bytes, isPrivate, alwaysExpanded = false,
  variant = 'normal', tamperField, onTamper, tamperActive = false, onReset,
}: SigHexFieldProps) {
  const [expanded,  setExpanded]  = useState(alwaysExpanded);
  const [copied,    setCopied]    = useState(false);
  const [editHex,   setEditHex]   = useState<string | null>(null);
  const [hexError,  setHexError]  = useState(false);
  const { attackerMode } = useAttackerContext();
  const t = useTranslations('playground');

  const hex = toHex(bytes);
  const needsTruncate = !alwaysExpanded && hex.length > 32 + 16 + 3;

  async function handleCopy() {
    await navigator.clipboard.writeText(editHex ?? hex);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_TIMEOUT_MS);
  }

  function handleEdit(val: string) {
    const clean = val.replace(/\s/g, '');
    setEditHex(clean);
    setHexError(!isValidHex(clean));
  }

  function handleSubmit() {
    if (!tamperField || !onTamper || !editHex) return;
    if (!isValidHex(editHex)) { setHexError(true); return; }
    onTamper(tamperField, fromHex(editHex));
  }

  const isEditing  = !!(tamperActive && tamperField && editHex !== null);
  const currentHex = editHex ?? hex;

  return (
    <div className={`flex flex-col gap-1.5 transition-all ${attackerMode && isPrivate ? 'opacity-20 blur-[1px]' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          aria-label={isPrivate ? t('hexPrivateLabel') : t('hexPublicLabel')}
          title={
            attackerMode && isPrivate  ? t('attackerCannotSeeThis') :
            attackerMode && !isPrivate ? t('attackerSeesThis') :
            isPrivate ? t('hexPrivateTitle') : t('hexPublicTitle')
          }
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
            <button onClick={handleSubmit} disabled={hexError}
              className="font-mono text-xs px-3 py-1 rounded border border-amber-500/40 text-amber-400 hover:border-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
              {t('tamperButton')}
            </button>
            {hexError && <span className="font-mono text-xs text-red-400/70">{t('invalidHexInput')}</span>}
          </div>
        </div>
      ) : (
        <div
          className={`font-mono text-xs break-all leading-relaxed px-3 py-2 rounded-lg border ${
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

// ── SigTextField (UTF-8 message) ──────────────────────────────────────────────

interface SigTextFieldProps {
  label:          string;
  bytes:          Uint8Array;
  isPrivate:      boolean;
  tamperField?:   SigTamperField;
  onTamper?:      (field: SigTamperField, bytes: Uint8Array) => void;
  tamperActive?:  boolean;
  onReset?:       () => void;
}

function SigTextField({
  label, bytes, isPrivate, tamperField, onTamper, tamperActive = false, onReset,
}: SigTextFieldProps) {
  const [editText, setEditText] = useState<string | null>(null);
  const [copied,   setCopied]   = useState(false);
  const { attackerMode } = useAttackerContext();
  const t = useTranslations('playground');

  const text = new TextDecoder().decode(bytes);

  async function handleCopy() {
    await navigator.clipboard.writeText(editText ?? text);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_TIMEOUT_MS);
  }

  function handleSubmit() {
    if (!tamperField || !onTamper || editText === null) return;
    onTamper(tamperField, new TextEncoder().encode(editText));
  }

  const isEditing = !!(tamperActive && tamperField && editText !== null);

  return (
    <div className={`flex flex-col gap-1.5 transition-all ${attackerMode && isPrivate ? 'opacity-20 blur-[1px]' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span
          title={
            attackerMode && isPrivate  ? t('attackerCannotSeeThis') :
            attackerMode && !isPrivate ? t('attackerSeesThis') :
            isPrivate ? t('hexPrivateTitle') : t('hexPublicTitle')
          }
          className="text-sm leading-none">
          {isPrivate ? '🔒' : '📢'}
        </span>
        {attackerMode && !isPrivate && (
          <span className="font-mono text-[0.65rem] text-red-400/70 leading-none">👁</span>
        )}
        <span className="font-mono text-xs text-[var(--color-text-muted)]">{label}</span>
        <span className="font-mono text-xs text-[var(--color-text-muted)]">{formatBytes(bytes.length)}</span>
        <div className="ml-auto flex items-center gap-1">
          {tamperActive && tamperField && editText === null && (
            <button onClick={() => setEditText(text)}
              className="font-mono text-xs text-amber-400/80 hover:text-amber-300 transition-colors px-1.5 py-0.5 rounded border border-amber-500/30 hover:border-amber-400">
              edit
            </button>
          )}
          {tamperActive && tamperField && editText !== null && (
            <button onClick={() => { setEditText(null); onReset?.(); }}
              className="font-mono text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] transition-colors px-1.5 py-0.5 rounded border border-[var(--color-glass-border)]">
              reset
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
            value={editText ?? ''}
            onChange={e => setEditText(e.target.value)}
            rows={2}
            className="font-mono text-xs break-all leading-relaxed px-3 py-2 rounded-lg border w-full bg-[var(--color-bg-base)] text-amber-300 border-amber-500/40 focus:outline-none resize-none"
          />
          <div className="flex items-center gap-2">
            <button onClick={handleSubmit}
              className="font-mono text-xs px-3 py-1 rounded border border-amber-500/40 text-amber-400 hover:border-amber-400 transition-colors">
              {t('tamperButton')}
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`font-mono text-xs break-all leading-relaxed px-3 py-2 rounded-lg border ${
            isPrivate
              ? 'text-[var(--color-text-dim)] border-[var(--color-glass-border)] bg-[var(--color-bg-base)]'
              : attackerMode
                ? 'text-[var(--color-primary)] border-red-500/40 bg-red-500/5'
                : tamperActive && tamperField && editText === null
                  ? 'text-amber-300/80 border-amber-500/30 bg-amber-500/5 cursor-pointer'
                  : 'text-[var(--color-primary)] border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5'
          }`}
          onClick={tamperActive && tamperField ? () => setEditText(text) : undefined}
        >
          {text}
        </div>
      )}
    </div>
  );
}

// ── SplitStepCard ─────────────────────────────────────────────────────────────

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

// ── StepCard ──────────────────────────────────────────────────────────────────

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

// ── SigRaceCard ───────────────────────────────────────────────────────────────

function SigRaceCard({ dsa, entry }: { dsa: DsaAlgorithm; entry: SigRaceEntry }) {
  const t = useTranslations('playground');
  const isRunning = entry.phase === 'running';
  const isDone    = entry.phase === 'done';
  const isWaiting = entry.phase === 'waiting';

  return (
    <div className={`glass-panel rounded-lg border p-3 flex flex-col gap-2 ${
      isDone    ? 'border-emerald-500/20'
      : isRunning ? getDsaBorderColor(dsa).replace('border-', 'border-').replace('/20', '/30')
      : 'border-[var(--color-glass-border)]'
    }`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`font-mono text-xs ${isDone ? 'text-emerald-400' : getDsaTextColor(dsa)}`}>
          {DSA_DISPLAY_NAMES[dsa]}
        </span>
        {isRunning && <Spinner className={getDsaSpinnerColor(dsa)} />}
        {isDone    && <span className="font-mono text-xs text-emerald-400">{t('sigRaceDone')}</span>}
        {isWaiting && <span className="font-mono text-xs text-[var(--color-text-dim)]">{t('sigRaceWaiting')}</span>}
        {entry.phase === 'error' && <span className="font-mono text-xs text-red-400">{t('sigRaceError')}</span>}
      </div>
      {(isDone || entry.keygenMs !== undefined) && (
        <div className="flex flex-col gap-0.5">
          {entry.keygenMs !== undefined && (
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {t('sigRaceKeygen', { t: fmtMs(entry.keygenMs) })}
            </span>
          )}
          {entry.signMs !== undefined && (
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {t('sigRaceSign', { t: fmtMs(entry.signMs) })}
            </span>
          )}
          {entry.verifyMs !== undefined && (
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {t('sigRaceVerify', { t: fmtMs(entry.verifyMs) })}
            </span>
          )}
          {entry.totalMs !== undefined && (
            <span className={`font-mono text-xs font-semibold mt-0.5 ${
              entry.totalMs > 5000 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {t('sigRaceTotal', { t: fmtMs(entry.totalMs) })}
            </span>
          )}
          {entry.pubKeyBytes !== undefined && (
            <span className="font-mono text-xs text-[var(--color-text-dim)] mt-0.5">
              {t('sigRacePubKey', { size: formatBytes(entry.pubKeyBytes) })}
              {entry.sigBytes !== undefined && ` · ${t('sigRaceSigSize', { size: formatBytes(entry.sigBytes) })}`}
            </span>
          )}
        </div>
      )}
      {isRunning && entry.keygenMs === undefined && (
        <span className="font-mono text-xs text-[var(--color-text-dim)]">{t('sigRaceRunning')}</span>
      )}
    </div>
  );
}

// ── StatTooltip ───────────────────────────────────────────────────────────────

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

// ── Stats rows ────────────────────────────────────────────────────────────────

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

// ── SigBenchmarkChart — log-scale grouped SVG box-plots ───────────────────────

function SigBenchmarkChart({ title, datasets }: {
  title:    string;
  datasets: SigChartDataset[];
}) {
  const t = useTranslations('playground');
  if (datasets.length === 0) return null;
  const allVals = datasets.flatMap(d => d.values).filter(v => v > 0);
  if (allVals.length === 0) return null;

  const ML = 60, MR = 14, MT = 30, MB = 50;
  const VW = 500, VH = 250;
  const CW = VW - ML - MR;
  const CH = VH - MT - MB;

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
  const LY = VH - 7;
  const LX = ML;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} className="w-full" style={{ height: 'auto', maxHeight: 260 }} aria-label={title}>
      <rect x={ML} y={MT} width={CW} height={CH} fill="rgba(15,23,42,0.55)" rx="3" />

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

      <line x1={ML} y1={MT} x2={ML} y2={MT + CH} stroke="#334155" strokeWidth="1.2" />

      <text x={11} y={MT + CH / 2} textAnchor="middle" fill="#64748b"
        fontSize="9" fontFamily="'JetBrains Mono',monospace"
        transform={`rotate(-90 11 ${MT + CH / 2})`}>
        ms (log₁₀)
      </text>

      <text x={ML + CW / 2} y={MT - 10} textAnchor="middle" fill="#cbd5e1"
        fontSize="11" fontFamily="'JetBrains Mono',monospace" fontWeight="bold">
        {title}
      </text>

      {datasets.map((_, i) => i > 0 && (
        <line key={i} x1={ML + GW * i} y1={MT} x2={ML + GW * i} y2={MT + CH}
          stroke="rgba(255,255,255,0.04)" strokeWidth="1" strokeDasharray="3,3" />
      ))}

      {datasets.map(({ dsa, values, stats: s }, gi) => {
        const cx   = gCx(gi);
        const clr  = DSA_CLR[dsa];
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
          <g key={dsa}>
            <line x1={cx} y1={yWLo} x2={cx} y2={boxTop}
              stroke={clr} strokeWidth="1.2" opacity="0.4" />
            <line x1={cx} y1={boxTop + boxH} x2={cx} y2={yWHi}
              stroke={clr} strokeWidth="1.2" opacity="0.4" />
            <line x1={cx - 6} y1={yWLo} x2={cx + 6} y2={yWLo}
              stroke={clr} strokeWidth="1.3" opacity="0.55" />
            <line x1={cx - 6} y1={yWHi} x2={cx + 6} y2={yWHi}
              stroke={clr} strokeWidth="1.3" opacity="0.55" />
            <rect x={cx - BOX_W / 2} y={boxTop} width={BOX_W} height={boxH}
              fill={clr} fillOpacity="0.13" stroke={clr} strokeOpacity="0.5" strokeWidth="1.2" rx="2" />
            <line x1={cx - BOX_W / 2} y1={yMed} x2={cx + BOX_W / 2} y2={yMed}
              stroke={clr} strokeWidth="2.5" opacity="0.95" />
            <polygon
              points={`${cx},${yMean - 4.5} ${cx + 4.5},${yMean} ${cx},${yMean + 4.5} ${cx - 4.5},${yMean}`}
              fill={clr} fillOpacity="0.55" />
            <g opacity="0.72">
              <line x1={cx + CI_OFF} y1={yCiLo} x2={cx + CI_OFF} y2={yCiHi}
                stroke="#e2e8f0" strokeWidth="1.5" strokeDasharray="2,1.5" />
              <line x1={cx + CI_OFF - 4} y1={yCiLo} x2={cx + CI_OFF + 4} y2={yCiLo}
                stroke="#e2e8f0" strokeWidth="1.5" />
              <line x1={cx + CI_OFF - 4} y1={yCiHi} x2={cx + CI_OFF + 4} y2={yCiHi}
                stroke="#e2e8f0" strokeWidth="1.5" />
            </g>
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
            <text x={cx} y={MT + CH + 14} textAnchor="middle" fill="#94a3b8"
              fontSize="9.5" fontFamily="'JetBrains Mono',monospace">
              {DSA_DISPLAY_NAMES[dsa].split(' ').slice(0, 2).join('\u00A0')}
            </text>
            <text x={cx} y={MT + CH + 26} textAnchor="middle" fill="#64748b"
              fontSize="8.5" fontFamily="'JetBrains Mono',monospace">
              {DSA_DISPLAY_NAMES[dsa].split(' ').slice(2).join('\u00A0')}
            </text>
          </g>
        );
      })}

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

// ── SigStatsTable — collapsible per-DSA stats ─────────────────────────────────

function SigStatsTable({ dsa, kg, sg, vr, pubKeyBytes, secKeyBytes, sigBytes }: {
  dsa: DsaAlgorithm; kg: FullStats; sg: FullStats; vr: FullStats;
  pubKeyBytes: number; secKeyBytes: number; sigBytes: number;
}) {
  const [open, setOpen] = useState(false);
  const t = useTranslations('playground');
  const clr    = getDsaTextColor(dsa);
  const border = getDsaBorderColor(dsa);

  return (
    <div className={`rounded-lg border overflow-hidden ${border}`}>
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-white/2 transition-colors">
        <span className={`font-mono text-xs font-semibold ${clr}`}>{DSA_DISPLAY_NAMES[dsa]}</span>
        <div className="flex items-center gap-3 font-mono text-xs text-[var(--color-text-muted)]">
          <span className="hidden sm:inline tabular-nums opacity-70">
            <AbbrevTooltip abbrev="PK" full="Public Key" /> {formatBytes(pubKeyBytes)} · <AbbrevTooltip abbrev="SK" full="Secret Key" /> {formatBytes(secKeyBytes)} · <AbbrevTooltip abbrev="Sig" full="Signature" /> {formatBytes(sigBytes)}
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
                  <span className={clr}>{t('sigBenchmarkKeygen')}</span>
                </th>
                <th className="text-right px-3 py-1.5 text-[var(--color-text-muted)] font-normal whitespace-nowrap">{t('sigBenchmarkSign')}</th>
                <th className="text-right px-4 py-1.5 text-[var(--color-text-muted)] font-normal whitespace-nowrap">{t('sigBenchmarkVerify')}</th>
              </tr>
            </thead>
            <tbody>
              {STAT_ROWS.map(([labelKey, tipKey, fn]) => (
                <tr key={labelKey} className="border-b border-[var(--color-glass-border)]/30 hover:bg-white/[0.02]">
                  <td className="px-4 py-1.5">
                    <StatTooltip label={t(labelKey as Parameters<typeof t>[0])} tip={t(tipKey as Parameters<typeof t>[0])} />
                  </td>
                  <td className={`text-right px-3 py-1.5 tabular-nums ${clr}`}>{fn(kg)}</td>
                  <td className="text-right px-3 py-1.5 tabular-nums text-[var(--color-text-base)]">{fn(sg)}</td>
                  <td className="text-right px-4 py-1.5 tabular-nums text-[var(--color-text-base)]">{fn(vr)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── SigBenchmarkPanel ─────────────────────────────────────────────────────────

function SigBenchmarkPanel({ benchmark, active, onStop, onClose, onShare, shareCopied }: {
  benchmark:    Partial<Record<DsaAlgorithm, SigBenchmarkDsaState>>;
  active:       boolean;
  onStop:       () => void;
  onClose:      () => void;
  onShare?:     () => void;
  shareCopied?: boolean;
}) {
  const t = useTranslations('playground');

  function getStats(d: DsaAlgorithm) {
    const state = benchmark[d];
    if (!state || state.runs.length < 2) return null;
    const kg = computeFullStats(state.runs.map(r => r.keygenMs));
    const sg = computeFullStats(state.runs.map(r => r.signMs));
    const vr = computeFullStats(state.runs.map(r => r.verifyMs));
    if (!kg || !sg || !vr) return null;
    const first = state.runs[0];
    return { kg, sg, vr, runs: state.runs, n: state.runs.length,
      pubKeyBytes: first.pubKeyBytes, secKeyBytes: first.secKeyBytes, sigBytes: first.sigBytes };
  }

  function chartDatasets(op: keyof SigBenchmarkRun): SigChartDataset[] {
    return BENCH_DSAS.flatMap(d => {
      const s = getStats(d);
      if (!s || s.n < 3) return [];
      const vals  = s.runs.map(r => r[op]);
      const stats = op === 'keygenMs' ? s.kg : op === 'signMs' ? s.sg : s.vr;
      return [{ dsa: d, values: vals, stats }];
    });
  }

  const hasCharts = BENCH_DSAS.some(d => (benchmark[d]?.runs.length ?? 0) >= 3);
  const allDone   = BENCH_DSAS.every(d => {
    const s = benchmark[d];
    return s && (s.status === 'done' || s.status === 'error');
  });

  return (
    <div className="glass-panel rounded-xl border border-[var(--color-glass-border)] p-5 flex flex-col gap-5 animate-fade-up">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-xs text-[var(--color-primary)]">{t('sigBenchmarkTitle')}</span>
        <div className="flex items-center gap-2">
          {active && (
            <button onClick={onStop}
              className="font-mono text-xs px-2.5 py-1 rounded border border-red-500/30 text-red-400/70 hover:border-red-400 hover:text-red-400 transition-colors">
              {t('sigBenchmarkStop')}
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
              {t('sigBenchmarkClose')}
            </button>
          )}
        </div>
      </div>

      {/* Progress row (while still running) */}
      {!allDone && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {BENCH_DSAS.map(d => {
            const state = benchmark[d];
            if (!state) return null;
            const clr       = getDsaTextColor(d);
            const isDone    = state.status === 'done';
            const isRunning = state.status === 'running';
            const isWaiting = state.status === 'waiting';
            return (
              <div key={d} className={`rounded-lg border p-3 flex flex-col gap-1 ${
                isDone    ? 'border-emerald-500/20'
                : isRunning ? getDsaBorderColor(d).replace('/20', '/30')
                : 'border-[var(--color-glass-border)]'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className={`font-mono text-xs font-semibold ${clr}`}>{DSA_DISPLAY_NAMES[d]}</span>
                  {isRunning && <Spinner className={getDsaSpinnerColor(d)} />}
                </div>
                <span className={`font-mono text-xs tabular-nums ${
                  isDone ? 'text-emerald-400' : isWaiting ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text-base)]'
                }`}>
                  {isWaiting ? t('sigBenchmarkWaiting')
                  : state.status === 'error' ? t('sigBenchmarkError')
                  : t('sigBenchmarkProgress', { current: state.runs.length, total: state.total })}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Three charts: Keygen / Sign / Verify */}
      {hasCharts && (
        <div className="flex flex-col gap-3">
          {([
            { op: 'keygenMs' as const, label: t('sigBenchmarkKeygen') },
            { op: 'signMs'   as const, label: t('sigBenchmarkSign') },
            { op: 'verifyMs' as const, label: t('sigBenchmarkVerify') },
          ] as const).map(({ op, label }) => {
            const ds = chartDatasets(op);
            if (ds.length === 0) return null;
            return (
              <div key={op} className="rounded-lg border border-[var(--color-glass-border)] overflow-hidden p-1">
                <SigBenchmarkChart title={`// ${label}`} datasets={ds} />
              </div>
            );
          })}
        </div>
      )}

      {/* Numeric stats tables (collapsible per DSA) */}
      {allDone && (
        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs text-[var(--color-text-muted)]">{t('benchmarkStatsTitle')}</span>
          {BENCH_DSAS.map(d => {
            const s = getStats(d);
            if (!s) return null;
            return <SigStatsTable key={d} dsa={d} kg={s.kg} sg={s.sg} vr={s.vr}
              pubKeyBytes={s.pubKeyBytes} secKeyBytes={s.secKeyBytes} sigBytes={s.sigBytes} />;
          })}
        </div>
      )}

      <span className="font-mono text-xs text-[var(--color-text-muted)] leading-relaxed">
        {t('sigBenchmarkNote')}
      </span>
    </div>
  );
}

// ── runOnceSig — single benchmark run via a fresh worker ─────────────────────

function runOnceSig(dsa: DsaAlgorithm, message: string): Promise<SigBenchmarkRun> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('../workers/signature-worker.ts', import.meta.url));
    let keygenMs = 0, signMs = 0, pubKeyBytes = 0, secKeyBytes = 0, sigBytes = 0;
    w.onmessage = (e: MessageEvent<SigWorkerOutMessage>) => {
      const msg = e.data;
      if (msg.type === 'sig-step1') { keygenMs = msg.data.keygenMs; pubKeyBytes = msg.data.publicKey.length; secKeyBytes = msg.data.secretKey.length; }
      if (msg.type === 'sig-step2') { signMs = msg.data.signMs; sigBytes = msg.data.signature.length; }
      if (msg.type === 'sig-step3') {
        w.terminate();
        resolve({ keygenMs, signMs, verifyMs: msg.data.verifyMs, pubKeyBytes, secKeyBytes, sigBytes });
      }
      if (msg.type === 'sig-error') { w.terminate(); reject(new Error(msg.message)); }
    };
    w.onerror = (e) => { w.terminate(); reject(new Error(e.message ?? 'Worker error')); };
    w.postMessage({ type: 'start-sig', message, dsa } satisfies SigWorkerInMessage);
  });
}

// ── SigRealWorldCard ──────────────────────────────────────────────────────────

export interface SigRealWorldItem {
  name:        string;
  description: string;
  link?:       string;
}

function SigRealWorldCard({ items }: { items: SigRealWorldItem[] }) {
  const t = useTranslations('playground');
  const entries = items;
  return (
    <div className="glass-panel rounded-xl border border-[var(--color-glass-border)] p-5 flex flex-col gap-4 animate-fade-up">
      <div className="flex flex-col gap-1">
        <span className="font-mono text-xs text-[var(--color-primary)]">{t('sigRealWorldTitle')}</span>
        <p className="font-mono text-xs text-[var(--color-text-muted)]">{t('sigRealWorldIntro')}</p>
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

// ── Main Component ────────────────────────────────────────────────────────────

export interface SignaturePlaygroundProps {
  snippetHtmls:    Record<DsaAlgorithm, string>;
  realWorldItems?: SigRealWorldItem[];
  initialState?:   SigRunShareState | SigBenchmarkShareState;
}

export default function SignaturePlayground({ snippetHtmls, realWorldItems, initialState }: SignaturePlaygroundProps) {
  const t = useTranslations('playground');

  const [dsa,        setDsa]        = useState<DsaAlgorithm>('mldsa65');
  const [message,    setMessage]    = useState(t('sigDefaultMessage'));
  const [phase,      setPhase]      = useState<SigPhase>('idle');
  const [errorMsg,   setErrorMsg]   = useState<string | null>(null);
  const [step1,      setStep1]      = useState<SigStep1Data | null>(null);
  const [step2,      setStep2]      = useState<SigStep2Data | null>(null);
  const [step3,      setStep3]      = useState<SigStep3Data | null>(null);
  const [attackerMode, setAttackerMode] = useState(false);
  const [quantumMode,  setQuantumMode]  = useState(false);
  const [tamperMode,   setTamperMode]   = useState(false);
  const [tamperResult, setTamperResult] = useState<{ valid: boolean; verifyMs: number } | null>(null);
  const [race,       setRace]       = useState<Partial<Record<DsaAlgorithm, SigRaceEntry>>>({});
  const [raceActive, setRaceActive] = useState(false);
  const [shareCopied,          setShareCopied]          = useState(false);
  const [benchmarkShareCopied, setBenchmarkShareCopied] = useState(false);
  const [benchmark,  setBenchmark]  = useState<Partial<Record<DsaAlgorithm, SigBenchmarkDsaState>>>({});
  const [benchmarkActive, setBenchmarkActive] = useState(false);

  const workerRef         = useRef<Worker | null>(null);
  const raceWorkers       = useRef<Partial<Record<DsaAlgorithm, Worker>>>({});
  const benchmarkAbortRef = useRef(false);

  const tamperActive = tamperMode && phase === 'done';

  // Cleanup on unmount
  useEffect(() => () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    Object.values(raceWorkers.current).forEach(w => w?.terminate());
    raceWorkers.current = {};
    benchmarkAbortRef.current = true;
  }, []);

  // Restore shared state from URL
  useEffect(() => {
    if (!initialState) return;
    if (initialState.type === 'run') {
      setDsa(initialState.dsa);
      setStep1({
        publicKey: fromHex(initialState.s1.pk),
        secretKey: fromHex(initialState.s1.sk),
        keygenMs:  initialState.s1.keygenMs,
        dsa:       initialState.dsa,
      } satisfies SigStep1Data);
      setStep2({
        message:     fromHex(initialState.s2.msg),
        messageHash: initialState.s2.msgHash ? fromHex(initialState.s2.msgHash) : undefined,
        signature:   fromHex(initialState.s2.sig),
        signMs:      initialState.s2.signMs,
      } satisfies SigStep2Data);
      setStep3({ valid: initialState.s3.valid, verifyMs: initialState.s3.verifyMs } satisfies SigStep3Data);
      setPhase('done');
    } else {
      setBenchmark(initialState.benchmark);
    }
  }, [initialState]);

  // ── Share ──────────────────────────────────────────────────────────────────

  const SHARE_TIMEOUT_MS = 2_500;

  function handleShare() {
    if (!step1 || !step2 || !step3) return;
    const state: SigRunShareState = {
      v: 1, mode: 'signatures', type: 'run', dsa,
      s1: { pk: toHex(step1.publicKey), sk: toHex(step1.secretKey), keygenMs: step1.keygenMs },
      s2: {
        msg:     toHex(step2.message),
        msgHash: step2.messageHash ? toHex(step2.messageHash) : undefined,
        sig:     toHex(step2.signature),
        signMs:  step2.signMs,
      },
      s3: { valid: step3.valid, verifyMs: step3.verifyMs },
    };
    const encoded = encodeShareState(state);
    history.replaceState(null, '', `${window.location.pathname}#state=${encoded}`);
    navigator.clipboard.writeText(window.location.href).then(() => {
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), SHARE_TIMEOUT_MS);
    });
  }

  function handleBenchmarkShare() {
    const state: SigBenchmarkShareState = { v: 1, mode: 'signatures', type: 'benchmark', benchmark };
    const encoded = encodeShareState(state);
    history.replaceState(null, '', `${window.location.pathname}#state=${encoded}`);
    navigator.clipboard.writeText(window.location.href).then(() => {
      setBenchmarkShareCopied(true);
      setTimeout(() => setBenchmarkShareCopied(false), SHARE_TIMEOUT_MS);
    });
  }

  // ── Main run ──────────────────────────────────────────────────────────────

  const handleGenerate = useCallback(() => {
    if (!message.trim()) return;

    workerRef.current?.terminate();
    setPhase('running');
    setStep1(null); setStep2(null); setStep3(null);
    setTamperResult(null);
    setTamperMode(false);
    setErrorMsg(null);

    const worker = new Worker(new URL('../workers/signature-worker.ts', import.meta.url));
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<SigWorkerOutMessage>) => {
      const msg = e.data;
      if (msg.type === 'sig-step1') {
        setStep1(msg.data);
      } else if (msg.type === 'sig-step2') {
        setStep2(msg.data);
      } else if (msg.type === 'sig-step3') {
        setStep3(msg.data);
        setPhase('done');
      } else if (msg.type === 'tamper-sig-step3') {
        setTamperResult({ valid: msg.valid, verifyMs: msg.verifyMs });
      } else if (msg.type === 'sig-error') {
        setPhase('error');
        setErrorMsg(msg.message);
      }
    };

    worker.onerror = (e) => {
      setPhase('error');
      setErrorMsg(e.message);
    };

    worker.postMessage({ type: 'start-sig', message: message.trim(), dsa } satisfies SigWorkerInMessage);
  }, [message, dsa]);

  // ── Tamper ────────────────────────────────────────────────────────────────

  const handleTamper = useCallback((field: SigTamperField, bytes: Uint8Array) => {
    if (!workerRef.current) return;
    setTamperResult(null);
    const msg: SigWorkerInMessage = { type: 'tamper-sig', field, bytes };
    workerRef.current.postMessage(msg);
  }, []);

  // ── DSA Race ──────────────────────────────────────────────────────────────

  const handleRace = useCallback(() => {
    Object.values(raceWorkers.current).forEach(w => w?.terminate());
    raceWorkers.current = {};

    const dsas: DsaAlgorithm[] = ['ecdsa', 'mldsa65', 'slhdsa128s', 'slhdsa128f'];
    const raceStart = performance.now();
    setRaceActive(true);
    setRace(Object.fromEntries(dsas.map(d => [d, { phase: 'waiting' as const }])));

    dsas.forEach(d => {
      setRace(prev => ({ ...prev, [d]: { phase: 'running' } }));
      const w = new Worker(new URL('../workers/signature-worker.ts', import.meta.url));
      raceWorkers.current[d] = w;
      const input = message.trim() || t('sigDefaultMessage');

      w.onmessage = (e: MessageEvent<SigWorkerOutMessage>) => {
        const msg = e.data;
        if (msg.type === 'sig-error') {
          setRace(prev => ({ ...prev, [d]: { phase: 'error' } }));
          w.terminate();
          return;
        }
        if (msg.type === 'sig-step1') {
          setRace(prev => ({
            ...prev,
            [d]: { ...(prev[d] ?? {}), phase: 'running', keygenMs: msg.data.keygenMs, pubKeyBytes: msg.data.publicKey.length },
          }));
        }
        if (msg.type === 'sig-step2') {
          setRace(prev => ({
            ...prev,
            [d]: { ...(prev[d] ?? {}), signMs: msg.data.signMs, sigBytes: msg.data.signature.length },
          }));
        }
        if (msg.type === 'sig-step3') {
          const elapsed = performance.now() - raceStart;
          setRace(prev => ({
            ...prev,
            [d]: { ...(prev[d] ?? {}), phase: 'done', verifyMs: msg.data.verifyMs, totalMs: elapsed },
          }));
          w.terminate();
        }
      };

      w.onerror = () => { setRace(prev => ({ ...prev, [d]: { phase: 'error' } })); w.terminate(); };
      w.postMessage({ type: 'start-sig', message: input, dsa: d } satisfies SigWorkerInMessage);
    });
  }, [message, t]);

  // ── Benchmark ─────────────────────────────────────────────────────────────

  const handleBenchmark = useCallback(async () => {
    benchmarkAbortRef.current = false;
    setBenchmarkActive(true);
    const N = 20;
    const input = message.trim() || t('sigDefaultMessage');

    setBenchmark(Object.fromEntries(BENCH_DSAS.map(d => [d, { status: 'waiting' as const, runs: [], total: N }])));

    for (const d of BENCH_DSAS) {
      if (benchmarkAbortRef.current) break;
      setBenchmark(prev => ({ ...prev, [d]: { ...(prev[d]!), status: 'running' } }));

      let hadError = false;
      for (let i = 0; i < N; i++) {
        if (benchmarkAbortRef.current) break;
        try {
          const run = await runOnceSig(d, input);
          setBenchmark(prev => {
            const existing = prev[d]!;
            return { ...prev, [d]: { ...existing, runs: [...existing.runs, run] } };
          });
        } catch {
          setBenchmark(prev => ({ ...prev, [d]: { ...(prev[d]!), status: 'error' } }));
          hadError = true;
          break;
        }
      }

      if (!hadError) {
        setBenchmark(prev => ({ ...prev, [d]: { ...(prev[d]!), status: 'done' } }));
      }
    }

    setBenchmarkActive(false);
  }, [message, t]);

  // ImplInfo per algorithm
  const implMeta: Record<DsaAlgorithm, {
    packageName: string; packageUrl: string; prose: string; comingSoon: string;
  }> = {
    ecdsa: {
      packageName: '@noble/curves',
      packageUrl:  'https://github.com/paulmillr/noble-curves',
      prose:       t('ecdsaImplProse'),
      comingSoon:  t('sigImplArticleComingSoonEcdsa'),
    },
    mldsa65: {
      packageName: '@noble/post-quantum',
      packageUrl:  'https://github.com/paulmillr/noble-post-quantum',
      prose:       t('mldsa65ImplProse'),
      comingSoon:  t('sigImplArticleComingSoonMlDsa65'),
    },
    slhdsa128s: {
      packageName: '@noble/post-quantum',
      packageUrl:  'https://github.com/paulmillr/noble-post-quantum',
      prose:       t('slhdsa128sImplProse'),
      comingSoon:  t('sigImplArticleComingSoonSlhDsa128s'),
    },
    slhdsa128f: {
      packageName: '@noble/post-quantum',
      packageUrl:  'https://github.com/paulmillr/noble-post-quantum',
      prose:       t('slhdsa128fImplProse'),
      comingSoon:  t('sigImplArticleComingSoonSlhDsa128f'),
    },
  };

  const currentImpl = implMeta[dsa];
  const isQsAlgo    = DSA_IS_QUANTUM_SAFE[dsa];

  // The verification result to display (tamper overrides original)
  const displayResult = tamperResult ?? step3;

  return (
    <AttackerContext.Provider value={{ attackerMode, quantumMode }}>
      <div>
        {/* ── Header ── */}
        <header className="mb-8">
          <p className="mono-label text-[var(--color-primary)] mb-2">{t('sigLabel')}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-text-base)]">{t('sigTitle')}</h1>
          <p className="mt-4 text-[var(--color-text-muted)] leading-relaxed">{t('sigIntro')}</p>
          <p className="mt-2 font-mono text-xs text-[var(--color-text-dim)] leading-relaxed">{t('sigXmssLmsNote')}</p>
        </header>

        <div className="flex flex-col gap-8">

          {/* ── Config panel ── */}
          <div className="glass-panel rounded-xl border border-[var(--color-glass-border)] p-5 flex flex-col gap-5">

            {/* DSA selector */}
            <div className="flex flex-col gap-2">
              <span className="mono-label text-[var(--color-text-muted)]">{t('sigDsaLabel')}</span>
              <div className="flex flex-wrap gap-2">
                {(['ecdsa', 'mldsa65', 'slhdsa128s', 'slhdsa128f'] as DsaAlgorithm[]).map(d => (
                  <button key={d}
                    onClick={() => { setDsa(d); setStep1(null); setStep2(null); setStep3(null); setPhase('idle'); setTamperMode(false); setTamperResult(null); }}
                    disabled={phase === 'running'}
                    className={`font-mono text-xs px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                      dsa === d
                        ? 'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10'
                        : 'border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                    }`}>
                    {t(DSA_LABEL_KEYS[d] as Parameters<typeof t>[0])}
                  </button>
                ))}
              </div>
            </div>

            {/* Implementation info */}
            <ImplInfoPanel
              toggleLabel={t('implToggle')}
              packageLabel={t('implPackageLabel')}
              snippetLabel={t('implSnippetLabel')}
              packageName={currentImpl.packageName}
              packageUrl={currentImpl.packageUrl}
              snippetHtml={snippetHtmls[dsa]}
              prose={currentImpl.prose}
              articleComingSoon={currentImpl.comingSoon}
            />

            {/* Message input */}
            <div className="flex flex-col gap-2">
              <label htmlFor="sig-input" className="mono-label text-[var(--color-text-muted)]">
                {t('sigInputLabel')}
              </label>
              <input
                id="sig-input"
                type="text"
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && phase !== 'running') handleGenerate(); }}
                placeholder={t('sigInputPlaceholder')}
                className="w-full rounded-lg border border-[var(--color-glass-border)] bg-[var(--color-bg-base)] px-4 py-3 font-mono text-sm text-[var(--color-text-base)] placeholder:text-[var(--color-text-dim)] focus:outline-none focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
              />
            </div>

            {/* Generate + Race + Benchmark buttons + legend */}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleGenerate}
                disabled={phase === 'running' || !message.trim()}
                className="rounded-lg bg-[var(--color-primary)] px-5 py-2.5 font-mono text-sm font-semibold text-[var(--color-bg-base)] hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
                {phase === 'running' ? t('sigGenerating') : t('sigGenerateButton')}
              </button>
              <button
                onClick={handleRace}
                disabled={phase === 'running'}
                className="rounded-lg border border-[var(--color-glass-border)] px-4 py-2.5 font-mono text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {t('sigRaceButton')}
              </button>
              <button
                onClick={() => void handleBenchmark()}
                disabled={phase === 'running' || benchmarkActive}
                className="rounded-lg border border-[var(--color-glass-border)] px-4 py-2.5 font-mono text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {t('sigBenchmarkButton')}
              </button>
              <div className="flex gap-4 text-xs text-[var(--color-text-muted)] ml-auto">
                <span className="flex items-center gap-1.5">🔒 {t('legendPrivate')}</span>
                <span className="flex items-center gap-1.5">
                  <span className="text-[var(--color-primary)]">📢</span> {t('legendPublic')}
                </span>
              </div>
            </div>
          </div>

          {/* ── DSA Race Panel ── */}
          {raceActive && Object.keys(race).length > 0 && (
            <div className="glass-panel rounded-xl border border-[var(--color-glass-border)] p-5 flex flex-col gap-4 animate-fade-up">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-xs text-[var(--color-primary)]">{t('sigRaceTitle')}</span>
                <button
                  onClick={() => { setRace({}); setRaceActive(false); }}
                  className="font-mono text-xs px-2.5 py-1 rounded border border-[var(--color-glass-border)] text-[var(--color-text-dim)] hover:border-[var(--color-text-muted)] hover:text-[var(--color-text-muted)] transition-colors">
                  {t('sigBenchmarkClose')}
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(['ecdsa', 'mldsa65', 'slhdsa128s', 'slhdsa128f'] as DsaAlgorithm[]).map(d => (
                  <SigRaceCard key={d} dsa={d} entry={race[d] ?? { phase: 'waiting' }} />
                ))}
              </div>
            </div>
          )}

          {/* ── Benchmark Panel ── */}
          {Object.keys(benchmark).length > 0 && (
            <SigBenchmarkPanel
              benchmark={benchmark}
              active={benchmarkActive}
              onStop={() => { benchmarkAbortRef.current = true; }}
              onClose={() => { setBenchmark({}); history.replaceState(null, '', '#signatures'); }}
              onShare={handleBenchmarkShare}
              shareCopied={benchmarkShareCopied}
            />
          )}

          {/* ── Mode toggles (after first run) ── */}
          {phase !== 'idle' && (
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAttackerMode(v => !v)}
                className={`font-mono text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  attackerMode
                    ? 'border-red-500/40 text-red-400 bg-red-500/10'
                    : 'border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:border-red-500/40 hover:text-red-400'
                }`}>
                {t(attackerMode ? 'attackerModeOff' : 'attackerModeOn')}
              </button>
              <button
                onClick={() => setQuantumMode(v => !v)}
                className={`font-mono text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  quantumMode
                    ? 'border-red-500/40 text-red-400 bg-red-500/10'
                    : 'border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:border-red-500/40 hover:text-red-400'
                }`}>
                {t(quantumMode ? 'quantumModeOff' : 'quantumModeOn')}
              </button>
              {phase === 'done' && (
                <>
                  <button
                    onClick={() => { setTamperMode(v => !v); setTamperResult(null); }}
                    className={`font-mono text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                      tamperMode
                        ? 'border-amber-500/40 text-amber-400 bg-amber-500/10'
                        : 'border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:border-amber-500/40 hover:text-amber-400'
                    }`}>
                    {t(tamperMode ? 'sigTamperToggleActive' : 'sigTamperToggle')}
                  </button>
                  <button onClick={handleShare}
                    className="ml-auto font-mono text-xs px-3 py-1.5 rounded-lg border border-[var(--color-glass-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors">
                    {shareCopied ? t('shareCopied') : t('shareButton')}
                  </button>
                </>
              )}
            </div>
          )}

          {/* ── Tamper hint ── */}
          {tamperActive && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 font-mono text-xs text-amber-400/80">
              {t('sigTamperHint')}
            </div>
          )}

          {/* ── Steps ── */}
          <div className="flex flex-col gap-6">

            {/* Step 1 — Key Generation */}
            {step1 && (
              <SplitStepCard
                number="// step 01"
                title={t('sigStep1Title')}
                desc={t('sigStep1Desc')}
                leftLabel={t('sigSignerLabel')}
                rightLabel={t('sigVerifierLabel')}
                exchange={[{ label: t('sigExchangePubKey'), direction: '→' }]}
                badge={
                  quantumMode && !isQsAlgo
                    ? <BreachedBadge label={t('sigStep1QuantumBadgeEcdsa')} />
                    : quantumMode && isQsAlgo
                      ? <SafeBadge label={t('sigStep1QuantumSafe')} />
                      : undefined
                }
                left={
                  <div className="flex flex-col gap-3">
                    <SigHexField label={t('sigSecretKey')} bytes={step1.secretKey} isPrivate={true} />
                    <SigHexField label={t('sigPublicKey')} bytes={step1.publicKey} isPrivate={false} />
                    <span className="font-mono text-xs text-[var(--color-text-dim)]">
                      {`keygen: ${fmtMs(step1.keygenMs)}`}
                    </span>
                  </div>
                }
                right={
                  <div className="flex flex-col gap-3">
                    <SigHexField label={t('sigPublicKey')} bytes={step1.publicKey} isPrivate={false} />
                    <span className="font-mono text-xs text-[var(--color-text-dim)]">{t('sigVerifierReceivedPubKey')}</span>
                  </div>
                }
              />
            )}

            {/* Step 2 — Message + Sign */}
            {step2 && (
              <SplitStepCard
                number="// step 02"
                title={t('sigStep2Title')}
                desc={t(DSA_STEP2_DESC_KEYS[dsa] as Parameters<typeof t>[0])}
                leftLabel={t('sigSignerLabel')}
                rightLabel={t('sigVerifierLabel')}
                exchange={[
                  { label: t('sigExchangeMessage'),   direction: '→' },
                  { label: t('sigExchangeSignature'), direction: '→' },
                ]}
                left={
                  <div className="flex flex-col gap-3">
                    <SigTextField
                      label={t('sigMessage')}
                      bytes={step2.message}
                      isPrivate={false}
                      tamperField="message"
                      onTamper={handleTamper}
                      tamperActive={tamperActive}
                      onReset={() => setTamperResult(null)}
                    />
                    {/* ECDSA: show the SHA-256 hash that is actually signed */}
                    {step2.messageHash && (
                      <SigHexField
                        label={t('sigMessageHash')}
                        bytes={step2.messageHash}
                        isPrivate={false}
                        alwaysExpanded
                      />
                    )}
                    <SigHexField
                      label={t('sigSignature')}
                      bytes={step2.signature}
                      isPrivate={false}
                      tamperField="signature"
                      onTamper={handleTamper}
                      tamperActive={tamperActive}
                      onReset={() => setTamperResult(null)}
                    />
                    <span className="font-mono text-xs text-[var(--color-text-dim)]">
                      {`sign: ${fmtMs(step2.signMs)}`}
                    </span>
                  </div>
                }
                right={
                  <div className="flex flex-col gap-3">
                    <SigTextField label={t('sigMessage')}   bytes={step2.message}    isPrivate={false} />
                    {/* Verifier side: note that they must also recompute the hash for ECDSA */}
                    {step2.messageHash && (
                      <span className="font-mono text-xs text-[var(--color-text-dim)] italic">
                        {t('sigMessageHashVerifierNote')}
                      </span>
                    )}
                    <SigHexField  label={t('sigSignature')} bytes={step2.signature}  isPrivate={false} />
                  </div>
                }
              />
            )}

            {/* Step 3 — Verification */}
            {step3 && displayResult && (
              <StepCard
                number="// step 03"
                title={t('sigStep3Title')}
                desc={dsa === 'ecdsa' ? t('sigStep3DescEcdsa') : t('sigStep3Desc')}
              >
                {quantumMode && dsa === 'ecdsa' && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-4 py-3 font-mono text-xs text-red-400/90">
                    {t('sigStep3QuantumWarningEcdsa')}
                  </div>
                )}
                <div className={`rounded-lg border px-4 py-3 font-mono text-sm ${
                  displayResult.valid
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-red-500/40 bg-red-500/10 text-red-400'
                }`}>
                  {displayResult.valid ? t('sigResultValid') : t('sigResultInvalid')}
                </div>
                <span className="font-mono text-xs text-[var(--color-text-dim)]">
                  {`verify: ${fmtMs(displayResult.verifyMs)}`}
                </span>
              </StepCard>
            )}
          </div>

          {/* ── Real-World Card ── */}
          {phase === 'done' && realWorldItems && realWorldItems.length > 0 && (
            <SigRealWorldCard items={realWorldItems} />
          )}

          {/* ── Error ── */}
          {phase === 'error' && errorMsg && (
            <div className="font-mono text-xs text-red-400 border border-red-500/40 rounded-lg px-4 py-3 bg-red-500/5">
              {errorMsg}
            </div>
          )}

        </div>
      </div>
    </AttackerContext.Provider>
  );
}
