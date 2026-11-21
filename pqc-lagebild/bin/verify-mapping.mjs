#!/usr/bin/env node
// Checks every QID in scan/lists/mapping.mjs against its English Wikidata label.
// Exit code 1 if any label no longer matches the comment in the mapping.

import { RULES, COUNTRY_QIDS } from '../scan/lists/mapping.mjs';
import { sparql } from '../scan/lists/wikidata.mjs';

const expected = new Map();
for (const r of RULES) {
  for (const group of [r.classes, r.industries, r.excludeClasses]) {
    for (const [q, label] of Object.entries(group ?? {})) expected.set(q, label);
  }
}
const COUNTRY_NAMES = {
  AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', HR: 'Croatia', CY: 'Cyprus', CZ: 'Czech Republic',
  DK: 'Denmark', EE: 'Estonia', FI: 'Finland', FR: 'France', DE: 'Germany', GR: 'Greece', HU: 'Hungary',
  IE: 'Ireland', IT: 'Italy', LV: 'Latvia', LT: 'Lithuania', LU: 'Luxembourg', MT: 'Malta',
  NL: 'Netherlands', PL: 'Poland', PT: 'Portugal', RO: 'Romania', SK: 'Slovakia', SI: 'Slovenia',
  ES: 'Spain', SE: 'Sweden',
};
for (const [cc, q] of Object.entries(COUNTRY_QIDS)) expected.set(q, COUNTRY_NAMES[cc]);

const values = [...expected.keys()].map((q) => `wd:${q}`).join(' ');
const { rows } = await sparql(`SELECT ?x ?l WHERE { VALUES ?x { ${values} } ?x rdfs:label ?l FILTER(lang(?l) = "en") }`);
const actual = new Map(rows.map((r) => [r.x.replace(/.*\//, ''), r.l]));

const norm = (s) => s.toLowerCase().replace(/\s*\(.*\)\s*$/, '').trim();
let bad = 0;
for (const [q, label] of expected) {
  const got = actual.get(q);
  const ok = got && (norm(got) === norm(label) || norm(got).includes(norm(label)) || norm(label).includes(norm(got)));
  if (!ok) {
    bad++;
    console.log(`MISMATCH ${q}: mapping says "${label}", Wikidata says "${got ?? '(no label)'}"`);
  }
}
console.log(`${expected.size} QIDs checked, ${bad} mismatches`);
process.exit(bad ? 1 : 0);
