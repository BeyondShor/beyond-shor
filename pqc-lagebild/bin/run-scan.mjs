#!/usr/bin/env node
// Monthly PQC-Lagebild scan (A). Started by the pqscan-scan.timer user unit.
//
//   PQSCAN_DRY=1      measure and print the aggregate summary, publish nothing, keep no panel
//   PQSCAN_LIMIT=n    only the first n sites after shuffling (test runs)
//   PQSCAN_MONTH=…    override the month label (default: current UTC month)

import { closeSync, openSync, readFileSync, existsSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { CONCURRENCY, LIMIT, MIN_CELL, PUBLIC_DIR, STATE_DIR, MEASURE_MAIL } from '../lib/config.mjs';
import { log, mapPool, monthOf, previousMonth } from '../lib/util.mjs';
import { publishDataset, publishFailure } from '../lib/publish.mjs';
import { buildPopulation } from '../scan/lists/index.mjs';
import { loadHostingClassifier } from '../scan/asn.mjs';
import { probeDomain, BROWSER_GROUPS, PURE_GROUPS } from '../scan/probe.mjs';
import { toObservation, aggregate, trend, qualityGate } from '../scan/aggregate.mjs';
import { panelHasher, savePanel, loadPanel } from '../scan/panel.mjs';
import { loadOptOut } from './optout.mjs';

const DRY = process.env.PQSCAN_DRY === '1';
const month = process.env.PQSCAN_MONTH ?? monthOf();

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// One run at a time (a manual start while the timer fires would double the load).
const lockPath = join(STATE_DIR, 'scan.lock');
let lockFd;
if (existsSync(lockPath)) {
  // a lock left behind by a killed run must not block every later month
  const pid = Number(readFileSync(lockPath, 'utf8'));
  let alive = false;
  try { process.kill(pid, 0); alive = true; } catch { /* not running */ }
  if (!alive) unlinkSync(lockPath);
}
try {
  lockFd = openSync(lockPath, 'wx');
  writeSync(lockFd, String(process.pid));
} catch {
  console.error(`another scan holds ${lockPath}; exiting`);
  process.exit(2);
}
const releaseLock = () => { try { closeSync(lockFd); unlinkSync(lockPath); } catch { /* gone */ } };
process.on('exit', releaseLock);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => process.exit(130));

async function main() {
  const startedAt = new Date();
  log(`scan ${month} starting${DRY ? ' (dry run)' : ''}, concurrency ${CONCURRENCY}`);

  const { records: built, sources } = await buildPopulation({ log });
  const hash = panelHasher();
  const optOut = loadOptOut();
  const all = optOut.size ? built.filter((r) => !optOut.has(hash(r.site))) : built;
  if (optOut.size) log(`opt-out: ${built.length - all.length} site(s) excluded`);
  let records = shuffle([...all]);
  if (LIMIT) records = records.slice(0, LIMIT);
  log(`population: ${all.length} sites${LIMIT ? `, limited to ${records.length}` : ''}`);

  const hosting = await loadHostingClassifier();
  const classifyIp = (ip) => hosting.classify(ip);

  const observations = new Array(records.length);
  const panel = new Map();
  let errors = 0;
  await mapPool(records, CONCURRENCY, async (rec, i) => {
    let probe;
    try {
      probe = await probeDomain(rec, { classifyIp });
    } catch {
      errors++;
      probe = { web: { reachable: false }, dnssec: { ok: false }, mail: { mx: false } };
    }
    const o = toObservation(rec, probe);
    observations[i] = o;
    panel.set(hash(rec.site), o);
  }, (done, total) => log(`probed ${done}/${total}`));
  records.length = 0; // drop the list as soon as it is no longer needed

  const { cells, suppressed } = aggregate(observations, { minCell: MIN_CELL });
  const prevMonth = previousMonth(month);
  const prevPanel = loadPanel(prevMonth);
  const trendResult = prevPanel ? trend(prevPanel, panel, { minCell: MIN_CELL }) : null;

  const prevPath = join(PUBLIC_DIR, `lagebild-${prevMonth}.json`);
  const previous = existsSync(prevPath) ? JSON.parse(readFileSync(prevPath, 'utf8')) : null;

  const byCategory = {};
  for (const o of observations) byCategory[o.category] = (byCategory[o.category] ?? 0) + 1;
  const finishedAt = new Date();
  const dataset = {
    schema: 'beyond-shor/pqc-lagebild@1',
    month,
    generatedAt: finishedAt.toISOString(),
    scan: {
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationSec: Math.round((finishedAt - startedAt) / 1000),
      concurrency: CONCURRENCY,
      node: process.version,
      openssl: process.versions.openssl,
      offeredGroups: { browserLike: BROWSER_GROUPS, pureMlKem: PURE_GROUPS },
      probeErrors: errors,
      mail: MEASURE_MAIL,
    },
    sources,
    minCell: MIN_CELL,
    population: {
      total: observations.length,
      reachable: observations.filter((o) => o.reachable).length,
      byCategory,
      euView: observations.filter((o) => o.uniform).length,
      deView: observations.filter((o) => o.country === 'DE').length,
    },
    cells,
    suppressedCells: suppressed,
    trend: trendResult ? { previousMonth: prevMonth, cells: trendResult.cells, suppressedCells: trendResult.suppressed } : null,
  };

  const problems = LIMIT || DRY ? [] : qualityGate({ observations, cells }, previous);
  const eu = cells.find((c) => c.view === 'eu' && c.region === 'EU' && c.category === 'all' && c.sector === null);
  const de = cells.find((c) => c.view === 'de' && c.region === 'DE' && c.category === 'all' && c.sector === null);
  const share = (c) => (c ? `${((c.web.pq / c.web.reachable) * 100).toFixed(1)} % PQ of ${c.web.reachable} reachable` : 'n/a');
  log(`EU: ${share(eu)} · DE: ${share(de)} · cells ${cells.length}, suppressed ${suppressed}, probe errors ${errors}`);

  if (DRY) {
    console.log(JSON.stringify({ population: dataset.population, eu, de, cells: cells.length, suppressed }, null, 2));
    return;
  }
  if (problems.length) {
    publishFailure('lagebild', month, problems.join('; '));
    throw new Error(`quality gate failed: ${problems.join('; ')}`);
  }
  const name = publishDataset('lagebild', month, dataset);
  savePanel(month, panel);
  log(`published ${name} in ${dataset.scan.durationSec} s`);
}

main().catch((err) => {
  log(`scan failed: ${err.stack ?? err}`);
  if (!DRY) {
    try { publishFailure('lagebild', month, err.message); } catch { /* key or dir missing */ }
  }
  process.exit(1);
});
