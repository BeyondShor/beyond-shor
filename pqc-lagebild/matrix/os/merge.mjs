#!/usr/bin/env node
// Merge the per-runner results of the pqc-matrix-os workflow into os-matrix.json.
//
//   node pqc-lagebild/matrix/os/merge.mjs <dir-with-results> <out.json>

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const OS_SCHEMA = 'beyond-shor/os-matrix@1';

export function mergeResults(releases, { runId = null, runUrl = null, commit = null, now = new Date() } = {}) {
  const usable = releases
    .filter((r) => r && typeof r.id === 'string' && (r.distro === 'windows' || r.distro === 'macos'))
    .sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
  return {
    schema: OS_SCHEMA,
    generatedAt: now.toISOString(),
    workflow: { runId, url: runUrl, commit },
    releases: usable,
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir, out] = process.argv.slice(2);
  const releases = [];
  for (const f of readdirSync(dir, { recursive: true })) {
    if (!String(f).endsWith('.json')) continue;
    try {
      releases.push(JSON.parse(readFileSync(join(dir, String(f)), 'utf8')));
    } catch (err) {
      console.error(`skipping ${f}: ${err.message}`);
    }
  }
  const env = process.env;
  const runUrl = env.GITHUB_RUN_ID ? `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}` : null;
  const data = mergeResults(releases, { runId: env.GITHUB_RUN_ID ?? null, runUrl, commit: env.GITHUB_SHA ?? null });
  if (data.releases.length === 0) {
    console.error('no runner results — not writing os-matrix.json');
    process.exit(1);
  }
  writeFileSync(out, JSON.stringify(data, null, 2) + '\n');
  console.log(`wrote ${out}: ${data.releases.map((r) => r.id).join(', ')}`);
}
