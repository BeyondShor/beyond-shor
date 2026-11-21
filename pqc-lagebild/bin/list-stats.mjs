#!/usr/bin/env node
// Build the population and print COUNTS only — never a site name. For checking that the lists
// are plausible after changing sources or mapping.

import { buildPopulation } from '../scan/lists/index.mjs';

const quiet = process.argv.includes('--quiet');
const { records, sources, stats } = await buildPopulation({ log: quiet ? () => {} : undefined });

const count = (keyFn, list = records) => {
  const m = new Map();
  for (const r of list) {
    const k = keyFn(r);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]);
};
const table = (title, rows) => {
  console.log(`\n## ${title}`);
  for (const [k, n] of rows) console.log(`${String(n).padStart(8)}  ${k}`);
};

console.log(`\nSites total: ${records.length}  (uniform/EU view: ${records.filter((r) => r.uniform).length}, DE: ${records.filter((r) => r.country === 'DE').length}, no country (.eu): ${records.filter((r) => !r.country).length})`);
table('Sources (records contributed before merge)', sources.map((s) => [`${s.id}${s.listId ? ` ${s.listId}` : ''} — ${s.license}`, s.count]));
table('Category (all)', count((r) => r.category));
table('Category/sector (all)', count((r) => `${r.category}/${r.sector ?? '-'}`));
table('Category/sector — DE view', count((r) => `${r.category}/${r.sector ?? '-'}`, records.filter((r) => r.country === 'DE')));
table('Category/sector — EU view (uniform sources only)', count((r) => `${r.euCategory ?? r.category}/${(r.euCategory ? r.euSector : r.sector) ?? '-'}`, records.filter((r) => r.uniform)));
table('Country (all)', count((r) => r.country ?? '(.eu, no country)'));
table('Country × category (EU view)', count((r) => `${r.country ?? '--'} ${r.euCategory ?? r.category}`, records.filter((r) => r.uniform)));
table('Winning source', count((r) => r.source));

console.log('\n## Merge');
console.log(JSON.stringify(stats.merge));
console.log('\n## Wikidata');
console.log(`organisations: ${stats.wikidata.organisations}, dropped: ${JSON.stringify(stats.wikidata.dropped)}, ${Math.round(stats.wikidata.ms / 1000)} s`);
for (const r of stats.wikidata.perRule) {
  console.log(`  ${`${r.category}/${r.sector ?? '-'} ${r.kind}`.padEnd(40)} rows ${String(r.rows).padStart(6)}  orgs ${String(r.orgs).padStart(6)}  ${r.ms} ms`);
}
console.log(`\n## german-gov-domains dropped: ${JSON.stringify(stats.german.dropped)}`);
console.log(`## Tranco skipped: ${stats.tranco.skipped}`);
console.log(`\nRuntime: ${Math.round(stats.ms / 1000)} s`);
