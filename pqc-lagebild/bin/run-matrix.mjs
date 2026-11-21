#!/usr/bin/env node
// B — "Software ab Werk": test the defaults of all supported distribution releases
// and publish the signed matrix for the current month.
//
//   node bin/run-matrix.mjs                 # all releases, publish
//   node bin/run-matrix.mjs --only debian-13,ubuntu-24.04 --no-publish --out /tmp/m.json

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATE_DIR } from '../lib/config.mjs';
import { log, monthOf } from '../lib/util.mjs';
import { publishDataset, publishFailure } from '../lib/publish.mjs';
import { discoverReleases } from '../matrix/releases.mjs';
import { runMatrix, runnerInfo, cleanupImages } from '../matrix/run.mjs';

const args = process.argv.slice(2);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;
const publish = !args.includes('--no-publish');
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const month = monthOf();

try {
  let releases = await discoverReleases();
  if (only) releases = releases.filter((r) => only.includes(r.id));
  log(`matrix: ${releases.length} releases: ${releases.map((r) => r.id).join(', ')}`);
  const started = Date.now();
  const results = await runMatrix(releases, { workRoot: join(STATE_DIR, 'matrix-work'), concurrency: Number(process.env.PQSCAN_MATRIX_CONCURRENCY ?? 2) });
  const tested = results.filter((r) => Object.keys(r.results).length > 0);
  const data = {
    schema: 'beyond-shor/software-matrix@1',
    month,
    generatedAt: new Date().toISOString(),
    durationSec: Math.round((Date.now() - started) / 1000),
    runner: await runnerInfo(),
    method: {
      serverProbe: 'Node.js/OpenSSL client offering key shares for X25519MLKEM768 and X25519 (like current browsers), then X25519MLKEM768 alone',
      clientProbe: 'first ClientHello recorded by a sink: a post-quantum key share means PQ by default',
      ssh: 'effective defaults from sshd -T and ssh -G; PQ means the preferred key exchange is post-quantum',
      changes: 'only a certificate and non-colliding ports are configured; groups, ciphers and protocol versions stay at the distribution defaults',
    },
    releases: results,
  };
  if (tested.length === 0) throw new Error(`no release could be tested (${results.flatMap((r) => r.errors).slice(0, 3).join(' | ')})`);
  if (publish) {
    const name = publishDataset('matrix', month, data);
    log(`matrix: published ${name} (${tested.length}/${results.length} releases tested)`);
  } else if (outFile) {
    writeFileSync(outFile, JSON.stringify(data, null, 2) + '\n');
    log(`matrix: wrote ${outFile}`);
  }
  if (!only) await cleanupImages(releases);
} catch (err) {
  log(`matrix: FAILED ${err.stack ?? err}`);
  if (publish) {
    try { publishFailure('matrix', month, err.message ?? String(err)); } catch (e) { log(`matrix: could not record failure: ${e.message}`); }
  }
  process.exitCode = 1;
}
