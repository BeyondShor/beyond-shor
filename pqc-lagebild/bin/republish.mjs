#!/usr/bin/env node
// Re-apply the current publication policy to an already published month, without measuring again:
// keep only named commercial providers, merge mail entries under their display names, and decide
// mail reliability by domains (not by provider count). Re-signs and updates the index.
//
//   sudo -u pqscan /opt/pqscan/node/bin/node /opt/pqscan/app/bin/republish.mjs 2026-11

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PUBLIC_DIR } from '../lib/config.mjs';
import { publishDataset } from '../lib/publish.mjs';
import { log } from '../lib/util.mjs';
import { KNOWN_PROVIDERS } from '../scan/asn.mjs';
import { KNOWN_MAIL_PROVIDERS, mailProviderName } from '../scan/aggregate.mjs';

const month = process.argv[2];
if (!/^\d{4}-\d{2}$/.test(month ?? '')) { console.error('usage: republish.mjs YYYY-MM'); process.exit(1); }
const ds = JSON.parse(readFileSync(join(PUBLIC_DIR, `lagebild-${month}.json`), 'utf8'));

for (const p of ds.providers ?? []) {
  p.web = p.web.filter((e) => KNOWN_PROVIDERS.has(e.name));
  const merged = new Map();
  for (const e of p.mail) {
    const name = KNOWN_MAIL_PROVIDERS.has(e.name) ? e.name : mailProviderName(e.name);
    if (!name) continue;
    const m = merged.get(name) ?? { name, n: 0, answered: 0, tls: 0, pq: 0, group: null, errors: {} };
    m.n += e.n; m.answered += e.answered; m.tls += e.tls; m.pq += e.pq; m.group ??= e.group;
    for (const [k, v] of Object.entries(e.errors ?? {})) m.errors[k] = (m.errors[k] ?? 0) + v;
    merged.set(name, m);
  }
  p.mail = [...merged.values()].sort((a, b) => b.n - a.n);
}

if (ds.mail) {
  const eu = ds.cells.find((c) => c.view === 'eu' && c.region === 'EU' && c.category === 'all' && c.sector === null);
  const measured = eu?.mail ? eu.mail.withMx - (eu.mail.errors?.['not-measured'] ?? 0) : 0;
  ds.mail.domainsAnswered = eu?.mail?.answered ?? 0;
  ds.mail.reliable = measured > 0 && ds.mail.domainsAnswered / measured >= 0.5;
}
ds.republishedAt = new Date().toISOString();
log(`republishing ${month}: mail reliable=${ds.mail?.reliable}`);
publishDataset('lagebild', month, ds);
log('done');
