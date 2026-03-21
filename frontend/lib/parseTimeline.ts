import fs from 'fs';
import path from 'path';

export type TimelineCategory = 'HISTORY' | 'STANDARD' | 'HARDWARE' | 'REGULATION' | 'ESTIMATE';

export interface TimelineEvent {
  year: number;   // fractional year for x-position
  label: string;  // short display string e.g. "2024 (Aug)"
  title: string;
  category: TimelineCategory;
  desc: string;
  caveat?: string;
}

// Maps German month names (and shorthands) to a fractional year offset
const MONTH_FRACTION: Record<string, number> = {
  'Januar':   1  / 12,
  'Februar':  2  / 12,
  'März':     3  / 12,
  'April':    4  / 12,
  'Mai':      5  / 12,
  'Juni':     6  / 12,
  'Juli':     7  / 12,
  'August':   8  / 12,
  'September':9  / 12,
  'Oktober':  10 / 12,
  'November': 11 / 12,
  'Dezember': 11 / 12,
  'Ende':     11 / 12,
  '31.12.':   11 / 12,
};

// Short labels for the card display
const MONTH_SHORT: Record<string, string> = {
  'Januar': 'Jan', 'Februar': 'Feb', 'März': 'Mrz', 'April': 'Apr',
  'Mai': 'Mai', 'Juni': 'Jun', 'Juli': 'Jul', 'August': 'Aug',
  'September': 'Sep', 'Oktober': 'Okt', 'November': 'Nov',
  'Dezember': 'Dez', 'Ende': 'Dez', '31.12.': 'Dez',
};

const VALID_CATEGORIES = new Set<string>(['HISTORY', 'STANDARD', 'HARDWARE', 'REGULATION', 'ESTIMATE']);

function parseHeading(raw: string): { baseYear: number; fraction: number; label: string } {
  const approx = raw.startsWith('~');
  const clean = raw.replace(/^~/, '').trim();

  const match = clean.match(/^(\d{4})(?:\s*\(([^)]+)\))?$/);
  if (!match) {
    // Fallback: try parsing a plain number
    const n = parseFloat(clean);
    return { baseYear: isNaN(n) ? 2000 : n, fraction: 0, label: raw.trim() };
  }

  const baseYear = parseInt(match[1], 10);
  const qualifier = match[2]?.trim() ?? '';
  const fraction = MONTH_FRACTION[qualifier] ?? 0;

  let label: string;
  if (approx) {
    label = `~${baseYear}`;
  } else if (qualifier && MONTH_SHORT[qualifier]) {
    label = `${baseYear} (${MONTH_SHORT[qualifier]})`;
  } else {
    label = `${baseYear}`;
  }

  return { baseYear, fraction, label };
}

// Tries each candidate field name in order, returns the first match.
// Supports both German ("Titel") and English ("Title") field names.
function extractField(block: string, ...candidates: string[]): string | undefined {
  for (const field of candidates) {
    const re = new RegExp(`\\*\\*${field}:\\*\\*\\s*([\\s\\S]+?)(?=\\n\\*\\*|\\n###|$)`);
    const m = block.match(re);
    if (m) return m[1].trim().replace(/\s+/g, ' ');
  }
  return undefined;
}

export function parseTimeline(filePath?: string): TimelineEvent[] {
  const target = filePath ?? path.join(process.cwd(), 'data', 'timeline.md');
  const content = fs.readFileSync(target, 'utf-8');

  // Split on "---" separators (with surrounding newlines)
  const blocks = content.split(/\n---\n/);

  const events: TimelineEvent[] = [];
  // Track how many times we've seen each exact (baseYear + fraction) key,
  // so that duplicate year entries get a small visual offset.
  const yearCount: Record<string, number> = {};

  for (const block of blocks) {
    const headingMatch = block.match(/###\s+(.+)/);
    if (!headingMatch) continue;

    const title = extractField(block, 'Titel', 'Title');
    const categoryRaw = extractField(block, 'Kategorie', 'Category');
    const desc = extractField(block, 'Beschreibung', 'Description');

    // Skip blocks that are not proper event entries
    if (!title || !categoryRaw || !desc) continue;
    if (!VALID_CATEGORIES.has(categoryRaw)) continue;

    const { baseYear, fraction, label } = parseHeading(headingMatch[1].trim());
    const caveat = extractField(block, 'Caveat'); // same in both languages

    // Deduplicate: give same-year-same-fraction entries a small offset
    const key = `${baseYear}-${fraction.toFixed(4)}`;
    const count = yearCount[key] ?? 0;
    yearCount[key] = count + 1;

    events.push({
      year:     baseYear + fraction + count * 0.15,
      label,
      title,
      category: categoryRaw as TimelineCategory,
      desc,
      caveat,
    });
  }

  return events;
}
