'use client';

import { useTranslations } from 'next-intl';
import cbomData from '@/public/cbom.json';

/* ─── types ─────────────────────────────────────────────────────────── */
type CbomComponent = (typeof cbomData.components)[number];

/* ─── primitive → display ───────────────────────────────────────────── */
const PRIMITIVE_META: Record<string, { label: string; color: string; border: string; bg: string }> = {
  kem:           { label: 'KEM',          color: 'text-cyan-400',   border: 'border-l-cyan-500',   bg: 'bg-cyan-500/10'   },
  signature:     { label: 'Signature',    color: 'text-violet-400', border: 'border-l-violet-500', bg: 'bg-violet-500/10' },
  'block-cipher':{ label: 'Block Cipher', color: 'text-emerald-400',border: 'border-l-emerald-500',bg: 'bg-emerald-500/10'},
  hash:          { label: 'Hash',         color: 'text-amber-400',  border: 'border-l-amber-500',  bg: 'bg-amber-500/10'  },
  mac:           { label: 'MAC',          color: 'text-orange-400', border: 'border-l-orange-500', bg: 'bg-orange-500/10' },
  kdf:           { label: 'KDF',          color: 'text-blue-400',   border: 'border-l-blue-400',   bg: 'bg-blue-500/10'   },
  ke:            { label: 'Key Exchange', color: 'text-red-400',    border: 'border-l-red-500',    bg: 'bg-red-500/10'    },
};

function primitiveOf(c: CbomComponent) {
  return c.cryptoProperties?.algorithmProperties?.primitive ?? 'unknown';
}
function isQS(c: CbomComponent) {
  return (c.cryptoProperties?.algorithmProperties?.nistQuantumSecurityLevel ?? 0) > 0;
}
function meta(c: CbomComponent) {
  return PRIMITIVE_META[primitiveOf(c)] ?? { label: primitiveOf(c), color: 'text-slate-400', border: 'border-l-slate-500', bg: 'bg-slate-500/10' };
}
function depsOf(ref: string) {
  return cbomData.dependencies.find(d => d.ref === ref)?.dependsOn ?? [];
}

/* ─── main component ─────────────────────────────────────────────────── */
export default function CbomViewer() {
  const t = useTranslations('cbom');

  const components = cbomData.components;
  const count      = components.length;
  const qsCount    = components.filter(isQS).length;
  const nqsCount   = count - qsCount;

  const sorted = [...components].sort((a, b) => {
    if (isQS(a) !== isQS(b)) return isQS(a) ? -1 : 1;
    return a['bom-ref'].localeCompare(b['bom-ref']);
  });

  return (
    <div className="space-y-16">

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <header className="space-y-5">
        <p className="font-mono text-sm text-[var(--color-primary)]">
          // cbom ·{' '}
          <a
            href="https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-CBOM-en.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80 transition-opacity"
          >
            CycloneDX 1.6
          </a>
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-text)] sm:text-4xl">
          {t('pageTitle')}
        </h1>
        <p className="max-w-3xl text-base leading-relaxed text-[var(--color-text-muted)]">
          {t('intro', { count })}
        </p>
        <p className="max-w-3xl text-base leading-relaxed text-[var(--color-text-muted)]">
          {t('idSchemeNote')}
        </p>
        <p className="max-w-3xl text-base leading-relaxed text-[var(--color-text-muted)]">
          {t('scopeNote', { count })}
        </p>
        <p className="max-w-3xl text-base leading-relaxed text-[var(--color-text-muted)]">
          {t('autoUpdateNote')}
        </p>
      </header>

      {/* ── Compliance dashboard ──────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard value={count}    label={t('statTotal')}    mono="components" />
        <StatCard value={qsCount}  label={t('statQS')}       mono="quantum-safe" accent="emerald" />
        <StatCard value={nqsCount} label={t('statNQS')}      mono="not-qs"     accent="red" />
        <MetaCard specVersion={cbomData.specVersion} />
      </div>

      {/* ── Dependency map ────────────────────────────────────────────── */}
      <section>
        <SectionHeader label="// dependency-map" title={t('depMapTitle')} />
        <DependencyMap />
      </section>

      {/* ── Component inventory ───────────────────────────────────────── */}
      <section>
        <SectionHeader label="// components" title={t('inventoryTitle')} />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sorted.map(c => <ComponentCard key={c['bom-ref']} component={c} t={t} />)}
        </div>
      </section>

      {/* ── Download + JSON ───────────────────────────────────────────── */}
      <section className="space-y-4">
        <SectionHeader label="// export" title={t('exportTitle')} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <DownloadButton label={t('downloadBtn')} />
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            {t('downloadNotePrefix')}{' '}
            <a
              href="https://github.com/cbomkit/cbomkit?tab=readme-ov-file#cbomkit-coeus"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-primary)] underline underline-offset-2 hover:opacity-80 transition-opacity"
            >
              CBOMkit-coeus
            </a>
          </span>
        </div>

        <details className="group rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-base)] overflow-hidden">
          <summary className="flex cursor-pointer select-none list-none items-center justify-between px-5 py-4">
            <span className="font-mono text-sm text-[var(--color-primary)]">{t('rawJsonToggle')}</span>
            <svg className="h-4 w-4 text-[var(--color-text-muted)] transition-transform duration-200 group-open:rotate-90" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="border-t border-[var(--color-border)] px-5 py-4">
            <pre className="overflow-x-auto whitespace-pre text-xs leading-relaxed text-[var(--color-text-muted)]">
              {JSON.stringify(cbomData, null, 2)}
            </pre>
          </div>
        </details>
      </section>

    </div>
  );
}

/* ─── StatCard ───────────────────────────────────────────────────────── */
function StatCard({ value, label, mono, accent }: {
  value: number; label: string; mono: string; accent?: 'emerald' | 'red';
}) {
  const numColor = accent === 'emerald' ? 'text-emerald-400'
                 : accent === 'red'     ? 'text-red-400'
                 : 'text-[var(--color-text)]';
  return (
    <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-2">
      <p className="font-mono text-[10px] tracking-widest uppercase text-[var(--color-text-muted)] truncate">{mono}</p>
      <p className={`text-3xl sm:text-4xl font-bold tabular-nums ${numColor}`}>{value}</p>
      <p className="text-xs text-[var(--color-text-muted)] leading-tight">{label}</p>
    </div>
  );
}

/* ─── MetaCard ───────────────────────────────────────────────────────── */
function MetaCard({ specVersion }: { specVersion: string }) {
  return (
    <div className="glass-panel rounded-xl p-4 sm:p-5 space-y-2">
      <p className="font-mono text-[10px] tracking-widest uppercase text-[var(--color-text-muted)]">spec</p>
      <p className="font-mono text-xl font-bold text-[var(--color-primary)]">CycloneDX</p>
      <p className="font-mono text-sm text-[var(--color-text-muted)]">v{specVersion}</p>
    </div>
  );
}

/* ─── SectionHeader ──────────────────────────────────────────────────── */
function SectionHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="mb-5 space-y-1">
      <p className="font-mono text-xs text-[var(--color-primary)]">{label}</p>
      <h2 className="text-lg font-semibold text-[var(--color-text)]">{title}</h2>
    </div>
  );
}

/* ─── DependencyMap ──────────────────────────────────────────────────── */
function DependencyMap() {
  const deps = cbomData.dependencies;

  // Nodes participating in at least one dependency relationship
  const graphRefs = new Set(
    deps.filter(d => d.dependsOn.length > 0).flatMap(d => [d.ref, ...d.dependsOn])
  );

  const standalones = cbomData.components.filter(c => !graphRefs.has(c['bom-ref']));

  if (graphRefs.size === 0) {
    return (
      <div className="glass-panel rounded-xl p-6">
        <p className="font-mono text-[11px] text-[var(--color-text-muted)]">
          // no dependency relationships detected
        </p>
      </div>
    );
  }

  // Adjacency maps
  const inEdges  = new Map([...graphRefs].map(r => [r, new Set<string>()])); // r → its own deps
  const outEdges = new Map([...graphRefs].map(r => [r, new Set<string>()])); // r → who depends on r
  for (const entry of deps) {
    for (const dep of entry.dependsOn) {
      inEdges.get(entry.ref)?.add(dep);
      outEdges.get(dep)?.add(entry.ref);
    }
  }

  // Topological level: sources (no inEdges) = 0, each step adds 1
  const levelOf = new Map<string, number>();
  const computeLevel = (ref: string): number => {
    if (levelOf.has(ref)) return levelOf.get(ref)!;
    const ins = inEdges.get(ref) ?? new Set<string>();
    const level = ins.size === 0 ? 0 : Math.max(...[...ins].map(computeLevel)) + 1;
    levelOf.set(ref, level);
    return level;
  };
  for (const ref of graphRefs) computeLevel(ref);

  // Connected components (undirected BFS)
  const visited = new Set<string>();
  const components: Set<string>[] = [];
  for (const startRef of graphRefs) {
    if (visited.has(startRef)) continue;
    const comp = new Set<string>();
    const queue = [startRef];
    while (queue.length) {
      const r = queue.shift()!;
      if (visited.has(r)) continue;
      visited.add(r); comp.add(r);
      for (const n of [...(outEdges.get(r) ?? []), ...(inEdges.get(r) ?? [])]) {
        if (!visited.has(n)) queue.push(n);
      }
    }
    components.push(comp);
  }

  return (
    <div className="glass-panel rounded-xl p-3 sm:p-6 overflow-x-auto">
      <div className="space-y-5 sm:space-y-8">
        {components.map((comp, ci) => {
          const maxLevel = Math.max(...[...comp].map(r => levelOf.get(r) ?? 0));
          const columns = Array.from({ length: maxLevel + 1 }, (_, lvl) =>
            [...comp].filter(r => levelOf.get(r) === lvl)
          );
          return (
            <div key={ci} className="flex items-center gap-0">
              {columns.map((colRefs, lvl) => (
                <div key={lvl} className="flex items-center gap-0">
                  <div className="flex flex-col gap-2 sm:gap-3">
                    {colRefs.map(ref => <DepNode key={ref} ref_={ref} />)}
                  </div>
                  {lvl < maxLevel && <DepConnectorH />}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {standalones.length > 0 && (
        <p className="mt-5 font-mono text-[11px] text-[var(--color-text-muted)]">
          // {standalones.length} standalone (no dependencies):&nbsp;
          {standalones.map(c => c['bom-ref']).join(' · ')}
        </p>
      )}
    </div>
  );
}

function DepNode({ ref_ }: { ref_: string }) {
  const comp      = cbomData.components.find(c => c['bom-ref'] === ref_);
  const primitive = comp?.cryptoProperties?.algorithmProperties?.primitive ?? 'unknown';
  const m         = PRIMITIVE_META[primitive] ?? { label: primitive, color: 'text-slate-400', border: 'border-l-slate-500', bg: 'bg-slate-500/10' };
  return (
    <div className={`rounded-lg border ${m.bg} px-2 py-1.5 sm:px-3 sm:py-2 min-w-[88px] sm:min-w-[140px]`}
         style={{ borderColor: 'color-mix(in srgb, currentColor 20%, transparent)' }}>
      <p className={`font-mono text-[9px] sm:text-[10px] tracking-wide uppercase ${m.color}`}>{m.label}</p>
      <p className="font-mono text-[10px] sm:text-xs font-semibold text-[var(--color-text)] mt-0.5 truncate">#{ref_}</p>
      {comp && <p className="text-[9px] sm:text-[10px] text-[var(--color-text-muted)] mt-0.5 truncate max-w-[76px] sm:max-w-[120px]">{comp.name}</p>}
    </div>
  );
}

function DepConnectorH() {
  return (
    <div className="flex items-center shrink-0">
      <div className="h-px w-3 sm:w-8 bg-[var(--color-border)]" />
      <svg width="8" height="8" viewBox="0 0 8 8" className="text-[var(--color-text-muted)] shrink-0" aria-hidden="true">
        <path d="M0 4h6M4 1l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
    </div>
  );
}

/* ─── ComponentCard ──────────────────────────────────────────────────── */
function ComponentCard({ component, t }: { component: CbomComponent; t: ReturnType<typeof useTranslations<'cbom'>> }) {
  const m      = meta(component);
  const qs     = isQS(component);
  const deps   = depsOf(component['bom-ref']);
  const prim   = primitiveOf(component);

  return (
    <div className={`glass-panel rounded-xl border-l-4 ${m.border} flex flex-col overflow-hidden transition-all duration-200 hover:brightness-110`}>

      {/* card header: bom-ref id */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
          <span className="text-[var(--color-primary)]">#</span>{component['bom-ref']}
        </span>
        <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-medium tracking-wide ${m.color} ${m.bg}`}>
          {m.label}
        </span>
      </div>

      {/* algorithm name */}
      <div className="px-4 pb-3">
        <h3 className="text-base font-semibold text-[var(--color-text)] leading-snug">
          {component.name}
        </h3>
      </div>

      {/* quantum-safe badge */}
      <div className="px-4 pb-3">
        {qs ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 font-mono text-[11px] text-emerald-400">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
              <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            {t('statusQuantumSafe')}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 font-mono text-[11px] text-red-400">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className="shrink-0">
              <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            {t('statusNotSafe')}
          </span>
        )}
      </div>

      {/* description */}
      <p className="flex-1 px-4 pb-3 text-xs leading-relaxed text-[var(--color-text-muted)]">
        {component.description}
      </p>

      {/* footer: deps */}
      <div className="border-t border-[var(--color-border)] px-4 py-3">
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
          {t('tableColDependencies')}
        </p>
        {deps.length === 0 ? (
          <span className="font-mono text-[11px] text-[var(--color-text-muted)]">—</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {deps.map(dep => {
              const depComp = cbomData.components.find(c => c['bom-ref'] === dep);
              const dm = PRIMITIVE_META[depComp ? primitiveOf(depComp) : 'hash'];
              return (
                <span key={dep} className={`rounded px-2 py-0.5 font-mono text-[10px] ${dm.color} ${dm.bg}`}>
                  #{dep}
                </span>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}

/* ─── DownloadButton ─────────────────────────────────────────────────── */
function DownloadButton({ label }: { label: string }) {
  function handleDownload() {
    const json = JSON.stringify(cbomData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'cbom.json' });
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleDownload}
      className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-primary)] px-4 py-2 font-mono text-sm text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-[var(--color-bg-base)]"
    >
      {label}
    </button>
  );
}
