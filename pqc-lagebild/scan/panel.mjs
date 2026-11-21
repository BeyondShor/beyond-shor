// Month-over-month panel without storing domains: each site is kept as a keyed hash
// (HMAC-SHA-256 with a secret that never leaves /var/lib/pqscan/keys), truncated to 128 bits.
// A plain hash would be useless here — anyone can hash the public Tranco list and match it.

import { createHmac } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { PANEL_DIR, PANEL_KEY } from '../lib/config.mjs';
import { writeAtomic } from '../lib/util.mjs';

const KEEP_MONTHS = 2; // only the previous month is ever needed

export function panelHasher() {
  const key = Buffer.from(readFileSync(PANEL_KEY, 'utf8').trim(), 'hex');
  if (key.length < 32) throw new Error('panel key too short');
  return (site) => createHmac('sha256', key).update(site).digest('hex').slice(0, 32);
}

// Compact form: only what the trend needs.
const pack = (o) => [o.country ?? '', o.category, o.uniform ? 1 : 0, o.reachable ? 1 : 0, o.pq ? 1 : 0, o.euCategory ?? o.category];
const unpack = ([country, category, uniform, reachable, pq, euCategory]) => ({
  country: country || null, category, euCategory: euCategory ?? category, uniform: !!uniform, reachable: !!reachable, pq: !!pq,
});

export function savePanel(month, map) {
  const obj = {};
  for (const [h, o] of map) obj[h] = pack(o);
  writeAtomic(join(PANEL_DIR, `${month}.json.gz`), gzipSync(JSON.stringify(obj)), 0o600);
  // prune
  const files = readdirSync(PANEL_DIR).filter((f) => /^\d{4}-\d{2}\.json\.gz$/.test(f)).sort();
  for (const f of files.slice(0, Math.max(0, files.length - KEEP_MONTHS))) unlinkSync(join(PANEL_DIR, f));
}

export function loadPanel(month) {
  const p = join(PANEL_DIR, `${month}.json.gz`);
  if (!existsSync(p)) return null;
  const obj = JSON.parse(gunzipSync(readFileSync(p)).toString('utf8'));
  return new Map(Object.entries(obj).map(([h, v]) => [h, unpack(v)]));
}
