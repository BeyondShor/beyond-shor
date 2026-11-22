import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLine, countDays, summarize } from '../server/tls-stats.mjs';

test('parseLine reads names, hex codes and the client class', () => {
  assert.deepEqual(parseLine('2026-11-21T00:00:03+00:00 TLSv1.3 X25519MLKEM768 browser'),
    { date: '2026-11-21', protocol: 'TLSv1.3', group: 'X25519MLKEM768', pq: true, client: 'browser' });
  assert.equal(parseLine('2026-11-21T00:00:03+00:00 TLSv1.3 0x11ec browser').group, 'X25519MLKEM768');
  assert.equal(parseLine('2026-11-21T00:00:03+00:00 TLSv1.3 X25519 bot').pq, false);
  assert.equal(parseLine('2026-11-21T00:30:00+01:00 TLSv1.3 X25519 bot').date, '2026-11-20'); // UTC day
  assert.equal(parseLine('garbage'), null);
  assert.equal(parseLine('2026-11-21T00:00:03+00:00 - - browser'), null); // plain HTTP redirect
  assert.equal(parseLine('2026-11-21T00:00:03+00:00 TLSv1.2 - browser').group, 'none');
});

test('daily counts and monthly summary', () => {
  const days = countDays([
    '2026-11-21T10:00:00+00:00 TLSv1.3 X25519MLKEM768 browser',
    '2026-11-21T11:00:00+00:00 TLSv1.3 X25519 browser',
    '2026-11-22T11:00:00+00:00 TLSv1.2 prime256v1 bot',
  ]);
  assert.equal(days['2026-11-21'].browser.connections, 2);
  assert.equal(days['2026-11-21'].browser.pq, 1);
  const [m] = summarize(Object.values(days));
  assert.equal(m.month, '2026-11');
  assert.equal(m.days, 2);
  assert.equal(m.bot.connections, 1);
  assert.equal(m.bot.tls13, 0);
});
