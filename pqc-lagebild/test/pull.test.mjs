import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { generateKeyPair, signBytes } from '../lib/sign.mjs';

const PULL = join(dirname(fileURLToPath(import.meta.url)), '../server/pull.mjs');
const sha = (s) => createHash('sha256').update(s).digest('hex');

function makeSource(secretKeyHex, { tamper = false } = {}) {
  const src = mkdtempSync(join(tmpdir(), 'pqcl-src-'));
  const key = Buffer.from(secretKeyHex, 'hex');
  const month = new Date().toISOString().slice(0, 7);
  const files = {};
  for (const kind of ['lagebild', 'matrix']) {
    const name = `${kind}-${month}.json`;
    const body = JSON.stringify({ kind }) + '\n';
    writeFileSync(join(src, name), tamper && kind === 'matrix' ? body.replace('matrix', 'evil') : body);
    writeFileSync(join(src, `${name}.sig`), signBytes(Buffer.from(body), key) + '\n');
    files[name] = { kind, month, sha256: sha(body) };
  }
  const index = JSON.stringify({ files, latest: { lagebild: `lagebild-${month}.json`, matrix: `matrix-${month}.json` }, status: {} }) + '\n';
  writeFileSync(join(src, 'index.json'), index);
  writeFileSync(join(src, 'index.json.sig'), signBytes(Buffer.from(index), key) + '\n');
  return { src, month };
}

function runPull(src, pub) {
  const data = mkdtempSync(join(tmpdir(), 'pqcl-data-'));
  const r = spawnSync(process.execPath, [PULL], {
    env: { ...process.env, PQC_LAGEBILD_SOURCE: src, PQC_LAGEBILD_DIR: data, PQC_LAGEBILD_PUBKEY: pub, PQC_LAGEBILD_NO_MAIL: '1' },
    encoding: 'utf8',
  });
  return { data, out: r.stdout + r.stderr, status: r.status };
}

test('valid files are installed', () => {
  const k = generateKeyPair();
  const { src, month } = makeSource(k.secretKeyHex);
  const { data, status } = runPull(src, k.publicKeyHex);
  assert.equal(status, 0);
  assert.ok(existsSync(join(data, `lagebild-${month}.json`)));
  assert.ok(existsSync(join(data, 'index.json')));
});

test('a tampered file is rejected, the rest still installs', () => {
  const k = generateKeyPair();
  const { src, month } = makeSource(k.secretKeyHex, { tamper: true });
  const { data, out } = runPull(src, k.publicKeyHex);
  assert.ok(existsSync(join(data, `lagebild-${month}.json`)));
  assert.equal(existsSync(join(data, `matrix-${month}.json`)), false);
  assert.match(out, /signature does not verify/);
});

test('files signed with another key are rejected entirely', () => {
  const k = generateKeyPair();
  const other = generateKeyPair();
  const { src, month } = makeSource(k.secretKeyHex);
  const { data, out, status } = runPull(src, other.publicKeyHex);
  assert.equal(status, 1);
  assert.equal(existsSync(join(data, `lagebild-${month}.json`)), false);
  assert.match(out, /index\.json: signature does not verify/);
  const state = JSON.parse(readFileSync(join(data, 'state/pull.json'), 'utf8'));
  assert.ok(state.lastRun.problems.length > 0);
});
