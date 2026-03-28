#!/usr/bin/env node
/**
 * scan-cbom.mjs — Read-only CBOM scanner for pqc-blog
 *
 * Scans the Next.js / Node.js codebase for cryptographic asset usage,
 * then writes frontend/public/cbom.json (CycloneDX 1.6).
 *
 * Safety guarantees:
 *  ✓ Never modifies any source file
 *  ✓ Only writes to frontend/public/cbom.json (via atomic temp-file rename)
 *  ✓ Aborts if 0 components detected (prevents accidental blank output)
 *  ✓ Preserves serialNumber across runs; only bumps version on real changes
 *
 * Annotation syntax (add to source files):
 *  // cbom: <context>          → overrides path-based context for nearby pattern match
 *  // cbom: <algo-id>:<context> → explicit declaration (for internals not in source code)
 *
 * Deduplication:
 *  One entry per algorithm ID. When the same algorithm appears in multiple contexts,
 *  the highest-priority context wins: article-signing > playground > contact-form > strapi
 */

import { readFileSync, writeFileSync, renameSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, extname } from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

const __dirname      = fileURLToPath(new URL('.', import.meta.url));
const ROOT           = join(__dirname, '..');
const OUTPUT         = join(ROOT, 'frontend/public/cbom.json');
const OUTPUT_TMP     = OUTPUT + '.tmp';
const OUTPUT_SIG     = join(ROOT, 'frontend/public/cbom.sig');
const OUTPUT_SIG_TMP = OUTPUT_SIG + '.tmp';

// ── Context priority (lower index = higher priority) ───────────────────────
const CONTEXT_PRIORITY = ['article-signing', 'cbom-signing', 'playground', 'contact-form', 'strapi'];

function priorityOf(ctx) {
  const idx = CONTEXT_PRIORITY.indexOf(ctx);
  return idx === -1 ? CONTEXT_PRIORITY.length : idx;
}

// ── Algorithm database ─────────────────────────────────────────────────────
const ALGORITHM_DB = [

  // ── Post-Quantum KEMs ──────────────────────────────────────────────────
  {
    id: 'ml-kem-1024',
    name: 'ML-KEM-1024',
    primitive: 'kem',
    nistLevel: 5,
    descriptionSuffix: 'NIST FIPS 203 (August 2024). Lattice-based KEM (Module-LWE). Quantum-safe at NIST security level 5.',
    patterns: [/ml[_-]kem[_-]?1024/i, /kyber1024/i, /mlKem1024/],
  },
  {
    id: 'ml-kem-768',
    name: 'ML-KEM-768',
    primitive: 'kem',
    nistLevel: 3,
    descriptionSuffix: 'NIST FIPS 203 (August 2024). Lattice-based KEM (Module-LWE). Quantum-safe at NIST security level 3.',
    patterns: [/ml[_-]kem[_-]?768/i, /kyber768/i, /mlKem768/],
  },
  {
    id: 'ml-kem-512',
    name: 'ML-KEM-512',
    primitive: 'kem',
    nistLevel: 1,
    descriptionSuffix: 'NIST FIPS 203 (August 2024). Lattice-based KEM (Module-LWE). Quantum-safe at NIST security level 1.',
    patterns: [/ml[_-]kem[_-]?512/i, /kyber512/i, /mlKem512/],
  },
  {
    id: 'frodokem-1344',
    name: 'FrodoKEM-1344',
    primitive: 'kem',
    nistLevel: 5,
    descriptionSuffix: 'Lattice-based KEM (plain LWE — no ring/module structure). Most conservative lattice assumption. Quantum-safe at NIST security level 5. NIST Round 3 alternate candidate maintained by Microsoft Research.',
    patterns: [/frodokem[_-]?1344/i, /createFrodoKEM1344/i],
  },
  {
    id: 'frodokem-976',
    name: 'FrodoKEM-976',
    primitive: 'kem',
    nistLevel: 3,
    descriptionSuffix: 'Lattice-based KEM (plain LWE). Quantum-safe at NIST security level 3. NIST Round 3 alternate candidate.',
    patterns: [/frodokem[_-]?976/i, /createFrodoKEM976/i],
  },
  {
    // The npm package 'mceliece' specifically provides Classic McEliece 8192128.
    id: 'classic-mceliece-8192128',
    name: 'Classic McEliece 8192128',
    primitive: 'kem',
    nistLevel: 5,
    descriptionSuffix: 'Code-based KEM (binary Goppa codes). Oldest and most battle-tested PQC assumption (50+ years). Very large public keys (~1 MB). Quantum-safe at NIST security level 5. NIST Round 4 alternate candidate.',
    patterns: [
      /mceliece8192128/i,
      /classic[_-\s]?mceliece[_-\s]?8192/i,
      /from\s*['"]mceliece['"]/,        // import { mceliece } from 'mceliece'
      /require\s*\(\s*['"]mceliece['"]\)/, // require('mceliece')
    ],
  },

  // ── Classical Signatures ──────────────────────────────────────────────
  {
    id: 'ecdsa-p256',
    name: 'ECDSA P-256',
    primitive: 'signature',
    nistLevel: 0,
    descriptionSuffix: "Classical elliptic-curve digital signature (NIST P-256 / secp256r1). Quantum-VULNERABLE — Shor's algorithm can recover the private key from the public key in polynomial time.",
    patterns: [/@noble\/curves\/nist/i, /\bp256\.sign\b/, /\bp256\.verify\b/, /\bp256\.keygen\b/],
  },

  // ── Post-Quantum Signatures ────────────────────────────────────────────
  {
    id: 'slh-dsa-sha2-128s',
    name: 'SLH-DSA-SHA2-128s',
    primitive: 'signature',
    nistLevel: 1,
    descriptionSuffix: 'Hash-based stateless signature scheme (small variant). NIST FIPS 205 (August 2024). Smallest signatures of the SLH-DSA family at the cost of significantly slower signing. Quantum-safe at NIST security level 1. Based on SPHINCS+.',
    patterns: [/slh[_-]dsa[_-]sha2[_-]128s/i, /slh_dsa_sha2_128s/i],
  },
  {
    id: 'slh-dsa-sha2-128f',
    name: 'SLH-DSA-SHA2-128f',
    primitive: 'signature',
    nistLevel: 1,
    descriptionSuffix: 'Hash-based stateless signature scheme (fast variant). NIST FIPS 205 (August 2024). Faster signing than the small variant at the cost of larger signatures. Quantum-safe at NIST security level 1. Based on SPHINCS+.',
    patterns: [/slh[_-]dsa[_-]sha2[_-]128f/i, /slh_dsa_sha2_128f/i],
  },
  {
    id: 'ml-dsa-65',
    name: 'ML-DSA-65',
    primitive: 'signature',
    nistLevel: 3,
    descriptionSuffix: 'NIST FIPS 204 (August 2024). Lattice-based digital signature (Module-LWE + Module-SIS). Pure ML-DSA: message bytes passed directly without pre-hashing — SHAKE-256 applied internally (µ = SHAKE-256(tr ∥ M, 64) per FIPS 204 §5.2). Quantum-safe at NIST security level 3.',
    patterns: [/ml[_-]dsa[_-]?65/i, /dilithium3/i, /mlDsa65/],
  },
  {
    id: 'ml-dsa-87',
    name: 'ML-DSA-87',
    primitive: 'signature',
    nistLevel: 5,
    descriptionSuffix: 'NIST FIPS 204 (August 2024). Lattice-based digital signature (Module-LWE + Module-SIS). Quantum-safe at NIST security level 5.',
    patterns: [/ml[_-]dsa[_-]?87/i, /dilithium5/i, /mlDsa87/],
  },
  {
    id: 'ml-dsa-44',
    name: 'ML-DSA-44',
    primitive: 'signature',
    nistLevel: 2,
    descriptionSuffix: 'NIST FIPS 204 (August 2024). Lattice-based digital signature. Quantum-safe at NIST security level 2.',
    patterns: [/ml[_-]dsa[_-]?44/i, /dilithium2/i, /mlDsa44/],
  },

  // ── Classical Key Exchange ─────────────────────────────────────────────
  {
    id: 'x25519',
    name: 'X25519',
    primitive: 'ke',
    nistLevel: 0,
    descriptionSuffix: "Classical ECDH key exchange (Curve25519). Quantum-VULNERABLE — Shor's algorithm breaks the elliptic curve discrete logarithm problem in polynomial time.",
    patterns: [/x25519/i, /generateX25519KeyPair/i],
  },

  // ── Symmetric ─────────────────────────────────────────────────────────
  {
    id: 'aes-256-gcm',
    name: 'AES-256-GCM',
    primitive: 'block-cipher',
    nistLevel: 1,
    descriptionSuffix: "Authenticated symmetric encryption (AEAD, 256-bit key). Grover's algorithm halves the effective key length: AES-256 provides ~128-bit post-quantum security, corresponding to NIST Level 1.",
    patterns: [/aes[_-]256[_-]gcm/i, /AES-256-GCM/],
  },
  {
    id: 'aes-128-gcm',
    name: 'AES-128-GCM',
    primitive: 'block-cipher',
    nistLevel: 0,
    descriptionSuffix: "Authenticated symmetric encryption (AEAD, 128-bit key). Grover's algorithm halves the effective key length: AES-128 provides only ~64-bit post-quantum security — not quantum-safe.",
    patterns: [/aes[_-]128[_-]gcm/i],
  },

  // ── Hash ──────────────────────────────────────────────────────────────
  {
    id: 'sha-256',
    name: 'SHA-256',
    primitive: 'hash',
    nistLevel: 2,
    descriptionSuffix: "SHA-256 (NIST FIPS 180-4). Cryptographic hash function producing a 256-bit digest; Grover's algorithm halves preimage resistance to ~128 bits, corresponding to NIST Level 2.",
    patterns: [
      /createHash\s*\(\s*['"`]sha256['"`]/,
      /subtle\.digest\s*\(\s*['"`]SHA-256['"`]/,
      /sha[_-]256(?![_-]gcm)/i,
    ],
  },
  {
    id: 'shake-256',
    name: 'SHAKE-256',
    primitive: 'hash',
    nistLevel: 3,
    descriptionSuffix: "SHAKE-256 (NIST FIPS 202) — extendable output function (XOF) based on Keccak-1600. Produces variable-length output from arbitrary input; used as the core hash construction inside ML-DSA-65 (FIPS 204 §5.2).",
    patterns: [/shake[_-]?256/i],
  },
  {
    id: 'sha-512',
    name: 'SHA-512',
    primitive: 'hash',
    nistLevel: 4,
    descriptionSuffix: "SHA-2 family hash function (512-bit). Grover's algorithm reduces preimage resistance to ~256 bits — fully quantum-safe.",
    patterns: [
      /createHash\s*\(\s*['"`]sha512['"`]/,
      /subtle\.digest\s*\(\s*['"`]SHA-512['"`]/,
    ],
  },

  // ── MAC ───────────────────────────────────────────────────────────────
  {
    id: 'hmac-sha256',
    name: 'HMAC-SHA-256',
    primitive: 'mac',
    nistLevel: 2,
    descriptionSuffix: "HMAC with SHA-256 (NIST FIPS 198). Grover's algorithm reduces the underlying hash preimage resistance to ~128 bits. Level 2 follows CycloneDX categorisation.",
    patterns: [
      /createHmac\s*\(\s*['"`]sha256['"`]/,
      /hmac[_-]sha[_-]?256/i,
    ],
  },
  {
    id: 'hs256-jwt',
    name: 'HS256 (JWT)',
    primitive: 'mac',
    nistLevel: 2,
    descriptionSuffix: "Strapi CMS — API authentication tokens (internal, server-to-server only).",
    patterns: [/['"`]HS256['"`]/, /algorithm\s*:\s*['"`]HS256['"`]/i],
  },

  // ── KDF ───────────────────────────────────────────────────────────────
  {
    id: 'hkdf-sha256',
    name: 'HKDF-SHA-256',
    primitive: 'kdf',
    nistLevel: 2,
    descriptionSuffix: "HMAC-based Key Derivation Function with SHA-256 (RFC 5869 / NIST SP 800-56C). Derives pseudorandom keying material from input key material using HMAC-SHA-256 as the underlying pseudorandom function.",
    patterns: [
      /hkdf\s*\(\s*sha256/i,
      /hkdf.*sha[_-]?256/i,
      /sha[_-]?256.*hkdf/i,
      /import.*\bhkdf\b/i,
    ],
  },
];

// Build a quick lookup by id
const ALGO_BY_ID = Object.fromEntries(ALGORITHM_DB.map(a => [a.id, a]));

// ── Usage-based dependency rules ────────────────────────────────────────────
// Models WHERE algorithms are used together, not algorithmic internals.
// byPrimitive: depends on all discovered entries with those primitives in that context.
// byAlgoId:    depends on specific algorithm IDs in that context.
const USAGE_DEP_RULES = [
  // All playground KEMs + classical key-exchange (X25519) feed into HKDF.
  {
    when:      { algoId: 'hkdf-sha256', context: 'playground' },
    dependsOn: { byPrimitive: ['kem', 'ke'], context: 'playground' },
  },
  // HKDF output is the key material for AES-256-GCM.
  {
    when:      { algoId: 'aes-256-gcm', context: 'playground' },
    dependsOn: { byAlgoId: ['hkdf-sha256'], context: 'playground' },
  },
  // ML-DSA-65 uses SHAKE-256 internally per FIPS 204 §5.2 — in every context.
  // In article-signing: SHA-256 is also used to fingerprint media files embedded in the signed message.
  { when: { algoId: 'ml-dsa-65', context: 'article-signing' }, dependsOn: { byAlgoId: ['shake-256', 'sha-256'], context: 'article-signing' } },
  { when: { algoId: 'ml-dsa-65', context: 'playground'     }, dependsOn: { byAlgoId: ['shake-256'], context: 'playground'     } },
  { when: { algoId: 'ml-dsa-65', context: 'cbom-signing'   }, dependsOn: { byAlgoId: ['shake-256'], context: 'cbom-signing'   } },
  // ECDSA P-256 hashes the message with SHA-256 before signing.
  { when: { algoId: 'ecdsa-p256', context: 'playground' }, dependsOn: { byAlgoId: ['sha-256'], context: 'playground' } },
  // SLH-DSA SHA2 variants use SHA-256 and SHA-512 internally (FIPS 205, SHA2 instantiation).
  { when: { algoId: 'slh-dsa-sha2-128s', context: 'playground' }, dependsOn: { byAlgoId: ['sha-256'], context: 'playground' } },
  { when: { algoId: 'slh-dsa-sha2-128f', context: 'playground' }, dependsOn: { byAlgoId: ['sha-256'], context: 'playground' } },
  // HMAC uses SHA-256 as its underlying hash function.
  { when: { algoId: 'hmac-sha256', context: 'contact-form' }, dependsOn: { byAlgoId: ['sha-256'], context: 'contact-form' } },
];

// ── Implicit dependency propagation ────────────────────────────────────────
// When algorithm X is detected in context Y, also add algorithm Z to context Y.
// Ensures supporting primitives (SHAKE-256, SHA-256) always appear alongside
// the higher-level algorithm that relies on them, even when not directly visible in source.
const IMPLICIT_DEPS = [
  { whenAlgoId: 'ml-dsa-65',         impliesAlgoId: 'shake-256' }, // FIPS 204: SHAKE-256 internal
  { whenAlgoId: 'ecdsa-p256',        impliesAlgoId: 'sha-256'   }, // ECDSA: SHA-256 message hashing
  { whenAlgoId: 'slh-dsa-sha2-128s', impliesAlgoId: 'sha-256'   }, // SLH-DSA SHA2: SHA-256 internal
  { whenAlgoId: 'slh-dsa-sha2-128f', impliesAlgoId: 'sha-256'   }, // SLH-DSA SHA2: SHA-256 internal
  { whenAlgoId: 'hmac-sha256',        impliesAlgoId: 'sha-256'   }, // HMAC construction uses SHA-256
];

// ── Explicit exclusions ────────────────────────────────────────────────────
// (algoId, context) pairs to suppress from the CBOM output.
// Use to remove false positives where source-level pattern matching detects
// a primitive that is not a distinct cryptographic asset in that context.
const CBOM_EXCLUDES = [
  // no exclusions currently
];

// ── Context labels ─────────────────────────────────────────────────────────
const CONTEXT_LABELS = {
  'article-signing': 'Article signing and verification',
  'cbom-signing':    'CBOM signing',
  'playground':      'Interactive Cryptography Playground',
  'contact-form':    'Contact form',
  'strapi':          'Strapi CMS',
};

function labelForContext(ctx) {
  return CONTEXT_LABELS[ctx] ?? ctx.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Context detection from file path ──────────────────────────────────────
function contextFromPath(filePath) {
  const rel = relative(ROOT, filePath).toLowerCase().replace(/\\/g, '/');
  if (/playground/i.test(rel))                            return 'playground';
  if (/contact/i.test(rel))                               return 'contact-form';
  if (/lifecycle|article.*sign|sign.*article/i.test(rel)) return 'article-signing';
  if (/strapi|middleware|jwt|server\.ts/i.test(rel))      return 'strapi';
  if (/auth/i.test(rel))                                  return 'auth';
  const parts = rel.split('/').filter(Boolean);
  const segment = parts[parts.length - 2] ?? parts[parts.length - 1] ?? 'unknown';
  return segment.replace(/\.(ts|tsx|mjs|js)$/, '');
}

// ── Annotation parsing ─────────────────────────────────────────────────────
// Returns:
//   declarations: explicit { algoId, context } pairs from "// cbom: <algo-id>:<context>"
//   contextOverrides: { lineIdx, context } from "// cbom: <context>" (no colon in value)
function parseAnnotations(content) {
  const lines        = content.split('\n');
  const declarations = [];
  const overrides    = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\/\/\s*cbom:\s*(.+)/i);
    if (!m) continue;

    const value = m[1].trim();
    // "algo-id:context" format → explicit declaration
    const declMatch = value.match(/^([\w-]+):([\w-]+)/);
    if (declMatch) {
      declarations.push({ algoId: declMatch[1], context: declMatch[2] });
    } else {
      // plain context override for the next detected algorithm
      overrides.push({ lineIdx: i, context: value });
    }
  }
  return { declarations, overrides };
}

// Given a match position in content, find a // cbom: <ctx> override in the 5 preceding lines
function findContextOverride(content, matchIndex, overrides) {
  const preceding = content.slice(0, matchIndex);
  const matchLine = preceding.split('\n').length - 1; // 0-based line of match
  for (const ov of overrides) {
    if (ov.lineIdx >= matchLine - 5 && ov.lineIdx < matchLine) {
      return ov.context;
    }
  }
  return null;
}

// ── File collection ────────────────────────────────────────────────────────
const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.mjs', '.js']);
const IGNORE_DIRS     = new Set([
  'node_modules', '.next', '.git', 'dist', 'build', '.turbo',
  'Infos für dich', '.cache',
]);

function collectFiles(dir, files = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return files; }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      collectFiles(full, files);
    } else if (SCAN_EXTENSIONS.has(extname(entry))) {
      if (full.includes('scan-cbom') || full.endsWith('.tmp') || full.endsWith('.bak')) continue;
      files.push(full);
    }
  }
  return files;
}

// ── File scanner ───────────────────────────────────────────────────────────
// Returns { findings: [{algoId, context}], declarations: [{algoId, context}] }
function scanFile(filePath) {
  let content;
  try { content = readFileSync(filePath, 'utf8'); } catch { return { findings: [], declarations: [] }; }

  // File-level opt-out: add "// cbom-ignore" anywhere in the file
  if (/\/\/\s*cbom-ignore/i.test(content)) return { findings: [], declarations: [] };

  const pathContext              = contextFromPath(filePath);
  const { declarations, overrides } = parseAnnotations(content);
  const findings                 = [];

  for (const algo of ALGORITHM_DB) {
    for (const pattern of algo.patterns) {
      const match = pattern.exec(content);
      if (match) {
        const annotatedCtx = findContextOverride(content, match.index, overrides);
        findings.push({ algoId: algo.id, context: annotatedCtx ?? pathContext });
        break; // one match per algorithm per file
      }
    }
  }

  return { findings, declarations };
}

// ── Dependency resolver ────────────────────────────────────────────────────
// Resolves usage-based dependencies for a given (algo, context) pair.
// finalEntries is the full list of { algo, context, bomRef } objects.
function resolveDeps(algo, context, finalEntries) {
  const deps = [];
  for (const rule of USAGE_DEP_RULES) {
    if (rule.when.algoId !== algo.id || rule.when.context !== context) continue;
    const { byPrimitive, byAlgoId, context: depCtx } = rule.dependsOn;
    for (const entry of finalEntries) {
      if (entry.context !== depCtx) continue;
      const matchesPrimitive = byPrimitive?.includes(entry.algo.primitive);
      const matchesId        = byAlgoId?.includes(entry.algo.id);
      if (matchesPrimitive || matchesId) deps.push(entry.bomRef);
    }
  }
  return deps;
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log('🔍  Scanning codebase for cryptographic assets...\n');

  // Collect all candidate findings: Map<algoId, Set<context>>
  const candidateContexts = new Map(); // algoId → Set<context>

  const addFinding = (algoId, context) => {
    if (!ALGO_BY_ID[algoId]) return; // unknown algo
    if (!candidateContexts.has(algoId)) candidateContexts.set(algoId, new Set());
    candidateContexts.get(algoId).add(context);
  };

  const files = collectFiles(ROOT);
  console.log(`    Scanning ${files.length} source files...`);

  for (const file of files) {
    const { findings, declarations } = scanFile(file);
    for (const f of findings)     addFinding(f.algoId, f.context);
    for (const d of declarations) addFinding(d.algoId, d.context);
  }

  // Static declarations for scan-cbom.mjs itself (excluded from scanning to avoid self-scan)
  addFinding('ml-dsa-65', 'cbom-signing');

  // Safety check
  if (candidateContexts.size === 0) {
    console.error('\n❌  No cryptographic assets detected — aborting to prevent blank output.');
    process.exit(1);
  }

  // Filter to recognized contexts only — drops noise from generic path segments
  // (e.g. 'workers', 'components', 'lib', 'scripts') that are not meaningful CBOM contexts.
  const RECOGNIZED_CONTEXTS = new Set(CONTEXT_PRIORITY);
  for (const [algoId, contexts] of candidateContexts) {
    for (const ctx of [...contexts]) {
      if (!RECOGNIZED_CONTEXTS.has(ctx)) contexts.delete(ctx);
    }
    if (contexts.size === 0) candidateContexts.delete(algoId);
  }

  // Apply implicit dependencies: when algo X exists in context Y, also add algo Z to context Y.
  // Run until stable (in case of chained deps, though none currently exist).
  let changed = true;
  while (changed) {
    changed = false;
    for (const rule of IMPLICIT_DEPS) {
      const sourceContexts = candidateContexts.get(rule.whenAlgoId);
      if (!sourceContexts) continue;
      for (const ctx of sourceContexts) {
        const before = candidateContexts.get(rule.impliesAlgoId)?.size ?? 0;
        addFinding(rule.impliesAlgoId, ctx);
        const after = candidateContexts.get(rule.impliesAlgoId)?.size ?? 0;
        if (after > before) changed = true;
      }
    }
  }

  // Apply explicit exclusions
  for (const exc of CBOM_EXCLUDES) {
    candidateContexts.get(exc.algoId)?.delete(exc.context);
  }

  // Emit one entry per (algo, context) pair — no deduplication across contexts
  const finalEntries = []; // { algo, context, bomRef }
  for (const [algoId, contexts] of candidateContexts) {
    const algo = ALGO_BY_ID[algoId];
    for (const context of contexts) {
      finalEntries.push({ algo, context, bomRef: `${algoId}:${context}` });
    }
  }

  // Sort: QS first, then alphabetical
  finalEntries.sort((a, b) => {
    const aQS = a.algo.nistLevel > 0;
    const bQS = b.algo.nistLevel > 0;
    if (aQS !== bQS) return aQS ? -1 : 1;
    return a.bomRef.localeCompare(b.bomRef);
  });

  console.log(`\n    Found ${finalEntries.length} cryptographic asset(s):\n`);

  const components = [];
  const depEntries = [];

  for (const { algo, context, bomRef } of finalEntries) {
    const label       = labelForContext(context);
    const descSuffix = algo.descriptionSuffix;
    const description = algo.id === 'hs256-jwt'
      ? descSuffix
      : `${label} — ${descSuffix}`;

    components.push({
      'bom-ref': bomRef,
      type: 'cryptographic-asset',
      name: algo.name,
      description,
      cryptoProperties: {
        assetType: 'algorithm',
        algorithmProperties: {
          primitive:                algo.primitive,
          nistQuantumSecurityLevel: algo.nistLevel,
        },
      },
    });

    depEntries.push({
      ref:       bomRef,
      dependsOn: resolveDeps(algo, context, finalEntries),
    });

    const qs = algo.nistLevel > 0 ? '✅' : '❌';
    console.log(`    ${qs}  ${bomRef}`);
  }

  // Load existing CBOM to preserve serialNumber and version
  let serialNumber = `urn:uuid:${randomUUID()}`;
  let version      = 1;

  if (existsSync(OUTPUT)) {
    try {
      const existing   = JSON.parse(readFileSync(OUTPUT, 'utf8'));
      serialNumber     = existing.serialNumber ?? serialNumber;
      const prevContent = JSON.stringify({ c: existing.components, d: existing.dependencies });
      const newContent  = JSON.stringify({ c: components,          d: depEntries });
      if (prevContent === newContent) {
        version = existing.version ?? 1;
        console.log('\n✅  No changes detected — version unchanged.');
      } else {
        version = (existing.version ?? 0) + 1;
        console.log(`\n📝  CBOM changed — version bumped to ${version}.`);
      }
    } catch {
      console.log('\n⚠️   Could not parse existing cbom.json — creating fresh.');
    }
  }

  const cbom = {
    bomFormat:   'CycloneDX',
    specVersion: '1.6',
    version,
    serialNumber,
    metadata: {
      timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      component: {
        type:        'application',
        name:        'beyond-shor.eu',
        version:     '1.0.0',
        description: 'Post-Quantum Cryptography blog and interactive playground',
      },
      tools: [{ name: 'scan-cbom.mjs', version: '1.0.0' }],
    },
    components,
    dependencies: depEntries,
  };

  // Atomic write via temp file → rename
  writeFileSync(OUTPUT_TMP, JSON.stringify(cbom, null, 2));
  renameSync(OUTPUT_TMP, OUTPUT);

  const qsCount  = components.filter(c => (c.cryptoProperties?.algorithmProperties?.nistQuantumSecurityLevel ?? 0) > 0).length;
  const nqsCount = components.length - qsCount;

  console.log(`\n🎯  Written to frontend/public/cbom.json`);
  console.log(`    ${components.length} total  |  ${qsCount} quantum-safe  |  ${nqsCount} quantum-vulnerable`);

  // ── Sign CBOM with ML-DSA-65 ──────────────────────────────────────────────
  const envPath = join(ROOT, '.env');
  let privKeyHex = '';
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      if (line.startsWith('ML_DSA_PRIVATE_KEY=')) {
        privKeyHex = line.slice('ML_DSA_PRIVATE_KEY='.length).trim();
        break;
      }
    }
  }

  if (privKeyHex) {
    const cbomContent = readFileSync(OUTPUT, 'utf8');
    const privKey     = Uint8Array.from(Buffer.from(privKeyHex, 'hex'));
    const msgBytes    = new TextEncoder().encode(cbomContent);
    const sig         = ml_dsa65.sign(msgBytes, privKey);
    const sigHex      = Buffer.from(sig).toString('hex');
    writeFileSync(OUTPUT_SIG_TMP, sigHex, 'utf8');
    renameSync(OUTPUT_SIG_TMP, OUTPUT_SIG);
    console.log('🔐  CBOM signed   → frontend/public/cbom.sig');
  } else {
    console.warn('⚠️   ML_DSA_PRIVATE_KEY not found in .env — skipping signature.');
  }
}

main();
