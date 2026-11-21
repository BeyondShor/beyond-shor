import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import de from '../messages/de.json';
import en from '../messages/en.json';
import {
  loadLagebild, findCell, selfShare, formatPercent, formatMonth, FILE_NAME, type Cell, type LagebildDataset,
} from '@/lib/pqc-lagebild';

const { secretKey, publicKey } = ml_dsa65.keygen(randomBytes(32));
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');

function cell(over: Partial<Cell> = {}): Cell {
  return {
    view: 'de', region: 'DE', category: 'all', sector: null, n: 120,
    web: { reachable: 100, tls13: 95, pq: 40, pqCapable: 41, pqPure: 0, groups: { X25519MLKEM768: 40, X25519: 60 }, cert: { rsa: 60, ecdsa: 40, eddsa: 0, pq: 0, other: 0 }, certKeys: { 'RSA-2048': 60, 'ECDSA P-256': 40 }, certSigs: { RSA: 70, ECDSA: 30 } },
    hosting: { cdn: 20, cloud: 10, other: 70, unknown: 0 },
    pqByHosting: { cdn: 20, cloud: null, other: 15, unknown: null },
    dns: null, mail: null, ...over,
  };
}

function dataset(month: string): LagebildDataset {
  return {
    schema: 'beyond-shor/pqc-lagebild@1', month, generatedAt: `${month}-01T03:00:00Z`,
    scan: { startedAt: '', finishedAt: `${month}-01T03:00:00Z`, durationSec: 1, node: 'v24', openssl: '3.5', offeredGroups: {} },
    sources: [], minCell: 30,
    population: { total: 120, reachable: 100, byCategory: {}, euView: 0, deView: 120 },
    cells: [cell(), cell({ view: 'eu', region: 'EU' })], suppressedCells: 0, trend: null,
  };
}

function write(dir: string, name: string, body: string, key = secretKey) {
  writeFileSync(join(dir, name), body);
  writeFileSync(join(dir, `${name}.sig`), hex(ml_dsa65.sign(Buffer.from(body), key)) + '\n');
}

describe('PQC-Lagebild data layer', () => {
  beforeAll(() => { process.env.PQC_LAGEBILD_PUBKEY = hex(publicKey); });
  afterAll(() => { delete process.env.PQC_LAGEBILD_PUBKEY; });

  it('loads only files whose signature verifies against the pinned key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pqcl-'));
    write(dir, 'lagebild-2026-11.json', JSON.stringify(dataset('2026-11')) + '\n');
    write(dir, 'lagebild-2026-12.json', JSON.stringify(dataset('2026-12')) + '\n');
    // tampered after signing
    write(dir, 'lagebild-2027-01.json', JSON.stringify(dataset('2027-01')) + '\n');
    writeFileSync(join(dir, 'lagebild-2027-01.json'), JSON.stringify({ ...dataset('2027-01'), minCell: 1 }) + '\n');
    // signed with a foreign key
    const other = ml_dsa65.keygen(randomBytes(32));
    write(dir, 'matrix-2026-11.json', JSON.stringify({ schema: 'beyond-shor/software-matrix@1', month: '2026-11', releases: [] }) + '\n', other.secretKey);

    const b = loadLagebild(dir);
    expect(b.history.map((h) => h.month)).toEqual(['2026-11', '2026-12']);
    expect(b.latest?.data.month).toBe('2026-12');
    expect(b.matrix).toBeNull();
    expect(b.visitors).toBeNull();
  });

  it('returns an empty bundle when the directory does not exist', () => {
    const b = loadLagebild('/nonexistent/pqc-lagebild');
    expect(b.latest).toBeNull();
    expect(b.history).toEqual([]);
  });

  it('finds cells and computes the share without CDN', () => {
    const ds = dataset('2026-11');
    const c = findCell(ds, 'de', 'DE')!;
    expect(c).not.toBeNull();
    // (40 - 20) / (100 - 20)
    expect(selfShare(c)).toBeCloseTo(0.25);
    expect(selfShare(cell({ pqByHosting: { cdn: null, cloud: null, other: 1, unknown: null } }))).toBeNull();
    expect(findCell(ds, 'de', 'DE', 'kritis')).toBeNull();
  });

  it('formats percentages and months per locale', () => {
    expect(formatPercent(0.404, 'de')).toBe('40\u00a0%'); // German uses a no-break space
    expect(formatPercent(0.404, 'en')).toBe('40%');
    expect(formatPercent(null, 'de')).toBe('–');
    expect(formatMonth('2026-11', 'de')).toBe('November 2026');
    expect(formatMonth('2026-11', 'en')).toBe('November 2026');
  });

  it('serves only published file names', () => {
    for (const ok of ['lagebild-2026-11.json', 'lagebild-2026-11.json.sig', 'matrix-2026-11.json', 'index.json']) expect(FILE_NAME.test(ok)).toBe(true);
    for (const bad of ['../etc/passwd', 'state/pull.json', 'visitors.json', 'lagebild-2026-11.json.tmp-1', 'lagebild-26-11.json']) expect(FILE_NAME.test(bad)).toBe(false);
  });

  it('has the same message keys in German and English', () => {
    const keys = (o: unknown, p = ''): string[] =>
      Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
    expect(keys(de.pqcLagebild).sort()).toEqual(keys(en.pqcLagebild).sort());
  });
});
