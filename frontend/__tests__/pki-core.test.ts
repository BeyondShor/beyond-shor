import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { sha512 } from '@noble/hashes/sha2.js';
import {
  concat, decodeOid, fromBase64, integer, oid, oidContent, parse, parseStrict, time, decodeTime, toHex, utf8Bytes,
} from '@/lib/pki/der';
import { ALGS, composite, keygen, sign, verify, type AlgId } from '@/lib/pki/algorithms';
import {
  encodeName, issueCatalystCertificate, issueCertificate, keyIdentifier, parseCertificate, randomSerial,
  verifyAltSignature, verifyCertSignature, type CertSpec,
} from '@/lib/pki/x509';
import { createCsr, parseCsr, verifyCsr } from '@/lib/pki/csr';
import { createCrl, parseCrl, verifyCrl } from '@/lib/pki/crl';
import { createLog, createSct, encodeSctList, parseSctList, precertTbsOf, verifySct } from '@/lib/pki/ct';
import { MerkleTree, evaluateInclusionProof, isValidSubtree, leafHash, maxProofHashes, verifyInclusion } from '@/lib/pki/merkle';
import { OID } from '@/lib/pki/oids';

const DAY = 86_400_000;
const now = new Date();

function spec(subject: string, issuer: string, key: { alg: AlgId; publicKey: Uint8Array }, ca: boolean): CertSpec {
  return {
    serial: randomSerial(),
    issuer: { C: 'DE', O: 'Test', CN: issuer },
    subject: { C: 'DE', O: 'Test', CN: subject },
    notBefore: new Date(now.getTime() - DAY),
    notAfter: new Date(now.getTime() + 30 * DAY),
    subjectKey: key,
    extensions: ca
      ? [{ type: 'basicConstraints', ca: true, pathLen: 0 }, { type: 'keyUsage', bits: ['keyCertSign', 'cRLSign'] }]
      : [{ type: 'basicConstraints', ca: false }, { type: 'keyUsage', bits: ['digitalSignature'] },
         { type: 'extKeyUsage', oids: [OID.kpServerAuth] }, { type: 'subjectAltName', dns: [subject] }],
  };
}

describe('DER', () => {
  it('encodes OIDs, integers and times like X.690 / RFC 5280', () => {
    expect(toHex(oid('1.2.840.10045.4.3.2'))).toBe('06082a8648ce3d040302');
    expect(toHex(oid(OID.mlDsa65))).toBe('0609608648016503040312');
    expect(decodeOid(oidContent('2.16.840.1.101.3.4.3.22'))).toBe('2.16.840.1.101.3.4.3.22');
    expect(toHex(integer(0))).toBe('020100');
    expect(toHex(integer(128))).toBe('02020080');                  // sign bit needs a leading zero
    expect(toHex(integer(Uint8Array.of(0, 0, 5)))).toBe('020105');  // minimal encoding
    // UTCTime until 2049, GeneralizedTime from 2050 on
    expect(time(new Date(Date.UTC(2049, 11, 31, 23, 59, 59)))[0]).toBe(0x17);
    expect(time(new Date(Date.UTC(2050, 0, 1)))[0]).toBe(0x18);
    const d = new Date(Date.UTC(2035, 11, 31, 23, 59, 59));
    expect(decodeTime(parse(time(d))).getTime()).toBe(d.getTime());
  });

  it('rejects non-DER length encodings', () => {
    expect(() => parseStrict(Uint8Array.of(0x04, 0x81, 0x01, 0x00))).toThrow();   // long form for short length
    expect(() => parseStrict(Uint8Array.of(0x30, 0x80, 0x00, 0x00))).toThrow();   // indefinite length
    expect(() => parseStrict(Uint8Array.of(0x04, 0x01, 0x00, 0x00))).toThrow();   // trailing data
  });
});

describe('signature algorithms', () => {
  const msg = utf8Bytes('Beyond Shor PKI playground');
  for (const alg of ['ecdsa-p256', 'mldsa44', 'mldsa65', 'composite-mldsa65-p256'] as AlgId[]) {
    it(`${alg}: sign/verify, sizes, tamper detection`, () => {
      const k = keygen(alg);
      expect(k.publicKey.length).toBe(ALGS[alg].pkBytes);
      const s = sign(k, msg);
      if (alg === 'ecdsa-p256') expect(s.length).toBeLessThanOrEqual(72);
      else if (alg === 'composite-mldsa65-p256') expect(s.length).toBeLessThanOrEqual(ALGS[alg].sigBytes);
      else expect(s.length).toBe(ALGS[alg].sigBytes);
      expect(verify(alg, k.publicKey, msg, s)).toBe(true);
      const bad = s.slice(); bad[bad.length >> 1] ^= 1;
      expect(verify(alg, k.publicKey, msg, bad)).toBe(false);
      expect(verify(alg, k.publicKey, concat(msg, Uint8Array.of(0)), s)).toBe(false);
    });
  }

  it('composite rejects a signature whose ML-DSA half was swapped out (AND rule)', () => {
    const a = keygen('composite-mldsa65-p256'), b = keygen('composite-mldsa65-p256');
    const sa = sign(a, msg), sb = sign(b, msg);
    const mixed = concat(composite.splitSignature(sb).mldsa, composite.splitSignature(sa).ecdsa);
    expect(verify('composite-mldsa65-p256', a.publicKey, msg, mixed)).toBe(false);
  });
});

describe('Composite ML-DSA test vectors (draft-ietf-lamps-pq-composite-sigs-19, Appendix E)', () => {
  const v = JSON.parse(readFileSync(path.join(__dirname, 'fixtures/composite-sigs-19.json'), 'utf8'));
  const m = fromBase64(v.m);
  const tc = v.tests.find((t: { tcId: string }) => t.tcId === 'id-MLDSA65-ECDSA-P256-SHA512');

  it('verifies the published signature over m with an empty context', () => {
    expect(verify('composite-mldsa65-p256', fromBase64(tc.pk), m, fromBase64(tc.s))).toBe(true);
  });

  it('builds M′ exactly as specified', () => {
    const mp = composite.message(m);
    expect(new TextDecoder().decode(mp.subarray(0, 32))).toBe('CompositeAlgorithmSignatures2025');
    expect(new TextDecoder().decode(mp.subarray(32, 32 + 33))).toBe('COMPSIG-MLDSA65-ECDSA-P256-SHA512');
    expect(mp[65]).toBe(0);                                           // len(ctx)
    expect(toHex(mp.subarray(66))).toBe(toHex(sha512(m)));
  });

  it('parses and validates the self-signed x5c certificate', () => {
    const cert = parseCertificate(fromBase64(tc.x5c));
    expect(cert.sigAlgOid).toBe(OID.compMlDsa65EcdsaP256);
    expect(cert.keyAlg).toBe('composite-mldsa65-p256');
    expect(toHex(cert.publicKey)).toBe(toHex(fromBase64(tc.pk)));
    expect(verifyCertSignature(cert, 'composite-mldsa65-p256', cert.publicKey)).toBe(true);
  });

  it('also parses and validates the pure ML-DSA-65 vector certificate (RFC 9881 encoding)', () => {
    const t65 = v.tests.find((t: { tcId: string }) => t.tcId === 'id-ML-DSA-65');
    const cert = parseCertificate(fromBase64(t65.x5c));
    expect(cert.keyAlg).toBe('mldsa65');
    expect(verifyCertSignature(cert, 'mldsa65', cert.publicKey)).toBe(true);
    expect(verify('mldsa65', fromBase64(t65.pk), m, fromBase64(t65.s))).toBe(true);
  });
});

describe('X.509 certificates', () => {
  for (const alg of ['ecdsa-p256', 'mldsa44', 'mldsa65', 'composite-mldsa65-p256'] as AlgId[]) {
    it(`${alg}: issue, parse, verify, detect tampering`, () => {
      const caKey = keygen(alg), leafKey = keygen(alg);
      const caSpec = spec('Test CA', 'Test CA', caKey, true);
      caSpec.extensions.push({ type: 'subjectKeyIdentifier', keyId: keyIdentifier(caKey.publicKey) });
      const ca = parseCertificate(issueCertificate(caSpec, caKey));
      expect(verifyCertSignature(ca, alg, caKey.publicKey)).toBe(true);
      expect(ca.basicConstraints).toEqual({ ca: true, pathLen: 0 });
      expect(ca.keyUsage).toEqual(['keyCertSign', 'cRLSign']);

      const leafSpec = spec('portal.muster.example', 'Test CA', leafKey, false);
      const leafDer = issueCertificate(leafSpec, caKey);
      const leaf = parseCertificate(leafDer);
      expect(leaf.san).toEqual(['portal.muster.example']);
      expect(leaf.extKeyUsage).toEqual([OID.kpServerAuth]);
      expect(leaf.basicConstraints).toEqual({ ca: false, pathLen: undefined });
      expect(leaf.keyUsage).toEqual(['digitalSignature']);
      expect(verifyCertSignature(leaf, alg, caKey.publicKey)).toBe(true);
      // flip one byte inside the subject's common name
      const t = leafDer.slice();
      const at = toHex(t).indexOf(toHex(utf8Bytes('portal'))) / 2;
      t[at] ^= 0x01;
      expect(verifyCertSignature(parseCertificate(t), alg, caKey.publicKey)).toBe(false);
      // byte breakdown accounts for every byte
      expect(leaf.breakdown.reduce((s, b) => s + b.bytes, 0)).toBe(leafDer.length);
    });
  }

  it('keyUsage keyCertSign|cRLSign encodes as 03 02 01 06 (RFC 5280 named bits)', () => {
    const k = keygen('ecdsa-p256');
    const der = issueCertificate(spec('CA', 'CA', k, true), k);
    expect(toHex(der)).toContain('300e0603551d0f0101ff040403020106');
  });

  it('ITU-T alternative signature covers the preTBSCertificate', () => {
    const issuer = keygen('ecdsa-p256'), issuerAlt = keygen('mldsa65'), leafKey = keygen('ecdsa-p256');
    const der = issueCatalystCertificate(spec('portal.muster.example', 'CA', leafKey, false), issuer, issuerAlt);
    const c = parseCertificate(der);
    expect(c.altSigAlgOid).toBe(OID.mlDsa65);
    expect(c.altSignature?.length).toBe(3309);
    expect(verifyCertSignature(c, 'ecdsa-p256', issuer.publicKey)).toBe(true);
    expect(verifyAltSignature(c, 'mldsa65', issuerAlt.publicKey)).toBe(true);
    expect(verifyAltSignature(c, 'mldsa65', keygen('mldsa65').publicKey)).toBe(false);
  });

  it('encodes a trust anchor ID name as in draft-ietf-tls-trust-anchor-ids-07 §4.1', () => {
    // 1.3.6.1.5.5.7.25.3=#0d0481fd5901
    expect(toHex(encodeName({ trustAnchorId: '32473.1' }))).toBe('30143112301006082b06010505071903' + '0d0481fd5901');
  });
});

describe('PKCS #10 and CRLs', () => {
  it('CSR proves possession of the private key', () => {
    const k = keygen('mldsa65');
    const csr = parseCsr(createCsr({ CN: 'portal.muster.example' }, k, ['portal.muster.example']));
    expect(verifyCsr(csr)).toBe(true);
    const forged = parseCsr(createCsr({ CN: 'portal.muster.example' }, k, ['portal.muster.example']));
    forged.publicKey = keygen('mldsa65').publicKey;           // someone else's public key
    expect(verifyCsr(forged)).toBe(false);
  });

  it('CRL lists revoked serials and is signed by the CA', () => {
    const ca = keygen('mldsa44');
    const serial = randomSerial();
    const crlDer = createCrl({ CN: 'Test CA' }, ca, keyIdentifier(ca.publicKey), 7, now, new Date(now.getTime() + 7 * DAY),
      [{ serial, date: now, reason: 'keyCompromise' }]);
    const crl = parseCrl(crlDer);
    expect(verifyCrl(crl, 'mldsa44', ca.publicKey)).toBe(true);
    expect(crl.revokedSerials).toEqual([BigInt('0x' + toHex(serial))]);
    expect(crl.issuerDer).toEqual(encodeName({ CN: 'Test CA' }));
  });
});

describe('Certificate Transparency (RFC 6962)', () => {
  it('SCTs over the precertificate verify after embedding', () => {
    const caKey = keygen('ecdsa-p256'), leafKey = keygen('ecdsa-p256');
    const caCert = parseCertificate(issueCertificate(spec('CA', 'CA', caKey, true), caKey));
    const logs = [createLog('Log A', 'ecdsa-p256'), createLog('Log B', 'ecdsa-p256')];
    const s = spec('shop.example.com', 'CA', leafKey, false);
    // precertificate TBS = final TBS without the SCT extension
    const pre = parseCertificate(issueCertificate(s, caKey));
    const scts = logs.map((l) => createSct(l, precertTbsOf(pre), caCert.spkiDer, Date.now(), ['shop.example.com'], 'CA'));
    s.extensions.push({ type: 'sctList', list: encodeSctList(scts) });
    const leaf = parseCertificate(issueCertificate(s, caKey));
    const parsed = parseSctList(leaf.sctList!);
    expect(parsed).toHaveLength(2);
    expect(parsed.every((p, i) => verifySct(p, logs[i], leaf, caCert.spkiDer))).toBe(true);
    // the wrong issuer key hash breaks the SCT
    expect(verifySct(parsed[0], logs[0], leaf, leaf.spkiDer)).toBe(false);
  });
});

describe('Merkle trees (RFC 9162) and subtrees (draft-ietf-plants-merkle-tree-certs-08 §4)', () => {
  it('inclusion proofs verify for every index of trees with 1–40 leaves', () => {
    for (let n = 1; n <= 40; n++) {
      const leaves = Array.from({ length: n }, (_, i) => leafHash(Uint8Array.of(i)));
      const t = new MerkleTree(leaves);
      for (let i = 0; i < n; i++) {
        const proof = t.inclusionProof(i);
        expect(proof.length).toBeLessThanOrEqual(maxProofHashes(n));
        expect(verifyInclusion(proof, i, leaves[i], 0, n, t.hash())).toBe(true);
        if (n > 1) expect(verifyInclusion(proof, i, leafHash(Uint8Array.of(255)), 0, n, t.hash())).toBe(false);
      }
    }
  });

  it('matches the draft’s subtree rules and example', () => {
    expect(isValidSubtree(8, 13)).toBe(true);
    expect(isValidSubtree(4, 13)).toBe(false);
    const leaves = Array.from({ length: 16 }, (_, i) => leafHash(Uint8Array.of(i)));
    const t = new MerkleTree(leaves);
    // entry 10 of [8, 13): MTH({d[11]}), MTH(D[8:10]), MTH({d[12]})
    const proof = t.inclusionProof(10, 8, 13);
    expect(proof.map(toHex)).toEqual([t.hash(11, 12), t.hash(8, 10), t.hash(12, 13)].map(toHex));
    expect(toHex(evaluateInclusionProof(proof, 10, leaves[10], 8, 13)!)).toBe(toHex(t.hash(8, 13)));
  });

  it('known-answer: empty tree and single leaf (RFC 9162 §2.1.1)', () => {
    expect(toHex(new MerkleTree([]).hash())).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(toHex(leafHash(new Uint8Array()))).toBe('6e340b9cffb37a989ca544e6bb780a2c78901d3fb33738768511a30617afa01d');
  });
});

