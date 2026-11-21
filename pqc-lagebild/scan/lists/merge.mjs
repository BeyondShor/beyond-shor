// Merge the source lists into one record per site.
//
//   category/sector: highest priority wins (kritis > institutions > corporations > other, then the
//                    sector order in mapping.mjs); on a tie a uniform source beats a German-only one.
//   country:         an organisation source beats the ccTLD guess from Tranco.
//   uniform:         true if any uniform source lists the site — it then belongs to the EU view.
//   euCategory/euSector: only present when the German view classifies the site differently than
//                    the uniform sources alone would (e.g. a municipality known only from
//                    german-gov-domains that Tranco also lists → "other" in the EU comparison).

import { compareAssignment } from './mapping.mjs';

const SOURCE_ORDER = ['wikidata', 'german-gov-domains', 'tranco'];
const sourceRank = (s) => {
  const i = SOURCE_ORDER.indexOf(s);
  return i === -1 ? SOURCE_ORDER.length : i;
};

function compareCandidates(a, b) {
  return compareAssignment(a, b) || Number(b.uniform) - Number(a.uniform) || sourceRank(a.source) - sourceRank(b.source);
}

export function mergeRecords(lists) {
  const bySite = new Map();
  for (const list of lists) {
    for (const r of list) {
      if (!bySite.has(r.site)) bySite.set(r.site, []);
      bySite.get(r.site).push(r);
    }
  }
  const records = [];
  const stats = { inputs: 0, sites: 0, mergedDuplicates: 0, countryFromOrg: 0, euDiffers: 0 };
  for (const [site, cands] of bySite) {
    stats.inputs += cands.length;
    if (cands.length > 1) stats.mergedDuplicates += cands.length - 1;
    const sorted = [...cands].sort(compareCandidates);
    const best = sorted[0];
    const orgCountry = sorted.filter((c) => c.source !== 'tranco' && c.country)
      .sort((a, b) => Number(b.uniform) - Number(a.uniform))[0]?.country;
    const country = orgCountry ?? sorted.find((c) => c.country)?.country ?? null;
    if (orgCountry && cands.some((c) => c.source === 'tranco')) stats.countryFromOrg++;
    const uniformCands = sorted.filter((c) => c.uniform);
    const rec = {
      site,
      zone: best.zone,
      country,
      category: best.category,
      sector: best.sector,
      uniform: uniformCands.length > 0,
      source: best.source,
    };
    if (uniformCands.length && (uniformCands[0].category !== rec.category || uniformCands[0].sector !== rec.sector)) {
      rec.euCategory = uniformCands[0].category;
      rec.euSector = uniformCands[0].sector;
      stats.euDiffers++;
    }
    records.push(rec);
  }
  stats.sites = records.length;
  return { records, stats };
}
