#!/usr/bin/env node
// Blog server (F): turn nginx's pqc-tls.log (one line per TLS connection, no IP/URL/UA —
// see /etc/nginx/conf.d/pqc-lagebild-tls.conf) into daily counts and a monthly summary.
// Idempotent: each finished UTC day is counted once and kept as a tiny JSON file, so log
// rotation (14 days) never loses a month.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { writeAtomic, canonicalJson } from '../lib/util.mjs';

const LOG_DIR = process.env.PQC_TLS_LOG_DIR ?? '/var/log/nginx';
const DATA_DIR = process.env.PQC_LAGEBILD_DIR ?? '/var/lib/beyond-shor/pqc-lagebild';
const DAILY = join(DATA_DIR, 'visitors', 'daily');

// nginx prints names for known groups and 0x… for others; cover both.
export const PQ_GROUPS = new Set([
  'X25519MLKEM768', 'SecP256r1MLKEM768', 'SecP384r1MLKEM1024', 'MLKEM512', 'MLKEM768', 'MLKEM1024',
  '0x11ec', '0x11eb', '0x11ed', '0x0200', '0x0201', '0x0202', '0x200', '0x201', '0x202',
]);
const ALIASES = { '0x11ec': 'X25519MLKEM768', '0x11eb': 'SecP256r1MLKEM768', '0x11ed': 'SecP384r1MLKEM1024' };

export function parseLine(line) {
  const [ts, protocol, curve, client] = line.trim().split(' ');
  if (!ts || !/^\d{4}-\d{2}-\d{2}T/.test(ts) || !client) return null;
  const date = new Date(ts).toISOString().slice(0, 10); // UTC day
  const group = curve === '-' || !curve ? 'none' : (ALIASES[curve.toLowerCase()] ?? curve);
  return { date, protocol, group, pq: PQ_GROUPS.has(curve) || PQ_GROUPS.has(group), client: client === 'bot' ? 'bot' : 'browser' };
}

function readLogs() {
  if (!existsSync(LOG_DIR)) return [];
  const files = readdirSync(LOG_DIR).filter((f) => /^pqc-tls\.log(\.\d+)?(\.gz)?$/.test(f));
  const lines = [];
  for (const f of files) {
    let buf = readFileSync(join(LOG_DIR, f));
    if (f.endsWith('.gz')) buf = gunzipSync(buf);
    for (const l of buf.toString('utf8').split('\n')) if (l) lines.push(l);
  }
  return lines;
}

const emptySide = () => ({ connections: 0, pq: 0, tls13: 0, groups: {} });

export function countDays(lines) {
  const days = {};
  for (const line of lines) {
    const r = parseLine(line);
    if (!r) continue;
    const d = (days[r.date] ??= { date: r.date, browser: emptySide(), bot: emptySide() });
    const side = d[r.client];
    side.connections++;
    if (r.pq) side.pq++;
    if (r.protocol === 'TLSv1.3') side.tls13++;
    side.groups[r.group] = (side.groups[r.group] ?? 0) + 1;
  }
  return days;
}

export function summarize(dailyList) {
  const months = {};
  for (const d of dailyList) {
    const m = (months[d.date.slice(0, 7)] ??= { month: d.date.slice(0, 7), days: 0, browser: emptySide(), bot: emptySide() });
    m.days++;
    for (const k of ['browser', 'bot']) {
      m[k].connections += d[k].connections;
      m[k].pq += d[k].pq;
      m[k].tls13 += d[k].tls13;
      for (const [g, n] of Object.entries(d[k].groups)) m[k].groups[g] = (m[k].groups[g] ?? 0) + n;
    }
  }
  return Object.values(months).sort((a, b) => a.month.localeCompare(b.month));
}

function main() {
  const today = new Date().toISOString().slice(0, 10);
  const days = countDays(readLogs());
  let added = 0;
  for (const [date, d] of Object.entries(days)) {
    if (date >= today) continue; // only finished days
    const p = join(DAILY, `${date}.json`);
    if (existsSync(p)) continue;
    writeAtomic(p, canonicalJson(d), 0o644);
    added++;
  }
  const dailyList = existsSync(DAILY)
    ? readdirSync(DAILY).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().map((f) => JSON.parse(readFileSync(join(DAILY, f), 'utf8')))
    : [];
  const summary = {
    schema: 'beyond-shor/pqc-lagebild-visitors@1',
    updatedAt: new Date().toISOString(),
    firstDay: dailyList[0]?.date ?? null,
    lastDay: dailyList.at(-1)?.date ?? null,
    months: summarize(dailyList),
  };
  writeAtomic(join(DATA_DIR, 'visitors.json'), canonicalJson(summary), 0o644);
  console.log(`${new Date().toISOString()} visitor stats: ${added} new day(s), ${dailyList.length} day(s) total`);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
