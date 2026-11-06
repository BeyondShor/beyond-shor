import { describe, it, expect } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import {
  base64url, caaPermits, createAccount, dns01Value, emptyZone, jwkThumbprint, keyAuthorization, relevantCaa, signJws,
  validateDns01, verifyJws,
} from '@/lib/pki/acme';
import { acmeCa, createPki, issueLeaf } from '@/lib/pki/engine';

describe('ACME (RFC 8555) building blocks', () => {
  it('base64url has no padding and uses - and _', () => {
    expect(base64url(Uint8Array.of(0xfb, 0xff))).toBe('-_8');
  });

  it('JWK thumbprint hashes the required EC members in lexicographic order (RFC 7638 §3)', () => {
    const jwk = { crv: 'P-256' as const, kty: 'EC' as const, x: 'f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU', y: 'x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0' };
    const canonical = '{"crv":"P-256","kty":"EC","x":"f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU","y":"x_FEzRu9m36HLN_tue659LNpXW6pCyStikYjKIWI5a0"}';
    expect(jwkThumbprint(jwk)).toBe(base64url(sha256(new TextEncoder().encode(canonical))));
  });

  it('dns-01: TXT value = base64url(SHA-256(token "." thumbprint)) (§8.4)', () => {
    const acct = createAccount('https://acme.test');
    const ka = keyAuthorization('evaGxfADs6pSRb2LAv9IZf17Dt3juxGJ-PCt92wr-oA', acct);
    expect(ka).toBe(`evaGxfADs6pSRb2LAv9IZf17Dt3juxGJ-PCt92wr-oA.${acct.thumbprint}`);
    expect(dns01Value(ka)).toBe(base64url(sha256(new TextEncoder().encode(ka))));
  });

  it('ES256 JWS verifies and detects tampering', () => {
    const acct = createAccount('https://acme.test');
    const jws = signJws(acct, 'https://acme.test/new-order', 'n1', { identifiers: [{ type: 'dns', value: 'a.example' }] });
    expect(verifyJws(acct.jwk, jws)).toBe(true);
    expect(verifyJws(acct.jwk, { ...jws, payload: jws.payload.replace(/.$/, 'A') })).toBe(false);
    expect(verifyJws(createAccount('https://acme.test').jwk, jws)).toBe(false);
  });
});

describe('CAA (RFC 8659, RFC 8657)', () => {
  const zone = emptyZone();
  zone.caa.set('example.com', ['0 issue "demo-web-ca.example; accounturi=https://acme.demo-web-ca.example/acct/1"']);

  it('climbs from the name to the closest CAA RRset', () => {
    expect(relevantCaa(zone, 'shop.example.com')?.owner).toBe('example.com');
    expect(relevantCaa(zone, 'other.org')).toBeNull();
  });

  it('checks issuer domain and accounturi', () => {
    const r = relevantCaa(zone, 'shop.example.com')!.records;
    expect(caaPermits(r, 'demo-web-ca.example', 'https://acme.demo-web-ca.example/acct/1')).toBe(true);
    expect(caaPermits(r, 'demo-web-ca.example', 'https://acme.demo-web-ca.example/acct/2')).toBe(false);
    expect(caaPermits(r, 'other-ca.example', 'https://acme.demo-web-ca.example/acct/1')).toBe(false);
    expect(caaPermits(['0 iodef "mailto:sec@example.com"'], 'any.example', 'x')).toBe(true);
  });
});

describe('domain validation in issuance', () => {
  it('Web PKI: three perspectives and CAA', () => {
    const pki = createPki('web-classical');
    const leaf = issueLeaf(pki);
    expect(leaf.acme).toMatchObject({ valid: true, orderJwsOk: true, finalizeJwsOk: true, caa: { checked: true, ok: true, owner: 'example.com' } });
    expect(leaf.acme!.perspectives).toHaveLength(3);
    expect(leaf.acme!.txtName).toBe('_acme-challenge.shop.example.com');
  });

  it('private PKI: internal resolver, no CAA requirement', () => {
    const leaf = issueLeaf(createPki('mldsa65'));
    expect(leaf.acme).toMatchObject({ valid: true, caa: { checked: false } });
    expect(leaf.acme!.perspectives.map((p) => p.name)).toEqual(['internal']);
  });

  it('a CAA record for another CA blocks validation', () => {
    const pki = createPki('web-classical');
    const zone = emptyZone();
    zone.caa.set('example.com', ['0 issue "other-ca.example"']);
    const trace = validateDns01(acmeCa(pki.profile), createAccount('https://acme.demo-web-ca.example'), 'shop.example.com', zone, new Uint8Array(8));
    expect(trace.caa.ok).toBe(false);
    expect(trace.valid).toBe(false);
  });
});
