#!/usr/bin/env node
// Exclude a website from all future measurements. Only its keyed hash is stored
// (same HMAC as the panel), so the opt-out list does not reveal who asked.
//
//   sudo -u pqscan /opt/pqscan/node/bin/node /opt/pqscan/app/bin/optout.mjs add example.de

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { STATE_DIR } from '../lib/config.mjs';
import { normalizeHost } from '../lib/psl.mjs';
import { panelHasher } from '../scan/panel.mjs';

export const OPTOUT_FILE = join(STATE_DIR, 'optout.hmac');

export function loadOptOut() {
  if (!existsSync(OPTOUT_FILE)) return new Set();
  return new Set(readFileSync(OPTOUT_FILE, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean));
}

if (import.meta.url.endsWith(process.argv[1]?.split('/').pop() ?? '')) {
  const [cmd, name] = process.argv.slice(2);
  const site = normalizeHost(name)?.replace(/^www\./, '');
  if (cmd !== 'add' || !site) {
    console.error('usage: optout.mjs add <domain>');
    process.exit(1);
  }
  const h = panelHasher()(site);
  if (loadOptOut().has(h)) console.log(`${site} is already excluded`);
  else {
    appendFileSync(OPTOUT_FILE, h + '\n', { mode: 0o600 });
    console.log(`${site} excluded from future measurements`);
  }
}
