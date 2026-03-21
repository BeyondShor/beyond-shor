/**
 * CBOM validation tests.
 *
 * These tests do NOT re-run the scanner — they validate the already-generated
 * frontend/public/cbom.json against the CycloneDX 1.6 structure and our
 * expected cryptographic asset inventory.
 *
 * Run `node scripts/scan-cbom.mjs` from the project root to regenerate.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CBOM_PATH = join(__dirname, '../public/cbom.json');

interface AlgorithmProperties {
  primitive: string;
  nistQuantumSecurityLevel: number;
}

interface CryptoProperties {
  assetType: string;
  algorithmProperties: AlgorithmProperties;
}

interface Component {
  'bom-ref': string;
  type: string;
  name: string;
  description: string;
  cryptoProperties: CryptoProperties;
}

interface Dependency {
  ref: string;
  dependsOn: string[];
}

interface Cbom {
  bomFormat: string;
  specVersion: string;
  version: number;
  serialNumber: string;
  metadata: {
    timestamp: string;
    component: { type: string; name: string };
    tools: { name: string }[];
  };
  components: Component[];
  dependencies: Dependency[];
}

let cbom: Cbom;

beforeAll(() => {
  const raw = readFileSync(CBOM_PATH, 'utf8');
  cbom = JSON.parse(raw) as Cbom;
});

// ── CycloneDX envelope ────────────────────────────────────────────────────────

describe('CycloneDX envelope', () => {
  it('has bomFormat "CycloneDX"', () => {
    expect(cbom.bomFormat).toBe('CycloneDX');
  });

  it('has specVersion "1.6"', () => {
    expect(cbom.specVersion).toBe('1.6');
  });

  it('has a positive integer version', () => {
    expect(typeof cbom.version).toBe('number');
    expect(cbom.version).toBeGreaterThan(0);
  });

  it('has a valid URN serialNumber', () => {
    expect(cbom.serialNumber).toMatch(/^urn:uuid:[0-9a-f-]{36}$/i);
  });

  it('has metadata with application component', () => {
    expect(cbom.metadata.component.type).toBe('application');
    expect(cbom.metadata.component.name).toBeTruthy();
  });

  it('has an ISO 8601 timestamp', () => {
    expect(cbom.metadata.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });
});

// ── Components structure ──────────────────────────────────────────────────────

describe('components', () => {
  it('contains at least one component', () => {
    expect(cbom.components.length).toBeGreaterThan(0);
  });

  it('every component has required fields', () => {
    for (const c of cbom.components) {
      expect(c['bom-ref'], `bom-ref missing on ${c.name}`).toBeTruthy();
      expect(c.type).toBe('cryptographic-asset');
      expect(c.name).toBeTruthy();
      expect(c.cryptoProperties?.assetType).toBe('algorithm');
      expect(c.cryptoProperties?.algorithmProperties?.primitive).toBeTruthy();
      expect(typeof c.cryptoProperties?.algorithmProperties?.nistQuantumSecurityLevel).toBe('number');
    }
  });

  it('bom-refs follow the "algo-id:context" convention', () => {
    for (const c of cbom.components) {
      expect(c['bom-ref']).toMatch(/^[\w-]+:[\w-]+$/);
    }
  });

  it('bom-refs are unique', () => {
    const refs = cbom.components.map(c => c['bom-ref']);
    const unique = new Set(refs);
    expect(unique.size).toBe(refs.length);
  });
});

// ── Expected inventory ────────────────────────────────────────────────────────

describe('expected cryptographic assets', () => {
  let bomRefs: Set<string>;

  beforeAll(() => {
    bomRefs = new Set(cbom.components.map(c => c['bom-ref']));
  });

  // Playground KEMs
  it('contains ML-KEM-1024 in playground context', () => {
    expect(bomRefs.has('ml-kem-1024:playground')).toBe(true);
  });

  it('contains Classic McEliece 8192128 in playground context', () => {
    expect(bomRefs.has('classic-mceliece-8192128:playground')).toBe(true);
  });

  it('contains FrodoKEM-1344 in playground context', () => {
    expect(bomRefs.has('frodokem-1344:playground')).toBe(true);
  });

  // Playground signatures
  it('contains ML-DSA-65 in playground context', () => {
    expect(bomRefs.has('ml-dsa-65:playground')).toBe(true);
  });

  it('contains SLH-DSA-SHA2-128s in playground context', () => {
    expect(bomRefs.has('slh-dsa-sha2-128s:playground')).toBe(true);
  });

  it('contains SLH-DSA-SHA2-128f in playground context', () => {
    expect(bomRefs.has('slh-dsa-sha2-128f:playground')).toBe(true);
  });

  it('contains ECDSA P-256 in playground context', () => {
    expect(bomRefs.has('ecdsa-p256:playground')).toBe(true);
  });

  // Article signing
  it('contains ML-DSA-65 in article-signing context', () => {
    expect(bomRefs.has('ml-dsa-65:article-signing')).toBe(true);
  });

  it('contains ML-DSA-65 in cbom-signing context', () => {
    expect(bomRefs.has('ml-dsa-65:cbom-signing')).toBe(true);
  });

  // Supporting primitives
  it('contains SHAKE-256 implicitly added from ML-DSA-65 usage', () => {
    // Must appear in all contexts where ML-DSA-65 is present
    expect(bomRefs.has('shake-256:article-signing')).toBe(true);
    expect(bomRefs.has('shake-256:cbom-signing')).toBe(true);
    expect(bomRefs.has('shake-256:playground')).toBe(true);
  });

  it('contains SHA-256 implicitly added from article-signing', () => {
    expect(bomRefs.has('sha-256:article-signing')).toBe(true);
  });

  it('contains HKDF-SHA-256 and AES-256-GCM in playground', () => {
    expect(bomRefs.has('hkdf-sha256:playground')).toBe(true);
    expect(bomRefs.has('aes-256-gcm:playground')).toBe(true);
  });

  it('contains X25519 in playground', () => {
    expect(bomRefs.has('x25519:playground')).toBe(true);
  });

  // Contact form
  it('contains HMAC-SHA-256 in contact-form context', () => {
    expect(bomRefs.has('hmac-sha256:contact-form')).toBe(true);
  });

  // Strapi
  it('contains HS256 JWT in strapi context', () => {
    expect(bomRefs.has('hs256-jwt:strapi')).toBe(true);
  });
});

// ── Quantum-safety classification ─────────────────────────────────────────────

describe('quantum-safety classification', () => {
  it('quantum-vulnerable algorithms have nistQuantumSecurityLevel === 0', () => {
    const vulnerable = ['ecdsa-p256', 'x25519'];
    for (const c of cbom.components) {
      const algoId = c['bom-ref'].split(':')[0];
      if (vulnerable.includes(algoId)) {
        expect(c.cryptoProperties.algorithmProperties.nistQuantumSecurityLevel, `${c['bom-ref']} should be level 0`)
          .toBe(0);
      }
    }
  });

  it('post-quantum algorithms have nistQuantumSecurityLevel > 0', () => {
    const postQuantum = ['ml-kem-1024', 'ml-dsa-65', 'slh-dsa-sha2-128s', 'slh-dsa-sha2-128f',
                         'classic-mceliece-8192128', 'frodokem-1344', 'shake-256'];
    for (const c of cbom.components) {
      const algoId = c['bom-ref'].split(':')[0];
      if (postQuantum.includes(algoId)) {
        expect(c.cryptoProperties.algorithmProperties.nistQuantumSecurityLevel, `${c['bom-ref']} should be > 0`)
          .toBeGreaterThan(0);
      }
    }
  });
});

// ── Dependencies ──────────────────────────────────────────────────────────────

describe('dependencies', () => {
  let bomRefs: Set<string>;

  beforeAll(() => {
    bomRefs = new Set(cbom.components.map(c => c['bom-ref']));
  });

  it('dependencies array has same length as components', () => {
    expect(cbom.dependencies.length).toBe(cbom.components.length);
  });

  it('every dependency.ref is a known bom-ref', () => {
    for (const dep of cbom.dependencies) {
      expect(bomRefs.has(dep.ref), `Unknown ref: ${dep.ref}`).toBe(true);
    }
  });

  it('every dependsOn entry is a known bom-ref', () => {
    for (const dep of cbom.dependencies) {
      for (const ref of dep.dependsOn) {
        expect(bomRefs.has(ref), `Unknown dependsOn ref: ${ref} (from ${dep.ref})`).toBe(true);
      }
    }
  });

  it('AES-256-GCM:playground depends on HKDF-SHA-256:playground', () => {
    const aesDep = cbom.dependencies.find(d => d.ref === 'aes-256-gcm:playground');
    expect(aesDep?.dependsOn).toContain('hkdf-sha256:playground');
  });

  it('HKDF-SHA-256:playground depends on KEM and X25519 entries', () => {
    const hkdfDep = cbom.dependencies.find(d => d.ref === 'hkdf-sha256:playground');
    expect(hkdfDep?.dependsOn).toContain('ml-kem-1024:playground');
    expect(hkdfDep?.dependsOn).toContain('x25519:playground');
  });

  it('ML-DSA-65:article-signing depends on SHAKE-256 and SHA-256', () => {
    const dsaDep = cbom.dependencies.find(d => d.ref === 'ml-dsa-65:article-signing');
    expect(dsaDep?.dependsOn).toContain('shake-256:article-signing');
    expect(dsaDep?.dependsOn).toContain('sha-256:article-signing');
  });

  it('ML-DSA-65:cbom-signing depends on SHAKE-256:cbom-signing', () => {
    const dsaDep = cbom.dependencies.find(d => d.ref === 'ml-dsa-65:cbom-signing');
    expect(dsaDep?.dependsOn).toContain('shake-256:cbom-signing');
  });
});
