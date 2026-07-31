/**
 * CBOM validation tests.
 *
 * These tests do NOT run a scan — they validate the published
 * frontend/public/cbom.json against the CycloneDX 1.7 structure ShorSight emits,
 * and check that the ML-DSA-65 signature next to it covers those exact bytes.
 *
 * To regenerate:
 *   shorsight scan . -o shorsight/cbom.raw.json
 *   node scripts/sign-cbom.mjs shorsight/cbom.raw.json
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

const __dirname   = dirname(fileURLToPath(import.meta.url));
const CBOM_PATH   = join(__dirname, '../public/cbom.json');
const SIG_PATH    = join(__dirname, '../public/cbom.sig');
const GOV_PATH    = join(__dirname, '../data/governance.json');

interface Property { name: string; value: string }

interface Component {
  'bom-ref': string;
  type: string;
  name: string;
  version?: string;
  purl?: string;
  cryptoProperties?: {
    assetType: string;
    oid?: string;
    algorithmProperties?: {
      primitive?: string;
      nistQuantumSecurityLevel?: number;
    };
  };
  evidence?: { occurrences?: { location: string; line?: number }[] };
  properties?: Property[];
}

interface Cbom {
  bomFormat: string;
  specVersion: string;
  version: number;
  serialNumber: string;
  metadata: {
    timestamp: string;
    component: { type: string; name: string };
    tools: { components: { type: string; name: string; version?: string }[] };
    properties?: Property[];
  };
  components: Component[];
  dependencies: { ref: string; dependsOn?: string[]; provides?: string[] }[];
}

interface Governance {
  risk: {
    params: { crqcYear: number; crqcYearSignatures: number; yearsUntilCrqc: number };
    buckets: { acute: number; quantum: number; none: number };
    items: { component: string; category: string }[];
    assets: { asset: string; owner: string; riskOwner: string; impactState: string }[];
    riskMatrix: {
      axes: Record<string, string[]>;
      acute: { cells: { impact: number; urgency: number; count: number; tuples: unknown[] }[] };
      quantum: { cells: { impact: number; urgency: number; count: number; tuples: { component: string; treatment: string }[] }[] };
    };
  };
}

let rawText: string;
let cbom: Cbom;
let gov: Governance;
let cryptoAssets: Component[];
let libraries: Component[];
let bomRefs: Set<string>;

function firstProp(c: Component, name: string): string | undefined {
  return c.properties?.find(p => p.name === name)?.value;
}

beforeAll(() => {
  rawText = readFileSync(CBOM_PATH, 'utf8');
  cbom = JSON.parse(rawText) as Cbom;
  gov  = JSON.parse(readFileSync(GOV_PATH, 'utf8')) as Governance;
  cryptoAssets = cbom.components.filter(c => c.type === 'cryptographic-asset');
  libraries    = cbom.components.filter(c => c.type === 'library');
  bomRefs      = new Set(cbom.components.map(c => c['bom-ref']));
});

// ── CycloneDX envelope ────────────────────────────────────────────────────────

describe('CycloneDX envelope', () => {
  it('has bomFormat "CycloneDX"', () => {
    expect(cbom.bomFormat).toBe('CycloneDX');
  });

  it('has specVersion "1.7"', () => {
    expect(cbom.specVersion).toBe('1.7');
  });

  it('has a positive integer version', () => {
    expect(Number.isInteger(cbom.version)).toBe(true);
    expect(cbom.version).toBeGreaterThan(0);
  });

  it('has a urn:uuid serialNumber', () => {
    expect(cbom.serialNumber).toMatch(/^urn:uuid:[0-9a-f-]{36}$/i);
  });

  it('names the scanned application as the metadata component', () => {
    expect(cbom.metadata.component.type).toBe('application');
    expect(cbom.metadata.component.name).toBe('beyond-shor');
  });

  it('records ShorSight as the producing tool', () => {
    const tool = cbom.metadata.tools.components[0];
    expect(tool.name).toBe('shorsight');
    expect(tool.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('has an ISO-8601 timestamp', () => {
    expect(() => new Date(cbom.metadata.timestamp).toISOString()).not.toThrow();
    expect(Number.isNaN(Date.parse(cbom.metadata.timestamp))).toBe(false);
  });
});

// ── Components ────────────────────────────────────────────────────────────────

describe('Components', () => {
  it('contains cryptographic assets and libraries', () => {
    expect(cryptoAssets.length).toBeGreaterThan(0);
    expect(libraries.length).toBeGreaterThan(0);
    // every component is one of the two kinds the viewer knows how to render
    expect(cryptoAssets.length + libraries.length).toBe(cbom.components.length);
  });

  it('gives every component a unique bom-ref', () => {
    expect(bomRefs.size).toBe(cbom.components.length);
  });

  it('namespaces bom-refs by kind', () => {
    for (const c of cryptoAssets) expect(c['bom-ref']).toMatch(/^crypto\//);
    for (const c of libraries)    expect(c['bom-ref']).toMatch(/^lib\//);
  });

  it('marks every crypto asset with assetType "algorithm"', () => {
    for (const c of cryptoAssets) {
      expect(c.cryptoProperties?.assetType).toBe('algorithm');
    }
  });

  it('gives every crypto asset a quantum and a classical status', () => {
    for (const c of cryptoAssets) {
      expect(['safe', 'unsafe', 'unknown']).toContain(firstProp(c, 'crypto:quantumStatus'));
      expect(['secure', 'weak', 'broken', 'unknown']).toContain(firstProp(c, 'crypto:classicalStatus'));
    }
  });

  it('grades the evidence behind every crypto asset', () => {
    for (const c of cryptoAssets) {
      expect(['literal', 'resolved', 'name-only']).toContain(firstProp(c, 'crypto:confidence'));
    }
  });

  it('backs every crypto asset with at least one located occurrence', () => {
    for (const c of cryptoAssets) {
      const occ = c.evidence?.occurrences ?? [];
      expect(occ.length).toBeGreaterThan(0);
      for (const o of occ) expect(o.location).toBeTruthy();
    }
  });

  it('explains every crypto asset with a rationale', () => {
    for (const c of cryptoAssets) {
      expect(firstProp(c, 'crypto:rationale')).toBeTruthy();
    }
  });
});

// ── The algorithms this site actually runs ────────────────────────────────────

describe('Expected inventory', () => {
  it('finds the PQC signature schemes', () => {
    expect(bomRefs.has('crypto/ml-dsa-65')).toBe(true);
    expect(bomRefs.has('crypto/slh-dsa-sha2-128s')).toBe(true);
    expect(bomRefs.has('crypto/slh-dsa-sha2-128f')).toBe(true);
  });

  it('finds the PQC KEMs', () => {
    expect(bomRefs.has('crypto/ml-kem-1024')).toBe(true);
    expect(bomRefs.has('crypto/frodokem-1344-aes')).toBe(true);
    expect(bomRefs.has('crypto/classic-mceliece')).toBe(true);
  });

  it('finds the classical primitives kept as reference points', () => {
    expect(bomRefs.has('crypto/x25519')).toBe(true);
    expect(bomRefs.has('crypto/ec-p256')).toBe(true);
  });

  it('flags exactly the classical asymmetric assets as quantum-unsafe', () => {
    const unsafe = cryptoAssets
      .filter(c => firstProp(c, 'crypto:quantumStatus') === 'unsafe')
      .map(c => c['bom-ref'])
      .sort();
    expect(unsafe).toEqual(['crypto/ec-p256', 'crypto/x25519']);
  });

  it('assigns a NIST PQ level to the FIPS-standardised schemes', () => {
    const levels: Record<string, number> = {
      'crypto/ml-dsa-65':    3,
      'crypto/ml-kem-1024':  5,
      'crypto/frodokem-1344-aes': 5,
    };
    for (const [ref, level] of Object.entries(levels)) {
      const c = cryptoAssets.find(x => x['bom-ref'] === ref);
      expect(c?.cryptoProperties?.algorithmProperties?.nistQuantumSecurityLevel).toBe(level);
    }
  });

  it('pins the libraries it can pin', () => {
    const noble = libraries.find(l => l['bom-ref'] === 'lib/noble-post-quantum');
    expect(noble?.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(noble?.purl).toMatch(/^pkg:npm\/@noble\/post-quantum@/);
    expect(firstProp(noble!, 'crypto:versionPrecision')).toBe('exact');
  });
});

// ── Dependency graph ──────────────────────────────────────────────────────────

describe('Dependency graph', () => {
  it('references only components that exist', () => {
    for (const dep of cbom.dependencies) {
      const known = bomRefs.has(dep.ref) || dep.ref.startsWith('target/');
      expect(known, `unknown ref ${dep.ref}`).toBe(true);
      for (const r of [...(dep.dependsOn ?? []), ...(dep.provides ?? [])]) {
        expect(bomRefs.has(r), `unknown ref ${r}`).toBe(true);
      }
    }
  });

  it('attributes every crypto asset to a providing library', () => {
    const provided = new Set(cbom.dependencies.flatMap(d => d.provides ?? []));
    for (const c of cryptoAssets) {
      expect(provided.has(c['bom-ref']), `${c['bom-ref']} has no provider`).toBe(true);
    }
  });

  it('roots the graph at the scanned application', () => {
    const root = cbom.dependencies.find(d => d.ref.startsWith('target/'));
    expect(root?.dependsOn?.length).toBeGreaterThan(0);
    for (const r of root!.dependsOn!) expect(r).toMatch(/^lib\//);
  });
});

// ── Signature ─────────────────────────────────────────────────────────────────

describe('ML-DSA-65 signature', () => {
  it('verifies over the exact bytes served at /cbom.json', () => {
    if (!existsSync(SIG_PATH) || !process.env.ML_DSA_PUBLIC_KEY) {
      // no key in the environment (e.g. a fresh clone) — the page degrades to
      // showing no badge, so this is a skip rather than a failure
      return;
    }
    const sig    = Buffer.from(readFileSync(SIG_PATH, 'utf8').trim(), 'hex');
    const pubKey = Buffer.from(process.env.ML_DSA_PUBLIC_KEY, 'hex');
    const msg    = new TextEncoder().encode(rawText);
    expect(ml_dsa65.verify(sig, msg, pubKey)).toBe(true);
  });
});

// ── Governance / risk analysis ────────────────────────────────────────────────

describe('Risk analysis', () => {
  it('covers every crypto asset exactly once', () => {
    expect(gov.risk.items.length).toBe(cryptoAssets.length);
    const names = new Set(gov.risk.items.map(i => i.component));
    for (const c of cryptoAssets) expect(names.has(c.name), `${c.name} unassessed`).toBe(true);
  });

  it('has buckets that add up to the asset count', () => {
    const { acute, quantum, none } = gov.risk.buckets;
    expect(acute + quantum + none).toBe(cryptoAssets.length);
  });

  it('puts the quantum-unsafe assets in the quantum bucket', () => {
    const quantum = gov.risk.items.filter(i => i.category === 'quantum').map(i => i.component).sort();
    expect(quantum).toEqual(['EC-P256', 'X25519']);
  });

  it('resolves the asset key, so the human input is not silently dropped', () => {
    // The governance config addresses the asset as `beyond-shor`. A mismatched key
    // is ignored without error, which leaves owner/objectives empty and every
    // impact provisional — this test is what makes that failure loud.
    const asset = gov.risk.assets[0];
    expect(asset.asset).toBe('beyond-shor');
    expect(asset.owner).toBeTruthy();
    expect(asset.riskOwner).toBeTruthy();
    expect(asset.impactState).toBe('confirmed');
  });

  it('carries a treatment decision for every object in a matrix', () => {
    const tuples = gov.risk.riskMatrix.quantum.cells.flatMap(c => c.tuples);
    expect(tuples.length).toBe(gov.risk.buckets.quantum);
    for (const t of tuples) {
      expect(['avoid', 'reduce', 'transfer', 'accept'], `${t.component} untreated`).toContain(t.treatment);
    }
  });

  it('labels all four axes of the risk matrices', () => {
    for (const axis of ['impact', 'urgencyAcute', 'urgencyQuantum', 'category']) {
      expect(gov.risk.riskMatrix.axes[axis]).toHaveLength(4);
    }
  });
});
