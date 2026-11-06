import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sha256 } from '@noble/hashes/sha2.js';
import { concat, fromHex, toHex } from '@/lib/pki/der';
import {
  encryptRecord, finishedVerifyData, handshakeSecrets, runHandshake, trafficKeys, transportCost,
} from '@/lib/pki/tls13';
import { createPki, issueLeaf } from '@/lib/pki/engine';

const v = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/rfc8448-simple-1rtt.json'), 'utf8'));

describe('TLS 1.3 key schedule against RFC 8448 §3 (simple 1-RTT handshake)', () => {
  const ch = fromHex(v.clientHello), sh = fromHex(v.serverHello);
  const sec = handshakeSecrets(fromHex(v.ikm), sha256(concat(ch, sh)));

  it('handshake, traffic and master secrets', () => {
    expect(toHex(sec.handshake)).toBe(v.handshakeSecret);
    expect(toHex(sec.clientHs)).toBe(v.cHs);
    expect(toHex(sec.serverHs)).toBe(v.sHs);
    expect(toHex(sec.master)).toBe(v.master);
  });

  it('server handshake traffic key and IV', () => {
    const k = trafficKeys(sec.serverHs);
    expect(toHex(k.key)).toBe(v.sKey);
    expect(toHex(k.iv)).toBe(v.sIv);
  });

  it('server Finished over CH…CertificateVerify', () => {
    const payload = fromHex(v.payload);                       // EE ‖ Certificate ‖ CertificateVerify ‖ Finished
    const upToCv = payload.subarray(0, payload.length - 36);
    expect(toHex(finishedVerifyData(sec.serverHs, sha256(concat(ch, sh, upToCv))))).toBe(v.finished);
  });

  it('encrypted handshake record, byte for byte', async () => {
    const rec = await encryptRecord(trafficKeys(sec.serverHs), 0, 22, fromHex(v.payload));
    expect(rec.length).toBe(679);
    expect(toHex(rec)).toBe(v.record);
  });
});

describe('a complete handshake with X25519MLKEM768 and a real chain', () => {
  for (const profile of ['classical', 'mldsa65', 'composite'] as const) {
    it(profile, async () => {
      const pki = createPki(profile);
      const leaf = issueLeaf(pki);
      const h = await runHandshake(pki.host, leaf.chain, leaf.key, leaf.cert.publicKey, true);
      expect(h.clientChecks).toEqual({ decrypted: true, certificateVerify: 'pass', serverFinished: true });
      // RFC 10024: client share 1216 bytes, ServerHello with 1120-byte server share
      expect(h.messages.serverHello).toBe(1210);
      expect(h.clientHello.length).toBeGreaterThan(1216);
      // the Certificate message carries exactly the DER of the chain plus framing
      expect(h.messages.certificate).toBe(4 + 1 + 3 + leaf.chain.reduce((s, d) => s + 3 + d.length + 2, 0));
      const tc = transportCost(h);
      // the hybrid ClientHello does not fit into one 1200-byte Initial: two datagrams → limit 7200
      expect(tc.quicClientBytes).toBe(2400);
      expect(tc.quicLimit).toBe(7200);
      expect(tc.tcpServerBytes).toBe(h.serverFlight.length);
    });
  }

  it('a client that cannot verify the algorithm skips CertificateVerify but still checks Finished', async () => {
    const pki = createPki('mldsa44');
    const leaf = issueLeaf(pki);
    const h = await runHandshake(pki.host, leaf.chain, leaf.key, leaf.cert.publicKey, false);
    expect(h.clientChecks).toEqual({ decrypted: true, certificateVerify: 'skip', serverFinished: true });
  });

  it('a different public key makes CertificateVerify fail', async () => {
    const pki = createPki('mldsa65');
    const leaf = issueLeaf(pki);
    const other = issueLeaf(pki);
    const h = await runHandshake(pki.host, leaf.chain, leaf.key, other.cert.publicKey, true);
    expect(h.clientChecks.certificateVerify).toBe('fail');
  });
});
