// Paths and tunables. Everything that differs between the scanner host and a laptop
// test run comes from the environment, so the code itself never needs editing.

import { join } from 'node:path';

const env = process.env;

export const STATE_DIR = env.PQSCAN_STATE ?? '/var/lib/pqscan';
export const PUBLIC_DIR = env.PQSCAN_PUBLIC ?? '/srv/pqscan-public';
export const KEY_DIR = join(STATE_DIR, 'keys');
export const CACHE_DIR = join(STATE_DIR, 'cache');
export const PANEL_DIR = join(STATE_DIR, 'panel');
export const LOG_DIR = join(STATE_DIR, 'logs');

export const SIGNING_KEY = env.PQSCAN_SIGNING_KEY ?? join(KEY_DIR, 'dataset-ml-dsa-65.key');
export const PANEL_KEY = env.PQSCAN_PANEL_KEY ?? join(KEY_DIR, 'panel-hmac.key');

// Local recursive resolver installed by setup-pqscan.sh (never the shared system resolver).
export const DNS_SERVER = env.PQSCAN_DNS ?? '127.0.0.1:5335';

export const CONCURRENCY = Number(env.PQSCAN_CONCURRENCY ?? 64);
export const TIMEOUT_MS = Number(env.PQSCAN_TIMEOUT_MS ?? 8000);
// Smallest group we ever publish a number for. Smaller groups are folded into their parent.
export const MIN_CELL = Number(env.PQSCAN_MIN_CELL ?? 30);
// Mail-server STARTTLS measurement (PQSCAN_MAIL=0 switches it off). Some providers refuse or ignore
// connections from VPS networks; the dataset reports that coverage per provider instead of hiding it.
export const MEASURE_MAIL = env.PQSCAN_MAIL !== '0';
// Mail: how many of the largest MX zones are measured, and the pause between two of them.
export const MAIL_TOP = Number(env.PQSCAN_MAIL_TOP ?? 60);
export const MAIL_PAUSE_MS = Number(env.PQSCAN_MAIL_PAUSE_MS ?? 2000);
// Optional cap for test runs (0 = no cap).
export const LIMIT = Number(env.PQSCAN_LIMIT ?? 0);

// Identifies requests to public data services (Wikidata, Tranco, …). Wikimedia's policy asks
// for a way to reach the operator; the project page is that way — no personal address.
export const USER_AGENT = 'BeyondShor-PQC-Lagebild/1.0 (+https://beyond-shor.eu/de/pqc-lagebild/methodik)';

// EU member states (ISO 3166-1 alpha-2) and their ccTLDs. Greece uses .gr, not .el.
export const EU_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
];
export const CCTLD_TO_COUNTRY = Object.fromEntries(EU_COUNTRIES.map((c) => [c.toLowerCase(), c]));
