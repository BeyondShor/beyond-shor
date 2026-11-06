// Certification path validation for the playground's relying parties: a faithful
// subset of RFC 5280 §6.1 plus the policies that decide quantum safety (catalyst
// rule, PQ-only policy), revocation behaviour and the Web-PKI SCT requirement.
import { ALGS, algByOid, type AlgId } from './algorithms';
import { equalBytes, type Bytes } from './der';
import { OID } from './oids';
import { parseCrl, verifyCrl } from './crl';
import { parseSctList, verifySct, type CtLog } from './ct';
import { verifyMtc, type MtcRelyingParty } from './mtc';
import { nameToString, parseCertificate, verifyAltSignature, verifyCertSignature, type ParsedCert } from './x509';

export type RevocationMode = 'hard' | 'soft' | 'none' | 'local';

export interface ClientPolicy {
  supportedAlgs:        AlgId[];
  /** Knows the ITU-T alternative-signature extensions and checks them when present. */
  understandsCatalyst:  boolean;
  /** Rejects a certificate without alternative signature if its issuer has an alternative key (Strenzke). */
  enforceAltSignature:  boolean;
  /** Accepts only chains whose CA signatures are quantum-safe. */
  requirePq:            boolean;
  revocation:           RevocationMode;
  /** Web PKI: number of valid SCTs required (Chrome: 2 for lifetimes up to 180 days). */
  requiredScts?:        number;
  ctLogs?:              Pick<CtLog, 'logId' | 'key' | 'name'>[];
  /** Merkle Tree Certificates: landmarks and trusted cosigners, if supported. */
  mtc?:                 MtcRelyingParty;
}

export interface TrustAnchor { label: string; cert: ParsedCert }

export interface CrlOnNetwork { der: Bytes; reachable: boolean }

export type CheckId =
  | 'parse' | 'path' | 'algorithm' | 'signature' | 'altSignature' | 'mtcProof' | 'validity'
  | 'criticalExtensions' | 'caFlags' | 'pathLen' | 'nameConstraints' | 'eku' | 'hostname'
  | 'revocation' | 'scts' | 'pqPolicy';

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface Check {
  id:      CheckId;
  status:  CheckStatus;
  cert?:   string;                       // subject of the certificate the check is about
  reason?: string;                       // machine-readable cause, translated in the UI
  params?: Record<string, string | number>;
}

export interface ValidationResult {
  ok:      boolean;
  checks:  Check[];
  path:    ParsedCert[];                 // leaf first, trust anchor not included
  anchor?: string;
  quantumSafePath: boolean;              // every CA signature (and the anchor key) resists Shor
}

const KNOWN_EXTENSIONS = new Set<string>([
  OID.basicConstraints, OID.keyUsage, OID.extKeyUsage, OID.subjectAltName, OID.nameConstraints,
  OID.subjectKeyIdentifier, OID.authorityKeyIdentifier, OID.cRLDistributionPoints, OID.ctSctList,
  OID.relatedCertificate, OID.subjectAltPublicKeyInfo, OID.altSignatureAlgorithm, OID.altSignatureValue,
]);

const label = (c: ParsedCert) => c.subject.CN ?? c.san?.[0] ?? nameToString(c.subject);

function issuedBy(cert: ParsedCert, issuer: ParsedCert): boolean {
  if (!equalBytes(cert.issuerDer, issuer.subjectDer)) return false;
  if (cert.aki && issuer.ski && !equalBytes(cert.aki, issuer.ski)) return false;
  return true;
}

/** RFC 5280 §4.2.1.10: a dNSName satisfies a constraint if it equals it or adds labels on the left. */
export function dnsWithin(name: string, constraint: string): boolean {
  const n = name.toLowerCase(), c = constraint.toLowerCase().replace(/^\./, '');
  return n === c || n.endsWith(`.${c}`);
}

function keyIsQuantumSafe(alg?: AlgId) { return !!alg && ALGS[alg].quantumSafe; }

export function validateChain(
  chainDer: Bytes[], hostname: string, now: Date, anchors: TrustAnchor[], policy: ClientPolicy, crl?: CrlOnNetwork,
): ValidationResult {
  const checks: Check[] = [];
  const add = (c: Check) => { checks.push(c); return c; };
  const result = (path: ParsedCert[], anchor?: string, qs = false): ValidationResult =>
    ({ ok: !checks.some((c) => c.status === 'fail'), checks, path, anchor, quantumSafePath: qs });

  // ── Parse ──
  let certs: ParsedCert[];
  try {
    certs = chainDer.map(parseCertificate);
    add({ id: 'parse', status: 'pass', params: { count: certs.length } });
  } catch (e) {
    add({ id: 'parse', status: 'fail', reason: 'parseError', params: { error: String((e as Error).message) } });
    return result([]);
  }
  const leaf = certs[0];

  // ── Merkle Tree Certificate: proof instead of a CA signature (draft-08 §7.2) ──
  if (leaf.sigAlgOid === OID.mtcProof) {
    if (!policy.mtc) {
      add({ id: 'algorithm', status: 'fail', cert: label(leaf), reason: 'mtcUnsupported' });
      return result([leaf]);
    }
    const v = verifyMtc(leaf, policy.mtc);
    add(v.ok
      ? { id: 'mtcProof', status: 'pass', cert: label(leaf), reason: v.via === 'landmark' ? 'viaLandmark' : 'viaCosignatures', params: { cosignatures: v.validCosignatures ?? 0 } }
      : { id: 'mtcProof', status: 'fail', cert: label(leaf), reason: v.reason, params: { cosignatures: v.validCosignatures ?? 0 } });
    checkLeafCommon(leaf, hostname, now, policy, add);
    if (policy.requirePq) {
      // Cosigners sign with ML-DSA-44; a landmark comes over the authenticated update channel
      add({ id: 'pqPolicy', status: 'pass', reason: 'mtc' });
    }
    return result([leaf], 'MTC', true);
  }

  // ── Path building: follow issuer names up to a trust anchor ──
  const path: ParsedCert[] = [leaf];
  let anchor: TrustAnchor | undefined;
  for (let depth = 0; depth < 6 && !anchor; depth++) {
    const cur = path[path.length - 1];
    anchor = anchors.find((a) => issuedBy(cur, a.cert));
    if (anchor) break;
    const next = certs.find((c) => !path.includes(c) && issuedBy(cur, c) && !equalBytes(c.der, cur.der));
    if (!next) {
      add({ id: 'path', status: 'fail', cert: label(cur), reason: anchors.length ? 'noIssuer' : 'emptyTrustStore', params: { issuer: nameToString(cur.issuer) } });
      return result(path);
    }
    path.push(next);
  }
  if (!anchor) {
    add({ id: 'path', status: 'fail', reason: 'tooLong' });
    return result(path);
  }
  add({ id: 'path', status: 'pass', params: { anchor: anchor.label, length: path.length } });

  // ── Per-certificate checks, from the anchor downwards ──
  const issuerOf = (i: number): ParsedCert => (i + 1 < path.length ? path[i + 1] : anchor!.cert);
  // A catalyst anchor also brings its alternative (PQ) key into the trust store
  let quantumSafe = keyIsQuantumSafe(anchor.cert.keyAlg)
    || (policy.understandsCatalyst && keyIsQuantumSafe(anchor.cert.altPublicKey?.alg));
  const caSignaturesPq: boolean[] = [];

  for (let i = path.length - 1; i >= 0; i--) {
    const cert = path[i];
    const issuer = issuerOf(i);
    const sigAlg = algByOid(cert.sigAlgOid)?.id;
    const supported = !!sigAlg && policy.supportedAlgs.includes(sigAlg) && !!issuer.keyAlg && policy.supportedAlgs.includes(issuer.keyAlg);

    if (!supported) {
      add({ id: 'algorithm', status: 'fail', cert: label(cert), reason: 'unsupported', params: { alg: sigAlg ? ALGS[sigAlg].name : cert.sigAlgOid } });
      add({ id: 'signature', status: 'skip', cert: label(cert) });
    } else {
      add({ id: 'algorithm', status: 'pass', cert: label(cert), params: { alg: ALGS[sigAlg!].name } });
      const ok = verifyCertSignature(cert, issuer.keyAlg!, issuer.publicKey);
      add({ id: 'signature', status: ok ? 'pass' : 'fail', cert: label(cert), reason: ok ? undefined : 'invalid', params: { alg: ALGS[sigAlg!].name, issuer: label(issuer) } });
    }

    // ITU-T alternative signature (X.509 §9.8)
    let altPq = false;
    if (policy.understandsCatalyst && issuer.altPublicKey?.alg) {
      if (cert.altSignature) {
        const ok = policy.supportedAlgs.includes(issuer.altPublicKey.alg) && verifyAltSignature(cert, issuer.altPublicKey.alg, issuer.altPublicKey.publicKey);
        altPq = ok && keyIsQuantumSafe(issuer.altPublicKey.alg);
        add({ id: 'altSignature', status: ok ? 'pass' : 'fail', cert: label(cert), reason: ok ? undefined : 'invalid', params: { alg: ALGS[issuer.altPublicKey.alg].name } });
      } else {
        add({ id: 'altSignature', status: policy.enforceAltSignature ? 'fail' : 'warn', cert: label(cert), reason: 'missing' });
      }
    }
    caSignaturesPq.push((!!sigAlg && ALGS[sigAlg].quantumSafe) || altPq);

    const before = now < cert.notBefore, after = now > cert.notAfter;
    add({ id: 'validity', status: before || after ? 'fail' : 'pass', cert: label(cert),
      reason: before ? 'notYetValid' : after ? 'expired' : undefined,
      params: { notBefore: cert.notBefore.toISOString(), notAfter: cert.notAfter.toISOString() } });

    const unknownCritical = cert.extensions.filter((e) => e.critical && !KNOWN_EXTENSIONS.has(e.oid));
    add({ id: 'criticalExtensions', status: unknownCritical.length ? 'fail' : 'pass', cert: label(cert),
      reason: unknownCritical.length ? 'unknown' : undefined, params: { oids: unknownCritical.map((e) => e.oid).join(', ') } });
  }

  // CA certificates in the path (not the anchor itself, RFC 5280 §6.1.4)
  for (let i = path.length - 1; i >= 1; i--) {
    const ca = path[i];
    const isCa = !!ca.basicConstraints?.ca;
    const certSign = !!ca.keyUsage?.includes('keyCertSign');
    add({ id: 'caFlags', status: isCa && certSign ? 'pass' : 'fail', cert: label(ca), reason: !isCa ? 'notCa' : !certSign ? 'noKeyCertSign' : undefined });
    const below = i - 1;                                  // CA certificates below this one in the path
    const pl = ca.basicConstraints?.pathLen;
    if (pl !== undefined) {
      add({ id: 'pathLen', status: below <= pl ? 'pass' : 'fail', cert: label(ca), params: { pathLen: pl, below } });
    }
  }
  // The leaf must not be usable as a CA here, and the anchor's constraints are not applied
  for (let i = path.length - 1; i >= 1; i--) {
    const nc = path[i].nameConstraints;
    if (!nc?.length) continue;
    const names = path.slice(0, i).flatMap((c) => c.san ?? []);
    const outside = names.filter((n) => !nc.some((p) => dnsWithin(n, p)));
    add({ id: 'nameConstraints', status: outside.length ? 'fail' : 'pass', cert: label(path[i]),
      reason: outside.length ? 'outside' : undefined, params: { permitted: nc.join(', '), names: (outside.length ? outside : names).join(', ') } });
  }

  checkLeafCommon(leaf, hostname, now, policy, add);

  // ── Revocation of the leaf ──
  checkRevocation(leaf, issuerOf(0), now, policy.revocation, crl, add);

  // ── Certificate Transparency (Web PKI) ──
  if (policy.requiredScts) {
    const issuer = issuerOf(0);
    let valid = 0;
    try {
      for (const sct of leaf.sctList ? parseSctList(leaf.sctList) : []) {
        const log = policy.ctLogs?.find((l) => equalBytes(l.logId, sct.logId));
        if (log && verifySct(sct, log, leaf, issuer.spkiDer)) valid++;
      }
    } catch { /* malformed list counts as zero */ }
    add({ id: 'scts', status: valid >= policy.requiredScts ? 'pass' : 'fail', cert: label(leaf),
      reason: valid >= policy.requiredScts ? undefined : 'tooFew', params: { valid, required: policy.requiredScts } });
  }

  quantumSafe = quantumSafe && caSignaturesPq.every(Boolean);
  if (policy.requirePq) {
    add({ id: 'pqPolicy', status: quantumSafe ? 'pass' : 'fail', reason: quantumSafe ? undefined : 'classicalInPath' });
  }
  return result(path, anchor.label, quantumSafe);
}

function checkLeafCommon(leaf: ParsedCert, hostname: string, now: Date, policy: ClientPolicy, add: (c: Check) => Check) {
  if (leaf.sigAlgOid === OID.mtcProof) {
    const before = now < leaf.notBefore, after = now > leaf.notAfter;
    add({ id: 'validity', status: before || after ? 'fail' : 'pass', cert: label(leaf), reason: before ? 'notYetValid' : after ? 'expired' : undefined,
      params: { notBefore: leaf.notBefore.toISOString(), notAfter: leaf.notAfter.toISOString() } });
  }
  const eku = leaf.extKeyUsage ?? [];
  add({ id: 'eku', status: eku.includes(OID.kpServerAuth) ? 'pass' : 'fail', cert: label(leaf), reason: eku.includes(OID.kpServerAuth) ? undefined : 'noServerAuth' });
  // RFC 9525: only subjectAltName identifies the service, the Common Name is ignored
  const san = leaf.san ?? [];
  const match = san.some((n) => n.toLowerCase() === hostname.toLowerCase());
  add({ id: 'hostname', status: match ? 'pass' : 'fail', cert: label(leaf), reason: match ? undefined : 'mismatch', params: { expected: hostname, san: san.join(', ') } });
  void policy;
}

function checkRevocation(leaf: ParsedCert, issuer: ParsedCert, now: Date, mode: RevocationMode, crl: CrlOnNetwork | undefined, add: (c: Check) => Check) {
  if (mode === 'none') { add({ id: 'revocation', status: 'warn', cert: label(leaf), reason: 'notChecked' }); return; }
  if (!leaf.crlUri || !crl) { add({ id: 'revocation', status: 'skip', cert: label(leaf), reason: 'noCrl' }); return; }
  // 'local': revocation data shipped to the client in advance (CRLite/CRLSets) — no lookup to block
  if (!crl.reachable && mode !== 'local') {
    add({ id: 'revocation', status: mode === 'hard' ? 'fail' : 'warn', cert: label(leaf), reason: mode === 'hard' ? 'unavailableHard' : 'unavailableSoft' });
    return;
  }
  let parsed;
  try { parsed = parseCrl(crl.der); } catch { add({ id: 'revocation', status: 'fail', cert: label(leaf), reason: 'crlMalformed' }); return; }
  if (!equalBytes(parsed.issuerDer, issuer.subjectDer) || !issuer.keyAlg || !verifyCrl(parsed, issuer.keyAlg, issuer.publicKey)) {
    add({ id: 'revocation', status: 'fail', cert: label(leaf), reason: 'crlSignature' });
    return;
  }
  if (now > parsed.nextUpdate) { add({ id: 'revocation', status: mode === 'hard' ? 'fail' : 'warn', cert: label(leaf), reason: 'crlStale' }); return; }
  const revoked = parsed.revokedSerials.includes(leaf.serial);
  add({ id: 'revocation', status: revoked ? 'fail' : 'pass', cert: label(leaf), reason: revoked ? 'revoked' : undefined, params: { crlBytes: crl.der.length } });
}
