#!/usr/bin/env node
/**
 * sign-cbom.mjs — Sign frontend/public/cbom.json with ML-DSA-65 (NIST FIPS 204)
 *
 * The CBOM itself is produced by ShorSight, not here:
 *
 *   shorsight scan . -o shorsight/cbom.raw.json
 *   shorsight govern shorsight/cbom.raw.json \
 *     --config shorsight/governance.beyond-shor.json -o frontend/data/governance.json
 *   node scripts/sign-cbom.mjs shorsight/cbom.raw.json
 *
 * Passing a source file re-publishes it to frontend/public/cbom.json first
 * (normalised to JSON.stringify(…, null, 2) + a trailing newline, which is what
 * the page imports and what the browser verifier fetches). Without an argument
 * the file already in public/ is signed as-is.
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

// ─── Publish (optional) ───────────────────────────────────────────────────────

const source = process.argv[2];

if (source) {
  const src = JSON.parse(readFileSync(resolve(process.cwd(), source), 'utf8'));
  if (!Array.isArray(src.components) || src.components.length === 0) {
    console.error(`Error: ${source} contains no components — refusing to publish a blank CBOM.`);
    process.exit(1);
  }
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
