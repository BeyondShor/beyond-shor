// German-only sources (uniform: false — they deepen the German view and are not counted in the
// EU comparison, where every country must be measured the same way).
//
// german-gov-domains (https://github.com/robbi5/german-gov-domains, CC0 1.0): domains of federal
// agencies and of municipalities, scraped from the federal agency directory on bund.de and other
// public sources. The data has not been updated since October 2022; dead domains simply fail the
// probe and are counted as unreachable, they do not distort the PQ shares of reachable sites.
//
// Other candidates (HRK Hochschulkompass, BaFin company database, GKV list of health insurers) were
// left out: no clear open licence for automated reuse. Wikidata covers these groups instead.

import { fetchRetry, log as defaultLog } from '../../lib/util.mjs';
import { siteFromUrl, isPlatform } from './normalize.mjs';

const GOV_DOMAINS_CSV = 'https://raw.githubusercontent.com/robbi5/german-gov-domains/master/data/domains.csv';

/** Minimal RFC 4180 CSV parser (quoted fields, embedded commas/quotes/newlines). */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const TYPE_TO_SECTOR = { 'Federal Agency': 'government', City: 'municipality' };

export function govDomainsToRecords(csvText, psl) {
  const [header, ...rows] = parseCsv(csvText);
  const iDomain = header.indexOf('Domain Name');
  const iType = header.indexOf('Domain Type');
  if (iDomain === -1 || iType === -1) throw new Error('german-gov-domains: unexpected CSV header');
  const records = [];
  const seen = new Set();
  const dropped = { invalid: 0, platform: 0, unknownType: 0, duplicate: 0 };
  for (const r of rows) {
    const sector = TYPE_TO_SECTOR[r[iType]];
    if (!sector) { dropped.unknownType++; continue; }
    const s = siteFromUrl(r[iDomain], psl);
    if (!s) { dropped.invalid++; continue; }
    if (isPlatform(s.site, s.zone)) { dropped.platform++; continue; }
    if (seen.has(s.site)) { dropped.duplicate++; continue; }
    seen.add(s.site);
    records.push({ ...s, country: 'DE', category: 'institutions', sector, uniform: false, source: 'german-gov-domains' });
  }
  return { records, dropped };
}

export async function fetchGermanSources({ psl, log = defaultLog } = {}) {
  const text = await (await fetchRetry(GOV_DOMAINS_CSV, { timeoutMs: 120_000 })).text();
  const { records, dropped } = govDomainsToRecords(text, psl);
  if (records.length < 1000) throw new Error(`german-gov-domains: only ${records.length} usable domains`);
  log(`german-gov-domains: ${records.length} domains`);
  return {
    records,
    source: {
      id: 'german-gov-domains',
      label: 'german-gov-domains (robbi5)',
      license: 'CC0 1.0',
      url: 'https://github.com/robbi5/german-gov-domains',
      fetchedAt: new Date().toISOString(),
      count: records.length,
    },
    stats: { dropped },
  };
}
