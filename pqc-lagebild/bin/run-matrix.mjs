#!/usr/bin/env node
// B — "Software ab Werk": test the defaults of all supported distribution releases,
// add the Windows/macOS results of the pqc-matrix-os GitHub workflow, and publish
// the signed matrix for the current month.
//
//   node bin/run-matrix.mjs                 # all releases + OS results, publish
//   node bin/run-matrix.mjs --refresh-os    # keep this month's Linux results, re-import OS results, republish
//   node bin/run-matrix.mjs --only debian-13,ubuntu-24.04 --no-publish --out /tmp/m.json

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_DIR, STATE_DIR } from '../lib/config.mjs';
import { log, monthOf } from '../lib/util.mjs';
import { publishDataset, publishFailure } from '../lib/publish.mjs';
import { discoverReleases } from '../matrix/releases.mjs';
import { runMatrix, runnerInfo, cleanupImages } from '../matrix/run.mjs';
import { fetchOsMatrix } from '../matrix/os-import.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const publish = !args.includes('--no-publish');
const refreshOs = args.includes('--refresh-os');
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const month = monthOf();

const METHOD = {
  serverProbe: 'Node.js/OpenSSL client offering key shares for X25519MLKEM768 and X25519 (like current browsers), then X25519MLKEM768 alone',
  clientProbe: 'first ClientHello recorded by a sink: a post-quantum key share means PQ by default',
  ssh: 'effective defaults from sshd -T and ssh -G; PQ means the preferred key exchange is post-quantum',
  changes: 'only a certificate and non-colliding ports are configured; groups, ciphers and protocol versions stay at the distribution defaults',
  windowsMacos: 'GitHub-hosted runner images (stock Windows/macOS), tested by .github/workflows/pqc-matrix-os.yml with the same sink and probe',
};

/** Attach the OS results (or the reason they are missing) to a matrix dataset. */
async function withOs(data) {
  const os = await fetchOsMatrix();
  data.releases = data.releases.filter((r) => r.source !== 'github-hosted-runner');
  data.releases.push(...os.releases);
  data.os = { status: os.status, generatedAt: os.generatedAt ?? null, url: os.url ?? null, workflow: os.workflow ?? null, reason: os.reason ?? null };
  log(`matrix: OS results ${os.status}${os.reason ? ` (${os.reason})` : ''}: ${os.releases.map((r) => r.id).join(', ') || '–'}`);
  return data;
}

try {
  let data;
  if (refreshOs) {
    const path = join(PUBLIC_DIR, `matrix-${month}.json`);
    if (!existsSync(path)) throw new Error(`--refresh-os: no published matrix for ${month} yet — run without --refresh-os first`);
    data = JSON.parse(readFileSync(path, 'utf8'));
    data.osRefreshedAt = new Date().toISOString();
    data.method = METHOD;
  } else {
    const discoveryErrors = [];
    let releases = await discoverReleases(undefined, discoveryErrors);
    if (only) releases = releases.filter((r) => only.includes(r.id));
    log(`matrix: ${releases.length} releases: ${releases.map((r) => r.id).join(', ')}`);
    if (discoveryErrors.length) log(`matrix: discovery problems: ${discoveryErrors.join(' | ')}`);
    const started = Date.now();
    const results = await runMatrix(releases, { workRoot: join(STATE_DIR, 'matrix-work'), concurrency: Number(process.env.PQSCAN_MATRIX_CONCURRENCY ?? 2) });
    const tested = results.filter((r) => Object.keys(r.results).length > 0);
    if (tested.length === 0) throw new Error(`no release could be tested (${results.flatMap((r) => r.errors).slice(0, 3).join(' | ')})`);
    for (const r of results) r.source = 'container';
    data = {
      schema: 'beyond-shor/software-matrix@1',
      month,
      generatedAt: new Date().toISOString(),
      durationSec: Math.round((Date.now() - started) / 1000),
      runner: await runnerInfo(),
      method: METHOD,
      discoveryErrors,
      releases: results,
    };
    log(`matrix: ${tested.length}/${results.length} releases tested`);
    if (!only) await cleanupImages(releases);
  }
  await withOs(data);

  if (publish) {
    const name = publishDataset('matrix', month, data);
    log(`matrix: published ${name} (${data.releases.length} releases incl. OS)`);
  } else if (outFile) {
    writeFileSync(outFile, JSON.stringify(data, null, 2) + '\n');
    log(`matrix: wrote ${outFile}`);
  }
} catch (err) {
  log(`matrix: FAILED ${err.stack ?? err}`);
  if (publish && !refreshOs) {
    try { publishFailure('matrix', month, err.message ?? String(err)); } catch (e) { log(`matrix: could not record failure: ${e.message}`); }
  }
  process.exitCode = 1;
}
