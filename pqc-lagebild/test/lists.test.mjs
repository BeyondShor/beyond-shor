import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PublicSuffixList, normalizeHost } from '../lib/psl.mjs';
import { siteFromUrl, isPlatform, isSharedPlatform } from '../scan/lists/normalize.mjs';
import { mergeRecords } from '../scan/lists/merge.mjs';
import { filterEuDomains } from '../scan/lists/tranco.mjs';
import { parseCsv, govDomainsToRecords } from '../scan/lists/de-sources.mjs';
import { orgsToSites, buildQuery } from '../scan/lists/wikidata.mjs';
import { compareAssignment, RULES } from '../scan/lists/mapping.mjs';

// A tiny public suffix list with the interesting rule types.
const psl = new PublicSuffixList(`
// ===BEGIN ICANN DOMAINS===
com
de
eu
uk
co.uk
gov.pl
pl
fr
at
*.ck
!www.ck
github.io
// ===END ICANN DOMAINS===
`);

test('psl: registrable domain incl. multi-label, wildcard and exception rules', () => {
  assert.equal(psl.registrableDomain('www.stadt.example.de'), 'example.de');
  assert.equal(psl.registrableDomain('a.b.example.co.uk'), 'example.co.uk');
  assert.equal(psl.registrableDomain('co.uk'), null);
  assert.equal(psl.registrableDomain('foo.bar.ck'), 'foo.bar.ck');
  assert.equal(psl.registrableDomain('bar.ck'), null);
  assert.equal(psl.registrableDomain('www.ck'), 'www.ck');
  assert.equal(psl.registrableDomain('x.www.ck'), 'www.ck');
  assert.equal(psl.registrableDomain('user.github.io'), 'user.github.io');
  assert.equal(psl.registrableDomain('ministerstwo.gov.pl'), 'ministerstwo.gov.pl');
  assert.equal(psl.registrableDomain('example.unknowntld'), 'example.unknowntld'); // implicit "*" rule
});

test('psl: host normalisation (IDN, case, trailing dot, junk)', () => {
  assert.equal(normalizeHost('https://WWW.Müller-Beispiel.de/pfad?q=1'), 'www.xn--mller-beispiel-gsb.de');
  assert.equal(normalizeHost('example.de.'), 'example.de');
  assert.equal(normalizeHost('http://192.0.2.1/'), null);
  assert.equal(normalizeHost('localhost'), null);
  assert.equal(normalizeHost('mailto:info@example.de'), null);
  assert.equal(normalizeHost(''), null);
});

test('siteFromUrl strips only a leading www. and keeps subdomains', () => {
  assert.deepEqual(siteFromUrl('https://www.agency.example.de/', psl), { site: 'agency.example.de', zone: 'example.de' });
  assert.deepEqual(siteFromUrl('http://example.co.uk/en/', psl), { site: 'example.co.uk', zone: 'example.co.uk' });
  assert.deepEqual(siteFromUrl('https://www2.example.fr', psl), { site: 'www2.example.fr', zone: 'example.fr' });
  assert.equal(siteFromUrl('https://co.uk/', psl), null);
});

test('platform exclusion by zone and by host suffix', () => {
  assert.equal(isPlatform('facebook.com', 'facebook.com'), true);
  assert.equal(isPlatform('de-de.facebook.com', 'facebook.com'), true);
  assert.equal(isPlatform('club.github.io', 'club.github.io'), true);
  assert.equal(isPlatform('verein.wordpress.com', 'wordpress.com'), true);
  assert.equal(isPlatform('example.de', 'example.de'), false);
});

test('shared-platform rule needs many orgs of different kinds', () => {
  const same = Array.from({ length: 9 }, () => ({ category: 'institutions', sector: 'municipality' }));
  assert.equal(isSharedPlatform(same), false);
  const mixed = [
    ...same.slice(0, 3),
    { category: 'kritis', sector: 'health' }, { category: 'kritis', sector: 'health' },
    { category: 'corporations', sector: null },
  ];
  assert.equal(isSharedPlatform(mixed), true);
  assert.equal(isSharedPlatform(mixed.slice(0, 5)), false);
});

test('category priority: kritis > institutions > corporations > other', () => {
  const k = { category: 'kritis', sector: 'health' };
  const i = { category: 'institutions', sector: 'higher-education' };
  const c = { category: 'corporations', sector: null };
  assert.ok(compareAssignment(k, i) < 0);
  assert.ok(compareAssignment(i, c) < 0);
  assert.ok(compareAssignment({ category: 'kritis', sector: 'energy' }, { category: 'kritis', sector: 'water' }) < 0);
});

test('merge: priority, uniform tie-break, org country over ccTLD, EU classification', () => {
  const wikidata = [
    { site: 'clinic.example.de', zone: 'example.de', country: 'DE', category: 'kritis', sector: 'health', uniform: true, source: 'wikidata' },
    { site: 'uni.example.at', zone: 'example.at', country: 'AT', category: 'institutions', sector: 'higher-education', uniform: true, source: 'wikidata' },
    { site: 'firma.example.com', zone: 'example.com', country: 'FR', category: 'corporations', sector: null, uniform: true, source: 'wikidata' },
  ];
  const german = [
    { site: 'clinic.example.de', zone: 'example.de', country: 'DE', category: 'institutions', sector: 'municipality', uniform: false, source: 'german-gov-domains' },
    { site: 'gemeinde-example.de', zone: 'gemeinde-example.de', country: 'DE', category: 'institutions', sector: 'municipality', uniform: false, source: 'german-gov-domains' },
  ];
  const tranco = [
    { site: 'gemeinde-example.de', zone: 'gemeinde-example.de', country: 'DE', category: 'other', sector: null, uniform: true, source: 'tranco' },
    { site: 'uni.example.at', zone: 'example.at', country: 'AT', category: 'other', sector: null, uniform: true, source: 'tranco' },
    { site: 'shop-example.eu', zone: 'shop-example.eu', country: null, category: 'other', sector: null, uniform: true, source: 'tranco' },
    { site: 'firma.example.com', zone: 'example.com', country: 'DE', category: 'other', sector: null, uniform: true, source: 'tranco' },
  ];
  const { records, stats } = mergeRecords([wikidata, german, tranco]);
  const by = Object.fromEntries(records.map((r) => [r.site, r]));
  assert.equal(records.length, 5);
  assert.equal(by['clinic.example.de'].category, 'kritis');
  assert.equal(by['clinic.example.de'].euCategory, undefined);
  assert.equal(by['uni.example.at'].sector, 'higher-education');
  assert.equal(by['firma.example.com'].country, 'FR'); // organisation source beats ccTLD/Tranco
  const g = by['gemeinde-example.de'];
  assert.equal(g.category, 'institutions');
  assert.equal(g.uniform, true);
  assert.equal(g.euCategory, 'other'); // only the German source knows it is a municipality
  assert.equal(by['shop-example.eu'].country, null);
  assert.equal(stats.mergedDuplicates, 4);
});

test('tranco: EU ccTLDs + .eu only, CRLF, PSL re-derivation, no duplicates', () => {
  const csv = '1,example.com\r\n2,example.de\r\n3,example.eu\r\n4,shop.example.fr\r\n5,example.de\r\n6,gov.pl\r\n7,example.co.uk\r\n';
  const { records } = filterEuDomains(csv, psl);
  assert.deepEqual(records.map((r) => [r.site, r.country]), [
    ['example.de', 'DE'], ['example.eu', null], ['example.fr', 'FR'],
  ]);
  assert.ok(records.every((r) => r.category === 'other' && r.uniform && r.site === r.zone));
});

test('german-gov-domains: CSV parsing and type mapping', () => {
  const csv = 'Domain Name,Domain Type,Agency,City,State\r\n'
    + 'bundesamt-example.de,Federal Agency,"Bundesamt, Example",,\r\n'
    + 'www.stadt-example.de,City,Non-Federal Agency,Example,BY\r\n'
    + 'stadt-example.de,City,Non-Federal Agency,Example,BY\r\n'
    + 'odd-example.de,Something,,,\r\n';
  assert.equal(parseCsv('a,"b,""c"""\n1,2\n')[0][1], 'b,"c"');
  const { records, dropped } = govDomainsToRecords(csv, psl);
  assert.deepEqual(records.map((r) => [r.site, r.sector, r.uniform]), [
    ['bundesamt-example.de', 'government', false], ['stadt-example.de', 'municipality', false],
  ]);
  assert.equal(dropped.duplicate, 1);
  assert.equal(dropped.unknownType, 1);
});

test('wikidata: org → site collapse picks best assignment, majority country, drops platforms', () => {
  const orgs = new Map([
    ['Q1', { urls: new Set(['https://www.hospital-example.de/']), countries: [{ country: 'DE', via: 1 }], assignments: [{ category: 'institutions', sector: 'government' }, { category: 'kritis', sector: 'health' }] }],
    ['Q2', { urls: new Set(['https://facebook.com/someclub', 'not a url']), countries: [{ country: 'AT', via: 1 }], assignments: [{ category: 'corporations', sector: null }] }],
    ['Q3', { urls: new Set(['https://hq-example.com']), countries: [{ country: 'NL', via: 2 }, { country: 'BE', via: 1 }], assignments: [{ category: 'corporations', sector: null }] }],
  ]);
  const { records, dropped } = orgsToSites(orgs, psl);
  const by = Object.fromEntries(records.map((r) => [r.site, r]));
  assert.equal(by['hospital-example.de'].category, 'kritis');
  assert.equal(by['hq-example.com'].country, 'BE'); // P17 beats headquarters country
  assert.equal(dropped.platform, 1);
  assert.equal(dropped.invalidUrl, 1);
});

test('wikidata: queries are well-formed for every rule', () => {
  for (const rule of RULES) {
    for (const kind of ['class', 'industry']) {
      if (!(kind === 'class' ? rule.classes : rule.industries)) continue;
      const q = buildQuery(rule, kind, ['DE', 'FR']);
      assert.match(q, /^SELECT DISTINCT \?o \?w \?c \?via WHERE \{/);
      assert.match(q, /wd:Q183 wd:Q142/);
      assert.equal((q.match(/\{/g) ?? []).length, (q.match(/\}/g) ?? []).length);
      if (rule.minPopulation) assert.match(q, /P1082/);
      if (rule.largeOrListed) assert.match(q, /P1128.*P414/);
    }
  }
});
