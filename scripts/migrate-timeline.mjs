/**
 * migrate-timeline.mjs
 *
 * Migrates timeline events from local markdown files into the Strapi
 * timeline-event collection type. Requires Strapi to be running.
 *
 * Usage:
 *   STRAPI_API_TOKEN=$(grep STRAPI_SIGN_TOKEN .env | cut -d= -f2) node scripts/migrate-timeline.mjs
 *
 * Reads:
 *   frontend/data/timeline_de.md  (default locale — DE title/description/caveat + shared fields)
 *   frontend/data/timeline_en.md  (English localisation — EN title/description/caveat only)
 *
 * Notes:
 *  - Strapi must be running (default: http://localhost:1337)
 *  - Requires STRAPI_API_TOKEN with full-access permissions
 *  - Will create duplicates if re-run — delete all entries first
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');

const STRAPI_URL = process.env.STRAPI_URL       ?? 'http://localhost:1337';
const API_TOKEN  = process.env.STRAPI_API_TOKEN;

if (!API_TOKEN) {
  console.error('Error: STRAPI_API_TOKEN environment variable is required.');
  process.exit(1);
}

const HEADERS = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${API_TOKEN}`,
};

// ─── Month name → ENUM value ──────────────────────────────────────────────────

const MONTH_ENUM_DE = {
  'Januar':    'JANUARY',  'Februar':   'FEBRUARY', 'März':    'MARCH',
  'April':     'APRIL',    'Mai':       'MAY',       'Juni':    'JUNE',
  'Juli':      'JULY',     'August':    'AUGUST',    'September': 'SEPTEMBER',
  'Oktober':   'OCTOBER',  'November':  'NOVEMBER',
  'Dezember':  'DECEMBER', 'Ende':      'DECEMBER',  '31.12.':  'DECEMBER',
};

const MONTH_ENUM_EN = {
  'January':   'JANUARY',  'February':  'FEBRUARY', 'March':   'MARCH',
  'April':     'APRIL',    'May':       'MAY',       'June':    'JUNE',
  'July':      'JULY',     'August':    'AUGUST',    'September': 'SEPTEMBER',
  'October':   'OCTOBER',  'November':  'NOVEMBER',
  'December':  'DECEMBER', 'Late':      'DECEMBER',  '31 Dec':  'DECEMBER',
};

const VALID_CATEGORIES = new Set(['HISTORY', 'STANDARD', 'HARDWARE', 'REGULATION', 'ESTIMATE']);

// ─── Markdown parser ──────────────────────────────────────────────────────────

function extractField(block, ...candidates) {
  for (const field of candidates) {
    const re = new RegExp(`\\*\\*${field}:\\*\\*\\s*([\\s\\S]+?)(?=\\n\\*\\*|\\n###|$)`);
    const m = block.match(re);
    if (m) return m[1].trim().replace(/\s+/g, ' ');
  }
  return undefined;
}

function parseHeading(raw, monthEnumMap) {
  const isApproximate = raw.startsWith('~');
  const clean = raw.replace(/^~/, '').trim();
  const match = clean.match(/^(\d{4})(?:\s*\(([^)]+)\))?$/);
  if (!match) {
    const n = parseFloat(clean);
    return { year: isNaN(n) ? 2000 : Math.round(n), month: null, isApproximate };
  }
  const year      = parseInt(match[1], 10);
  const qualifier = match[2]?.trim() ?? '';
  const month     = qualifier ? (monthEnumMap[qualifier] ?? null) : null;
  return { year, month, isApproximate };
}

function parseMarkdown(filePath, locale) {
  const content    = fs.readFileSync(filePath, 'utf-8');
  const blocks     = content.split(/\n---\n/);
  const monthEnumMap = locale === 'en' ? MONTH_ENUM_EN : MONTH_ENUM_DE;

  const events = [];

  for (const block of blocks) {
    const headingMatch = block.match(/###\s+(.+)/);
    if (!headingMatch) continue;

    const title    = extractField(block, 'Titel', 'Title');
    const catRaw   = extractField(block, 'Kategorie', 'Category');
    const desc     = extractField(block, 'Beschreibung', 'Description');
    if (!title || !catRaw || !desc) continue;
    if (!VALID_CATEGORIES.has(catRaw)) continue;

    const { year, month, isApproximate } = parseHeading(headingMatch[1].trim(), monthEnumMap);
    const caveat = extractField(block, 'Caveat') ?? null;

    events.push({ title, year, month, isApproximate, category: catRaw, description: desc, caveat });
  }
  return events;
}

// ─── Strapi API helpers ───────────────────────────────────────────────────────

async function createEntry(data) {
  const res = await fetch(`${STRAPI_URL}/api/timeline-events`, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({ data }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST /api/timeline-events failed ${res.status}: ${text}`);
  }
  return res.json();
}

// Strapi 5: localizations via PUT /:documentId?locale=<locale>
async function addLocalisation(documentId, locale, localizedFields) {
  const res = await fetch(`${STRAPI_URL}/api/timeline-events/${documentId}?locale=${locale}`, {
    method: 'PUT',
    headers: HEADERS,
    body: JSON.stringify({ data: localizedFields }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PUT /${documentId}?locale=${locale} failed ${res.status}: ${text}`);
  }
  return res.json();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const deFile = path.join(ROOT, 'frontend', 'data', 'timeline_de.md');
  const enFile = path.join(ROOT, 'frontend', 'data', 'timeline_en.md');

  console.log('Parsing German timeline…');
  const deEvents = parseMarkdown(deFile, 'de');
  console.log(`  Found ${deEvents.length} entries`);

  console.log('Parsing English timeline…');
  const enEvents = parseMarkdown(enFile, 'en');
  console.log(`  Found ${enEvents.length} entries`);

  if (deEvents.length !== enEvents.length) {
    console.warn(`Warning: DE (${deEvents.length}) and EN (${enEvents.length}) counts differ.`);
  }

  console.log('\nMigrating to Strapi…');
  let ok = 0, failed = 0;

  for (let i = 0; i < deEvents.length; i++) {
    const de = deEvents[i];
    const en = enEvents[i];

    try {
      // 1. Create German entry (includes shared non-i18n fields: year, month, isApproximate, category)
      const created    = await createEntry({ ...de, locale: 'de' });
      const documentId = created.data.documentId;

      // 2. Add English localisation (only the i18n fields: title, description, caveat)
      if (en) {
        await addLocalisation(documentId, 'en', {
          title:       en.title,
          description: en.description,
          caveat:      en.caveat,
        });
      }

      const monthLabel = de.month ? ` (${de.month})` : '';
      console.log(`  [${i + 1}/${deEvents.length}] ✓  ${de.year}${de.isApproximate ? '~' : ''}${monthLabel} — ${de.title}`);
      ok++;
    } catch (err) {
      console.error(`  [${i + 1}/${deEvents.length}] ✗  ${de.year} — ${de.title}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\nDone. ${ok} migrated, ${failed} failed.`);
  if (failed === 0) {
    console.log('\nReminder: if you re-run this script, delete all existing entries first to avoid duplicates.');
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
