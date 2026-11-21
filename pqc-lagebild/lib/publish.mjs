// Publishing: sign a dataset, write it to PUBLIC_DIR, and update the signed index.
// The blog server only ever trusts files whose signature verifies against the pinned key,
// so everything that leaves this host goes through here.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_DIR, SIGNING_KEY } from './config.mjs';
import { loadSecretKey, writeSigned, publicKeyHexFromSecret } from './sign.mjs';
import { canonicalJson } from './util.mjs';

const KINDS = { lagebild: 'beyond-shor/pqc-lagebild@1', matrix: 'beyond-shor/software-matrix@1' };

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function readIndex() {
  const p = join(PUBLIC_DIR, 'index.json');
  if (!existsSync(p)) return { schema: 'beyond-shor/pqc-lagebild-index@1', files: {}, status: {} };
  return JSON.parse(readFileSync(p, 'utf8'));
}

function writeIndex(index, key, pub) {
  index.updatedAt = new Date().toISOString();
  writeSigned(join(PUBLIC_DIR, 'index.json'), canonicalJson(index), key, pub);
}

/** Publish `data` as `<kind>-<month>.json` (+ .sig) and record it in the index. */
export function publishDataset(kind, month, data) {
  if (!KINDS[kind]) throw new Error(`unknown kind ${kind}`);
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error(`bad month ${month}`);
  if (data.schema !== KINDS[kind]) throw new Error(`${kind} data must carry schema ${KINDS[kind]}`);
  const key = loadSecretKey(SIGNING_KEY);
  const pub = publicKeyHexFromSecret(key);
  const name = `${kind}-${month}.json`;
  const content = canonicalJson(data);
  writeSigned(join(PUBLIC_DIR, name), content, key, pub);

  const index = readIndex();
  index.files[name] = { kind, month, sha256: sha256(Buffer.from(content)), bytes: Buffer.byteLength(content) };
  index.latest = index.latest ?? {};
  const months = Object.values(index.files).filter((f) => f.kind === kind).map((f) => f.month).sort();
  index.latest[kind] = `${kind}-${months.at(-1)}.json`;
  index.status[kind] = { ok: true, month, at: new Date().toISOString() };
  writeIndex(index, key, pub);
  return name;
}

/** Record a failed run so the blog server can alert — the previous data stays published. */
export function publishFailure(kind, month, reason) {
  const key = loadSecretKey(SIGNING_KEY);
  const pub = publicKeyHexFromSecret(key);
  const index = readIndex();
  index.status[kind] = { ok: false, month, at: new Date().toISOString(), reason: String(reason).slice(0, 500) };
  writeIndex(index, key, pub);
}

export function listPublished() {
  return existsSync(PUBLIC_DIR) ? readdirSync(PUBLIC_DIR).sort() : [];
}
