// Certificate Transparency, RFC 6962: signed certificate timestamps (SCTs) for
// precertificates, embedded in the final certificate.
import { sha256 } from '@noble/hashes/sha2.js';
import { concat, explicit, parseStrict, raw, seq, type Bytes } from './der';
import { keygen, sign, verify, type AlgId, type KeyPair } from './algorithms';
import { OID } from './oids';
import { spki, type ParsedCert } from './x509';
import { Reader, uint, vec } from './tls-encoding';

export interface CtLog {
  name:   string;
  key:    KeyPair;
  logId:  Bytes;          // SHA-256 of the log's DER SubjectPublicKeyInfo (RFC 6962 §3.2)
  /** Entries the log has accepted — what a monitor can search. */
  entries: { dnsNames: string[]; issuer: string; timestamp: number }[];
}

export function createLog(name: string, alg: AlgId): CtLog {
  const key = keygen(alg);
  return { name, key, logId: sha256(spki(alg, key.publicKey)), entries: [] };
}

// SignatureAndHashAlgorithm (RFC 5246 §7.4.1.4.1). RFC 6962 logs use ECDSA with SHA-256.
// CT defines no post-quantum value; for ML-DSA-44 the demo reuses the TLS 1.3 code point
// 0x0904 from draft-ietf-tls-mldsa — a modelling choice, not a standard.
function sigHashAlg(alg: AlgId): Bytes {
  if (alg === 'ecdsa-p256') return Uint8Array.of(4, 3);       // sha256, ecdsa
  if (alg === 'mldsa44') return Uint8Array.of(0x09, 0x04);
  throw new Error(`no SCT signature code point for ${alg}`);
}

function signedData(timestamp: bigint, issuerKeyHash: Bytes, precertTbs: Bytes): Bytes {
  return concat(
    uint(0, 1),                    // sct_version v1
    uint(0, 1),                    // signature_type certificate_timestamp
    uint(timestamp, 8),
    uint(1, 2),                    // entry_type precert_entry
    issuerKeyHash,                 // PreCert.issuer_key_hash[32]
    vec(precertTbs, 3),            // PreCert.tbs_certificate<1..2^24-1>
    vec(new Uint8Array(), 2),      // extensions
  );
}

export function createSct(log: CtLog, precertTbs: Bytes, issuerSpkiDer: Bytes, timestamp: number, dnsNames: string[], issuer: string): Bytes {
  const ts = BigInt(timestamp);
  const issuerKeyHash = sha256(issuerSpkiDer);
  const signature = sign(log.key, signedData(ts, issuerKeyHash, precertTbs));
  log.entries.push({ dnsNames, issuer, timestamp });
  return concat(
    uint(0, 1), log.logId, uint(ts, 8), vec(new Uint8Array(), 2),
    sigHashAlg(log.key.alg), vec(signature, 2),
  );
}

export function encodeSctList(scts: Bytes[]): Bytes {
  return vec(concat(...scts.map((s) => vec(s, 2))), 2);
}

export interface ParsedSct { logId: Bytes; timestamp: bigint; signature: Bytes; bytes: number }

export function parseSctList(list: Bytes): ParsedSct[] {
  const outer = new Reader(list);
  const r = new Reader(outer.vec(2));
  const out: ParsedSct[] = [];
  while (!r.done) {
    const raw = r.vec(2);
    const s = new Reader(raw);
    if (s.num(1) !== 0) throw new Error('unknown SCT version');
    const logId = s.bytes(32);
    const timestamp = s.uint(8);
    s.vec(2);          // extensions
    s.bytes(2);        // SignatureAndHashAlgorithm
    out.push({ logId, timestamp, signature: s.vec(2), bytes: raw.length });
  }
  return out;
}

/**
 * Reconstruct the precertificate TBSCertificate a log signed: the final TBSCertificate
 * with the SCT list extension removed (RFC 6962 §3.2).
 */
export function precertTbsOf(cert: ParsedCert): Bytes {
  const tbsN = parseStrict(cert.tbs);
  const fields = tbsN.children ?? [];
  const kept = fields.filter((f) => f.tag !== 0xa3).map((f) => raw(cert.tbs, f));
  const exts = cert.extensions.filter((e) => e.oid !== OID.ctSctList).map((e) => cert.der.subarray(e.start, e.end));
  return seq(...kept, explicit(3, seq(...exts)));
}

export function verifySct(sct: ParsedSct, log: Pick<CtLog, 'logId' | 'key'>, cert: ParsedCert, issuerSpkiDer: Bytes): boolean {
  if (sct.logId.length !== 32 || !sct.logId.every((b, i) => b === log.logId[i])) return false;
  const data = signedData(sct.timestamp, sha256(issuerSpkiDer), precertTbsOf(cert));
  return verify(log.key.alg, log.key.publicKey, data, sct.signature);
}
