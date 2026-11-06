import { describe, it, expect } from 'vitest';
import {
  clientsFor, createPki, exposureDays, handshake, issueLeaf, runAttack, runQDay, QDAY_DEPLOYMENTS,
  type ClientId, type ProfileId, type Variant,
} from '@/lib/pki/engine';
import { parseCertificate } from '@/lib/pki/x509';
import { parseMtcProof, verifyMtc } from '@/lib/pki/mtc';
import { OID } from '@/lib/pki/oids';

function acceptance(profile: ProfileId): Record<string, boolean> {
  const pki = createPki(profile);
  const leaf = issueLeaf(pki);
  expect(leaf.csrValid).toBe(true);
  const { clients, crl } = clientsFor(pki);
  return Object.fromEntries(clients.map((c) => [c.id, handshake(pki, leaf, c, crl).accepted]));
}

function failingChecks(profile: ProfileId, variant: Variant, client: ClientId = 'modern'): string[] {
  const pki = createPki(profile);
  const leaf = issueLeaf(pki, variant);
  const { clients, crl } = clientsFor(pki);
  const c = clients.find((x) => x.id === client)!;
  return handshake(pki, leaf, c, crl).validation.checks.filter((x) => x.status === 'fail').map((x) => x.id);
}

describe('private PKI profiles: who accepts the legitimate chain', () => {
  it('classical: everyone except the PQ-only client', () => {
    expect(acceptance('classical')).toEqual({ legacy: true, modern: true, strict: false });
  });
  for (const p of ['mldsa44', 'mldsa65', 'composite'] as ProfileId[]) {
    it(`${p}: the legacy device cannot verify the algorithm`, () => {
      expect(acceptance(p)).toEqual({ legacy: false, modern: true, strict: true });
    });
  }
  it('mixed (SLH-DSA root, ML-DSA below)', () => {
    expect(acceptance('mixed')).toEqual({ legacy: false, modern: true, strict: true });
  }, 120_000);

  it('the legacy device fails at the algorithm check, not elsewhere', () => {
    const pki = createPki('mldsa65');
    const { clients, crl } = clientsFor(pki);
    const v = handshake(pki, issueLeaf(pki), clients[0], crl).validation;
    expect(v.checks.find((c) => c.id === 'algorithm' && c.status === 'fail')?.reason).toBe('unsupported');
  });
});

describe('failure cases fail exactly where RFC 5280 says', () => {
  const expected: [Variant, string][] = [
    ['expired', 'validity'], ['wrongHost', 'hostname'], ['missingIntermediate', 'path'],
    ['nameConstraints', 'nameConstraints'], ['wrongEku', 'eku'], ['revoked', 'revocation'], ['tampered', 'signature'],
  ];
  for (const [variant, check] of expected) {
    it(`${variant} → ${check}`, () => {
      expect(failingChecks('mldsa65', variant)).toEqual([check]);
    });
  }
});

describe('Web PKI profiles', () => {
  it('classical: browsers verify two SCTs', () => {
    const pki = createPki('web-classical');
    const leaf = issueLeaf(pki);
    const { clients, crl } = clientsFor(pki);
    const r = handshake(pki, leaf, clients[0], crl);
    expect(r.accepted).toBe(true);
    expect(r.validation.checks.find((c) => c.id === 'scts')?.params).toEqual({ valid: 2, required: 2 });
    // empty subject → subjectAltName critical (RFC 5280 §4.2.1.6)
    expect(leaf.cert.extensions.find((e) => e.oid === OID.subjectAltName)?.critical).toBe(true);
  });

  it('hypothetical ML-DSA-44 X.509: no public root store holds such a root', () => {
    expect(acceptance('web-mldsa44')).toEqual({ browserToday: false, browserMtc: false, cliTool: false });
  });

  it('MTC: landmark-relative for the updated browser, standalone for the tool, unknown to today’s browser', () => {
    const pki = createPki('web-mtc');
    const leaf = issueLeaf(pki);
    const { clients } = clientsFor(pki);
    const res = Object.fromEntries(clients.map((c) => [c.id, handshake(pki, leaf, c)]));
    expect(res.browserToday.accepted).toBe(false);
    expect(res.browserMtc.accepted).toBe(true);
    expect(res.browserMtc.presented).toBe('landmark');
    expect(res.cliTool.accepted).toBe(true);
    expect(res.cliTool.presented).toBe('standalone');
    expect(res.cliTool.validation.checks.find((c) => c.id === 'mtcProof')?.params).toEqual({ cosignatures: 2 });
    // inclusion proof: 4096 entries → 12 hashes; landmark-relative carries no signatures
    expect(leaf.mtc!.proofHashes).toBe(12);
    const lr = parseMtcProof(parseCertificate(leaf.mtc!.landmarkRelative).signature);
    expect(lr.cosignatures).toHaveLength(0);
    expect(lr.proof).toHaveLength(12);
  });

  it('MTC: a modified certificate no longer matches the proof; one cosignature is not a quorum', () => {
    const pki = createPki('web-mtc');
    const leaf = issueLeaf(pki);
    const der = leaf.mtc!.standalone.slice();
    const host = new TextEncoder().encode('shop.example.com');
    const i = der.findIndex((_, k) => host.every((b, j) => der[k + j] === b));
    der[i] ^= 0x01;                          // 'shop' → 'rhop' inside subjectAltName
    const cert = parseCertificate(der);
    expect(verifyMtc(cert, { cosigners: pki.cosigners!, quorum: 2, trustedSubtrees: new Map() }).ok).toBe(false);
    const good = parseCertificate(leaf.mtc!.standalone);
    expect(verifyMtc(good, { cosigners: [pki.cosigners![1]], quorum: 2, trustedSubtrees: new Map() })).toMatchObject({ ok: false, reason: 'cosignatures', validCosignatures: 1 });
  });
});

describe('attacks without a quantum computer', () => {
  it('MTC: a swapped key breaks the inclusion proof for every client', () => {
    expect(runAttack(createPki('web-mtc'), 'swapKey').results.every((r) => !r.accepted)).toBe(true);
  });

  it('own CA and swapped key are rejected by everyone', () => {
    const pki = createPki('mldsa65');
    expect(runAttack(pki, 'ownCa').results.every((r) => !r.accepted)).toBe(true);
    expect(runAttack(pki, 'swapKey').results.every((r) => !r.accepted)).toBe(true);
  });

  it('stolen key + blocked CRL: soft-fail accepts, hard-fail rejects', () => {
    const pki = createPki('mldsa65');
    const r = Object.fromEntries(runAttack(pki, 'stolenKey', true).results.map((x) => [x.client, x.accepted]));
    expect(r).toEqual({ legacy: false, modern: true, strict: false });
    const reachable = Object.fromEntries(runAttack(createPki('mldsa65'), 'stolenKey', false).results.map((x) => [x.client, x.accepted]));
    expect(reachable).toEqual({ legacy: false, modern: false, strict: false });
  });

  it('Web PKI: locally shipped revocation data cannot be blocked', () => {
    const r = Object.fromEntries(runAttack(createPki('web-classical'), 'stolenKey', true).results.map((x) => [x.client, x.accepted]));
    expect(r).toEqual({ browserToday: false, browserMtc: false, cliTool: true });
  });

  it('misissuance by a trusted CA validates — CT makes it findable in the Web PKI', () => {
    const web = runAttack(createPki('web-classical'), 'misissuance');
    expect(web.results.every((r) => r.accepted)).toBe(true);
    expect(web.detectedBy).toBe('ctMonitor');
    expect(runAttack(createPki('classical'), 'misissuance').detectedBy).toBeNull();
  });
});

describe('Q-Day: protection only comes from rejecting classical chains', () => {
  const expectations: Record<string, { legit: boolean[]; forged: boolean[] }> = {
    classical:         { legit: [true, true, false], forged: [true, true, false] },
    pqParallel:        { legit: [true, true, true], forged: [true, true, false] },
    compositeParallel: { legit: [true, true, true], forged: [true, true, false] },
    catalyst:          { legit: [true, true, true], forged: [true, true, false] },
    dual:              { legit: [true, true, true], forged: [true, true, false] },
  };
  for (const d of QDAY_DEPLOYMENTS) {
    it(d, () => {
      const r = runQDay(d);
      expect(r.cells.map((c) => c.legit)).toEqual(expectations[d].legit);
      expect(r.cells.map((c) => c.forged)).toEqual(expectations[d].forged);
      expect(r.brokenKeys.length).toBeGreaterThan(0);
      if (d === 'compositeParallel') expect(r.compositeForgeryRejected).toBe(true);
    });
  }

  it('catalyst: the strict client rejects the forgery for the missing alternative signature', () => {
    const strict = runQDay('catalyst').cells[2];
    const leafCheck = strict.forgedChecks.checks.find((c) => c.id === 'altSignature' && c.cert === 'portal.muster.example');
    expect(leafCheck).toMatchObject({ status: 'fail', reason: 'missing' });
  });
});

describe('exposure window', () => {
  it('min(notAfter, effective revocation) − compromise', () => {
    expect(exposureDays(90, 30, 1, true)).toBe(1);
    expect(exposureDays(90, 30, 1, false)).toBe(60);       // revocation never reaches the client
    expect(exposureDays(6.67, 2, 1, false)).toBeCloseTo(4.67);
    expect(exposureDays(47, 46.5, 1, true)).toBeCloseTo(0.5);
  });
});
