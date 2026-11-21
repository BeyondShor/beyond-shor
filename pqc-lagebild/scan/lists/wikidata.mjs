// Organisations from Wikidata (CC0): one SPARQL query per mapping rule and match kind
// (class via P31/P279*, industry via P452/P279*), EU-wide. Results stay in memory only.
//
// Endpoint: QLever (University of Freiburg, https://qlever.dev) answers these transitive
// queries in about a second, and is hosted in the EU. The official Wikidata Query Service is the
// fallback; there the query is split per country to stay under its 60 s limit.

import { fetchRetry, log as defaultLog } from '../../lib/util.mjs';
import { RULES, COUNTRY_QIDS, QID_TO_COUNTRY, compareAssignment } from './mapping.mjs';
import { siteFromUrl, isPlatform, isSharedPlatform } from './normalize.mjs';

export const ENDPOINTS = [
  { id: 'qlever', url: 'https://qlever.dev/api/wikidata' },
  { id: 'wdqs', url: 'https://query.wikidata.org/sparql' },
];

const PREFIXES = [
  'PREFIX wd: <http://www.wikidata.org/entity/>',
  'PREFIX wdt: <http://www.wikidata.org/prop/direct/>',
  'PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>',
].join('\n');

/** Run a SPARQL SELECT; returns { rows: [{var: value}], endpoint }. */
export async function sparql(query, { endpoint = ENDPOINTS[0], timeoutMs = 180_000 } = {}) {
  const res = await fetchRetry(endpoint.url, {
    method: 'POST',
    retries: 2,
    timeoutMs,
    headers: { Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ query: `${PREFIXES}\n${query}` }),
  });
  const json = await res.json();
  if (!json?.results?.bindings) throw new Error(`unexpected SPARQL response from ${endpoint.id}`);
  const rows = json.results.bindings.map((b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v.value])));
  return { rows, endpoint: endpoint.id };
}

const qid = (iri) => iri.replace(/^.*\//, '');
const values = (qids) => qids.map((q) => `wd:${q}`).join(' ');

/** SPARQL for one rule and match kind, restricted to the given countries (ISO codes). */
export function buildQuery(rule, kind, countries) {
  const roots = Object.keys(kind === 'class' ? rule.classes : rule.industries);
  const path = kind === 'class' ? 'wdt:P31/wdt:P279*' : 'wdt:P452/wdt:P279*';
  const lines = [
    'SELECT DISTINCT ?o ?w ?c ?via WHERE {',
    `  VALUES ?root { ${values(roots)} }`,
    `  ?o ${path} ?root .`,
    '  ?o wdt:P856 ?w .',
    '  { ?o wdt:P17 ?c . BIND(1 AS ?via) } UNION { ?o wdt:P159/wdt:P17 ?c . BIND(2 AS ?via) }',
    `  VALUES ?c { ${values(countries.map((c) => COUNTRY_QIDS[c]))} }`,
    '  FILTER NOT EXISTS { ?o wdt:P576 ?dissolved }',
  ];
  for (const q of Object.keys(rule.excludeClasses ?? {})) {
    lines.push(`  FILTER NOT EXISTS { ?o wdt:P31/wdt:P279* wd:${q} }`);
  }
  if (rule.minPopulation) lines.push(`  ?o wdt:P1082 ?pop . FILTER(?pop >= ${rule.minPopulation})`);
  if (rule.largeOrListed) {
    lines.push('  { ?o wdt:P1128 ?emp . FILTER(?emp >= 250) } UNION { ?o wdt:P414 ?exchange }');
  }
  lines.push('}');
  return lines.join('\n');
}

async function runRuleQuery(rule, kind, logFn) {
  const all = Object.keys(COUNTRY_QIDS);
  try {
    return (await sparql(buildQuery(rule, kind, all), { endpoint: ENDPOINTS[0] })).rows;
  } catch (err) {
    logFn(`wikidata: ${ENDPOINTS[0].id} failed for ${rule.category}/${rule.sector ?? '-'} ${kind} (${err.message}); falling back to ${ENDPOINTS[1].id} per country`);
  }
  const rows = [];
  for (const c of all) {
    const { rows: part } = await sparql(buildQuery(rule, kind, [c]), { endpoint: ENDPOINTS[1], timeoutMs: 90_000 });
    rows.push(...part);
    await new Promise((r) => setTimeout(r, 1000)); // WDQS etiquette: no parallel bursts
  }
  return rows;
}

function pickCountry(entries) {
  // Prefer the item's own country (P17) over the country of its headquarters (P159).
  const best = Math.min(...entries.map((e) => e.via));
  return entries.filter((e) => e.via === best).map((e) => e.country).sort()[0];
}

/**
 * Collapse organisations to sites. Each org may have several websites; each site may belong to
 * several orgs. Returns records plus counters of what was dropped and why.
 */
export function orgsToSites(orgs, psl) {
  const bySite = new Map();
  const dropped = { invalidUrl: 0, platform: 0, sharedPlatform: 0 };
  for (const org of orgs.values()) {
    const assignment = [...org.assignments].sort(compareAssignment)[0];
    const country = pickCountry(org.countries);
    for (const url of org.urls) {
      const s = siteFromUrl(url, psl);
      if (!s) { dropped.invalidUrl++; continue; }
      if (isPlatform(s.site, s.zone)) { dropped.platform++; continue; }
      if (!bySite.has(s.site)) bySite.set(s.site, { zone: s.zone, items: [] });
      bySite.get(s.site).items.push({ ...assignment, country });
    }
  }
  const records = [];
  for (const [site, { zone, items }] of bySite) {
    if (isSharedPlatform(items)) { dropped.sharedPlatform++; continue; }
    const best = [...items].sort(compareAssignment)[0];
    const counts = new Map();
    for (const it of items) counts.set(it.country, (counts.get(it.country) ?? 0) + 1);
    const country = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0];
    records.push({ site, zone, country, category: best.category, sector: best.sector, uniform: true, source: 'wikidata' });
  }
  return { records, dropped };
}

/** Fetch all rules; returns { records, source, stats }. */
export async function fetchWikidataOrgs({ psl, log = defaultLog } = {}) {
  const started = Date.now();
  const orgs = new Map(); // qid → { urls:Set, countries:[{country, via}], assignments:[{category, sector}] }
  const perRule = [];
  for (const rule of RULES) {
    for (const kind of ['class', 'industry']) {
      if (!(kind === 'class' ? rule.classes : rule.industries)) continue;
      const t = Date.now();
      const rows = await runRuleQuery(rule, kind, log);
      let matched = 0;
      for (const r of rows) {
        const country = QID_TO_COUNTRY[qid(r.c)];
        if (!country) continue;
        const id = qid(r.o);
        if (!orgs.has(id)) orgs.set(id, { urls: new Set(), countries: [], assignments: [] });
        const o = orgs.get(id);
        o.urls.add(r.w);
        if (!o.countries.some((e) => e.country === country && e.via === Number(r.via))) {
          o.countries.push({ country, via: Number(r.via) });
        }
        if (!o.assignments.some((a) => a.category === rule.category && a.sector === rule.sector)) {
          o.assignments.push({ category: rule.category, sector: rule.sector });
          matched++;
        }
      }
      perRule.push({ category: rule.category, sector: rule.sector, kind, rows: rows.length, orgs: matched, ms: Date.now() - t });
      log(`wikidata: ${rule.category}/${rule.sector ?? '-'} by ${kind}: ${rows.length} rows, ${matched} organisations`);
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  const { records, dropped } = orgsToSites(orgs, psl);
  return {
    records,
    source: {
      id: 'wikidata',
      label: 'Wikidata',
      license: 'CC0 1.0',
      url: 'https://www.wikidata.org/',
      endpoint: ENDPOINTS[0].url,
      fetchedAt: new Date().toISOString(),
      count: records.length,
    },
    stats: { organisations: orgs.size, perRule, dropped, ms: Date.now() - started },
  };
}
