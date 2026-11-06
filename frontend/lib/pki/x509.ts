// X.509 v3 certificates (RFC 5280): building, signing and parsing.
import { sha256 } from '@noble/hashes/sha2.js';
import {
  bitString, bool, child, concat, decodeOid, decodeTime, equalBytes, explicit, implicitConstructed,
  implicitPrimitive, integer, octets, oid, parseStrict, printable, raw, readBitString, readInteger, readString,
  relativeOidContent, seq, setOf, TAG, time, tlv, utf8, utf8Bytes, type Bytes, type Node,
} from './der';
import { OID, oidName } from './oids';
import { ALGS, algByOid, sigAlgId, sign, spkiAlgId, verify, type AlgId, type KeyPair } from './algorithms';

// ── Names ─────────────────────────────────────────────────────────────────────

export interface DName {
  C?:  string;
  O?:  string;
  CN?: string;
  /** Trust anchor ID as a distinguished name (draft-ietf-tls-trust-anchor-ids-07 §4.1). */
  trustAnchorId?: string;
}

export function encodeName(n: DName): Bytes {
  if (n.trustAnchorId) {
    const value = tlv(TAG.RELATIVE_OID, relativeOidContent(n.trustAnchorId));
    return seq(setOf(seq(oid(OID.rdnaTrustAnchorId), value)));
  }
  const rdns: Bytes[] = [];
  // countryName is a PrintableString (RFC 5280 Appendix A), the others UTF8String
  if (n.C) rdns.push(setOf(seq(oid(OID.countryName), printable(n.C))));
  if (n.O) rdns.push(setOf(seq(oid(OID.organizationName), utf8(n.O))));
  if (n.CN) rdns.push(setOf(seq(oid(OID.commonName), utf8(n.CN))));
  return seq(...rdns);
}

export function nameToString(n: DName): string {
  if (n.trustAnchorId) return `trustAnchorID=${n.trustAnchorId}`;
  return [n.CN && `CN=${n.CN}`, n.O && `O=${n.O}`, n.C && `C=${n.C}`].filter(Boolean).join(', ');
}

function decodeName(node: Node): DName {
  const out: DName = {};
  for (const rdn of node.children ?? []) {
    for (const atv of rdn.children ?? []) {
      const type = decodeOid(child(atv, 0).content);
      const val = child(atv, 1);
      if (type === OID.countryName) out.C = readString(val);
      else if (type === OID.organizationName) out.O = readString(val);
      else if (type === OID.commonName) out.CN = readString(val);
      else if (type === OID.rdnaTrustAnchorId) out.trustAnchorId = decodeRelativeOid(val.content);
    }
  }
  return out;
}

function decodeRelativeOid(content: Bytes): string {
  const arcs: bigint[] = [];
  let v = 0n;
  for (const b of content) { v = (v << 7n) | BigInt(b & 0x7f); if (!(b & 0x80)) { arcs.push(v); v = 0n; } }
  return arcs.join('.');
}

// ── Extensions ────────────────────────────────────────────────────────────────

export type KeyUsageBit =
  | 'digitalSignature' | 'nonRepudiation' | 'keyEncipherment' | 'dataEncipherment'
  | 'keyAgreement' | 'keyCertSign' | 'cRLSign';

const KU_BITS: KeyUsageBit[] = [
  'digitalSignature', 'nonRepudiation', 'keyEncipherment', 'dataEncipherment', 'keyAgreement', 'keyCertSign', 'cRLSign',
];

export type ExtSpec =
  | { type: 'basicConstraints'; ca: boolean; pathLen?: number }
  | { type: 'keyUsage'; bits: KeyUsageBit[] }
  | { type: 'extKeyUsage'; oids: string[] }
  | { type: 'subjectAltName'; dns: string[]; critical?: boolean }
  | { type: 'nameConstraints'; permittedDns: string[] }
  | { type: 'subjectKeyIdentifier'; keyId: Bytes }
  | { type: 'authorityKeyIdentifier'; keyId: Bytes }
  | { type: 'crlDistributionPoint'; uri: string }
  | { type: 'sctList'; list: Bytes }
  | { type: 'relatedCertificate'; certDer: Bytes }
  | { type: 'altPublicKey'; alg: AlgId; publicKey: Bytes }
  | { type: 'altSignatureAlgorithm'; alg: AlgId }
  | { type: 'altSignatureValue'; signature: Bytes };

/** keyUsage BIT STRING with named-bit DER rules: trailing zero bits removed (X.690 §11.2.2). */
function keyUsageValue(bits: KeyUsageBit[]): Bytes {
  const idx = bits.map((b) => KU_BITS.indexOf(b));
  const highest = Math.max(...idx);
  const nBytes = Math.floor(highest / 8) + 1;
  const bytes = new Uint8Array(nBytes);
  for (const i of idx) bytes[i >> 3] |= 0x80 >> (i & 7);
  const unused = nBytes * 8 - (highest + 1);
  return tlv(TAG.BIT_STRING, concat(Uint8Array.of(unused), bytes));
}

function extension(id: string, critical: boolean, value: Bytes): Bytes {
  // critical is DEFAULT FALSE and therefore omitted when false (DER)
  return critical ? seq(oid(id), bool(true), octets(value)) : seq(oid(id), octets(value));
}

export function encodeExtension(e: ExtSpec): Bytes {
  switch (e.type) {
    case 'basicConstraints': {
      const parts: Bytes[] = [];
      if (e.ca) parts.push(bool(true));
      if (e.ca && e.pathLen !== undefined) parts.push(integer(e.pathLen));
      return extension(OID.basicConstraints, true, seq(...parts));
    }
    case 'keyUsage':
      return extension(OID.keyUsage, true, keyUsageValue(e.bits));
    case 'extKeyUsage':
      return extension(OID.extKeyUsage, false, seq(...e.oids.map(oid)));
    case 'subjectAltName':
      // dNSName [2] IA5String
      // RFC 5280 §4.2.1.6: critical when the subject is an empty sequence
      return extension(OID.subjectAltName, !!e.critical, seq(...e.dns.map((d) => implicitPrimitive(2, utf8Bytes(d)))));
    case 'nameConstraints': {
      // permittedSubtrees [0] GeneralSubtrees; RFC 5280 §4.2.1.10: MUST be critical
      const subtrees = e.permittedDns.map((d) => seq(implicitPrimitive(2, utf8Bytes(d))));
      return extension(OID.nameConstraints, true, seq(implicitConstructed(0, concat(...subtrees))));
    }
    case 'subjectKeyIdentifier':
      return extension(OID.subjectKeyIdentifier, false, octets(e.keyId));
    case 'authorityKeyIdentifier':
      return extension(OID.authorityKeyIdentifier, false, seq(implicitPrimitive(0, e.keyId)));
    case 'crlDistributionPoint': {
      // DistributionPoint { distributionPoint [0] { fullName [0] GeneralNames { uniformResourceIdentifier [6] } } }
      const uri = implicitPrimitive(6, utf8Bytes(e.uri));
      return extension(OID.cRLDistributionPoints, false, seq(seq(explicit(0, implicitConstructed(0, uri)))));
    }
    case 'sctList':
      // RFC 6962 §3.3: the TLS-encoded list sits inside an OCTET STRING inside extnValue
      return extension(OID.ctSctList, false, octets(e.list));
    case 'relatedCertificate':
      // RFC 9763 §4: hash of the entire related certificate; SHOULD NOT be critical
      return extension(OID.relatedCertificate, false, seq(seq(oid(OID.sha256)), octets(sha256(e.certDer))));
    case 'altPublicKey':
      // X.509 §9.8.2 — recommended non-critical so legacy relying parties can skip it
      return extension(OID.subjectAltPublicKeyInfo, false, seq(spkiAlgId(e.alg), bitString(e.publicKey)));
    case 'altSignatureAlgorithm':
      return extension(OID.altSignatureAlgorithm, false, sigAlgId(e.alg));
    case 'altSignatureValue':
      return extension(OID.altSignatureValue, false, bitString(e.signature));
  }
}

// ── Certificates ──────────────────────────────────────────────────────────────

export interface CertSpec {
  serial:     Bytes;
  issuer:     DName;
  subject:    DName;
  notBefore:  Date;
  notAfter:   Date;
  subjectKey: { alg: AlgId; publicKey: Bytes };
  extensions: ExtSpec[];
}

export function spki(alg: AlgId, publicKey: Bytes): Bytes {
  return seq(spkiAlgId(alg), bitString(publicKey));
}

/** Key identifier per RFC 7093 §2 method 1: leftmost 160 bits of SHA-256 over the subjectPublicKey bits. */
export function keyIdentifier(publicKey: Bytes): Bytes {
  return sha256(publicKey).slice(0, 20);
}

/** 16 random bytes, positive and non-zero: ≥ 64 bits of CSPRNG output as the Baseline Requirements demand. */
export function randomSerial(): Bytes {
  const s = crypto.getRandomValues(new Uint8Array(16));
  s[0] = (s[0] & 0x7f) | 0x01;
  return s;
}

export function encodeTbs(spec: CertSpec, signatureAlg: Bytes, extensions: Bytes[] = spec.extensions.map(encodeExtension)): Bytes {
  const parts: Bytes[] = [
    explicit(0, integer(2)),             // version v3
    integer(spec.serial),
    signatureAlg,
    encodeName(spec.issuer),
    seq(time(spec.notBefore), time(spec.notAfter)),
    encodeName(spec.subject),
    spki(spec.subjectKey.alg, spec.subjectKey.publicKey),
  ];
  if (extensions.length) parts.push(explicit(3, seq(...extensions)));
  return seq(...parts);
}

export function assembleCertificate(tbs: Bytes, signatureAlg: Bytes, signature: Bytes): Bytes {
  return seq(tbs, signatureAlg, bitString(signature));
}

export function issueCertificate(spec: CertSpec, issuerKey: KeyPair): Bytes {
  const alg = sigAlgId(issuerKey.alg);
  const tbs = encodeTbs(spec, alg);
  return assembleCertificate(tbs, alg, sign(issuerKey, tbs));
}

/**
 * ITU-T X.509 (10/2019) §9.8 hybrid certificate: the issuer's alternative key signs the
 * preTBSCertificate — the TBSCertificate without its signature field and without the
 * altSignatureValue extension (§7.2.2, as implemented by Bouncy Castle). The native
 * signature then covers everything including the alternative signature.
 */
export function issueCatalystCertificate(spec: CertSpec, issuerKey: KeyPair, issuerAltKey: KeyPair): Bytes {
  const nativeAlg = sigAlgId(issuerKey.alg);
  const exts = [...spec.extensions, { type: 'altSignatureAlgorithm', alg: issuerAltKey.alg } as ExtSpec];
  const pre = preTbs(spec, exts.map(encodeExtension));
  const altSig = sign(issuerAltKey, pre);
  const tbs = encodeTbs(spec, nativeAlg, [...exts, { type: 'altSignatureValue', signature: altSig } as ExtSpec].map(encodeExtension));
  return assembleCertificate(tbs, nativeAlg, sign(issuerKey, tbs));
}

function preTbs(spec: CertSpec, extensions: Bytes[]): Bytes {
  return seq(
    explicit(0, integer(2)),
    integer(spec.serial),
    encodeName(spec.issuer),
    seq(time(spec.notBefore), time(spec.notAfter)),
    encodeName(spec.subject),
    spki(spec.subjectKey.alg, spec.subjectKey.publicKey),
    explicit(3, seq(...extensions)),
  );
}

// ── Parsing ───────────────────────────────────────────────────────────────────

export interface ParsedExtension {
  oid:      string;
  name:     string;
  critical: boolean;
  value:    Bytes;     // extnValue contents
  start:    number;    // byte range of the whole Extension in the certificate
  end:      number;
}

export interface ByteRange { part: 'publicKey' | 'signature' | 'altPublicKey' | 'altSignature' | 'sct' | 'names' | 'extensions' | 'structure'; bytes: number }

export interface ParsedCert {
  der:          Bytes;
  tbs:          Bytes;
  serial:       bigint;
  serialHex:    string;
  sigAlgOid:    string;
  signature:    Bytes;
  issuer:       DName;
  issuerDer:    Bytes;
  subject:      DName;
  subjectDer:   Bytes;
  notBefore:    Date;
  notAfter:     Date;
  spkiDer:      Bytes;
  spkiAlgOid:   string;
  keyAlg?:      AlgId;
  publicKey:    Bytes;
  extensions:   ParsedExtension[];
  // Decoded extension values
  basicConstraints?: { ca: boolean; pathLen?: number };
  keyUsage?:    KeyUsageBit[];
  extKeyUsage?: string[];
  san?:         string[];
  nameConstraints?: string[];
  ski?:         Bytes;
  aki?:         Bytes;
  crlUri?:      string;
  sctList?:     Bytes;
  relatedCertHash?: Bytes;
  altPublicKey?: { algOid: string; alg?: AlgId; publicKey: Bytes };
  altSigAlgOid?: string;
  altSignature?: Bytes;
  breakdown:    ByteRange[];
}

function spkiKeyAlg(algNode: Node): { oid: string; alg?: AlgId } {
  const o = decodeOid(child(algNode, 0).content);
  if (o === OID.ecPublicKey) {
    const curve = algNode.children?.[1];
    return { oid: o, alg: curve && decodeOid(curve.content) === OID.prime256v1 ? 'ecdsa-p256' : undefined };
  }
  return { oid: o, alg: algByOid(o)?.id };
}

function decodeKeyUsage(v: Bytes): KeyUsageBit[] {
  const n = parseStrict(v);
  const bytes = n.content.subarray(1);
  return KU_BITS.filter((_, i) => i < bytes.length * 8 && (bytes[i >> 3] & (0x80 >> (i & 7))) !== 0);
}

function decodeGeneralDnsNames(seqNode: Node): string[] {
  return (seqNode.children ?? []).filter((g) => g.tag === 0x82).map(readString);
}

export function parseCertificate(der: Bytes): ParsedCert {
  const cert = parseStrict(der);
  const tbsN = child(cert, 0);
  if (cert.tag !== TAG.SEQUENCE || tbsN.tag !== TAG.SEQUENCE || cert.children?.length !== 3) throw new Error('X.509: not a Certificate');
  const tbsF = tbsN.children ?? [];
  let i = 0;
  if (tbsF[0]?.tag === 0xa0) i++;                      // version
  const serialN = tbsF[i++];
  const sigAlgN = tbsF[i++];
  const issuerN = tbsF[i++];
  const validityN = tbsF[i++];
  const subjectN = tbsF[i++];
  const spkiN = tbsF[i++];
  const extsN = tbsF.find((f) => f.tag === 0xa3);
  if (!serialN || !sigAlgN || !issuerN || !validityN || !subjectN || !spkiN) throw new Error('X.509: incomplete TBSCertificate');

  const outerAlg = decodeOid(child(child(cert, 1), 0).content);
  if (decodeOid(child(sigAlgN, 0).content) !== outerAlg) throw new Error('X.509: signature algorithm mismatch');
  const signatureN = child(cert, 2);
  const keyAlgN = child(spkiN, 0);
  const keyBitsN = child(spkiN, 1);
  const { oid: spkiAlgOid, alg: keyAlg } = spkiKeyAlg(keyAlgN);

  const p: ParsedCert = {
    der,
    tbs: raw(der, tbsN),
    serial: readInteger(serialN),
    serialHex: Array.from(serialN.content, (b) => b.toString(16).padStart(2, '0')).join(':'),
    sigAlgOid: outerAlg,
    signature: readBitString(signatureN),
    issuer: decodeName(issuerN),
    issuerDer: raw(der, issuerN),
    subject: decodeName(subjectN),
    subjectDer: raw(der, subjectN),
    notBefore: decodeTime(child(validityN, 0)),
    notAfter: decodeTime(child(validityN, 1)),
    spkiDer: raw(der, spkiN),
    spkiAlgOid,
    keyAlg,
    publicKey: readBitString(keyBitsN),
    extensions: [],
    breakdown: [],
  };

  let sctBytes = 0, altPk = 0, altSig = 0;
  for (const e of extsN ? child(extsN, 0).children ?? [] : []) {
    const id = decodeOid(child(e, 0).content);
    const critical = e.children?.length === 3 && child(e, 1).content[0] === 0xff;
    const value = child(e, e.children!.length - 1).content;
    p.extensions.push({ oid: id, name: oidName(id), critical, value, start: e.start, end: e.end });
    const v = () => parseStrict(value);
    switch (id) {
      case OID.basicConstraints: {
        const f = v().children ?? [];
        const ca = f[0]?.tag === TAG.BOOLEAN && f[0].content[0] === 0xff;
        const pl = f.find((x) => x.tag === TAG.INTEGER);
        p.basicConstraints = { ca, pathLen: pl ? Number(readInteger(pl)) : undefined };
        break;
      }
      case OID.keyUsage: p.keyUsage = decodeKeyUsage(value); break;
      case OID.extKeyUsage: p.extKeyUsage = (v().children ?? []).map((x) => decodeOid(x.content)); break;
      case OID.subjectAltName: p.san = decodeGeneralDnsNames(v()); break;
      case OID.nameConstraints: {
        const permitted = (v().children ?? []).find((x) => x.tag === 0xa0);
        p.nameConstraints = (permitted?.children ?? []).flatMap((st) => (st.children ?? []).filter((g) => g.tag === 0x82).map(readString));
        break;
      }
      case OID.subjectKeyIdentifier: p.ski = v().content; break;
      case OID.authorityKeyIdentifier: {
        const kid = (v().children ?? []).find((x) => x.tag === 0x80);
        if (kid) p.aki = kid.content;
        break;
      }
      case OID.cRLDistributionPoints: {
        const uri = findTag(v(), 0x86);
        if (uri) p.crlUri = readString(uri);
        break;
      }
      case OID.ctSctList: p.sctList = v().content; sctBytes = value.length; break;
      case OID.relatedCertificate: p.relatedCertHash = child(v(), 1).content; break;
      case OID.subjectAltPublicKeyInfo: {
        const n = v();
        const a = spkiKeyAlg(child(n, 0));
        p.altPublicKey = { algOid: a.oid, alg: a.alg, publicKey: readBitString(child(n, 1)) };
        altPk = p.altPublicKey.publicKey.length;
        break;
      }
      case OID.altSignatureAlgorithm: p.altSigAlgOid = decodeOid(child(v(), 0).content); break;
      case OID.altSignatureValue: p.altSignature = readBitString(v()); altSig = p.altSignature.length; break;
    }
  }

  // Byte breakdown for the certificate anatomy view
  const extTotal = extsN ? extsN.end - extsN.start : 0;
  const parts: ByteRange[] = [
    { part: 'publicKey', bytes: p.publicKey.length },
    { part: 'signature', bytes: p.signature.length },
    { part: 'altPublicKey', bytes: altPk },
    { part: 'altSignature', bytes: altSig },
    { part: 'sct', bytes: sctBytes },
    { part: 'names', bytes: (issuerN.end - issuerN.start) + (subjectN.end - subjectN.start) },
    { part: 'extensions', bytes: extTotal - altPk - altSig - sctBytes },
  ];
  const known = parts.reduce((s, x) => s + x.bytes, 0);
  parts.push({ part: 'structure', bytes: der.length - known });
  p.breakdown = parts.filter((x) => x.bytes > 0);
  return p;
}

function findTag(n: Node, tag: number): Node | undefined {
  if (n.tag === tag) return n;
  for (const c of n.children ?? []) { const f = findTag(c, tag); if (f) return f; }
  return undefined;
}

/** Verify the certificate's (native) signature with an issuer public key. */
export function verifyCertSignature(cert: ParsedCert, issuerAlg: AlgId, issuerKey: Bytes): boolean {
  const alg = algByOid(cert.sigAlgOid);
  if (!alg || alg.id !== issuerAlg) return false;
  return verify(issuerAlg, issuerKey, cert.tbs, cert.signature);
}

/** Verify an ITU-T alternative signature against the issuer's alternative public key. */
export function verifyAltSignature(cert: ParsedCert, issuerAltAlg: AlgId, issuerAltKey: Bytes): boolean {
  if (!cert.altSignature || !cert.altSigAlgOid) return false;
  if (algByOid(cert.altSigAlgOid)?.id !== issuerAltAlg) return false;
  const pre = rebuildPreTbs(cert);
  return verify(issuerAltAlg, issuerAltKey, pre, cert.altSignature);
}

function rebuildPreTbs(cert: ParsedCert): Bytes {
  const tbsN = parseStrict(cert.tbs);
  const f = tbsN.children ?? [];
  const kept = f.filter((_, idx) => idx !== 2 && f[idx].tag !== 0xa3).map((n) => raw(cert.tbs, n));
  const exts = cert.extensions
    .filter((e) => e.oid !== OID.altSignatureValue)
    .map((e) => cert.der.subarray(e.start, e.end));
  return seq(...kept, explicit(3, seq(...exts)));
}

export function sameName(a: Bytes, b: Bytes): boolean { return equalBytes(a, b); }

export const fingerprint = (der: Bytes) => sha256(der);

export function algName(o: string): string {
  return algByOid(o)?.name ?? (o === OID.ecPublicKey ? 'ECDSA P-256' : oidName(o));
}

export { ALGS };
