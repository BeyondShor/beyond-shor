#!/usr/bin/env node
// Monthly PQC-Lagebild scan (A). Started by the pqscan-scan.timer user unit.
//
//   PQSCAN_DRY=1      measure and print the aggregate summary, publish nothing, keep no panel
//   PQSCAN_LIMIT=n    only the first n sites after shuffling (test runs)
//   PQSCAN_MONTH=…    override the month label (default: current UTC month)

import { closeSync, openSync, readFileSync, existsSync, unlinkSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { CONCURRENCY, LIMIT, MIN_CELL, PUBLIC_DIR, STATE_DIR, MEASURE_MAIL, MAIL_TOP, MAIL_PAUSE_MS } from '../lib/config.mjs';
import { log, mapPool, monthOf, previousMonth } from '../lib/util.mjs';
import { publishDataset, publishFailure } from '../lib/publish.mjs';
import { buildPopulation } from '../scan/lists/index.mjs';
import { loadHostingClassifier } from '../scan/asn.mjs';
import { loadPublicSuffixList } from '../lib/psl.mjs';
import { probeDomain, probeMailHost, BROWSER_GROUPS, PURE_GROUPS } from '../scan/probe.mjs';
import { toObservation, aggregate, trend, qualityGate } from '../scan/aggregate.mjs';
import { panelHasher, savePanel, loadPanel } from '../scan/panel.mjs';
import { loadOptOut } from './optout.mjs';

const DRY = process.env.PQSCAN_DRY === '1';
const LIST_ATTEMPTS = Number(process.env.PQSCAN_LIST_ATTEMPTS ?? 4);
const LIST_RETRY_MIN = Number(process.env.PQSCAN_LIST_RETRY_MIN ?? 20);
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

  // Public data services (Wikidata, QLever, Tranco) have bad hours. A transient failure must not cost
  // the month: retry the whole list build a few times with long pauses before giving up.
  let built;
  let sources;
  for (let attempt = 1; ; attempt++) {
    try {
      ({ records: built, sources } = await buildPopulation({ log }));
      break;
    } catch (err) {
      if (attempt >= LIST_ATTEMPTS) throw err;
      log(`building the population failed (${err.message}); attempt ${attempt + 1}/${LIST_ATTEMPTS} in ${LIST_RETRY_MIN} min`);
      await new Promise((r) => setTimeout(r, LIST_RETRY_MIN * 60_000));
    }
  }
  const hash = panelHasher();
  const optOut = loadOptOut();
  const all = optOut.size ? built.filter((r) => !optOut.has(hash(r.site))) : built;
  if (optOut.size) log(`opt-out: ${built.length - all.length} site(s) excluded`);
  let records = shuffle([...all]);
  if (LIMIT) records = records.slice(0, LIMIT);
  log(`population: ${all.length} sites${LIMIT ? `, limited to ${records.length}` : ''}`);

  const hosting = await loadHostingClassifier();
  const classifyIp = (ip) => hosting.classify(ip);
  const psl = await loadPublicSuffixList();
  const mxZoneOf = (h) => psl.registrableDomain(h);

  // Phase 1: web, DNSSEC and MX lookup per site
  const probes = new Array(records.length);
  let errors = 0;
  await mapPool(records, CONCURRENCY, async (rec, i) => {
    try {
      probes[i] = await probeDomain(rec, { classifyIp, mxZoneOf });
    } catch {
      errors++;
      probes[i] = { web: { reachable: false }, dnssec: { ok: false }, mail: { mx: false } };
    }
  }, (done, total) => log(`probed ${done}/${total}`));

  // Phase 2: STARTTLS of the largest mail providers, one after another. Bulk SMTP from VPS networks
  // gets throttled or refused within minutes, so only the top zones are measured — slowly, one
  // connection per provider per month — and the rest is reported as "not measured".
  let mailMeta = null;
  if (MEASURE_MAIL) {
    const zoneCount = new Map();
    for (const p of probes) {
      if (!p.mail?.mx) continue;
      const z = zoneCount.get(p.mail.mxZone) ?? { host: p.mail.mxHost, n: 0 };
      z.n++;
      zoneCount.set(p.mail.mxZone, z);
    }
    const top = [...zoneCount].sort((a, b) => b[1].n - a[1].n).slice(0, MAIL_TOP);
    log(`mail: ${zoneCount.size} MX zones, measuring the top ${top.length}`);
    const results = new Map();
    for (const [zone, { host }] of top) {
      results.set(zone, await probeMailHost(host).catch(() => ({ ok: false, error: 'error', errorClass: 'other' })));
      await new Promise((r) => setTimeout(r, MAIL_PAUSE_MS));
    }
    for (const p of probes) {
      if (p.mail?.mx) Object.assign(p.mail, results.get(p.mail.mxZone) ?? { ok: false, error: 'not-measured', errorClass: 'not-measured' });
    }
    const answered = [...results.values()].filter((r) => r.ok).length;
    const withMx = [...zoneCount.values()].reduce((a, z) => a + z.n, 0);
    const covered = top.reduce((a, [, z]) => a + z.n, 0);
    const answeredDomains = top.reduce((a, [zone, z]) => a + (results.get(zone)?.ok ? z.n : 0), 0);
    mailMeta = {
      zones: zoneCount.size, measured: top.length, answered, domainsWithMx: withMx, domainsCovered: covered, domainsAnswered: answeredDomains,
      // publish mail figures only if providers for at least half of the measured domains answered
      reliable: covered > 0 && answeredDomains / covered >= 0.5,
    };
    log(`mail: ${answered}/${top.length} providers answered, covering ${covered} of ${withMx} domains`);
  }

  const observations = new Array(records.length);
  const panel = new Map();
  records.forEach((rec, i) => {
    const o = toObservation(rec, probes[i]);
    observations[i] = o;
    panel.set(hash(rec.site), o);
  });
  records.length = 0; // drop the list as soon as it is no longer needed
  probes.length = 0;

  const { cells, providers, suppressed } = aggregate(observations, { minCell: MIN_CELL });
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
    mail: mailMeta,
    cells,
    providers,
    suppressedCells: suppressed,
    trend: trendResult ? { previousMonth: prevMonth, cells: trendResult.cells, suppressedCells: trendResult.suppressed } : null,
  };

  const problems = LIMIT || DRY ? [] : qualityGate({ observations, cells }, previous);
  const eu = cells.find((c) => c.view === 'eu' && c.region === 'EU' && c.category === 'all' && c.sector === null);
  const de = cells.find((c) => c.view === 'de' && c.region === 'DE' && c.category === 'all' && c.sector === null);
  const share = (c) => (c ? `${((c.web.pq / c.web.reachable) * 100).toFixed(1)} % PQ of ${c.web.reachable} reachable` : 'n/a');
  log(`EU: ${share(eu)} · DE: ${share(de)} · cells ${cells.length}, suppressed ${suppressed}, probe errors ${errors}`);

  if (DRY) {
    console.log(JSON.stringify({ population: dataset.population, eu, de, providers, cells: cells.length, suppressed }, null, 2));
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
