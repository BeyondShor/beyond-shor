// PKCS #10 certification requests (RFC 2986). The request is signed with the
// private key that belongs to the public key it carries: proof of possession.
import { bitString, child, decodeOid, implicitConstructed, integer, oid, parseStrict, raw, readBitString, seq, setOf, type Bytes } from './der';
import { algByOid, sigAlgId, sign, verify, type AlgId, type KeyPair } from './algorithms';
import { OID } from './oids';
import { encodeExtension, encodeName, spki, type DName } from './x509';

export function createCsr(subject: DName, key: KeyPair, dnsNames: string[]): Bytes {
  // extensionRequest attribute carrying the requested subjectAltName (RFC 2985 §5.4.2)
  const extReq = seq(oid(OID.extensionRequest), setOf(seq(encodeExtension({ type: 'subjectAltName', dns: dnsNames }))));
  const info = seq(
    integer(0),
    encodeName(subject),
    spki(key.alg, key.publicKey),
    implicitConstructed(0, extReq),   // attributes [0] IMPLICIT SET OF Attribute
  );
  const alg = sigAlgId(key.alg);
  return seq(info, alg, bitString(sign(key, info)));
}

export interface ParsedCsr {
  der:       Bytes;
  info:      Bytes;
  subjectDer: Bytes;
  keyAlg?:   AlgId;
  publicKey: Bytes;
  sigAlg?:   AlgId;
  signature: Bytes;
}

export function parseCsr(der: Bytes): ParsedCsr {
  const n = parseStrict(der);
  const infoN = child(n, 0);
  const spkiN = child(infoN, 2);
  const keyAlgOid = decodeOid(child(child(spkiN, 0), 0).content);
  return {
    der,
    info: raw(der, infoN),
    subjectDer: raw(der, child(infoN, 1)),
    keyAlg: keyAlgOid === OID.ecPublicKey ? 'ecdsa-p256' : algByOid(keyAlgOid)?.id,
    publicKey: readBitString(child(spkiN, 1)),
    sigAlg: algByOid(decodeOid(child(child(n, 1), 0).content))?.id,
    signature: readBitString(child(n, 2)),
  };
}

/** Proof of possession: the request's self-signature verifies under the key it contains. */
export function verifyCsr(csr: ParsedCsr): boolean {
  if (!csr.keyAlg || csr.sigAlg !== csr.keyAlg) return false;
  return verify(csr.keyAlg, csr.publicKey, csr.info, csr.signature);
}

