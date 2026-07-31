/**
 * ShorSight CBOM model.
 *
 * frontend/public/cbom.json is a CycloneDX 1.7 document produced by `shorsight scan`
 * and signed with ML-DSA-65 (scripts/sign-cbom.mjs). CycloneDX keeps everything that
 * is not part of the core schema in flat `properties` name/value pairs, so the raw
 * document is awkward to render directly. This module folds it into the shape the
 * inventory actually draws — mirroring ShorSight's own `parseCBOM`, so the page and
 * the tool agree on what the scan says.
 */

import rawCbom from '@/public/cbom.json';
import rawGovernance from '@/data/governance.json';

/* ─── raw CycloneDX shapes ───────────────────────────────────────────────── */

interface RawProperty { name: string; value: string }

interface RawOccurrence {
  location: string;
  line?: number;
  additionalContext?: string;
  symbol?: string;
}

interface RawComponent {
  type: string;
  'bom-ref': string;
  name: string;
  version?: string;
  purl?: string;
  cryptoProperties?: {
    assetType?: string;
    oid?: string;
    algorithmProperties?: {
      primitive?: string;
      algorithmFamily?: string;
      parameterSetIdentifier?: string;
      mode?: string;
      nistQuantumSecurityLevel?: number;
      cryptoFunctions?: string[];
    };
  };
  evidence?: { occurrences?: RawOccurrence[] };
  properties?: RawProperty[];
}

interface RawCbom {
  bomFormat: string;
  specVersion: string;
  serialNumber: string;
  version: number;
  metadata: {
    timestamp: string;
    tools?: { components?: { type: string; name: string; version?: string }[] };
    component?: { type: string; 'bom-ref'?: string; name: string };
    properties?: RawProperty[];
  };
  components: RawComponent[];
  dependencies?: { ref: string; dependsOn?: string[]; provides?: string[] }[];
}

export const cbom = rawCbom as unknown as RawCbom;

/* ─── parsed model ───────────────────────────────────────────────────────── */

export type QuantumStatus   = 'safe' | 'unsafe' | 'unknown';
export type ClassicalStatus = 'secure' | 'weak' | 'broken' | 'unknown';
export type Confidence      = 'literal' | 'resolved' | 'name-only';

export interface Occurrence {
  /** source label the file belongs to, e.g. `beyond-shor` — '' when unqualified */
  src: string;
  /** repo-relative path, with the `<source>::` prefix stripped */
  file: string;
  line?: number;
  context?: string;
  symbol?: string;
}

export interface Algo {
  ref: string;
  name: string;
  kind: string;
  quantum: QuantumStatus;
  classical: ClassicalStatus;
  family: string;
  rationale: string;
  libraries: string[];
  sources: string[];
  sink: boolean;
  primitive: string;
  paramSet: string;
  mode: string;
  nist?: number;
  oid: string;
  functions: string[];
  migrationStatus: string;
  vendorDependency: boolean;
  confidence: Confidence;
  occ: Occurrence[];
}

export interface Lib {
  ref: string;
  name: string;
  version?: string;
  purl?: string;
  /** `direct` | `transitive` */
  scope: string;
  /** `exact` (lockfile) | `unpinned` (manifest range) */
  precision: string;
  /** `affected` | `unaffected` | `unknown` */
  cveStatus: string;
  /** algorithms this library provides, from the dependency graph */
  provides: string[];
  files: string[];
}

export interface Sink {
  symbol: string;
  library?: string;
  source?: string;
  location?: string;
  line?: number;
  /** set for crypto assets sitting at a network boundary, not for plain call sinks */
  cryptoAsset?: boolean;
}

export interface Source { label: string; kind: string }

export interface Provenance {
  label: string;
  webUrl?: string;
  host?: string;
  commit?: string;
  pathPrefix?: string;
}

export interface Model {
  algos: Algo[];
  libs: Lib[];
  sinks: Sink[];
  sources: Source[];
  prov: Record<string, Provenance>;
  target: string;
  tool: { name: string; version?: string } | null;
  timestamp: string;
  specVersion: string;
  serialNumber: string;
}

/* ─── parsing ────────────────────────────────────────────────────────────── */

/** first value per property name, plus every value for the repeatable ones */
function propMap(props?: RawProperty[]) {
  const first: Record<string, string> = {};
  const all: Record<string, string[]> = {};
  for (const p of props ?? []) {
    if (first[p.name] === undefined) first[p.name] = p.value;
    (all[p.name] ??= []).push(p.value);
  }
  return { first, all };
}

function splitLocation(location: string): { src: string; file: string } {
  const parts = String(location).split('::');
  return parts.length > 1
    ? { src: parts[0], file: parts.slice(1).join('::') }
    : { src: '', file: location };
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], fallback: T): T {
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback;
}

function parse(doc: RawCbom): Model {
  const algos: Algo[] = [];
  const libs: Lib[]   = [];

  // library ref → the crypto assets it provides (dependency graph, not properties)
  const provides = new Map<string, string[]>();
  for (const dep of doc.dependencies ?? []) {
    if (dep.provides?.length) provides.set(dep.ref, dep.provides);
  }

  for (const c of doc.components) {
    const { first, all } = propMap(c.properties);

    if (c.type === 'cryptographic-asset') {
      const ap = c.cryptoProperties?.algorithmProperties ?? {};
      algos.push({
        ref:        c['bom-ref'],
        name:       c.name,
        kind:       c.cryptoProperties?.assetType ?? 'algorithm',
        quantum:    oneOf(first['crypto:quantumStatus'],   ['safe', 'unsafe', 'unknown'] as const, 'unknown'),
        classical:  oneOf(first['crypto:classicalStatus'], ['secure', 'weak', 'broken', 'unknown'] as const, 'unknown'),
        family:     first['crypto:family'] ?? ap.primitive ?? '',
        rationale:  first['crypto:rationale'] ?? '',
        libraries:  all['crypto:library'] ?? [],
        sources:    all['crypto:source'] ?? [],
        sink:       first['crypto:sink'] === 'true',
        primitive:  ap.primitive ?? '',
        paramSet:   ap.parameterSetIdentifier ?? '',
        mode:       ap.mode ?? '',
        nist:       ap.nistQuantumSecurityLevel,
        oid:        c.cryptoProperties?.oid ?? '',
        functions:  (ap.cryptoFunctions ?? []).filter(f => f && f !== 'unknown'),
        migrationStatus:  first['crypto:migrationStatus'] ?? '',
        vendorDependency: first['crypto:vendorDependency'] === 'true',
        confidence: oneOf(first['crypto:confidence'], ['literal', 'resolved', 'name-only'] as const, 'resolved'),
        occ: (c.evidence?.occurrences ?? []).map(o => ({
          ...splitLocation(o.location),
          line:    o.line,
          context: o.additionalContext,
          symbol:  o.symbol,
        })),
      });
    } else if (c.type === 'library') {
      libs.push({
        ref:        c['bom-ref'],
        name:       c.name,
        version:    c.version,
        purl:       c.purl,
        scope:      first['crypto:dependencyScope'] ?? '',
        precision:  first['crypto:versionPrecision'] ?? '',
        cveStatus:  first['crypto:cveStatus'] ?? '',
        provides:   provides.get(c['bom-ref']) ?? [],
        files:      (c.evidence?.occurrences ?? []).map(o => splitLocation(o.location).file),
      });
    }
  }

  // Sinks: the structured network sinks carried on the document, plus any crypto
  // asset the scanner flagged as sitting at a network boundary.
  const sinks: Sink[] = [];
  for (const p of doc.metadata.properties ?? []) {
    if (p.name !== 'crypto:sink') continue;
    try {
      sinks.push(JSON.parse(p.value) as Sink);
    } catch {
      sinks.push({ symbol: p.value });
    }
  }
  for (const a of algos.filter(x => x.sink)) {
    const o = a.occ[0];
    sinks.push({
      symbol:   a.name,
      library:  a.libraries[0],
      source:   a.sources[0] ?? o?.src,
      location: o?.file,
      line:     o?.line,
      cryptoAsset: true,
    });
  }

  // Sources: `label (kind)` on the document, plus anything referenced by an asset.
  const sourceKind: Record<string, string> = {};
  for (const p of doc.metadata.properties ?? []) {
    if (p.name !== 'crypto:source') continue;
    const m = /^(.*)\s+\(([^)]+)\)\s*$/.exec(p.value);
    if (m) sourceKind[m[1]] = m[2];
    else sourceKind[p.value] = 'source';
  }
  for (const a of algos) for (const s of a.sources) sourceKind[s] ??= 'source';

  // Provenance: source label → repo coordinates, so evidence can deep-link to the line.
  const prov: Record<string, Provenance> = {};
  for (const p of doc.metadata.properties ?? []) {
    if (p.name !== 'crypto:provenance') continue;
    try {
      const o = JSON.parse(p.value) as Provenance;
      if (o?.label) prov[o.label] = o;
    } catch { /* a malformed provenance entry just means no deep links */ }
  }

  return {
    algos,
    libs,
    sinks,
    sources: Object.entries(sourceKind).map(([label, kind]) => ({ label, kind })),
    prov,
    target: doc.metadata.component?.name ?? 'target',
    tool:   doc.metadata.tools?.components?.[0] ?? null,
    timestamp:    doc.metadata.timestamp,
    specVersion:  doc.specVersion,
    serialNumber: doc.serialNumber,
  };
}

export const model: Model = parse(cbom);

/* ─── repo deep links ────────────────────────────────────────────────────── */

/**
 * Build a link to file:line on the repository's web host. The provenance comes out
 * of the CBOM, so only an absolute http(s) base is ever turned into an href —
 * a `javascript:` webUrl must not become a clickable source link.
 */
export function blobUrl(prov: Provenance | undefined, file: string, line?: number): string {
  if (!prov?.webUrl || !file) return '';
  let base: URL;
  try {
    base = new URL(prov.webUrl);
  } catch {
    return '';
  }
  if (base.protocol !== 'https:' && base.protocol !== 'http:') return '';

  const ref  = encodeURIComponent(prov.commit || 'HEAD');
  const path = ((prov.pathPrefix ?? '') + file).replace(/^\/+/, '');
  const enc  = path.split('/').map(encodeURIComponent).join('/');
  const L    = String(line ?? '').replace(/\D/g, '');
  const root = prov.webUrl.replace(/\/+$/, '');

  switch (prov.host) {
    case 'gitlab':    return `${root}/-/blob/${ref}/${enc}${L ? `#L${L}` : ''}`;
    case 'bitbucket': return `${root}/src/${ref}/${enc}${L ? `#lines-${L}` : ''}`;
    case 'gitea':     return `${root}/src/commit/${ref}/${enc}${L ? `#L${L}` : ''}`;
    default:          return `${root}/blob/${ref}/${enc}${L ? `#L${L}` : ''}`; // github & co.
  }
}

/* ─── governance (BSI 200-3 risk analysis) ───────────────────────────────── */

export type RiskCategory  = 'acute' | 'quantum' | 'none';
export type SecurityGoal  = 'confidentiality' | 'integrity' | 'authenticity' | 'nonRepudiation';
export type Treatment     = 'avoid' | 'reduce' | 'transfer' | 'accept';

export interface RiskParams {
  crqcYear: number;
  crqcYearSignatures: number;
  migrationYears: number;
  yearsUntilCrqc: number;
  yearsUntilCrqcSignatures: number;
  defaultShelfLifeYears: number;
}

export interface RiskItem {
  component: string;
  name: string;
  primitive: string;
  category: RiskCategory;
  role: string;
  quantum: QuantumStatus;
  classical: ClassicalStatus;
  sources: string[];
  cves: { id: string; severity: string }[];
  cwes: string[];
  urgent: boolean;
  priority: number;
  summary: string;
  mosca: string;
  deadlineYear: number | null;
  startByYear: number | null;
  migrationStatus: string;
  vendorDependency: boolean;
}

export interface RiskAsset {
  asset: string;
  kind: string;
  shelfLifeYears: number;
  migrationYears: number;
  criticality: string;
  owner: string;
  riskOwner: string;
  dataClassification: string;
  acute: number;
  quantum: number;
  none: number;
  urgent: boolean;
  verdicts: string[];
  deadlineYear: number | null;
  securityObjectives: Partial<Record<SecurityGoal, number>>;
  economicDamage: number | null;
  impactState: 'confirmed' | 'provisional';
}

export interface RiskTuple {
  component: string;
  asset: string;
  role: string;
  primitive: string;
  urgency: number;
  impactLevel: number;
  impactState: 'confirmed' | 'provisional';
  category: string;
  categoryRank: number;
  allowedTreatments: Treatment[];
  treatment: Treatment | '';
  treatmentNote: string;
  decidedBy: string;
  migrationStatus: string;
  vendorDependency: boolean;
  quantum: QuantumStatus;
  classical: ClassicalStatus;
}

export interface RiskCell {
  urgency: number;
  impact: number;
  category: string;
  categoryRank: number;
  count: number;
  tuples: RiskTuple[];
}

export interface RiskMatrix {
  axes: {
    impact: string[];
    urgencyAcute: string[];
    urgencyQuantum: string[];
    category: string[];
  };
  acute: { cells: RiskCell[] };
  quantum: { cells: RiskCell[] };
}

export interface Risk {
  params: RiskParams;
  buckets: Record<RiskCategory, number>;
  items: RiskItem[];
  assets: RiskAsset[];
  unknowns: { label: string; info?: string; summary: string; mosca: string; asset: string }[];
  riskMatrix: RiskMatrix;
}

export const risk = (rawGovernance as unknown as { risk: Risk }).risk;

export const SECURITY_GOALS: readonly SecurityGoal[] =
  ['confidentiality', 'integrity', 'authenticity', 'nonRepudiation'] as const;

/** Every object placed in a matrix, both regimes, in reading order. */
export function allTuples(matrix: RiskMatrix): (RiskTuple & { regime: 'quantum' | 'acute' })[] {
  const out: (RiskTuple & { regime: 'quantum' | 'acute' })[] = [];
  for (const regime of ['quantum', 'acute'] as const) {
    for (const cell of matrix[regime].cells) {
      for (const t of cell.tuples) out.push({ ...t, regime });
    }
  }
  return out;
}
