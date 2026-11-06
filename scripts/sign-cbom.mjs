#!/usr/bin/env node
/**
 * sign-cbom.mjs — Sign frontend/public/cbom.json with ML-DSA-65 (NIST FIPS 204)
 *
 * The CBOM itself is produced by ShorSight, not here:
 *
 *   shorsight scan . -o shorsight/cbom.raw.json
 *   node scripts/sign-cbom.mjs shorsight/cbom.raw.json
 *   python shorsight/build_inventory.py   # risk analysis for /cbom
 *
 * Passing a source file re-publishes it to frontend/public/cbom.json first
 * (normalised to JSON.stringify(…, null, 2) + a trailing newline, which is what
 * the page imports and what the browser verifier fetches). Without an argument
 * the file already in public/ is signed as-is.
 *
 * On publish, the corrections in shorsight/corrections.json are applied to the
 * scan: places where ShorSight's assessment is wrong or outdated. Every corrected
 * component carries a 'beyond-shor:correction' property saying what was changed,
 * so the signed CBOM never passes off an edit as scanner output.
 *
 * The signed message is the exact UTF-8 byte sequence of cbom.json — nothing is
 * added, nothing is hashed first. frontend/components/SignatureVerifier.tsx
 * reconstructs the same bytes with fetch('/cbom.json').text().
 *
 * Requires ML_DSA_PRIVATE_KEY in pqc-blog/.env — the same key that signs articles.
 */

import { readFileSync, writeFileSync, renameSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const CBOM      = resolve(ROOT, 'frontend/public/cbom.json');
const SIG       = resolve(ROOT, 'frontend/public/cbom.sig');
const FIXES     = resolve(ROOT, 'shorsight/corrections.json');

// ─── Load .env ────────────────────────────────────────────────────────────────

function loadEnvFile(filePath) {
  try {
    for (const line of readFileSync(filePath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { }
}

loadEnvFile(resolve(ROOT, '.env'));

if (!process.env.ML_DSA_PRIVATE_KEY) {
  console.error('Error: ML_DSA_PRIVATE_KEY not set in pqc-blog/.env');
  process.exit(1);
}

// ─── Corrections ──────────────────────────────────────────────────────────────

/**
 * Keys are dotted paths into the component. "properties.<name>" addresses the
 * value of the flat CycloneDX property with that name. Unknown bom-refs and
 * missing paths abort: a correction that silently stops applying is worse than none.
 */
function applyCorrections(cbom) {
  let fixes;
  try { fixes = JSON.parse(readFileSync(FIXES, 'utf8')).components ?? {}; }
  catch { return; }

  for (const [ref, { set, reason }] of Object.entries(fixes)) {
    const comp = cbom.components.find((c) => c['bom-ref'] === ref);
    if (!comp) {
      console.error(`Error: correction for ${ref}, but the scan has no such component.`);
      process.exit(1);
    }
    const changed = [];
    for (const [path, value] of Object.entries(set)) {
      if (path.startsWith('properties.')) {
        const name = path.slice('properties.'.length);
        const prop = comp.properties?.find((p) => p.name === name);
        if (!prop) { console.error(`Error: ${ref} has no property ${name}.`); process.exit(1); }
        changed.push(`${name}: ${JSON.stringify(prop.value)} → ${JSON.stringify(value)}`);
        prop.value = value;
      } else {
        const keys = path.split('.');
        const parent = keys.slice(0, -1).reduce((o, k) => o?.[k], comp);
        const last = keys.at(-1);
        if (!parent || !(last in parent)) { console.error(`Error: ${ref} has no ${path}.`); process.exit(1); }
        changed.push(`${path}: ${JSON.stringify(parent[last])} → ${JSON.stringify(value)}`);
        parent[last] = value;
      }
    }
    comp.properties = [
      ...(comp.properties ?? []).filter((p) => p.name !== 'beyond-shor:correction'),
      { name: 'beyond-shor:correction', value: `${reason} (${changed.join('; ')})` },
    ];
    console.log(`✏️   Corrected ${ref}: ${changed.join('; ')}`);
  }
}

// ─── Publish (optional) ───────────────────────────────────────────────────────

const source = process.argv[2];

if (source) {
  const src = JSON.parse(readFileSync(resolve(process.cwd(), source), 'utf8'));
  if (!Array.isArray(src.components) || src.components.length === 0) {
    console.error(`Error: ${source} contains no components — refusing to publish a blank CBOM.`);
    process.exit(1);
  }
  applyCorrections(src);
  // atomic: never leave a half-written cbom.json next to a signature over the old one
  writeFileSync(`${CBOM}.tmp`, JSON.stringify(src, null, 2) + '\n');
  renameSync(`${CBOM}.tmp`, CBOM);
  console.log(`📄  Published ${source} → frontend/public/cbom.json (${src.components.length} components)`);
}

// ─── Sign ─────────────────────────────────────────────────────────────────────

const content  = readFileSync(CBOM, 'utf8');
const msgBytes = new TextEncoder().encode(content);
const privKey  = Buffer.from(process.env.ML_DSA_PRIVATE_KEY, 'hex');
const sig      = ml_dsa65.sign(msgBytes, privKey);
const sigHex   = Buffer.from(sig).toString('hex');

writeFileSync(`${SIG}.tmp`, sigHex);
renameSync(`${SIG}.tmp`, SIG);

// verify what was just written, so a bad key or a truncated read fails here and
// not silently in a visitor's browser
const pubKey = process.env.ML_DSA_PUBLIC_KEY
  ? Buffer.from(process.env.ML_DSA_PUBLIC_KEY, 'hex')
  : null;
if (pubKey && !ml_dsa65.verify(sig, msgBytes, pubKey)) {
  console.error('Error: the signature just written does not verify against ML_DSA_PUBLIC_KEY.');
  process.exit(1);
}

console.log(`🔐  Signed ${msgBytes.length.toLocaleString()} B → frontend/public/cbom.sig`);
console.log(`    ${sigHex.slice(0, 16)}…${sigHex.slice(-16)}${pubKey ? '  ✓ verified' : ''}`);
