// Tranco top-1M (https://tranco-list.eu, Le Pochat et al., NDSS 2019): the "other websites"
// population — every domain under an EU ccTLD or .eu. The list ID is recorded so a run can be
// reproduced; Tranco asks users to cite it.
//
// Country comes from the ccTLD. .eu domains have no country: they count in the EU-wide totals
// only (country null), never in a single member state.

import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE_DIR, CCTLD_TO_COUNTRY } from '../../lib/config.mjs';
import { fetchRetry, writeAtomic, log as defaultLog } from '../../lib/util.mjs';

const API_LATEST = 'https://tranco-list.eu/api/lists/date/latest';

/** Parse Tranco CSV ("rank,domain" with CRLF) and keep EU ccTLD + .eu domains. */
export function filterEuDomains(csvText, psl) {
  const records = [];
  const seen = new Set();
  let skipped = 0;
  for (const line of csvText.split('\n')) {
    const domain = line.trim().split(',')[1];
    if (!domain) continue;
    const tld = domain.slice(domain.lastIndexOf('.') + 1).toLowerCase();
    const isEu = tld === 'eu';
    if (!isEu && !CCTLD_TO_COUNTRY[tld]) continue;
    // Tranco lists pay-level domains; re-derive with our PSL so site/zone match the other sources.
    const zone = psl.registrableDomain(domain);
    if (!zone || seen.has(zone)) { skipped++; continue; }
    seen.add(zone);
    records.push({
      site: zone,
      zone,
      country: isEu ? null : CCTLD_TO_COUNTRY[tld],
      category: 'other',
      sector: null,
      uniform: true,
      source: 'tranco',
    });
  }
  return { records, skipped };
}

export async function fetchTranco({ psl, log = defaultLog } = {}) {
  const meta = await (await fetchRetry(API_LATEST, { timeoutMs: 60_000 })).json();
  if (!meta?.list_id || !meta.available) throw new Error('Tranco: no available latest list');
  const path = join(CACHE_DIR, `tranco-${meta.list_id}.csv`);
  if (!existsSync(path)) {
    const url = meta.download ?? `https://tranco-list.eu/download/${meta.list_id}/1000000`;
    const text = await (await fetchRetry(url, { timeoutMs: 300_000 })).text();
    const lines = text.split('\n').filter(Boolean).length;
    if (lines < 900_000) throw new Error(`Tranco list ${meta.list_id} has only ${lines} lines`);
    writeAtomic(path, text);
    // keep only the current list in the cache
    for (const f of readdirSync(CACHE_DIR)) {
      if (/^tranco-.*\.csv$/.test(f) && f !== `tranco-${meta.list_id}.csv`) unlinkSync(join(CACHE_DIR, f));
    }
  }
  const { records, skipped } = filterEuDomains(readFileSync(path, 'utf8'), psl);
  log(`tranco: list ${meta.list_id} (${meta.created_on}), ${records.length} EU domains, ${skipped} skipped`);
  return {
    records,
    source: {
      id: 'tranco',
      label: 'Tranco top-1M',
      // Tranco aggregates provider rankings under their own terms (Majestic CC BY 3.0, CrUX CC BY-SA 4.0,
      // Cloudflare Radar CC BY-NC 4.0, Cisco Umbrella, Farsight). We never redistribute the list —
      // only aggregate statistics — and attribute Tranco and its providers on the methodology page.
      license: 'research ranking; cite list ID; providers: Majestic CC BY 3.0, CrUX CC BY-SA 4.0, Cloudflare Radar CC BY-NC 4.0, Cisco Umbrella, Farsight',
      url: `https://tranco-list.eu/list/${meta.list_id}/1000000`,
      listId: meta.list_id,
      listDate: meta.created_on,
      fetchedAt: new Date().toISOString(),
      count: records.length,
    },
    stats: { skipped },
  };
}
