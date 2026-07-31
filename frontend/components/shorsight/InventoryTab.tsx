'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  model, blobUrl,
  type Algo, type Lib, type Occurrence,
} from '@/lib/shorsight';
import {
  Badge, Chip, Drawer, DrawerSection, InfoTip, KeyValue, Panel, PanelTitle, Pill,
  CONFIDENCE_STYLE, SOURCE_ICON, STATUS_FILL,
} from './ui';

type SortKey = 'name' | 'kind' | 'quantum' | 'classical' | 'family' | 'confidence' | 'uses';

const CONFIDENCE_RANK: Record<string, number> = { 'name-only': 0, resolved: 1, literal: 2 };
const QUANTUM_ORDER   = ['safe', 'unsafe', 'unknown'] as const;
const CLASSICAL_ORDER = ['secure', 'weak', 'broken', 'unknown'] as const;

function countBy<T, K extends keyof T>(rows: T[], key: K): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const k = String(r[key]);
    out[k] = (out[k] ?? 0) + 1;
  }
  return out;
}

/* ─── inventory ───────────────────────────────────────────────────────────── */

export default function InventoryTab() {
  const t = useTranslations('cbom');

  const [quantumFilter, setQuantumFilter]       = useState('all');
  const [confidenceFilter, setConfidenceFilter] = useState('all');
  const [search, setSearch]                     = useState('');
  const [sort, setSort]                         = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'name', dir: 1 });
  const [openAlgo, setOpenAlgo]                 = useState<Algo | null>(null);
  const [openLib, setOpenLib]                   = useState<Lib | null>(null);

  const quantumCounts   = useMemo(() => countBy(model.algos, 'quantum'), []);
  const classicalCounts = useMemo(() => countBy(model.algos, 'classical'), []);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    let out = model.algos.filter(a =>
      (quantumFilter    === 'all' || a.quantum    === quantumFilter) &&
      (confidenceFilter === 'all' || a.confidence === confidenceFilter) &&
      (!needle || `${a.name} ${a.family} ${a.sources.join(' ')}`.toLowerCase().includes(needle)),
    );
    const value = (a: Algo): string | number =>
      sort.key === 'uses'       ? a.occ.length
      : sort.key === 'confidence' ? CONFIDENCE_RANK[a.confidence] ?? 1
      : a[sort.key];
    out = [...out].sort((a, b) => {
      const x = value(a), y = value(b);
      return (x > y ? 1 : x < y ? -1 : 0) * sort.dir;
    });
    return out;
  }, [quantumFilter, confidenceFilter, search, sort]);

  const cveCount = 0; // no advisories in this scan; kept explicit so the card never lies

  const cards: { label: string; value: number; tone?: string }[] = [
    { label: t('cardAssets'),          value: model.algos.length },
    { label: t('cardQuantumSafe'),     value: quantumCounts.safe ?? 0,    tone: 'safe' },
    { label: t('cardQuantumUnsafe'),   value: quantumCounts.unsafe ?? 0,  tone: 'unsafe' },
    { label: t('cardQuantumUnknown'),  value: quantumCounts.unknown ?? 0 },
    { label: t('cardBrokenWeak'),      value: (classicalCounts.broken ?? 0) + (classicalCounts.weak ?? 0), tone: 'unsafe' },
    { label: t('cardLibraries'),       value: model.libs.length },
    { label: t('cardCves'),            value: cveCount },
    { label: t('cardSinks'),           value: model.sinks.length },
  ];

  return (
    <div className="space-y-6">

      {/* ── headline numbers ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {cards.map(c => (
          <div key={c.label} className="glass-panel rounded-xl px-4 py-3.5">
            <p className={`text-2xl font-bold tabular-nums sm:text-3xl ${
              c.tone === 'safe' ? 'text-emerald-400' : c.tone === 'unsafe' && c.value > 0 ? 'text-red-400' : 'text-[var(--color-text-base)]'
            }`}>
              {c.value}
            </p>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">{c.label}</p>
          </div>
        ))}
      </div>

      {/* ── readiness + strength + provenance ─────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle>{t('quantumReadinessTitle')}</PanelTitle>
          <div className="flex flex-wrap items-center gap-6">
            <Donut counts={quantumCounts} total={model.algos.length} label={t('donutAssets')} />
            <ul className="space-y-1.5">
              {QUANTUM_ORDER.map(k => (
                <li key={k} className="flex items-center gap-2 font-mono text-xs text-[var(--color-text-muted)]">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_FILL[k] }} />
                  {t(`quantum_${k}`)}
                  <b className="text-[var(--color-text-base)]">{quantumCounts[k] ?? 0}</b>
                </li>
              ))}
            </ul>
          </div>
        </Panel>

        <Panel>
          <PanelTitle>{t('classicalStrengthTitle')}</PanelTitle>
          <div className="space-y-2">
            {CLASSICAL_ORDER.map(k => {
              const v = classicalCounts[k] ?? 0;
              return (
                <div key={k} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 font-mono text-[11px] text-[var(--color-text-muted)]">{t(`classical_${k}`)}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-bg-elevated)]">
                    <div
                      className="h-full rounded-full transition-[width] duration-500"
                      style={{ width: `${(v / Math.max(model.algos.length, 1)) * 100}%`, background: STATUS_FILL[k] }}
                    />
                  </div>
                  <b className="w-5 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--color-text-base)]">{v}</b>
                </div>
              );
            })}
          </div>

          <h4 className="mono-label mt-6 mb-2 text-[var(--color-primary)]">{t('whereItLivesTitle')}</h4>
          <p className="font-mono text-xs text-[var(--color-text-base)]">{model.target}</p>
          <ul className="mt-2 space-y-1">
            {model.sources.map(s => {
              const n = model.algos.filter(a => a.sources.includes(s.label)).length;
              return (
                <li key={s.label} className="font-mono text-[11px] text-[var(--color-text-muted)]">
                  {SOURCE_ICON[s.kind] ?? '•'} <b className="text-[var(--color-text-base)]">{s.label}</b>{' '}
                  {t('sourceMeta', { kind: s.kind, count: n })}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      {/* ── algorithms ────────────────────────────────────────────────────── */}
      <Panel className="!p-0">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-[var(--color-border)] p-4 sm:px-6">
          <h3 className="mr-auto text-sm font-semibold text-[var(--color-text-base)]">{t('algoTableTitle')}</h3>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="w-36 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-base)] px-3 py-1 font-mono text-xs text-[var(--color-text-base)] placeholder:text-[var(--color-text-muted)] focus:border-[var(--color-primary)] focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] text-[var(--color-text-muted)]">{t('filterQuantum')}</span>
            {['all', ...QUANTUM_ORDER].map(k => (
              <Chip key={k} active={quantumFilter === k} onClick={() => setQuantumFilter(k)}>
                {k === 'all' ? t('filterAll') : t(`quantum_${k}`)}
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] text-[var(--color-text-muted)]">{t('filterEvidence')}</span>
            {['all', 'literal', 'resolved', 'name-only'].map(k => (
              <Chip key={k} active={confidenceFilter === k} onClick={() => setConfidenceFilter(k)}>
                {k === 'all' ? t('filterAll') : t(`evidence_${k}`)}
              </Chip>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                {([
                  ['name',       t('colAsset')],
                  ['kind',       t('colType')],
                  ['quantum',    t('colQuantum')],
                  ['classical',  t('colClassical')],
                  ['family',     t('colFamily')],
                  ['confidence', t('colEvidence')],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <SortableTh key={key} sortKey={key} sort={sort} onSort={setSort}>
                    {label}
                    {key === 'confidence' && (
                      <InfoTip label={t('colEvidence')}>
                        {t.rich('evidenceInfo', { b: c => <b>{c}</b>, br: () => <br /> })}
                      </InfoTip>
                    )}
                  </SortableTh>
                ))}
                <th className="px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                  {t('colSource')}
                </th>
                <SortableTh sortKey="uses" sort={sort} onSort={setSort} align="right">{t('colUses')}</SortableTh>
              </tr>
            </thead>
            <tbody>
              {rows.map(a => (
                <tr
                  key={a.ref}
                  tabIndex={0}
                  onClick={() => setOpenAlgo(a)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenAlgo(a); } }}
                  className="cursor-pointer border-b border-[var(--color-border-dim)] transition-colors last:border-0 hover:bg-[var(--color-primary-glow)] focus:bg-[var(--color-primary-glow)] focus:outline-none"
                >
                  <td className="px-4 py-2.5 font-mono text-xs font-semibold text-[var(--color-text-base)]">{a.name}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--color-text-muted)]">{a.kind}</td>
                  <td className="px-4 py-2.5"><Badge tone={a.quantum}>{t(`quantum_${a.quantum}`)}</Badge></td>
                  <td className="px-4 py-2.5"><Badge tone={a.classical}>{t(`classical_${a.classical}`)}</Badge></td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-[var(--color-text-muted)]">{a.family}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 font-mono text-[10px] leading-4 ${CONFIDENCE_STYLE[a.confidence]}`}>
                      {t(`evidence_${a.confidence}`)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-1">
                      {a.sources.map(s => <Pill key={s}>{SOURCE_ICON[sourceKind(s)] ?? '•'} {s}</Pill>)}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-[var(--color-text-muted)]">{a.occ.length}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center font-mono text-xs text-[var(--color-text-muted)]">{t('noMatches')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── libraries + sinks ─────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <PanelTitle>{t('libTableTitle')}</PanelTitle>
          <p className="mb-4 text-xs leading-relaxed text-[var(--color-text-muted)]">
            {t.rich('libIntro', { b: c => <b className="text-[var(--color-text-base)]">{c}</b> })}
          </p>
          <ul className="space-y-2">
            {model.libs.map(l => (
              <li key={l.ref}>
                <button
                  type="button"
                  onClick={() => setOpenLib(l)}
                  className="w-full rounded-lg border border-[var(--color-border-dim)] px-3 py-2.5 text-left transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-glow)]"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-[var(--color-text-base)]">{l.name}</span>
                    {l.scope === 'transitive' && <Pill title={t('transitiveTitle')}>{t('transitive')}</Pill>}
                    <span className="ml-auto font-mono text-[11px] text-[var(--color-text-muted)]">
                      {l.version ?? '—'}
                      {l.precision === 'exact'
                        ? <span title={t('versionExactTitle')}> 📌</span>
                        : l.version ? <span title={t('versionUnpinnedTitle')}> ~</span> : null}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <CveCell lib={l} />
                    {l.purl && <span className="font-mono text-[10px] text-[var(--color-text-muted)]">{l.purl}</span>}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <PanelTitle info={
            <InfoTip label={t('sinksTitle')}>
              {t.rich('sinksInfo', { b: c => <b>{c}</b>, br: () => <br /> })}
            </InfoTip>
          }>
            {t('sinksTitle')}
          </PanelTitle>
          {model.sinks.length === 0 ? (
            <p className="font-mono text-xs text-[var(--color-text-muted)]">{t('sinksNone')}</p>
          ) : (
            <ul className="space-y-1.5">
              {model.sinks.map((s, i) => {
                const url = s.location ? blobUrl(model.prov[s.source ?? ''], s.location, s.line) : '';
                const where = s.location ? `${s.location}${s.line ? `:${s.line}` : ''}` : '';
                return (
                  <li key={`${s.symbol}-${s.location}-${s.line}-${i}`} className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                    <code className="rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-[var(--color-primary)]">{s.symbol}</code>
                    {s.library && <Pill>{s.library}</Pill>}
                    {where && (
                      url
                        ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-text-muted)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-primary)]">{where} ↗</a>
                        : <span className="text-[var(--color-text-muted)]">{where}</span>
                    )}
                    {s.cryptoAsset && <span className="text-[var(--color-text-muted)]">— {t('sinkCryptoAsset')}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      <AlgoDrawer algo={openAlgo} onClose={() => setOpenAlgo(null)} />
      <LibDrawer  lib={openLib}   onClose={() => setOpenLib(null)} />
    </div>
  );
}

function sourceKind(label: string): string {
  return model.sources.find(s => s.label === label)?.kind ?? 'source';
}

/* ─── table header ────────────────────────────────────────────────────────── */

function SortableTh({ sortKey, sort, onSort, align, children }: {
  sortKey: SortKey;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (s: { key: SortKey; dir: 1 | -1 }) => void;
  align?: 'right';
  children: ReactNode;
}) {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}
      className={`px-4 py-2.5 ${align === 'right' ? 'text-right' : ''}`}
    >
      <button
        type="button"
        onClick={() => onSort({ key: sortKey, dir: active && sort.dir === 1 ? -1 : 1 })}
        className={`inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider transition-colors hover:text-[var(--color-primary)] ${
          active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-muted)]'
        }`}
      >
        {children}
        <span aria-hidden="true" className={active ? '' : 'opacity-0'}>{sort.dir === 1 ? '↑' : '↓'}</span>
      </button>
    </th>
  );
}

/* ─── CVE cell ────────────────────────────────────────────────────────────── */

function CveCell({ lib }: { lib: Lib }) {
  const t = useTranslations('cbom');
  if (lib.cveStatus === 'unaffected') {
    return <Badge tone="safe" title={t('cveNotAffectedTitle')}>✓ {t('cveNotAffected')}</Badge>;
  }
  if (lib.cveStatus === 'unknown' || lib.precision === 'unpinned') {
    return <Badge tone="unknown" title={t('cveUnknownTitle')}>{t('cveUnknown')}</Badge>;
  }
  return <Badge tone="unknown">{t('cveNone')}</Badge>;
}

/* ─── drawers ─────────────────────────────────────────────────────────────── */

function AlgoDrawer({ algo, onClose }: { algo: Algo | null; onClose: () => void }) {
  const t = useTranslations('cbom');
  if (!algo) return null;

  const slug = algo.ref.replace(/^crypto\//, '');
  // The scanner's rationale is English; a translated one is kept per asset and
  // falls back to the scanner's text for anything a future scan turns up.
  const rationale = t.has(`rationale.${slug}`) ? t(`rationale.${slug}`) : algo.rationale;

  return (
    <Drawer
      open
      onClose={onClose}
      title={algo.name}
      subtitle={
        <>
          <Badge tone={algo.quantum}>{t(`quantum_${algo.quantum}`)}</Badge>
          <Badge tone={algo.classical}>{t(`classical_${algo.classical}`)}</Badge>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] leading-4 ${CONFIDENCE_STYLE[algo.confidence]}`}>
            {t(`evidence_${algo.confidence}`)}
          </span>
          <span className="font-mono text-[11px] text-[var(--color-text-muted)]">{algo.kind} · {algo.family}</span>
        </>
      }
    >
      <DrawerSection title={t('detailProperties')}>
        <div>
          {algo.primitive && <KeyValue label={t('detailPrimitive')}>{algo.primitive}</KeyValue>}
          {algo.paramSet  && <KeyValue label={t('detailParam')}>{algo.paramSet}</KeyValue>}
          {algo.mode      && <KeyValue label={t('detailMode')}>{algo.mode}</KeyValue>}
          {algo.nist != null && <KeyValue label={t('detailNist')}>{algo.nist}</KeyValue>}
          {algo.oid       && <KeyValue label={t('detailOid')}>{algo.oid}</KeyValue>}
          {algo.functions.length > 0 && <KeyValue label={t('detailOperation')}>{algo.functions.join(', ')}</KeyValue>}
        </div>
      </DrawerSection>

      {rationale && (
        <DrawerSection title={t('detailAssessment')}>
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{rationale}</p>
        </DrawerSection>
      )}

      {algo.libraries.length > 0 && (
        <DrawerSection title={t('detailLibraries')}>
          <div className="flex flex-wrap gap-1.5">{algo.libraries.map(l => <Pill key={l}>{l}</Pill>)}</div>
        </DrawerSection>
      )}

      <DrawerSection title={t('detailUsage', { count: algo.occ.length })}>
        <ul className="space-y-2">
          {algo.occ.map((o, i) => <OccurrenceRow key={`${o.file}-${o.line}-${i}`} occ={o} />)}
          {algo.occ.length === 0 && <li className="font-mono text-xs text-[var(--color-text-muted)]">—</li>}
        </ul>
      </DrawerSection>
    </Drawer>
  );
}

function OccurrenceRow({ occ }: { occ: Occurrence }) {
  const url = blobUrl(model.prov[occ.src], occ.file, occ.line);
  const where = `${occ.file}${occ.line ? `:${occ.line}` : ''}`;
  return (
    <li className="rounded-lg border border-[var(--color-border-dim)] px-3 py-2">
      <p className="break-all font-mono text-[11px]">
        {url
          ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline decoration-dotted underline-offset-2 hover:opacity-80">{where} ↗</a>
          : <span className="text-[var(--color-text-base)]">{where}</span>}
      </p>
      {occ.symbol && <p className="mt-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">{occ.symbol}</p>}
      {occ.context && (
        <pre className="mt-1.5 overflow-x-auto rounded bg-[var(--color-bg-base)] px-2 py-1 font-mono text-[10px] leading-relaxed text-[var(--color-text-muted)]">
          {occ.context}
        </pre>
      )}
    </li>
  );
}

function LibDrawer({ lib, onClose }: { lib: Lib | null; onClose: () => void }) {
  const t = useTranslations('cbom');
  if (!lib) return null;

  const precisionLabel = lib.precision === 'exact' ? t('precisionExact')
                       : lib.precision === 'unpinned' ? t('precisionUnpinned')
                       : lib.precision;
  const cveStatusLabel = lib.cveStatus === 'affected'   ? t('cveStatusAffected')
                       : lib.cveStatus === 'unaffected' ? t('cveStatusUnaffected')
                       : t('cveStatusUnknown');

  return (
    <Drawer
      open
      onClose={onClose}
      title={lib.name}
      subtitle={<span className="font-mono text-[11px] text-[var(--color-text-muted)]">{lib.version ?? t('versionUnknown')}</span>}
    >
      {lib.purl && (
        <DrawerSection title={t('detailPackage')}>
          <Pill>{lib.purl}</Pill>
        </DrawerSection>
      )}

      <DrawerSection title={t('detailDependency')}>
        <div>
          {lib.scope     && <KeyValue label={t('detailScope')}>{lib.scope === 'transitive' ? t('transitive') : t('direct')}</KeyValue>}
          {lib.precision && <KeyValue label={t('detailVersion')}>{precisionLabel}</KeyValue>}
          {lib.cveStatus && <KeyValue label={t('detailCveStatus')}>{cveStatusLabel}</KeyValue>}
        </div>
      </DrawerSection>

      {lib.provides.length > 0 && (
        <DrawerSection title={t('detailProvides')}>
          <div className="flex flex-wrap gap-1.5">
            {lib.provides.map(ref => {
              const a = model.algos.find(x => x.ref === ref);
              return <Pill key={ref}>{a?.name ?? ref}</Pill>;
            })}
          </div>
        </DrawerSection>
      )}

      {lib.files.length > 0 && (
        <DrawerSection title={t('detailImportedIn', { count: lib.files.length })}>
          <ul className="space-y-1">
            {lib.files.map(f => {
              const url = blobUrl(model.prov[model.sources[0]?.label ?? ''], f);
              return (
                <li key={f} className="break-all font-mono text-[11px]">
                  {url
                    ? <a href={url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-primary)] underline decoration-dotted underline-offset-2 hover:opacity-80">{f} ↗</a>
                    : <span className="text-[var(--color-text-muted)]">{f}</span>}
                </li>
              );
            })}
          </ul>
        </DrawerSection>
      )}
    </Drawer>
  );
}

/* ─── donut ───────────────────────────────────────────────────────────────── */

function Donut({ counts, total, label }: {
  counts: Record<string, number>; total: number; label: string;
}) {
  const sum = QUANTUM_ORDER.reduce((s, k) => s + (counts[k] ?? 0), 0) || 1;
  let acc = 0;
  const segments = QUANTUM_ORDER.map(k => {
    const from = (acc / sum) * 100;
    acc += counts[k] ?? 0;
    return `${STATUS_FILL[k]} ${from}% ${(acc / sum) * 100}%`;
  }).join(', ');

  return (
    <div
      className="relative h-[9.5rem] w-[9.5rem] shrink-0 rounded-full"
      style={{ background: `conic-gradient(${segments})` }}
      role="img"
      aria-label={`${total} ${label}`}
    >
      <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-[var(--color-bg-surface)]">
        <span className="text-2xl font-bold tabular-nums text-[var(--color-text-base)]">{total}</span>
        <span className="mono-label text-[10px] text-[var(--color-text-muted)]">{label}</span>
      </div>
    </div>
  );
}
