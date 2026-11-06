// Certificate revocation lists, v2 (RFC 5280 §5).
import {
  bitString, child, decodeOid, decodeTime, enumerated, explicit, implicitPrimitive, integer, octets, oid, parseStrict, raw,
  readBitString, readInteger, seq, time, type Bytes,
} from './der';
import { algByOid, sigAlgId, sign, verify, type AlgId, type KeyPair } from './algorithms';
import { OID } from './oids';
import { encodeName, type DName } from './x509';

export interface RevokedEntry { serial: Bytes; date: Date; reason: 'keyCompromise' | 'superseded' }

const REASON_CODE = { keyCompromise: 1, superseded: 4 } as const;   // CRLReason, RFC 5280 §5.3.1

export function createCrl(issuer: DName, issuerKey: KeyPair, issuerKeyId: Bytes, crlNumber: number,
  thisUpdate: Date, nextUpdate: Date, revoked: RevokedEntry[]): Bytes {
  const alg = sigAlgId(issuerKey.alg);
  const parts: Bytes[] = [
    integer(1),                                    // version v2
    alg,
    encodeName(issuer),
    time(thisUpdate),
    time(nextUpdate),
  ];
  if (revoked.length) {
    parts.push(seq(...revoked.map((r) => seq(
      integer(r.serial),
      time(r.date),
      seq(seq(oid(OID.reasonCode), octets(enumerated(REASON_CODE[r.reason])))),
    ))));
  }
  // crlExtensions [0]: authorityKeyIdentifier and cRLNumber are MUST for conforming CAs (§5.2)
  parts.push(explicit(0, seq(
    seq(oid(OID.authorityKeyIdentifier), octets(seq(implicitPrimitive(0, issuerKeyId)))),
    seq(oid(OID.cRLNumber), octets(integer(crlNumber))),
  )));
  const tbs = seq(...parts);
  return seq(tbs, alg, bitString(sign(issuerKey, tbs)));
}

export interface ParsedCrl {
  der:        Bytes;
  tbs:        Bytes;
  issuerDer:  Bytes;
  sigAlg?:    AlgId;
  signature:  Bytes;
  thisUpdate: Date;
  nextUpdate: Date;
  revokedSerials: bigint[];
}

export function parseCrl(der: Bytes): ParsedCrl {
  const n = parseStrict(der);
  const tbsN = child(n, 0);
  const f = tbsN.children ?? [];
  // version, signature, issuer, thisUpdate, nextUpdate, [revokedCertificates], [0] extensions
  const revokedN = f[5]?.tag === 0x30 ? f[5] : undefined;
  return {
    der,
    tbs: raw(der, tbsN),
    issuerDer: raw(der, f[2]),
    sigAlg: algByOid(decodeOid(child(child(n, 1), 0).content))?.id,
    signature: readBitString(child(n, 2)),
    thisUpdate: decodeTime(f[3]),
    nextUpdate: decodeTime(f[4]),
    revokedSerials: (revokedN?.children ?? []).map((e) => readInteger(child(e, 0))),
  };
}

export function verifyCrl(crl: ParsedCrl, issuerAlg: AlgId, issuerKey: Bytes): boolean {
  return crl.sigAlg === issuerAlg && verify(issuerAlg, issuerKey, crl.tbs, crl.signature);
}
