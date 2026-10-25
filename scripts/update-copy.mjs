/**
 * update-copy.mjs
 *
 * Writes the copy from scripts/content/site-copy.mjs into Strapi:
 *   - Playground page (DE/EN): descriptions of the encryption "real world" items,
 *     matched by name (names and links are kept as they are)
 *
 * Usage:
 *   STRAPI_API_TOKEN=$(grep STRAPI_SIGN_TOKEN .env | cut -d= -f2) node scripts/update-copy.mjs [--dry-run]
 *
 *   STRAPI_URL defaults to http://localhost:1337 — for production, open the SSH tunnel first.
 *   --dry-run   print old → new without writing anything
 */

import { REAL_WORLD } from './content/site-copy.mjs';

const STRAPI_URL = process.env.STRAPI_URL ?? 'http://localhost:1337';
const API_TOKEN  = process.env.STRAPI_API_TOKEN;
const DRY_RUN    = process.argv.includes('--dry-run');
const LOCALES    = ['de', 'en'];

if (!API_TOKEN) {
  console.error('Error: STRAPI_API_TOKEN environment variable is required.');
  process.exit(1);
}

const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${API_TOKEN}`,
};

async function api(method, path, body) {
  const res = await fetch(`${STRAPI_URL}/api/${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify({ data: body }) : undefined,
  });
  if (!res.ok) throw new Error(`${method} /api/${path} failed ${res.status}: ${await res.text()}`);
  return res.json();
}

function preview(text) {
  const flat = String(text ?? '').replace(/\s+/g, ' ');
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
}

async function updatePlayground(locale) {
  const { data } = await api('GET', `playground-page?locale=${locale}&populate[0]=realWorldItems&populate[1]=sigRealWorldItems`);
  const copy = REAL_WORLD[locale];
  const strip = ({ id: _id, ...rest }) => rest;

  console.log(`\nplayground-page [${locale}]`);
  const realWorldItems = data.realWorldItems.map((item) => {
    const next = copy[item.name];
    if (!next) {
      console.log(`  ${item.name}: no new copy, kept`);
      return strip(item);
    }
    console.log(`  ${item.name}: ${preview(item.description)}\n      → ${preview(next)}`);
    return { ...strip(item), description: next };
  });
  const missing = Object.keys(copy).filter((name) => !data.realWorldItems.some((i) => i.name === name));
  if (missing.length) console.log(`  not in Strapi (skipped): ${missing.join(', ')}`);
  if (DRY_RUN) return;

  await api('PUT', `playground-page?locale=${locale}`, {
    realWorldItems,
    sigRealWorldItems: (data.sigRealWorldItems ?? []).map(strip),
  });
  console.log('  ✓ written');
}

async function main() {
  console.log(`Strapi: ${STRAPI_URL}${DRY_RUN ? '  (dry run)' : ''}`);
  for (const locale of LOCALES) {
    await updatePlayground(locale);
  }
  console.log(DRY_RUN ? '\nDry run — nothing written.' : '\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
