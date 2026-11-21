/**
 * PQC-Lagebild data, read at request time (ISR) from the directory the pull job fills
 * (pqc-lagebild/server/pull.mjs). Every signed file is verified again here against the
 * pinned dataset key; a file that does not verify is ignored, never shown.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

/** Flip to true when the page goes public: enables indexing, sitemap entry and nav link. */
export const PQC_LAGEBILD_PUBLIC = false;

export const DATA_DIR = process.env.PQC_LAGEBILD_DIR ?? '/var/lib/beyond-shor/pqc-lagebild';

export function datasetPublicKey(): string {
  return (process.env.PQC_LAGEBILD_PUBKEY
    ?? readFileSync(join(process.cwd(), 'data/pqc-lagebild-public-key.txt'), 'utf8')).trim();
}

// ─── types (mirror pqc-lagebild/scan/aggregate.mjs and matrix/) ─────────────

export type View = 'eu' | 'de';
export type Category = 'all' | 'kritis' | 'institutions' | 'corporations' | 'other';
export type Hosting = 'cdn' | 'cloud' | 'other' | 'unknown';

export interface Cell {
  view: View;
  region: string;
  category: Category;
  sector: string | null;
  n: number;
  web: {
    reachable: number; tls13: number; pq: number; pqPure: number;
    cert: { rsa: number; ecdsa: number; eddsa: number; pq: number; other: number };
  };
  hosting: Record<Hosting, number>;
  pqByHosting: Record<Hosting, number | null>;
  dns: { answered: number; signed: number; algorithms: Record<string, number> } | null;
  mail: { withMx: number; answered: number; starttls: number; tls: number; pq: number } | null;
}

export interface TrendCell {
  view: View; region: string; category: Category;
  n: number; pqBefore: number; pqNow: number; switchedOn: number; switchedOff: number;
}

export interface Source { id: string; label: string; license?: string; url?: string; listId?: string; fetchedAt?: string; count?: number }

export interface LagebildDataset {
  schema: 'beyond-shor/pqc-lagebild@1';
  month: string;
  generatedAt: string;
  scan: { startedAt: string; finishedAt: string; durationSec: number; node: string; openssl: string; offeredGroups: Record<string, string> };
  sources: Source[];
  minCell: number;
  population: { total: number; reachable: number; byCategory: Record<string, number>; euView: number; deView: number };
  cells: Cell[];
  suppressedCells: number;
  trend: { previousMonth: string; cells: TrendCell[]; suppressedCells: number } | null;
}

export interface MatrixResult {
  status?: string;
  pq?: boolean | null;
  group?: string | null;
  kex?: string[];
  keyShares?: string[];
  groups?: string[];
  version?: string | null;
  error?: string;
  [k: string]: unknown;
}

export interface MatrixRelease {
  id: string;
  distro: string;
  version: string;
  codename?: string | null;
  lts?: boolean;
  eol?: string | boolean | null;
  image?: string;
  digest?: string;
  packages?: Record<string, string | null>;
  results: Record<string, MatrixResult>;
  errors?: unknown[];
}

export interface MatrixDataset {
  schema: 'beyond-shor/software-matrix@1';
  month: string;
  generatedAt: string;
  runner?: Record<string, string>;
  releases: MatrixRelease[];
}

export interface VisitorSide { connections: number; pq: number; tls13: number; groups: Record<string, number> }
export interface VisitorMonth { month: string; days: number; browser: VisitorSide; bot: VisitorSide }
export interface Visitors { updatedAt: string; firstDay: string | null; lastDay: string | null; months: VisitorMonth[] }

export interface Signed<T> { file: string; data: T; sig: string }

// ─── loading ────────────────────────────────────────────────────────────────

export const FILE_NAME = /^(?:(lagebild|matrix)-\d{4}-\d{2}\.json|index\.json)(?:\.sig)?$/;

export function verifySigned(bytes: Uint8Array, sigHex: string, pubHex: string): boolean {
  try {
    return ml_dsa65.verify(Buffer.from(sigHex.trim(), 'hex'), bytes, Buffer.from(pubHex, 'hex'));
  } catch {
    return false;
  }
}

function readVerified<T>(dir: string, file: string, pub: string): Signed<T> | null {
  const p = join(dir, file);
  const s = `${p}.sig`;
  if (!existsSync(p) || !existsSync(s)) return null;
  const bytes = readFileSync(p);
  const sig = readFileSync(s, 'utf8').trim();
  if (!verifySigned(bytes, sig, pub)) return null;
  try {
    return { file, data: JSON.parse(bytes.toString('utf8')) as T, sig };
  } catch {
    return null;
  }
}

function monthsOf(dir: string, kind: 'lagebild' | 'matrix'): string[] {
  if (!existsSync(dir)) return [];
  const re = new RegExp(`^${kind}-(\\d{4}-\\d{2})\\.json$`);
  return readdirSync(dir).map((f) => re.exec(f)?.[1]).filter((m): m is string => !!m).sort();
}

export interface LagebildBundle {
  latest: Signed<LagebildDataset> | null;
  history: LagebildDataset[]; // verified months, oldest first (including latest)
  matrix: Signed<MatrixDataset> | null;
  visitors: Visitors | null;
}

export function loadLagebild(dir = DATA_DIR): LagebildBundle {
  const pub = datasetPublicKey();
  const history = monthsOf(dir, 'lagebild')
    .map((m) => readVerified<LagebildDataset>(dir, `lagebild-${m}.json`, pub))
    .filter((x): x is Signed<LagebildDataset> => !!x && x.data.schema === 'beyond-shor/pqc-lagebild@1');
  const matrixMonths = monthsOf(dir, 'matrix');
  let matrix: Signed<MatrixDataset> | null = null;
  for (const m of [...matrixMonths].reverse()) {
    matrix = readVerified<MatrixDataset>(dir, `matrix-${m}.json`, pub);
    if (matrix && matrix.data.schema === 'beyond-shor/software-matrix@1') break;
    matrix = null;
  }
  let visitors: Visitors | null = null;
  try {
    visitors = JSON.parse(readFileSync(join(dir, 'visitors.json'), 'utf8')) as Visitors;
  } catch { /* not yet */ }
  return { latest: history.at(-1) ?? null, history: history.map((h) => h.data), matrix, visitors };
}

// ─── helpers ────────────────────────────────────────────────────────────────

export function findCell(ds: LagebildDataset | null | undefined, view: View, region: string, category: Category = 'all', sector: string | null = null): Cell | null {
  return ds?.cells.find((c) => c.view === view && c.region === region && c.category === category && c.sector === sector) ?? null;
}

export const share = (num: number | null | undefined, den: number | null | undefined): number | null =>
  num == null || !den ? null : num / den;

/** PQ share among sites not behind a CDN — what operators switched on themselves (or their hoster did). */
export function selfShare(c: Cell): number | null {
  const pqCdn = c.pqByHosting.cdn ?? (c.hosting.cdn === 0 ? 0 : null);
  if (pqCdn == null) return null;
  return share(c.web.pq - pqCdn, c.web.reachable - c.hosting.cdn);
}

export function formatPercent(x: number | null, locale: string, digits = 0): string {
  if (x == null) return '–';
  return new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US', { style: 'percent', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(x);
}

export function formatNumber(n: number | null | undefined, locale: string): string {
  if (n == null) return '–';
  return new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'en-US').format(n);
}

export function formatMonth(month: string, locale: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(locale === 'de' ? 'de-DE' : 'en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, 1)));
}

/** DNSSEC algorithm numbers (IANA) → short names. None of today's algorithms is post-quantum. */
export const DNSSEC_ALGORITHMS: Record<string, string> = {
  '5': 'RSA/SHA-1', '7': 'RSA/SHA-1-NSEC3', '8': 'RSA/SHA-256', '10': 'RSA/SHA-512',
  '13': 'ECDSA P-256', '14': 'ECDSA P-384', '15': 'Ed25519', '16': 'Ed448',
};

/** TLS group names nginx/OpenSSL report → display names; PQ groups flagged. */
export const PQ_GROUPS = new Set(['X25519MLKEM768', 'SecP256r1MLKEM768', 'SecP384r1MLKEM1024', 'MLKEM512', 'MLKEM768', 'MLKEM1024']);
