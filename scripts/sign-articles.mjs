/**
 * sign-articles.mjs — Backfill: signs all published articles with ML-DSA-65
 * and writes the signature directly to SQLite.
 *
 * Articles are fetched via the Strapi REST API (so Strapi must be running)
 * to get blocks + media populated. The signature is then written directly to
 * the DB (bypassing Strapi's ORM) to avoid Strapi updating publishedAt, which
 * would immediately invalidate the signature.
 *
 * Usage (Strapi must be running on STRAPI_URL):
 *   node scripts/sign-articles.mjs
 *
 * Requires:
 *   ML_DSA_PRIVATE_KEY  — in pqc-blog/.env
 *   STRAPI_API_TOKEN    — in pqc-blog/.env
 *   STRAPI_URL          — in pqc-blog/.env (default: http://localhost:1337)
 */

import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load .env ────────────────────────────────────────────────────────────────

function loadEnvFile(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    for (const line of content.split('\n')) {
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

loadEnvFile(resolve(__dirname, '../.env'));

const STRAPI_URL       = process.env.STRAPI_URL       || 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN  || '';

if (!process.env.ML_DSA_PRIVATE_KEY) {
  console.error('Error: ML_DSA_PRIVATE_KEY not set in pqc-blog/.env');
  process.exit(1);
}

// ─── Media hashing ────────────────────────────────────────────────────────────

/**
 * Download a Strapi media file and return its SHA-256 hex digest.
 * url is e.g. /uploads/foo.jpg
 */
async function hashFileHttp(url) {
  const fullUrl = `${STRAPI_URL}${url}`;
  const headers = STRAPI_API_TOKEN ? { Authorization: `Bearer ${STRAPI_API_TOKEN}` } : {};
  const res = await fetch(fullUrl, { headers });
  if (!res.ok) throw new Error(`Failed to fetch ${fullUrl}: ${res.status} ${res.statusText}`);
  const buffer = await res.arrayBuffer();
  return createHash('sha256').update(Buffer.from(buffer)).digest('hex');
}

// ─── Canonical block serialization ───────────────────────────────────────────
// Must be identical to the logic in lifecycles.ts and SignatureVerifier.tsx.

async function processBlock(block) {
  switch (block.__component) {
    case 'shared.rich-text':
      return { __component: 'shared.rich-text', body: block.body ?? '' };

    case 'shared.quote':
      return { __component: 'shared.quote', body: block.body ?? '', title: block.title ?? '' };

    case 'shared.media': {
      const sha256 = block.file?.url ? await hashFileHttp(block.file.url) : null;
      return { __component: 'shared.media', file: sha256 ? { sha256 } : null };
    }

    case 'shared.slider': {
      const files = Array.isArray(block.files) ? block.files : [];
      const hashes = await Promise.all(
        files.map((f) => (f.url ? hashFileHttp(f.url) : Promise.resolve(null))),
      );
      return { __component: 'shared.slider', files: hashes.map((sha256) => (sha256 ? { sha256 } : null)) };
    }

    default:
      return { __component: block.__component };
  }
}

async function serializeBlocks(blocks) {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  const processed = await Promise.all(blocks.map(processBlock));
  return JSON.stringify(processed);
}

// publishedAt intentionally excluded: Strapi updates it on every write,
// which would immediately invalidate the signature.
// Raw UTF-8 bytes are passed directly to ML-DSA-65 — no pre-hashing.
// ML-DSA internally processes the message with SHAKE-256 per FIPS 204 §5.2.
async function buildMessage(documentId, locale, title, blocks) {
  const raw = [documentId, locale, title, await serializeBlocks(blocks)].join('|');
  return Buffer.from(raw, 'utf8');
}

// ─── Crypto ───────────────────────────────────────────────────────────────────

const privateKey = Uint8Array.from(Buffer.from(process.env.ML_DSA_PRIVATE_KEY, 'hex'));

// ─── Fetch articles from Strapi REST API ─────────────────────────────────────

async function fetchArticles(locale) {
  const url = new URL(`${STRAPI_URL}/api/articles`);
  url.searchParams.set('locale', locale);
  url.searchParams.set('filters[publishedAt][$notNull]', 'true');
  url.searchParams.set('populate[0]', 'blocks');
  url.searchParams.set('populate[1]', 'blocks.file');
  url.searchParams.set('populate[2]', 'blocks.files');
  url.searchParams.set('pagination[pageSize]', '100');

  const headers = {
    'Content-Type': 'application/json',
    ...(STRAPI_API_TOKEN ? { Authorization: `Bearer ${STRAPI_API_TOKEN}` } : {}),
  };

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`Strapi API error ${res.status} for locale=${locale}`);
  const data = await res.json();
  return data.data ?? [];
}

// ─── DB (write only) ─────────────────────────────────────────────────────────

const db = new Database(resolve(__dirname, '../.tmp/data.db'));

const updateSig = db.prepare(`
  UPDATE articles
  SET    pqc_signature = ?
  WHERE  document_id = ?
    AND  locale = ?
    AND  published_at IS NOT NULL
`);

// ─── Main ─────────────────────────────────────────────────────────────────────

let signed = 0;
let failed = 0;

for (const locale of ['de', 'en']) {
  console.log(`\nLocale: ${locale}`);
  let articles;
  try {
    articles = await fetchArticles(locale);
  } catch (err) {
    console.error(`  ✗ Could not fetch articles: ${err.message}`);
    console.error('    Is Strapi running on', STRAPI_URL, '?');
    failed++;
    continue;
  }

  for (const article of articles) {
    try {
      const msg = await buildMessage(article.documentId, locale, article.title, article.blocks ?? []);
      const sig = ml_dsa65.sign(msg, privateKey);
      const sigHex = Buffer.from(sig).toString('hex');
      updateSig.run(sigHex, article.documentId, locale);
      console.log(`  ✓ [${locale}] ${article.documentId} — ${article.title?.slice(0, 50)}`);
      signed++;
    } catch (err) {
      console.error(`  ✗ [${locale}] ${article.documentId}: ${err.message}`);
      failed++;
    }
  }
}

db.close();
console.log(`\nDone: ${signed} signed, ${failed} failed.`);
