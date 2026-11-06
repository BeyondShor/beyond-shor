// Merkle Tree Certificates following draft-ietf-plants-merkle-tree-certs-08.
// The CA certifies by logging, cosigners sign subtrees, the certificate carries an
// inclusion proof instead of a CA signature.
import { sha256 } from '@noble/hashes/sha2.js';
import {
  bitString, concat, explicit, integer, octets, oid, parseStrict, raw, relativeOidContent, seq, time, utf8Bytes,
  type Bytes,
} from './der';
import { keygen, sign, verify, type KeyPair } from './algorithms';
import { OID } from './oids';
import { encodeExtension, encodeName, spki, type CertSpec, type ParsedCert } from './x509';
import { HASH_SIZE, leafHash, MerkleTree, evaluateInclusionProof } from './merkle';
import { Reader, uint, vec } from './tls-encoding';

// Private Enterprise Number 32473 is reserved for documentation (RFC 5612).
export const MTC_CA_ID = '32473.1';
export const MTC_MIRROR_ID = '32473.2';
export const MTC_LOG_NUMBER = 1;
export const mtcLogId = (caId = MTC_CA_ID, logNumber = MTC_LOG_NUMBER) => `${caId}.0.${logNumber}`;

const MTC_ALG_ID = seq(oid(OID.mtcProof));     // parameters omitted (§6.2)

/** cosigner_name / log_origin: "oid/1.3.6.1.4.1." + trust anchor ID (§5.3.1) */
const originString = (trustAnchorId: string) => utf8Bytes(`oid/1.3.6.1.4.1.${trustAnchorId}`);

export interface Cosigner { id: string; role: 'ca' | 'mirror'; key: KeyPair }

export function createCosigner(id: string, role: Cosigner['role']): Cosigner {
  // Chrome's MTC test program asks for ML-DSA-44 cosignatures
  return { id, role, key: keygen('mldsa44') };
}

/** CosignedSubtree (§5.3.1), timestamp zero as required inside certificates (§6.2). */
export function cosignedSubtree(cosignerId: string, logId: string, start: number, end: number, subtreeHash: Bytes): Bytes {
  return concat(
    utf8Bytes('subtree/v1\n\0'),
    vec(originString(cosignerId), 1),
    uint(0, 8),
    vec(originString(logId), 1),
    uint(start, 8),
    uint(end, 8),
    subtreeHash,
  );
}

/**
 * TBSCertificateLogEntry fields, DER-encoded and concatenated (§5.2.1): the contents
 * octets of the SEQUENCE. Built from DER pieces so issuer and verifier agree byte for byte.
 */
function tbsLogEntryData(versionDer: Bytes, issuerDer: Bytes, validityDer: Bytes, subjectDer: Bytes,
  spkiAlgDer: Bytes, spkiDer: Bytes, extensionsDer?: Bytes): Bytes {
  return concat(versionDer, issuerDer, validityDer, subjectDer, spkiAlgDer, octets(sha256(spkiDer)), extensionsDer ?? new Uint8Array());
}

/** MTCLogEntry for a tbs_cert_entry with no entry extensions (§5.2.1). */
function mtcLogEntry(tbsEntryData: Bytes): Bytes {
  return concat(vec(new Uint8Array(), 2), uint(1, 2), tbsEntryData);
}

export interface IssuanceLog {
  caId:      string;
  logId:     string;
  entries:   Bytes[];        // MTCLogEntry encodings
  tree:      MerkleTree;
}

/**
 * Builds a log with `fill` other certificates around the target entry, so the inclusion
 * proof has a realistic length. Filler entries are complete TBSCertificateLogEntries for
 * made-up hosts with random key hashes.
 */
export function buildLogWithEntry(target: CertSpec, fill: number, targetIndex: number): { log: IssuanceLog; index: number } {
  const entries: Bytes[] = [];
  const caDn = encodeName({ trustAnchorId: MTC_CA_ID });
  const v3 = explicit(0, integer(2));
  for (let i = 0; i < fill + 1; i++) {
    if (i === targetIndex) {
      entries.push(mtcLogEntry(tbsLogEntryData(v3, caDn,
        seq(time(target.notBefore), time(target.notAfter)), encodeName(target.subject),
        spkiAlgOf(target), spki(target.subjectKey.alg, target.subjectKey.publicKey),
        explicit(3, seq(...target.extensions.map(encodeExtension))))));
    } else {
      const fakeSpki = crypto.getRandomValues(new Uint8Array(32));
      const data = concat(v3, caDn, seq(time(target.notBefore), time(target.notAfter)),
        encodeName({ CN: `host-${i}.example.net` }), seq(oid(OID.mlDsa44)), octets(fakeSpki));
      entries.push(mtcLogEntry(data));
    }
  }
  const tree = new MerkleTree(entries.map(leafHash));
  return { log: { caId: MTC_CA_ID, logId: mtcLogId(), entries, tree }, index: targetIndex };
}

function spkiAlgOf(spec: CertSpec): Bytes {
  const der = spki(spec.subjectKey.alg, spec.subjectKey.publicKey);
  return raw(der, parseStrict(der).children![0]);
}

/** TrustAnchorID binary representation: RELATIVE-OID contents octets (trust-anchor-ids §4). */
const taiBinary = (id: string) => relativeOidContent(id);

function encodeMtcProof(start: number, end: number, proof: Bytes[], cosignatures: { id: string; signature: Bytes }[]): Bytes {
  // Cosignatures ordered by cosigner_id: shorter first, then lexicographic (§6.2)
  const sorted = [...cosignatures].sort((a, b) => {
    const x = taiBinary(a.id), y = taiBinary(b.id);
    if (x.length !== y.length) return x.length - y.length;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  });
  const sigs = concat(...sorted.map((c) => concat(vec(taiBinary(c.id), 1), vec(c.signature, 2))));
  return concat(vec(new Uint8Array(), 2), uint(start, 6), uint(end, 6), vec(concat(...proof), 2), vec(sigs, 3));
}

export interface MtcIssued {
  landmarkRelative: Bytes;   // certificate DER without signatures
  standalone:       Bytes;   // certificate DER with CA and mirror cosignatures
  subtree:          { start: number; end: number; hash: Bytes };
  proofHashes:      number;
  logSize:          number;
}

/** Issue both certificate forms for `spec` from a log of `fill` other entries. */
export function issueMtc(spec: CertSpec, cosigners: Cosigner[], fill = 4095): MtcIssued {
  const targetIndex = Math.floor(fill * 0.618);
  const { log, index } = buildLogWithEntry(spec, fill, targetIndex);
  const start = 0, end = log.tree.size;            // [0, n) is always a valid subtree
  const subtreeHash = log.tree.hash(start, end);
  const proof = log.tree.inclusionProof(index, start, end);
  const cosigs = cosigners.map((c) => ({ id: c.id, signature: sign(c.key, cosignedSubtree(c.id, log.logId, start, end, subtreeHash)) }));
  const serial = (BigInt(MTC_LOG_NUMBER) << 48n) | BigInt(index);   // §6.2
  const tbs = seq(
    explicit(0, integer(2)),
    integer(serial),
    MTC_ALG_ID,
    encodeName({ trustAnchorId: MTC_CA_ID }),
    seq(time(spec.notBefore), time(spec.notAfter)),
    encodeName(spec.subject),
    spki(spec.subjectKey.alg, spec.subjectKey.publicKey),
    explicit(3, seq(...spec.extensions.map(encodeExtension))),
  );
  const cert = (cs: typeof cosigs) => seq(tbs, MTC_ALG_ID, bitString(encodeMtcProof(start, end, proof, cs)));
  return {
    landmarkRelative: cert([]),
    standalone: cert(cosigs),
    subtree: { start, end, hash: subtreeHash },
    proofHashes: proof.length,
    logSize: log.tree.size,
  };
}

export interface ParsedMtcProof { start: number; end: number; proof: Bytes[]; cosignatures: { id: Bytes; signature: Bytes }[] }

export function parseMtcProof(sigValue: Bytes): ParsedMtcProof {
  const r = new Reader(sigValue);
  r.vec(2);
  const start = r.num(6), end = r.num(6);
  const proofBytes = r.vec(2);
  if (proofBytes.length % HASH_SIZE !== 0) throw new Error('bad proof length');
  const proof: Bytes[] = [];
  for (let i = 0; i < proofBytes.length; i += HASH_SIZE) proof.push(proofBytes.subarray(i, i + HASH_SIZE));
  const sr = new Reader(r.vec(3));
  const cosignatures: ParsedMtcProof['cosignatures'] = [];
  while (!sr.done) cosignatures.push({ id: sr.vec(1), signature: sr.vec(2) });
  if (!r.done) throw new Error('trailing data after MTCProof');
  return { start, end, proof, cosignatures };
}

export interface MtcRelyingParty {
  /** Landmark subtrees received over the update channel, keyed "start:end". */
  trustedSubtrees: Map<string, Bytes>;
  /** Trusted cosigners and how many valid cosignatures are required. */
  cosigners: Cosigner[];
  quorum: number;
}

export type MtcVerdict =
  | { ok: true; via: 'landmark' | 'cosignatures'; validCosignatures?: number }
  | { ok: false; reason: 'notMtc' | 'malformed' | 'proof' | 'unknownLandmark' | 'cosignatures'; validCosignatures?: number };

/** Relying-party signature check for an MTC (§7.2). Other path checks (expiry …) stay separate. */
export function verifyMtc(cert: ParsedCert, rp: MtcRelyingParty): MtcVerdict {
  if (cert.sigAlgOid !== OID.mtcProof) return { ok: false, reason: 'notMtc' };
  let mp: ParsedMtcProof;
  try { mp = parseMtcProof(cert.signature); } catch { return { ok: false, reason: 'malformed' }; }
  const serial = cert.serial;
  const index = Number(serial & ((1n << 48n) - 1n));
  const logNumber = Number(serial >> 48n);
  if (logNumber === 0 || !cert.issuer.trustAnchorId) return { ok: false, reason: 'malformed' };
  const logId = mtcLogId(cert.issuer.trustAnchorId, logNumber);

  // Steps 7–9: rebuild the log entry from the certificate and hash it
  const tbsN = parseStrict(cert.tbs);
  const f = tbsN.children!;
  const spkiN = parseStrict(cert.spkiDer);
  const extN = f.find((x) => x.tag === 0xa3);
  const data = tbsLogEntryData(raw(cert.tbs, f[0]), raw(cert.tbs, f[3]), raw(cert.tbs, f[4]), raw(cert.tbs, f[5]),
    raw(cert.spkiDer, spkiN.children![0]), cert.spkiDer, extN ? raw(cert.tbs, extN) : undefined);
  const entryHash = leafHash(mtcLogEntry(data));

  const expected = evaluateInclusionProof(mp.proof, index, entryHash, mp.start, mp.end);
  if (!expected) return { ok: false, reason: 'proof' };

  // Step 11: a landmark the relying party already trusts
  const trusted = rp.trustedSubtrees.get(`${mp.start}:${mp.end}`);
  if (trusted) {
    return trusted.every((b, i) => b === expected[i]) ? { ok: true, via: 'landmark' } : { ok: false, reason: 'proof' };
  }
  if (mp.cosignatures.length === 0) return { ok: false, reason: 'unknownLandmark' };

  // Step 12: enough valid cosignatures from trusted cosigners; unknown ones are ignored
  let valid = 0;
  for (const cs of mp.cosignatures) {
    const c = rp.cosigners.find((x) => x.id === decodeTai(cs.id));
    if (!c) continue;
    if (verify(c.key.alg, c.key.publicKey, cosignedSubtree(c.id, logId, mp.start, mp.end, expected), cs.signature)) valid++;
  }
  return valid >= rp.quorum ? { ok: true, via: 'cosignatures', validCosignatures: valid } : { ok: false, reason: 'cosignatures', validCosignatures: valid };
}

function decodeTai(b: Bytes): string {
  const arcs: bigint[] = [];
  let v = 0n;
  for (const x of b) { v = (v << 7n) | BigInt(x & 0x7f); if (!(x & 0x80)) { arcs.push(v); v = 0n; } }
  return arcs.join('.');
}
