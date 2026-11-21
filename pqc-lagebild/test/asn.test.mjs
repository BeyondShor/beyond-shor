import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HostingClassifier, ipToInt, providerName } from '../scan/asn.mjs';

const TSV = [
  '1.0.0.0\t1.0.0.255\t13335\tUS\tCLOUDFLARENET',
  '3.0.0.0\t3.127.255.255\t16509\tUS\tAMAZON-02',
  '5.1.0.0\t5.1.255.255\t24940\tDE\tHETZNER-AS',
].join('\n');

test('ipToInt handles the full range', () => {
  assert.equal(ipToInt('0.0.0.0'), 0);
  assert.equal(ipToInt('255.255.255.255'), 4294967295);
});

test('hosting classes from AS names, CloudFront ranges override AMAZON', () => {
  const c = new HostingClassifier(TSV, { prefixes: [{ ip_prefix: '3.10.0.0/16', service: 'CLOUDFRONT' }] });
  assert.deepEqual(c.classify('1.0.0.1'), { hosting: 'cdn', provider: 'Cloudflare' });
  assert.deepEqual(c.classify('3.10.20.30'), { hosting: 'cdn', provider: 'Amazon CloudFront' });
  assert.deepEqual(c.classify('3.20.0.1'), { hosting: 'cloud', provider: 'Amazon (AWS)' });
  assert.deepEqual(c.classify('5.1.2.3'), { hosting: 'other', provider: 'Hetzner' });
  assert.equal(c.classify('9.9.9.9').hosting, 'other');
  assert.equal(c.classify('2001:db8::1').hosting, 'unknown');
});

test('provider names: curated first, otherwise the cleaned AS name', () => {
  assert.equal(providerName('IONOS-AS This is the joint network for IONOS, Fasthosts, Arsys'), 'IONOS');
  assert.equal(providerName('STRATO STRATO AG'), 'Strato');
  assert.equal(providerName('EXAMPLEHOST-AS Example Hosting GmbH'), 'EXAMPLEHOST');
});
