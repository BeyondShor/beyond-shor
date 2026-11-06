// Domain validation with ACME (RFC 8555) dns-01 and CAA (RFC 8659, RFC 8657).
// The protocol cryptography is real: account key, JWS signatures (ES256), challenge
// token, JWK thumbprint (RFC 7638), key authorization and TXT digest. Only DNS itself
// is simulated — an in-memory zone, since nobody here controls example.com.
import { sha256 } from '@noble/hashes/sha2.js';
import { p256 } from '@noble/curves/nist.js';
import { utf8Bytes, type Bytes } from './der';

export function base64url(b: Bytes): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface AcmeAccount {
  secretKey: Bytes;
  jwk: { crv: 'P-256'; kty: 'EC'; x: string; y: string };
  thumbprint: string;
  url: string;
}

export function createAccount(directory: string): AcmeAccount {
  const secretKey = p256.utils.randomSecretKey();
  const pub = p256.getPublicKey(secretKey, false);
  const jwk = { crv: 'P-256' as const, kty: 'EC' as const, x: base64url(pub.subarray(1, 33)), y: base64url(pub.subarray(33, 65)) };
  const thumbprint = jwkThumbprint(jwk);
  return { secretKey, jwk, thumbprint, url: `${directory}/acct/${thumbprint.slice(0, 12)}` };
}

/** RFC 7638: SHA-256 over the required members in lexicographic order, no whitespace. */
export function jwkThumbprint(jwk: { crv: string; kty: string; x: string; y: string }): string {
  return base64url(sha256(utf8Bytes(`{"crv":"${jwk.crv}","kty":"${jwk.kty}","x":"${jwk.x}","y":"${jwk.y}"}`)));
}

export interface Jws { protected: string; payload: string; signature: string }

/** Flattened JWS (RFC 7515) with ES256: ECDSA P-256 with SHA-256, signature as R ‖ S (RFC 7518 §3.4). */
export function signJws(account: AcmeAccount, url: string, nonce: string, payload: object | ''): Jws {
  const prot = base64url(utf8Bytes(JSON.stringify({ alg: 'ES256', kid: account.url, nonce, url })));
  const pl = payload === '' ? '' : base64url(utf8Bytes(JSON.stringify(payload)));
  const sig = p256.sign(utf8Bytes(`${prot}.${pl}`), account.secretKey);   // compact 64-byte R ‖ S, SHA-256 prehash
  return { protected: prot, payload: pl, signature: base64url(sig) };
}

function fromB64url(s: string): Bytes {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export function verifyJws(jwk: AcmeAccount['jwk'], jws: Jws): boolean {
  const pub = new Uint8Array(65);
  pub[0] = 4;
  pub.set(fromB64url(jwk.x), 1);
  pub.set(fromB64url(jwk.y), 33);
  try { return p256.verify(fromB64url(jws.signature), utf8Bytes(`${jws.protected}.${jws.payload}`), pub, { lowS: false }); }
  catch { return false; }
}

export const keyAuthorization = (token: string, account: AcmeAccount) => `${token}.${account.thumbprint}`;
export const dns01Value = (keyAuth: string) => base64url(sha256(utf8Bytes(keyAuth)));

// ── Simulated DNS ─────────────────────────────────────────────────────────────

export interface DnsZone { txt: Map<string, string[]>; caa: Map<string, string[]> }

export const emptyZone = (): DnsZone => ({ txt: new Map(), caa: new Map() });

/**
 * RFC 8659 §3: the relevant CAA RRset is found by climbing from the name towards the
 * root; the first non-empty set counts. No CAA records anywhere: any CA may issue.
 */
export function relevantCaa(zone: DnsZone, name: string): { owner: string; records: string[] } | null {
  const labels = name.toLowerCase().split('.');
  for (let i = 0; i < labels.length; i++) {
    const owner = labels.slice(i).join('.');
    const rs = zone.caa.get(owner);
    if (rs?.length) return { owner, records: rs };
  }
  return null;
}

/** Is `caDomain` with `accountUrl` authorized by an `issue` property (RFC 8659 §4.2, RFC 8657)? */
export function caaPermits(records: string[], caDomain: string, accountUrl: string): boolean {
  const issue = records.map((r) => /^\d+\s+issue\s+"(.*)"$/.exec(r)?.[1]).filter((v): v is string => v !== undefined);
  if (issue.length === 0) return true;          // no issue property: issue tags don't restrict
  return issue.some((v) => {
    const [domain, ...params] = v.split(';').map((x) => x.trim());
    if (domain.toLowerCase() !== caDomain.toLowerCase()) return false;
    const acct = params.map((p) => p.split('=')).find(([k]) => k === 'accounturi');
    return !acct || acct[1] === accountUrl;
  });
}

// ── One validation run ────────────────────────────────────────────────────────

export interface AcmeTrace {
  directory:   string;
  accountUrl:  string;
  thumbprint:  string;
  orderJwsOk:  boolean;
  token:       string;
  txtName:     string;
  txtValue:    string;
  perspectives: { name: string; ok: boolean }[];
  caa:         { checked: boolean; owner?: string; record?: string; ok: boolean };
  finalizeJwsOk: boolean;
  valid:       boolean;
}

export interface AcmeCa { directory: string; caaDomain: string; checkCaa: boolean; perspectives: string[] }

export function validateDns01(ca: AcmeCa, account: AcmeAccount, identifier: string, zone: DnsZone, csr: Bytes): AcmeTrace {
  // newOrder, signed with the account key
  const nonce = () => base64url(crypto.getRandomValues(new Uint8Array(16)));
  const order = signJws(account, `${ca.directory}/new-order`, nonce(), { identifiers: [{ type: 'dns', value: identifier }] });
  const orderJwsOk = verifyJws(account.jwk, order);

  // the CA's challenge: ≥ 128 bits of entropy, base64url without padding (§8.4)
  const token = base64url(crypto.getRandomValues(new Uint8Array(32)));
  // the client publishes the digest of its key authorization in DNS
  const txtName = `_acme-challenge.${identifier}`;
  const txtValue = dns01Value(keyAuthorization(token, account));
  zone.txt.set(txtName, [...(zone.txt.get(txtName) ?? []), txtValue]);

  // the CA looks the record up — from several network perspectives in the Web PKI
  const expected = dns01Value(keyAuthorization(token, account));
  const perspectives = ca.perspectives.map((name) => ({ name, ok: (zone.txt.get(txtName) ?? []).includes(expected) }));

  let caa: AcmeTrace['caa'] = { checked: false, ok: true };
  if (ca.checkCaa) {
    const rel = relevantCaa(zone, identifier);
    caa = rel
      ? { checked: true, owner: rel.owner, record: rel.records.join(' | '), ok: caaPermits(rel.records, ca.caaDomain, account.url) }
      : { checked: true, ok: true };
  }

  const finalize = signJws(account, `${ca.directory}/finalize`, nonce(), { csr: base64url(csr) });
  const finalizeJwsOk = verifyJws(account.jwk, finalize);
  zone.txt.delete(txtName);                    // the client cleans up after validation

  return {
    directory: ca.directory, accountUrl: account.url, thumbprint: account.thumbprint, orderJwsOk, token, txtName, txtValue,
    perspectives, caa, finalizeJwsOk,
    valid: orderJwsOk && perspectives.every((p) => p.ok) && caa.ok && finalizeJwsOk,
  };
}
