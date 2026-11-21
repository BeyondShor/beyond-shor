#!/usr/bin/env node
// Blog server: fetch the signed PQC-Lagebild files from the scanner host, verify every
// signature against the pinned public key and every SHA-256 against the signed index,
// and only then install them into DATA_DIR. Anything that does not verify is dropped.
// Mails an alert on failures or stale data (at most once per distinct problem per week).
//
//   PQC_LAGEBILD_SOURCE=/some/dir   read files from a local directory instead of SSH (tests)

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyBytes } from '../lib/sign.mjs';
import { writeAtomic, canonicalJson } from '../lib/util.mjs';
import { sendAlert } from './mail.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DATA_DIR = process.env.PQC_LAGEBILD_DIR ?? '/var/lib/beyond-shor/pqc-lagebild';
const PUBKEY = (process.env.PQC_LAGEBILD_PUBKEY ?? readFileSync(join(REPO, 'frontend/data/pqc-lagebild-public-key.txt'), 'utf8')).trim();
const NO_MAIL = process.env.PQC_LAGEBILD_NO_MAIL === '1';
const SOURCE = process.env.PQC_LAGEBILD_SOURCE;
// user@host of the scanner's hand-over account; set in /etc/beyond-shor/pqc-lagebild.env (not in git)
const SCANNER = process.env.PQC_LAGEBILD_SCANNER;
const SSH_ARGS = [
  '-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=20',
  '-i', '/root/.ssh/pqc-lagebild-pull',
  '-o', 'UserKnownHostsFile=/root/.ssh/pqc-lagebild-known_hosts', '-o', 'StrictHostKeyChecking=yes',
  SCANNER,
];
const NAME = /^(?:(lagebild|matrix)-\d{4}-\d{2}\.json|index\.json)(?:\.sig)?$/;
const STATE = join(DATA_DIR, 'state', 'pull.json');

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const log = (...a) => console.log(new Date().toISOString(), ...a);

function fetchToStaging() {
  if (SOURCE) return SOURCE;
  if (!SCANNER) throw new Error('PQC_LAGEBILD_SCANNER is not set');
  const dir = mkdtempSync(join(tmpdir(), 'pqc-lagebild-'));
  const ssh = spawnSync('ssh', SSH_ARGS, { maxBuffer: 256 * 1024 * 1024, timeout: 120_000 });
  if (ssh.status !== 0) throw new Error(`ssh failed (${ssh.status}): ${ssh.stderr.toString().slice(0, 300)}`);
  const list = spawnSync('tar', ['-tf', '-'], { input: ssh.stdout });
  const members = list.stdout.toString().split('\n').filter(Boolean).map((m) => m.replace(/^\.\//, '')).filter(Boolean);
  const bad = members.filter((m) => !NAME.test(m));
  if (bad.length) throw new Error(`unexpected members in archive: ${bad.slice(0, 5).join(', ')}`);
  const x = spawnSync('tar', ['-xf', '-', '-C', dir, '--no-same-owner', '--no-same-permissions', '--no-overwrite-dir'], { input: ssh.stdout });
  if (x.status !== 0) throw new Error(`tar failed: ${x.stderr.toString().slice(0, 300)}`);
  return dir;
}

function verifiedFile(dir, name) {
  const p = join(dir, name);
  const s = join(dir, `${name}.sig`);
  if (!existsSync(p) || !existsSync(s)) throw new Error(`${name}: file or signature missing`);
  const bytes = readFileSync(p);
  if (!verifyBytes(readFileSync(s, 'utf8'), bytes, PUBKEY)) throw new Error(`${name}: signature does not verify`);
  return bytes;
}

function readState() {
  try { return JSON.parse(readFileSync(STATE, 'utf8')); } catch { return { alerts: {} }; }
}

function expectedMonthNow(graceDays) {
  // the run on the 1st must be published within `graceDays`; before that, last month is fine
  const now = new Date();
  const d = new Date(now.getTime() - graceDays * 86400_000);
  return d.toISOString().slice(0, 7);
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });
  const problems = [];
  let installed = 0;
  let index = null;
  let staging = null;
  try {
    staging = fetchToStaging();
    index = JSON.parse(verifiedFile(staging, 'index.json').toString('utf8'));
    for (const [name, meta] of Object.entries(index.files ?? {})) {
      if (!NAME.test(name)) { problems.push(`index lists unexpected file ${name}`); continue; }
      try {
        const bytes = verifiedFile(staging, name);
        if (sha256(bytes) !== meta.sha256) throw new Error(`${name}: SHA-256 differs from the signed index`);
        const target = join(DATA_DIR, name);
        if (existsSync(target) && sha256(readFileSync(target)) === meta.sha256) continue;
        writeAtomic(`${target}.sig`, readFileSync(join(staging, `${name}.sig`)), 0o644);
        writeAtomic(target, bytes, 0o644);
        installed++;
        log(`installed ${name}`);
      } catch (e) {
        problems.push(e.message);
      }
    }
    // the index goes last, so readers never see an index pointing at files not yet installed
    writeAtomic(join(DATA_DIR, 'index.json.sig'), readFileSync(join(staging, 'index.json.sig')), 0o644);
    writeAtomic(join(DATA_DIR, 'index.json'), readFileSync(join(staging, 'index.json')), 0o644);
  } catch (e) {
    problems.push(`pull failed: ${e.message}`);
  } finally {
    if (staging && !SOURCE) rmSync(staging, { recursive: true, force: true });
  }

  // run status reported by the scanner, and freshness
  if (index) {
    for (const kind of ['lagebild', 'matrix']) {
      const st = index.status?.[kind];
      if (st && st.ok === false) problems.push(`${kind}: run for ${st.month} failed on the scanner: ${st.reason}`);
      const latest = index.latest?.[kind];
      const month = latest?.match(/(\d{4}-\d{2})/)?.[1];
      if (!month) problems.push(`${kind}: nothing published yet`);
      else if (month < expectedMonthNow(3)) problems.push(`${kind}: newest data is from ${month}`);
    }
  }

  // alert at most once a week per distinct set of problems; one all-clear after a problem
  const state = readState();
  const key = sha256(Buffer.from(problems.sort().join('\n'))).slice(0, 16);
  const last = state.lastAlert;
  const weekAgo = Date.now() - 7 * 86400_000;
  if (NO_MAIL) { /* tests */ } else if (problems.length && (!last || last.key !== key || last.at < weekAgo)) {
    const text = `Beim Abholen/Prüfen des PQC-Lagebilds gibt es Probleme:\n\n- ${problems.join('\n- ')}\n\n` +
      'Die Seite zeigt weiter den letzten gültigen Stand. Details: journalctl -u pqc-lagebild-pull ' +
      'auf dem Blog-Server bzw. journalctl --user -u pqscan-scan / pqscan-matrix als pqscan auf dem Messserver.';
    try { await sendAlert(REPO, 'Problem', text); state.lastAlert = { key, at: Date.now() }; log('alert mailed'); }
    catch (e) { log(`alert mail failed: ${e.message}`); }
  } else if (!problems.length && last) {
    try { await sendAlert(REPO, 'Wieder in Ordnung', 'Das PQC-Lagebild wird wieder normal abgeholt und geprüft.'); delete state.lastAlert; }
    catch (e) { log(`all-clear mail failed: ${e.message}`); }
  }
  state.lastRun = { at: new Date().toISOString(), installed, problems };
  writeAtomic(STATE, canonicalJson(state), 0o600);

  log(`done: ${installed} new file(s), ${problems.length} problem(s)`);
  for (const p of problems) log(`problem: ${p}`);
  if (problems.some((p) => p.startsWith('pull failed') || p.includes('signature'))) process.exitCode = 1;
}

main();
