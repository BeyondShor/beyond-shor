import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toObservation, aggregate, trend, qualityGate } from '../scan/aggregate.mjs';
import { negotiatedGroup, BROWSER_GROUPS, PURE_GROUPS } from '../scan/probe.mjs';

function obs(over = {}) {
  return {
    country: 'DE', category: 'other', sector: null, uniform: true, reachable: true, hosting: 'other',
    tls13: true, pq: false, pqPure: false, certKey: 'rsa', dnsOk: true, dnssecAlgs: [], mx: false,
    mailOk: false, starttls: false, mailPq: false, mailTlsOk: false, ...over,
  };
}

test('negotiatedGroup infers the single offered KEM from an empty key info', () => {
  assert.equal(negotiatedGroup({}, 'TLSv1.3', BROWSER_GROUPS), 'X25519MLKEM768');
  assert.equal(negotiatedGroup({ name: 'X25519' }, 'TLSv1.3', BROWSER_GROUPS), 'X25519');
  assert.equal(negotiatedGroup({}, 'TLSv1.3', PURE_GROUPS), 'KEM');
  assert.equal(negotiatedGroup({}, 'TLSv1.2', BROWSER_GROUPS), 'rsa-or-none');
});

test('toObservation keeps only aggregate facts', () => {
  const o = toObservation(
    { site: 'a.example', zone: 'a.example', country: 'DE', category: 'kritis', sector: 'energy', uniform: true },
    {
      web: { reachable: true, hosting: 'cdn', protocol: 'TLSv1.3', pq: true, pqPure: false, cert: { key: 'ecdsa' } },
      dnssec: { ok: true, algorithms: [13] },
      mail: { mx: true, ok: true, starttls: true, tls: { ok: true, pq: false } },
    },
  );
  assert.equal(JSON.stringify(o).includes('example'), false);
  assert.equal(o.pq, true);
  assert.equal(o.mailTlsOk, true);
  assert.equal(o.mailPq, false);
});

test('cells below the minimum are suppressed, not published', () => {
  const list = [
    ...Array.from({ length: 40 }, (_, i) => obs({ pq: i < 10 })),
    ...Array.from({ length: 5 }, () => obs({ category: 'kritis', sector: 'water' })),
  ];
  const { cells, suppressed } = aggregate(list, { minCell: 30 });
  const all = cells.find((c) => c.view === 'de' && c.category === 'all' && c.sector === null);
  assert.equal(all.web.reachable, 45);
  assert.equal(all.web.pq, 10);
  assert.equal(cells.some((c) => c.category === 'kritis'), false);
  assert.ok(suppressed > 0);
});

test('EU view excludes non-uniform sources, DE view includes them', () => {
  const list = Array.from({ length: 30 }, () => obs({ uniform: false }));
  const { cells } = aggregate(list, { minCell: 30 });
  assert.ok(cells.find((c) => c.view === 'de' && c.region === 'DE'));
  assert.equal(cells.some((c) => c.view === 'eu'), false);
});

test('small hosting classes do not reveal their PQ count', () => {
  const list = [...Array.from({ length: 35 }, () => obs()), obs({ hosting: 'cdn', pq: true })];
  const { cells } = aggregate(list, { minCell: 30 });
  const all = cells.find((c) => c.view === 'de' && c.category === 'all');
  assert.equal(all.hosting.cdn, 1);
  assert.equal(all.pqByHosting.cdn, null);
  assert.equal(all.pqByHosting.other, 0);
});

test('trend compares the same sites only', () => {
  const prev = new Map();
  const now = new Map();
  for (let i = 0; i < 40; i++) {
    prev.set(`h${i}`, obs({ pq: i < 10 }));
    now.set(`h${i}`, obs({ pq: i < 15 }));
  }
  now.set('new', obs({ pq: true })); // joined this month: must not count
  const { cells } = trend(prev, now, { minCell: 30 });
  const de = cells.find((c) => c.view === 'de' && c.category === 'all');
  assert.equal(de.n, 40);
  assert.equal(de.pqBefore, 10);
  assert.equal(de.pqNow, 15);
  assert.equal(de.switchedOn, 5);
});

test('quality gate rejects tiny or implausible runs', () => {
  const observations = Array.from({ length: 100 }, () => obs());
  const { cells } = aggregate(observations, { minCell: 30 });
  assert.ok(qualityGate({ observations, cells }, null).some((p) => p.includes('population too small')));
});

test('EU view uses the uniform classification (euCategory)', () => {
  const list = Array.from({ length: 30 }, () => obs({ category: 'institutions', sector: 'municipality', euCategory: 'other', euSector: null }));
  const { cells } = aggregate(list, { minCell: 30 });
  assert.ok(cells.find((c) => c.view === 'de' && c.category === 'institutions'));
  assert.ok(cells.find((c) => c.view === 'eu' && c.category === 'other'));
  assert.equal(cells.some((c) => c.view === 'eu' && c.category === 'institutions'), false);
});
