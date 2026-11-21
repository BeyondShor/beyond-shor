// Build the measured population: Tranco EU domains + Wikidata organisations + German sources,
// merged to one record per site. Everything stays in memory; callers must not write the records
// (or anything derived per site) to disk — only aggregates leave the process.

import { loadPublicSuffixList } from '../../lib/psl.mjs';
import { log as defaultLog } from '../../lib/util.mjs';
import { fetchTranco } from './tranco.mjs';
import { fetchWikidataOrgs } from './wikidata.mjs';
import { fetchGermanSources } from './de-sources.mjs';
import { mergeRecords } from './merge.mjs';

export async function buildPopulation({ log = defaultLog, psl } = {}) {
  const started = Date.now();
  psl ??= await loadPublicSuffixList();
  // Sources are independent; run them side by side (Wikidata dominates the runtime).
  const [tranco, wikidata, german] = await Promise.all([
    fetchTranco({ psl, log }),
    fetchWikidataOrgs({ psl, log }),
    fetchGermanSources({ psl, log }),
  ]);
  const { records, stats } = mergeRecords([wikidata.records, german.records, tranco.records]);
  log(`population: ${records.length} sites (${stats.mergedDuplicates} duplicates merged) in ${Math.round((Date.now() - started) / 1000)} s`);
  return {
    records,
    sources: [wikidata.source, german.source, tranco.source],
    stats: {
      merge: stats,
      wikidata: wikidata.stats,
      german: german.stats,
      tranco: tranco.stats,
      ms: Date.now() - started,
    },
  };
}
