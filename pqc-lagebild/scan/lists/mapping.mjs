// Wikidata classes (P31, incl. subclasses via P279*) and industries (P452, incl. subclasses)
// → category/sector of the PQC-Lagebild. Every QID below was checked against its Wikidata label
// (bin/verify-mapping.mjs re-checks them; run it when changing this file).
//
// KRITIS sectors follow BSI-KritisV / NIS2 Annex I: energy, water, health, finance, transport,
// ICT, food, waste. The operator list itself is confidential, so this is "organisations from
// KRITIS sectors", not "KRITIS operators" — the methodology page says so. The food sector only
// counts large organisations (same size test as corporations, see the rule below).
//
// Corporations: business (Q4830453) or company (Q783794) with ≥ 250 employees (P1128, any recorded
// value — the EU SME threshold, Recommendation 2003/361/EC) or a stock exchange listing (P414),
// and not already in a KRITIS sector or a public institution (category priority below).

export const CATEGORY_PRIORITY = ['kritis', 'institutions', 'corporations', 'other'];

// Within a category, the more specific sector wins when an organisation matches several
// (e.g. a municipal utility with power and water → energy; a university hospital → kritis/health
// beats institutions/higher-education through the category priority).
export const SECTOR_PRIORITY = [
  'energy', 'water', 'health', 'finance', 'transport', 'ict', 'food', 'waste',
  'eu-body', 'higher-education', 'municipality', 'government',
];

// Municipalities are only taken from this population on (P1082, any recorded value). Without the
// threshold Wikidata yields ~70 000 EU municipalities with a website, which would swamp every other
// group; ≥ 10 000 inhabitants gives ~7 500. The German view adds all municipal domains from
// german-gov-domains on top (de-sources.mjs).
export const MUNICIPALITY_MIN_POPULATION = 10_000;

/** @type {Array<{category:string, sector:string|null, classes?:Record<string,string>, industries?:Record<string,string>, excludeClasses?:Record<string,string>, minPopulation?:number, largeOrListed?:boolean}>} */
export const RULES = [
  // ── KRITIS sectors ────────────────────────────────────────────────────────
  {
    category: 'kritis', sector: 'energy',
    classes: {
      Q1326624: 'electricity supply company',
      Q1341478: 'energy company',
      Q131926253: 'energy company (energy industry)',
      Q112046: 'transmission system operator for electricity',
      Q1406985: 'transmission system operator for natural gas',
      Q472093: 'distribution network operator for electricity',
      Q11813450: 'gas supplier',
      Q14941854: 'oil company',
      Q1951366: 'public utility', // German Stadtwerke are mostly typed this way; energy is their core
    },
    industries: {
      Q2151621: 'energy industry',
      Q2316331: 'electric power industry',
      Q862571: 'petroleum industry',
      Q1341477: 'energy supply',
    },
    // Water utilities are a subclass of public utility; they belong to the water sector.
    excludeClasses: { Q7258040: 'water utility' },
  },
  {
    category: 'kritis', sector: 'water',
    classes: { Q7258040: 'water utility' },
    industries: {
      Q1061108: 'water supply',
      Q18449863: 'water services',
      Q20127660: 'wastewater treatment',
    },
  },
  {
    category: 'kritis', sector: 'health',
    classes: {
      Q16917: 'hospital',
      Q1059324: 'university hospital',
      Q1774898: 'clinic',
      Q2296168: 'medical laboratory',
      Q19644607: 'pharmaceutical company',
    },
    industries: {
      Q507443: 'pharmaceutical industry',
      Q130370834: 'hospitals and rehabilitation',
      Q112166139: 'hospital activities',
      Q15067276: 'health care industry',
    },
    excludeClasses: { Q64578911: 'former hospital' },
  },
  {
    category: 'kritis', sector: 'finance',
    classes: {
      Q22687: 'bank',
      Q157963: 'savings bank',
      Q3277997: 'cooperative bank',
      Q66344: 'central bank',
      Q730038: 'credit institution',
      Q896525: 'Landesbank',
      Q2143354: 'insurance company',
      Q11691: 'stock exchange',
      Q1956140: 'payment service provider',
    },
    industries: {
      Q837171: 'financial services',
      Q57774188: 'financial sector',
      Q806718: 'economics of banking',
      Q142168092: 'banking industry',
      Q29584334: 'financial service activities, except insurance and pension funding',
      Q112165989: 'other monetary intermediations',
      Q43183: 'insurance',
      Q2518196: 'insurance industry',
    },
  },
  {
    category: 'kritis', sector: 'transport',
    classes: {
      Q1248784: 'airport',
      Q46970: 'airline',
      Q249556: 'railway company',
      Q2127330: 'public transport company',
      Q740752: 'transport company',
      Q10438042: 'bus company',
      Q1807108: 'shipping line',
      Q1468664: 'logistics company',
      Q44782: 'port',
      Q652812: 'port authority',
    },
    industries: {
      Q178512: 'public transport',
      Q3565868: 'rail transport',
      Q177777: 'logistics',
      Q2072431: 'passenger transport',
      Q2516512: 'transport industry',
      Q155930: 'water transport',
    },
    // Leisure harbours and flight-simulation "airlines" are not transport infrastructure.
    excludeClasses: { Q721207: 'marina', Q10512405: 'guest harbor', Q4357531: 'virtual airline' },
  },
  {
    category: 'kritis', sector: 'ict',
    classes: {
      Q2401749: 'telecommunications company',
      Q1266169: 'telephone company',
      Q11371: 'internet service provider',
      Q1941618: 'mobile network operator',
      Q671224: 'data center',
      Q9067653: 'domain name registry',
      Q1433061: 'Internet exchange point',
    },
    industries: {
      Q2401742: 'telecommunications industry',
      Q418: 'telecommunications',
    },
  },
  {
    category: 'kritis', sector: 'food',
    classes: {
      Q1252971: 'food manufacturer',
      Q18043413: 'supermarket chain',
    },
    industries: {
      Q540912: 'food industry',
      Q15825471: 'food retail sector',
      Q107601756: 'food and tobacco industry',
      Q4899370: 'beverage industry',
      Q11644505: 'brewing industry',
    },
    // Only large producers and retailers: without a size criterion Wikidata yields mostly craft
    // breweries, bakeries and pâtisseries, while the KritisV thresholds target large plants.
    largeOrListed: true,
  },
  {
    category: 'kritis', sector: 'waste',
    industries: {
      Q180388: 'waste management',
      Q2684232: 'waste disposal',
      Q1324934: 'waste collection',
    },
  },

  // ── Public institutions ───────────────────────────────────────────────────
  {
    category: 'institutions', sector: 'eu-body',
    classes: {
      Q392918: 'agency of the European Union',
      Q748720: 'institutions of the European Union',
    },
  },
  {
    category: 'institutions', sector: 'higher-education',
    classes: {
      Q38723: 'higher education institution',
      Q3918: 'university',
      Q1365560: 'university of applied sciences',
    },
    industries: {
      Q136822: 'higher education',
      Q112166132: 'higher education',
    },
  },
  {
    category: 'institutions', sector: 'municipality',
    classes: { Q15284: 'municipality' },
    minPopulation: MUNICIPALITY_MIN_POPULATION,
  },
  {
    category: 'institutions', sector: 'government',
    classes: {
      Q2659904: 'government organization',
      Q327333: 'government agency',
      Q192350: 'ministry',
      Q1639780: 'regulatory agency',
    },
    industries: {
      Q112166113: 'administration publique générale',
      Q112166116: 'public administration (supervision) of economic activities',
      Q112166115: 'public administration in healthcare and social services',
    },
    // Municipalities have their own group (with a size threshold); foreign missions are not
    // institutions of the host country; volunteer fire brigades are mostly private associations;
    // state-owned enterprises are companies and are classified by their business.
    excludeClasses: {
      Q15284: 'municipality',
      Q213283: 'diplomatic mission',
      Q7843791: 'consulate',
      Q285852: 'volunteer fire department',
      Q270791: 'state-owned enterprise',
    },
  },

  // ── Large companies outside KRITIS sectors ────────────────────────────────
  {
    category: 'corporations', sector: null,
    classes: { Q4830453: 'business', Q783794: 'company' },
    largeOrListed: true,
  },
];

// EU member states → Wikidata items (labels verified).
export const COUNTRY_QIDS = {
  AT: 'Q40', BE: 'Q31', BG: 'Q219', HR: 'Q224', CY: 'Q229', CZ: 'Q213', DK: 'Q35', EE: 'Q191',
  FI: 'Q33', FR: 'Q142', DE: 'Q183', GR: 'Q41', HU: 'Q28', IE: 'Q27', IT: 'Q38', LV: 'Q211',
  LT: 'Q37', LU: 'Q32', MT: 'Q233', NL: 'Q55', PL: 'Q36', PT: 'Q45', RO: 'Q218', SK: 'Q214',
  SI: 'Q215', ES: 'Q29', SE: 'Q34',
};
export const QID_TO_COUNTRY = Object.fromEntries(Object.entries(COUNTRY_QIDS).map(([c, q]) => [q, c]));

export function categoryRank(category) {
  const i = CATEGORY_PRIORITY.indexOf(category);
  return i === -1 ? CATEGORY_PRIORITY.length : i;
}

export function sectorRank(sector) {
  const i = SECTOR_PRIORITY.indexOf(sector);
  return i === -1 ? SECTOR_PRIORITY.length : i;
}

/** Compare two {category, sector} assignments; negative if `a` should win. */
export function compareAssignment(a, b) {
  return categoryRank(a.category) - categoryRank(b.category) || sectorRank(a.sector) - sectorRank(b.sector);
}
