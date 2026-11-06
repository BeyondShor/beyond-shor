// The playground's PKI: profiles, key ceremony, issuance, failure cases, attacks
// and the Q-Day deployments. Pure functions over real certificates — runs in the
// worker and in the tests alike.
import { composite, keygen, type KeyPair } from './algorithms';
import {
  ALGS, PRIVATE_DOMAIN, PRIVATE_HOST, PROFILES, WEB_HOST,
  type AlgId, type AttackId, type ClientId, type Profile, type ProfileId, type QDayDeployment, type Variant,
} from './meta';

export * from './meta';
import { fromHex, toHex, type Bytes } from './der';
import { OID } from './oids';
import { createCsr, parseCsr, verifyCsr } from './csr';
import { createCrl, type RevokedEntry } from './crl';
import { createAccount, emptyZone, validateDns01, type AcmeAccount, type AcmeCa, type AcmeTrace, type DnsZone } from './acme';
import { createLog, createSct, encodeSctList, precertTbsOf, type CtLog } from './ct';
import { createCosigner, issueMtc, MTC_CA_ID, MTC_MIRROR_ID, type Cosigner, type MtcIssued } from './mtc';
import {
  issueCatalystCertificate, issueCertificate, keyIdentifier, parseCertificate, randomSerial,
  type CertSpec, type DName, type ExtSpec, type ParsedCert,
} from './x509';
import { validateChain, type ClientPolicy, type CrlOnNetwork, type TrustAnchor, type ValidationResult } from './validate';
import { PRIVATE_USE_SCHEMES, runHandshake, transportCost, type TlsHandshake, type TransportCost } from './tls13';

export const DAY = 86_400_000;

// ── Names and lifetimes ───────────────────────────────────────────────────────

const ORG = 'Muster GmbH';
const WEB_ORG = 'Beyond Shor Demo Trust';

/** notAfter of a root: classical roots end with 2035 (BSI/NIST horizon), PQ roots get 20 years. */
function rootNotAfter(alg: AlgId, now: Date): Date {
  if (ALGS[alg].classical && !ALGS[alg].quantumSafe) return new Date(Date.UTC(2035, 11, 31, 23, 59, 59));
  return new Date(Date.UTC(now.getUTCFullYear() + 20, now.getUTCMonth(), now.getUTCDate()));
}

const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

// ── CA nodes ──────────────────────────────────────────────────────────────────

export interface CaNode {
  key:       KeyPair;
  /** ITU-T alternative key (catalyst deployments only) */
  altKey?:   KeyPair;
  name:      DName;
  der:       Bytes;
  cert:      ParsedCert;
  keyId:     Bytes;
  /** where this CA publishes its CRL (the root: the CRL for CA certificates, an ARL) */
  crlUri:    string;
  crlNumber: number;
  revoked:   RevokedEntry[];
  crlCache?: { number: number; der: Bytes };
}

function caExtensions(key: KeyPair, issuerKeyId: Bytes | null, opts: { pathLen?: number; permitted?: string[]; serverAuthOnly?: boolean }): ExtSpec[] {
  const ext: ExtSpec[] = [
    { type: 'basicConstraints', ca: true, pathLen: opts.pathLen },
    { type: 'keyUsage', bits: ['keyCertSign', 'cRLSign'] },
    { type: 'subjectKeyIdentifier', keyId: keyIdentifier(key.publicKey) },
  ];
  if (issuerKeyId) ext.push({ type: 'authorityKeyIdentifier', keyId: issuerKeyId });
  if (opts.serverAuthOnly) ext.push({ type: 'extKeyUsage', oids: [OID.kpServerAuth] });
  if (opts.permitted) ext.push({ type: 'nameConstraints', permittedDns: opts.permitted });
  return ext;
}

function makeRoot(alg: AlgId, name: DName, now: Date, altAlg?: AlgId, crlUri = ''): CaNode {
  const key = keygen(alg);
  const altKey = altAlg ? keygen(altAlg) : undefined;
  const keyId = keyIdentifier(key.publicKey);
  const extensions = caExtensions(key, null, {});
  if (altKey) extensions.push({ type: 'altPublicKey', alg: altKey.alg, publicKey: altKey.publicKey });
  const spec: CertSpec = {
    serial: randomSerial(), issuer: name, subject: name,
    notBefore: startOfDay(now), notAfter: rootNotAfter(alg, now),
    subjectKey: { alg, publicKey: key.publicKey }, extensions,
  };
  const der = altKey ? issueCatalystCertificate(spec, key, altKey) : issueCertificate(spec, key);
  return { key, altKey, name, der, cert: parseCertificate(der), keyId, crlUri, crlNumber: 1, revoked: [] };
}

function makeIntermediate(alg: AlgId, name: DName, parent: CaNode, now: Date, opts: { permitted?: string[]; altAlg?: AlgId; crlUri?: string }): CaNode {
  const key = keygen(alg);
  const altKey = opts.altAlg ? keygen(opts.altAlg) : undefined;
  const extensions = caExtensions(key, parent.keyId, { pathLen: 0, permitted: opts.permitted, serverAuthOnly: true });
  // the intermediate's own revocation status is published by the root
  if (parent.crlUri) extensions.push({ type: 'crlDistributionPoint', uri: parent.crlUri });
  if (altKey) extensions.push({ type: 'altPublicKey', alg: altKey.alg, publicKey: altKey.publicKey });
  const notAfter = new Date(Math.min(parent.cert.notAfter.getTime(), Date.UTC(now.getUTCFullYear() + 5, now.getUTCMonth(), now.getUTCDate())));
  const spec: CertSpec = {
    serial: randomSerial(), issuer: parent.name, subject: name,
    notBefore: startOfDay(now), notAfter,
    subjectKey: { alg, publicKey: key.publicKey }, extensions,
  };
  const der = parent.altKey && altKey ? issueCatalystCertificate(spec, parent.key, parent.altKey) : issueCertificate(spec, parent.key);
  return { key, altKey, name, der, cert: parseCertificate(der), keyId: keyIdentifier(key.publicKey), crlUri: opts.crlUri ?? '', crlNumber: 1, revoked: [] };
}

// ── The PKI of one profile ────────────────────────────────────────────────────

export interface Pki {
  profile:   Profile;
  now:       Date;
  host:      string;
  root?:     CaNode;
  issuing?:  CaNode;
  logs?:     CtLog[];
  cosigners?: Cosigner[];
  /** further issuing CAs under the same root (failure case: revoked intermediate) */
  extraCas:  CaNode[];
  /** the subscriber's DNS zone and ACME account (simulated DNS, real ACME cryptography) */
  zone:      DnsZone;
  account?:  AcmeAccount;
  ceremonyMs: Record<string, number>;
}

function timed<T>(fn: () => T): [T, number] {
  const t = performance.now();
  const r = fn();
  return [r, performance.now() - t];
}

export function crlUris(p: Profile) {
  return p.scope === 'private'
    ? { root: `http://pki.${PRIVATE_DOMAIN}/root-ca.crl`, issuing: `http://pki.${PRIVATE_DOMAIN}/tls-ca-1.crl`, sibling: `http://pki.${PRIVATE_DOMAIN}/tls-ca-2.crl` }
    : { root: 'http://crl.example.net/demo-web-root.crl', issuing: 'http://crl.example.net/demo-web-ca-r1.crl', sibling: 'http://crl.example.net/demo-web-ca-r2.crl' };
}

export function acmeCa(p: Profile): AcmeCa {
  return p.scope === 'private'
    // an internal ACME server; CAA is a rule for publicly trusted CAs only
    ? { directory: `https://pki.${PRIVATE_DOMAIN}/acme`, caaDomain: `pki.${PRIVATE_DOMAIN}`, checkCaa: false, perspectives: ['internal'] }
    // Baseline Requirements: domain control confirmed from several network perspectives, CAA checked
    : { directory: 'https://acme.demo-web-ca.example', caaDomain: 'demo-web-ca.example', checkCaa: true, perspectives: ['primary', 'remote1', 'remote2'] };
}

export function createPki(profileId: ProfileId, now = new Date()): Pki {
  const profile = PROFILES[profileId];
  const host = profile.scope === 'private' ? PRIVATE_HOST : WEB_HOST;
  const ceremonyMs: Record<string, number> = {};
  if (profile.mtc) {
    const [cosigners, ms] = timed(() => [createCosigner(MTC_CA_ID, 'ca'), createCosigner(MTC_MIRROR_ID, 'mirror')]);
    ceremonyMs.cosigners = ms;
    return { profile, now, host, cosigners, extraCas: [], zone: emptyZone(), ceremonyMs };
  }
  const org = profile.scope === 'private' ? ORG : WEB_ORG;
  const rootName: DName = profile.scope === 'private'
    ? { C: 'DE', O: org, CN: `${org} Root CA` }
    : { C: 'DE', O: org, CN: 'Demo Web Root' };
  const uris = crlUris(profile);
  const [root, rootMs] = timed(() => {
    const r = makeRoot(profile.root, rootName, now, undefined, uris.root);
    caCrl(r, now);               // the root publishes its (empty) CRL for CA certificates right away
    return r;
  });
  ceremonyMs.root = rootMs;
  const intName: DName = profile.scope === 'private'
    ? { C: 'DE', O: org, CN: `${org} TLS CA 1` }
    : { C: 'DE', O: org, CN: 'Demo Web CA R1' };
  const [issuing, intMs] = timed(() => makeIntermediate(profile.intermediate, intName, root, now,
    { permitted: profile.scope === 'private' ? [PRIVATE_DOMAIN] : undefined, crlUri: uris.issuing }));
  ceremonyMs.intermediate = intMs;
  const pki: Pki = { profile, now, host, root, issuing, extraCas: [], zone: emptyZone(), ceremonyMs };
  if (profile.ct) {
    const [logs, ms] = timed(() => [createLog('Demo-Log A', profile.ct!), createLog('Demo-Log B', profile.ct!)]);
    pki.logs = logs;
    ceremonyMs.logs = ms;
  }
  return pki;
}

// ── Issuance ──────────────────────────────────────────────────────────────────


export interface LeafResult {
  variant:   Variant;
  serial:    Bytes;
  key:       KeyPair;
  csr:       Bytes;
  csrValid:  boolean;
  der:       Bytes;
  cert:      ParsedCert;
  /** what the server sends: leaf first, root never included */
  chain:     Bytes[];
  expectedHost: string;
  mtc?:      MtcIssued;
  /** domain validation (regular issuance only — the failure cases model a CA that skips it) */
  acme?:     AcmeTrace;
  timings:   { keygen: number; csr: number; popCheck: number; validation: number; issue: number };
}

export function leafSpec(pki: Pki, key: KeyPair, variant: Variant, dnsName: string, issuing: CaNode | undefined = pki.issuing): CertSpec {
  const now = pki.now;
  const lifetime = 90 * DAY;            // within today's 200-day Baseline Requirements limit
  const notBefore = variant === 'expired' ? new Date(now.getTime() - 120 * DAY) : new Date(now.getTime() - 60_000);
  const notAfter = variant === 'expired' ? new Date(now.getTime() - 30 * DAY) : new Date(notBefore.getTime() + lifetime);
  const extensions: ExtSpec[] = [
    { type: 'basicConstraints', ca: false },
    { type: 'keyUsage', bits: ['digitalSignature'] },
    { type: 'extKeyUsage', oids: [variant === 'wrongEku' ? OID.kpClientAuth : OID.kpServerAuth] },
    // Web certificates carry an empty subject, so subjectAltName must be critical (RFC 5280 §4.2.1.6)
    { type: 'subjectAltName', dns: [dnsName], critical: pki.profile.scope === 'web' },
  ];
  if (issuing) {
    extensions.push({ type: 'subjectKeyIdentifier', keyId: keyIdentifier(key.publicKey) });
    extensions.push({ type: 'authorityKeyIdentifier', keyId: issuing.keyId });
    extensions.push({ type: 'crlDistributionPoint', uri: issuing.crlUri });
  }
  return {
    serial: randomSerial(),
    issuer: issuing?.name ?? { trustAnchorId: MTC_CA_ID },
    subject: pki.profile.scope === 'web' ? {} : { O: ORG, CN: dnsName },
    notBefore, notAfter,
    subjectKey: { alg: key.alg, publicKey: key.publicKey },
    extensions,
  };
}

export function issueLeaf(pki: Pki, variant: Variant = 'ok', mtcFill = 4095): LeafResult {
  const p = pki.profile;
  const expectedHost = variant === 'nameConstraints' ? 'portal.fremd.example' : pki.host;
  const dnsName = variant === 'wrongHost' ? `intranet.${PRIVATE_DOMAIN}`
    : variant === 'nameConstraints' ? 'portal.fremd.example' : pki.host;

  const [key, keygenMs] = timed(() => keygen(p.leaf));
  // Web certificates carry no subject name, only subjectAltName (as Let's Encrypt does since 2025)
  const [csr, csrMs] = timed(() => createCsr(p.scope === 'web' ? {} : { O: ORG, CN: dnsName }, key, [dnsName]));
  const [csrValid, popMs] = timed(() => verifyCsr(parseCsr(csr)));

  // Regular issuance: ACME dns-01 for the requested name. The failure cases model a CA
  // that deliberately skips its own checks, so they bypass it.
  let acme: AcmeTrace | undefined;
  let validationMs = 0;
  if (variant === 'ok') {
    [acme, validationMs] = timed(() => {
      if (!pki.account) {
        pki.account = createAccount(acmeCa(p).directory);
        // the domain owner allows only this CA and this ACME account (RFC 8659, RFC 8657)
        if (p.scope === 'web') pki.zone.caa.set('example.com', [`0 issue "${acmeCa(p).caaDomain}; accounturi=${pki.account.url}"`]);
      }
      return validateDns01(acmeCa(p), pki.account, dnsName, pki.zone, csr);
    });
    if (!acme.valid) throw new Error('domain validation failed');
  }

  // Failure case: a second issuing CA under the same root, revoked by the root
  let issuing = pki.issuing;
  if (variant === 'intermediateRevoked' && pki.root && pki.issuing) {
    const org = p.scope === 'private' ? ORG : WEB_ORG;
    const sibling = makeIntermediate(p.intermediate, { C: 'DE', O: org, CN: p.scope === 'private' ? `${org} TLS CA 2` : 'Demo Web CA R2' },
      pki.root, pki.now, { permitted: p.scope === 'private' ? [PRIVATE_DOMAIN] : undefined, crlUri: crlUris(p).sibling });
    pki.root.revoked.push({ serial: serialBytes(sibling.cert.serial), date: pki.now, reason: 'keyCompromise' });
    pki.root.crlNumber++;
    pki.extraCas.push(sibling);
    issuing = sibling;
  }
  const spec = leafSpec(pki, key, variant, dnsName, issuing);

  if (p.mtc) {
    const [issued, ms] = timed(() => issueMtc(spec, pki.cosigners!, mtcFill));
    const mtc = variant === 'tampered'
      ? { ...issued, landmarkRelative: tamperPublicKey(issued.landmarkRelative), standalone: tamperPublicKey(issued.standalone) }
      : issued;
    return {
      variant, serial: spec.serial, key, csr, csrValid, der: mtc.landmarkRelative, cert: parseCertificate(mtc.landmarkRelative),
      chain: [mtc.landmarkRelative], expectedHost, mtc, acme,
      timings: { keygen: keygenMs, csr: csrMs, popCheck: popMs, validation: validationMs, issue: ms },
    };
  }

  const ca = issuing!;
  const [der, issueMs] = timed(() => {
    if (pki.logs) {
      // Precertificate flow, simplified: the logs sign the TBSCertificate without the SCT
      // extension (RFC 6962 §3.2); the CA then embeds the SCTs and signs the final certificate.
      const pre = parseCertificate(issueCertificate(spec, ca.key));
      const ts = pki.now.getTime();
      const scts = pki.logs.map((l) => createSct(l, precertTbsOf(pre), ca.cert.spkiDer, ts, [dnsName], ca.name.CN ?? ''));
      spec.extensions.push({ type: 'sctList', list: encodeSctList(scts) });
    }
    return issueCertificate(spec, ca.key);
  });

  let finalDer = der;
  if (variant === 'tampered') finalDer = tamperPublicKey(der);
  if (variant === 'revoked') revoke(pki, spec.serial, 'keyCompromise');
  const cert = parseCertificate(finalDer);
  const chain = variant === 'missingIntermediate' ? [finalDer] : [finalDer, ca.der];
  return {
    variant, serial: spec.serial, key, csr, csrValid, der: finalDer, cert, chain, expectedHost, acme,
    timings: { keygen: keygenMs, csr: csrMs, popCheck: popMs, validation: validationMs, issue: issueMs },
  };
}

/** Mallory replaces the subject public key with her own bytes: the CA signature no longer matches. */
function tamperPublicKey(der: Bytes): Bytes {
  const c = parseCertificate(der);
  const hex = toHex(der), pk = toHex(c.publicKey);
  const at = hex.indexOf(pk) / 2;
  const out = der.slice();
  for (let i = 0; i < 16; i++) out[at + 8 + i] ^= 0x5a;
  return out;
}

const serialBytes = (n: bigint) => {
  const hex = n.toString(16);
  return fromHex(hex.length % 2 ? `0${hex}` : hex);
};

export function revoke(pki: Pki, serial: Bytes, reason: RevokedEntry['reason']) {
  pki.issuing!.revoked.push({ serial, date: pki.now, reason });
  pki.issuing!.crlNumber++;
}

/** A CA's current CRL, re-signed only after a revocation (BR: a new CRL within 24 hours). */
export function caCrl(ca: CaNode, now: Date): Bytes {
  if (ca.crlCache?.number !== ca.crlNumber) {
    ca.crlCache = {
      number: ca.crlNumber,
      der: createCrl(ca.name, ca.key, ca.keyId, ca.crlNumber, new Date(now.getTime() - 3_600_000), new Date(now.getTime() + 7 * DAY), ca.revoked),
    };
  }
  return ca.crlCache.der;
}

/** The issuing CA's current CRL. */
export const currentCrl = (pki: Pki) => caCrl(pki.issuing!, pki.now);

/** Every CRL the PKI publishes, as a client could fetch it. */
export function publishedCrls(pki: Pki, reachable: boolean): CrlOnNetwork[] {
  const cas = [pki.root, pki.issuing, ...pki.extraCas].filter((c): c is CaNode => !!c && !!c.crlUri);
  return cas.map((c) => ({ uri: c.crlUri, der: caCrl(c, pki.now), reachable }));
}

// ── Relying parties ───────────────────────────────────────────────────────────


export interface Client { id: ClientId; policy: ClientPolicy; anchors: TrustAnchor[] }

const ALL_ALGS: AlgId[] = ['ecdsa-p256', 'mldsa44', 'mldsa65', 'slhdsa192s', 'composite-mldsa65-p256'];

export function clientsFor(pki: Pki, crlReachable = true): { clients: Client[]; crls: CrlOnNetwork[] } {
  const crls = publishedCrls(pki, crlReachable);
  if (pki.profile.scope === 'private') {
    const anchors: TrustAnchor[] = [{ label: pki.root!.name.CN!, cert: pki.root!.cert }];
    return {
      crls,
      clients: [
        { id: 'legacy', anchors, policy: { supportedAlgs: ['ecdsa-p256'], understandsCatalyst: false, enforceAltSignature: false, requirePq: false, revocation: 'soft' } },
        { id: 'modern', anchors, policy: { supportedAlgs: ALL_ALGS, understandsCatalyst: true, enforceAltSignature: false, requirePq: false, revocation: 'soft' } },
        { id: 'strict', anchors, policy: { supportedAlgs: ALL_ALGS, understandsCatalyst: true, enforceAltSignature: true, requirePq: true, revocation: 'hard' } },
      ],
    };
  }
  // Web PKI. The public root stores hold classical roots only; for the hypothetical ML-DSA
  // profile no browser has the root. MTC needs landmarks (update channel) or cosigners.
  const webAnchors: TrustAnchor[] = pki.root && !pki.profile.hypothetical ? [{ label: pki.root.name.CN!, cert: pki.root.cert }] : [];
  const ct = pki.logs ? { requiredScts: 2, ctLogs: pki.logs } : {};
  const mtcLandmark = pki.cosigners ? { cosigners: pki.cosigners, quorum: 2, trustedSubtrees: new Map<string, Bytes>() } : undefined;
  return {
    crls,
    clients: [
      { id: 'browserToday', anchors: webAnchors, policy: { supportedAlgs: ['ecdsa-p256'], understandsCatalyst: false, enforceAltSignature: false, requirePq: false, revocation: 'local', ...ct } },
      { id: 'browserMtc', anchors: webAnchors, policy: { supportedAlgs: ['ecdsa-p256', 'mldsa44'], understandsCatalyst: false, enforceAltSignature: false, requirePq: false, revocation: 'local', mtc: mtcLandmark, ...ct } },
      { id: 'cliTool', anchors: webAnchors, policy: { supportedAlgs: ['ecdsa-p256', 'mldsa44'], understandsCatalyst: false, enforceAltSignature: false, requirePq: false, revocation: 'none', mtc: mtcLandmark && { ...mtcLandmark, trustedSubtrees: new Map() }, ...ct } },
    ],
  };
}

export interface HandshakeResult {
  client:     ClientId;
  /** which certificate form the server picked (MTC: landmark-relative or standalone) */
  presented:  'chain' | 'landmark' | 'standalone';
  validation: ValidationResult;
  certVerify: 'pass' | 'fail' | 'skip';
  accepted:   boolean;
  tls: {
    messages:  TlsHandshake['messages'];
    records:   TlsHandshake['records'];
    clientHelloBytes: number;
    scheme:    number;
    privateUseScheme: boolean;
    checks:    TlsHandshake['clientChecks'];
    transport: TransportCost;
    timings:   TlsHandshake['timings'];
  };
}

/**
 * A full TLS 1.3 server authentication: real handshake with X25519MLKEM768, the client
 * validates the chain (RFC 5280), CertificateVerify over the transcript and Finished.
 */
export async function handshake(pki: Pki, leaf: LeafResult, client: Client, crls: CrlOnNetwork[] = [], landmarkKnown = true): Promise<HandshakeResult> {
  let chain = leaf.chain;
  let presented: HandshakeResult['presented'] = 'chain';
  if (leaf.mtc) {
    // The browser with an update channel holds the landmark; the CLI tool does not and gets the standalone form
    const hasLandmark = client.id === 'browserMtc' && landmarkKnown;
    if (hasLandmark && client.policy.mtc) {
      client.policy.mtc.trustedSubtrees.set(`${leaf.mtc.subtree.start}:${leaf.mtc.subtree.end}`, leaf.mtc.subtree.hash);
    }
    presented = hasLandmark ? 'landmark' : 'standalone';
    chain = [hasLandmark ? leaf.mtc.landmarkRelative : leaf.mtc.standalone];
  }
  const validation = validateChain(chain, leaf.expectedHost, pki.now, client.anchors, client.policy, crls);
  const leafCert = parseCertificate(chain[0]);
  const h = await runHandshake(leaf.expectedHost, chain, leaf.key, leafCert.publicKey, client.policy.supportedAlgs.includes(leaf.key.alg));
  const certVerify = h.clientChecks.certificateVerify;
  return {
    client: client.id, presented, validation, certVerify,
    accepted: validation.ok && certVerify === 'pass' && h.clientChecks.decrypted && h.clientChecks.serverFinished,
    tls: {
      messages: h.messages, records: h.records, clientHelloBytes: h.clientHello.length, scheme: h.scheme,
      privateUseScheme: PRIVATE_USE_SCHEMES.has(h.scheme), checks: h.clientChecks, transport: transportCost(h), timings: h.timings,
    },
  };
}

// ── Attacks (Mallory) ─────────────────────────────────────────────────────────


export interface AttackOutcome {
  attack:   AttackId;
  results:  { client: ClientId; accepted: boolean; validation: ValidationResult }[];
  /** misissuance: who could notice it */
  detectedBy?: 'ctMonitor' | 'issuanceLog' | null;
}

export function runAttack(pki: Pki, attack: AttackId, crlBlocked = true): AttackOutcome {
  const { clients, crls } = clientsFor(pki, true);
  const host = pki.host;
  let chain: Bytes[];
  let crlsOnNet: CrlOnNetwork[] = crls;
  let detectedBy: AttackOutcome['detectedBy'];

  if (attack === 'ownCa') {
    // Mallory builds a complete chain of her own for the victim's name
    // (same profile and names, but keys of her own)
    const fake = createPki(pki.profile.id === 'web-mtc' ? 'web-classical' : pki.profile.id, pki.now);
    chain = issueLeaf(fake, 'ok').chain;
  } else if (attack === 'swapKey') {
    const l = issueLeaf(pki, 'tampered');
    // MTC: the standalone form, so every client checks the proof against cosignatures
    chain = l.mtc ? [l.mtc.standalone] : l.chain;
  } else if (attack === 'stolenKey') {
    // The server's key leaked; the operator revoked the certificate. Mallory presents it
    // anyway and blocks the client's CRL download.
    const l = issueLeaf(pki, 'ok');
    revoke(pki, l.serial, 'keyCompromise');
    chain = l.chain;
    crlsOnNet = publishedCrls(pki, !crlBlocked);
  } else {
    // A trusted CA issues a certificate for the victim's name to Mallory (cf. Fina, 2025)
    const l = issueLeaf(pki, 'ok');
    chain = l.chain;
    detectedBy = pki.logs ? 'ctMonitor' : null;
  }
  const results = clients.map((c) => {
    const validation = validateChain(chain, host, pki.now, c.anchors, c.policy, crlsOnNet);
    return { client: c.id, accepted: validation.ok, validation };
  });
  return { attack, results, detectedBy };
}

// ── Q-Day: who still accepts a forgery once Shor breaks the classical keys ────


export interface QDayCell { client: 'legacy' | 'modern' | 'strict'; legit: boolean; forged: boolean; forgedChecks: ValidationResult }

export interface QDayResult {
  deployment: QDayDeployment;
  cells:      QDayCell[];
  /** what Mallory computed with Shor's algorithm: classical public keys she turned into private keys */
  brokenKeys: { owner: string; alg: string; publicKeyHex: string; recoveredSecretHex: string }[];
  /** composite: Mallory's attempt to forge with only the ECDSA half */
  compositeForgeryRejected?: boolean;
}

const QDAY_POLICIES: Record<'legacy' | 'modern' | 'strict', ClientPolicy> = {
  legacy: { supportedAlgs: ['ecdsa-p256'], understandsCatalyst: false, enforceAltSignature: false, requirePq: false, revocation: 'none' },
  modern: { supportedAlgs: ALL_ALGS, understandsCatalyst: true, enforceAltSignature: false, requirePq: false, revocation: 'none' },
  strict: { supportedAlgs: ALL_ALGS, understandsCatalyst: true, enforceAltSignature: true, requirePq: true, revocation: 'none' },
};

function hierarchy(alg: AlgId, label: string, now: Date, altAlg?: AlgId) {
  const root = makeRoot(alg, { C: 'DE', O: ORG, CN: `${ORG} ${label} Root` }, now, altAlg);
  const issuing = makeIntermediate(alg, { C: 'DE', O: ORG, CN: `${ORG} ${label} TLS CA` }, root, now, { permitted: [PRIVATE_DOMAIN], altAlg });
  const pki: Pki = { profile: { ...PROFILES.classical, leaf: alg }, now, host: PRIVATE_HOST, root, issuing, extraCas: [], zone: emptyZone(), ceremonyMs: {} };
  return { root, issuing, pki, anchor: { label: root.name.CN!, cert: root.cert } as TrustAnchor };
}

function leafFrom(issuing: CaNode, alg: AlgId, now: Date, opts: { related?: Bytes; catalyst?: boolean } = {}): Bytes {
  const key = keygen(alg);
  const extensions: ExtSpec[] = [
    { type: 'basicConstraints', ca: false },
    { type: 'keyUsage', bits: ['digitalSignature'] },
    { type: 'extKeyUsage', oids: [OID.kpServerAuth] },
    { type: 'subjectAltName', dns: [PRIVATE_HOST] },
    { type: 'authorityKeyIdentifier', keyId: issuing.keyId },
  ];
  if (opts.related) extensions.push({ type: 'relatedCertificate', certDer: opts.related });
  const spec: CertSpec = {
    serial: randomSerial(), issuer: issuing.name, subject: { O: ORG, CN: PRIVATE_HOST },
    notBefore: new Date(now.getTime() - 60_000), notAfter: new Date(now.getTime() + 90 * DAY),
    subjectKey: { alg, publicKey: key.publicKey }, extensions,
  };
  return opts.catalyst && issuing.altKey ? issueCatalystCertificate(spec, issuing.key, issuing.altKey) : issueCertificate(spec, issuing.key);
}

/**
 * Shor's algorithm is simulated: the demo hands Mallory the private key that a
 * cryptographically relevant quantum computer could derive from the public key.
 */
function shor(node: CaNode): KeyPair {
  if (node.key.alg !== 'ecdsa-p256') throw new Error('Shor applies to the classical key only');
  return node.key;
}

export function runQDay(deployment: QDayDeployment, now = new Date()): QDayResult {
  const brokenKeys: QDayResult['brokenKeys'] = [];
  const recordBreak = (n: CaNode) => brokenKeys.push({
    owner: n.name.CN!, alg: 'ECDSA P-256', publicKeyHex: toHex(n.key.publicKey), recoveredSecretHex: toHex(shor(n).secretKey),
  });

  // Deployments: which chain the legitimate server presents to each client, which anchors each client trusts
  let anchors: Record<'legacy' | 'modern' | 'strict', TrustAnchor[]>;
  let legitChain: Record<'legacy' | 'modern' | 'strict', Bytes[]>;
  let forged: Bytes[];
  let compositeForgeryRejected: boolean | undefined;

  if (deployment === 'catalyst') {
    // One hierarchy: ECDSA native keys, ML-DSA-65 alternative keys (X.509 §9.8)
    const h = hierarchy('ecdsa-p256', 'Hybrid', now, 'mldsa65');
    const legit = [leafFrom(h.issuing, 'ecdsa-p256', now, { catalyst: true }), h.issuing.der];
    anchors = { legacy: [h.anchor], modern: [h.anchor], strict: [h.anchor] };
    legitChain = { legacy: legit, modern: legit, strict: legit };
    recordBreak(h.root); recordBreak(h.issuing);
    // Mallory signs natively with the broken ECDSA key and simply leaves the alternative signature out
    forged = [leafFrom({ ...h.issuing, key: shor(h.issuing), altKey: undefined }, 'ecdsa-p256', now), h.issuing.der];
  } else {
    const classical = hierarchy('ecdsa-p256', 'Classic', now);
    recordBreak(classical.root); recordBreak(classical.issuing);
    const classicalLegit = [leafFrom(classical.issuing, 'ecdsa-p256', now), classical.issuing.der];
    forged = [leafFrom({ ...classical.issuing, key: shor(classical.issuing) }, 'ecdsa-p256', now), classical.issuing.der];

    if (deployment === 'classical') {
      anchors = { legacy: [classical.anchor], modern: [classical.anchor], strict: [classical.anchor] };
      legitChain = { legacy: classicalLegit, modern: classicalLegit, strict: classicalLegit };
    } else {
      const pqAlg: AlgId = deployment === 'compositeParallel' ? 'composite-mldsa65-p256' : 'mldsa65';
      const pq = hierarchy(pqAlg, deployment === 'compositeParallel' ? 'Composite' : 'PQC', now);
      let pqLeaf: Bytes;
      if (deployment === 'dual') {
        // RFC 9763: the PQ leaf references the classical leaf of the same server
        pqLeaf = leafFrom(pq.issuing, 'mldsa65', now, { related: classicalLegit[0] });
      } else {
        pqLeaf = leafFrom(pq.issuing, pqAlg, now);
      }
      const pqChain = [pqLeaf, pq.issuing.der];
      // Transition: old devices only know the classical root, current ones both, strict ones only the PQ root
      anchors = { legacy: [classical.anchor], modern: [classical.anchor, pq.anchor], strict: [pq.anchor] };
      legitChain = { legacy: classicalLegit, modern: pqChain, strict: pqChain };

      if (deployment === 'compositeParallel') {
        // Mallory knows the ECDSA half of the composite CA key, not the ML-DSA half: she can
        // only fill that half with a signature from a key of her own
        const ecSk = composite.ecdsaSecret(pq.issuing.key.secretKey);
        brokenKeys.push({ owner: `${pq.issuing.name.CN} (ECDSA-Teil)`, alg: 'ECDSA P-256', publicKeyHex: toHex(pq.issuing.key.publicKey.subarray(1952)), recoveredSecretHex: toHex(ecSk) });
        const attempt = forgeCompositeWithEcdsaHalf(pq.issuing, now);
        const r = validateChain([attempt, pq.issuing.der], PRIVATE_HOST, now, [pq.anchor], QDAY_POLICIES.modern);
        compositeForgeryRejected = !r.ok;
      }
    }
  }

  const cells: QDayCell[] = (['legacy', 'modern', 'strict'] as const).map((c) => {
    const legit = validateChain(legitChain[c], PRIVATE_HOST, now, anchors[c], QDAY_POLICIES[c]);
    const forgedChecks = validateChain(forged, PRIVATE_HOST, now, anchors[c], QDAY_POLICIES[c]);
    return { client: c, legit: legit.ok, forged: forgedChecks.ok, forgedChecks };
  });
  return { deployment, cells, brokenKeys, compositeForgeryRejected };
}

function forgeCompositeWithEcdsaHalf(issuing: CaNode, now: Date): Bytes {
  const ownMl = keygen('mldsa65');
  const realEcSk = composite.ecdsaSecret(issuing.key.secretKey);
  // A composite "key" combining Mallory's ML-DSA key with the broken ECDSA scalar
  const hybridSecret = new Uint8Array(32 + ownMl.secretKey.length + 32);
  hybridSecret.set(crypto.getRandomValues(new Uint8Array(32)), 0);
  hybridSecret.set(ownMl.secretKey, 32);
  hybridSecret.set(realEcSk, 32 + ownMl.secretKey.length);
  const forger: CaNode = { ...issuing, key: { alg: 'composite-mldsa65-p256', publicKey: issuing.key.publicKey, secretKey: hybridSecret } };
  return leafFrom(forger, 'mldsa65', now);
}

// ── Benchmark ─────────────────────────────────────────────────────────────────

export interface BenchRun {
  leafKeygen: number; csrSign: number; popCheck: number; validation: number; issue: number; validate: number;
  cvSign: number; cvVerify: number; handshake: number;
  chainBytes: number; handshakeBytes: number;
}

export async function benchmarkRun(pki: Pki): Promise<BenchRun> {
  const leaf = issueLeaf(pki, 'ok', 1023);
  const { clients, crls } = clientsFor(pki);
  const client = clients[1];   // 'modern' / 'browserMtc': supports every algorithm of the profile
  let chain = leaf.chain;
  if (leaf.mtc) {
    client.policy.mtc?.trustedSubtrees.set(`${leaf.mtc.subtree.start}:${leaf.mtc.subtree.end}`, leaf.mtc.subtree.hash);
    chain = [leaf.mtc.landmarkRelative];
  }
  const [, validateMs] = timed(() => validateChain(chain, leaf.expectedHost, pki.now, client.anchors, client.policy, crls));
  const t = performance.now();
  const h = await runHandshake(leaf.expectedHost, chain, leaf.key, parseCertificate(chain[0]).publicKey, true);
  const handshakeMs = performance.now() - t;
  return {
    leafKeygen: leaf.timings.keygen, csrSign: leaf.timings.csr, popCheck: leaf.timings.popCheck, validation: leaf.timings.validation,
    issue: leaf.timings.issue, validate: validateMs, cvSign: h.timings.serverSign, cvVerify: h.timings.clientVerify, handshake: handshakeMs,
    chainBytes: chain.reduce((s, d) => s + d.length, 0), handshakeBytes: h.serverFlight.length,
  };
}

// ── Revocation & exposure window ──────────────────────────────────────────────

/**
 * Exposure window = min(notAfter, effective revocation) − compromise (in days).
 * A client that never sees the revocation (no check, or a blocked soft-fail lookup)
 * is exposed for the full remaining lifetime.
 */
export function exposureDays(lifetimeDays: number, compromiseDay: number, revokedAfterDays: number, revocationReaches: boolean): number {
  const end = lifetimeDays;
  const effective = revocationReaches ? Math.min(end, compromiseDay + revokedAfterDays) : end;
  return Math.max(0, effective - compromiseDay);
}

