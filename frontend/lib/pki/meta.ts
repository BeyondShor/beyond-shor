// Crypto-free metadata of the PKI playground: algorithms, profiles, clients and
// protocol limits. The UI imports only this module (and types), so the crypto
// libraries stay in the worker bundle.
import { OID } from './oids';

export type AlgId = 'ecdsa-p256' | 'mldsa44' | 'mldsa65' | 'slhdsa192s' | 'composite-mldsa65-p256';

export interface AlgInfo {
  id:          AlgId;
  name:        string;
  /** compact name for tight spaces such as the overview diagram */
  short:       string;
  oid:         string;
  /** Resists an attacker with a cryptographically relevant quantum computer. */
  quantumSafe: boolean;
  /** Contains a classical component (ECDSA) that Shor's algorithm breaks. */
  classical:   boolean;
  standard:    string;
  pkBytes:     number;
  /** Signature size; for ECDSA the DER maximum (70–72 bytes in practice). */
  sigBytes:    number;
}

export const ALGS: Record<AlgId, AlgInfo> = {
  'ecdsa-p256': {
    id: 'ecdsa-p256', name: 'ECDSA P-256', short: 'ECDSA P-256', oid: OID.ecdsaWithSha256,
    quantumSafe: false, classical: true, standard: 'RFC 5480 / RFC 5758', pkBytes: 65, sigBytes: 72,
  },
  mldsa44: {
    id: 'mldsa44', name: 'ML-DSA-44', short: 'ML-DSA-44', oid: OID.mlDsa44,
    quantumSafe: true, classical: false, standard: 'FIPS 204 / RFC 9881', pkBytes: 1312, sigBytes: 2420,
  },
  mldsa65: {
    id: 'mldsa65', name: 'ML-DSA-65', short: 'ML-DSA-65', oid: OID.mlDsa65,
    quantumSafe: true, classical: false, standard: 'FIPS 204 / RFC 9881', pkBytes: 1952, sigBytes: 3309,
  },
  slhdsa192s: {
    id: 'slhdsa192s', name: 'SLH-DSA-SHA2-192s', short: 'SLH-DSA-SHA2-192s', oid: OID.slhDsaSha2_192s,
    quantumSafe: true, classical: false, standard: 'FIPS 205 / RFC 9909', pkBytes: 48, sigBytes: 16224,
  },
  'composite-mldsa65-p256': {
    id: 'composite-mldsa65-p256', name: 'Composite ML-DSA-65 + ECDSA P-256', short: 'Composite ML-DSA-65/P-256', oid: OID.compMlDsa65EcdsaP256,
    // EUF-CMA holds while either component holds (draft §9), so a CRQC alone does not break it
    quantumSafe: true, classical: true, standard: 'draft-ietf-lamps-pq-composite-sigs-19',
    pkBytes: 1952 + 65, sigBytes: 3309 + 72,
  },
};

export function algByOid(o: string): AlgInfo | undefined {
  return Object.values(ALGS).find((a) => a.oid === o);
}

// ── Profiles ──────────────────────────────────────────────────────────────────

export type Scope = 'private' | 'web';
export type ProfileId = 'classical' | 'mldsa44' | 'mldsa65' | 'composite' | 'mixed' | 'web-classical' | 'web-mldsa44' | 'web-mtc';

export interface Profile {
  id:           ProfileId;
  scope:        Scope;
  root:         AlgId;
  intermediate: AlgId;
  leaf:         AlgId;
  /** CT log signature algorithm (Web PKI) */
  ct?:          AlgId;
  mtc?:         boolean;
  /** Not permitted in today's Web PKI — shown for the size comparison only. */
  hypothetical?: boolean;
}

export const PROFILES: Record<ProfileId, Profile> = {
  classical:       { id: 'classical', scope: 'private', root: 'ecdsa-p256', intermediate: 'ecdsa-p256', leaf: 'ecdsa-p256' },
  mldsa44:         { id: 'mldsa44', scope: 'private', root: 'mldsa44', intermediate: 'mldsa44', leaf: 'mldsa44' },
  mldsa65:         { id: 'mldsa65', scope: 'private', root: 'mldsa65', intermediate: 'mldsa65', leaf: 'mldsa65' },
  composite:       { id: 'composite', scope: 'private', root: 'composite-mldsa65-p256', intermediate: 'composite-mldsa65-p256', leaf: 'composite-mldsa65-p256' },
  mixed:           { id: 'mixed', scope: 'private', root: 'slhdsa192s', intermediate: 'mldsa65', leaf: 'mldsa65' },
  'web-classical': { id: 'web-classical', scope: 'web', root: 'ecdsa-p256', intermediate: 'ecdsa-p256', leaf: 'ecdsa-p256', ct: 'ecdsa-p256' },
  'web-mldsa44':   { id: 'web-mldsa44', scope: 'web', root: 'mldsa44', intermediate: 'mldsa44', leaf: 'mldsa44', ct: 'mldsa44', hypothetical: true },
  // MTC: no root or intermediate certificate — CA and mirror cosign subtrees with ML-DSA-44
  'web-mtc':       { id: 'web-mtc', scope: 'web', root: 'mldsa44', intermediate: 'mldsa44', leaf: 'mldsa44', mtc: true },
};

export const PRIVATE_PROFILES: ProfileId[] = ['classical', 'mldsa44', 'mldsa65', 'composite', 'mixed'];
export const WEB_PROFILES: ProfileId[] = ['web-classical', 'web-mldsa44', 'web-mtc'];

export const PRIVATE_DOMAIN = 'muster.example';          // RFC 2606 reserved TLD
export const PRIVATE_HOST = 'portal.muster.example';
export const WEB_HOST = 'shop.example.com';

export type ClientId = 'legacy' | 'modern' | 'strict' | 'browserToday' | 'browserMtc' | 'cliTool';
export const PRIVATE_CLIENTS: ClientId[] = ['legacy', 'modern', 'strict'];
export const WEB_CLIENTS: ClientId[] = ['browserToday', 'browserMtc', 'cliTool'];

export type Variant = 'ok' | 'expired' | 'wrongHost' | 'missingIntermediate' | 'nameConstraints' | 'wrongEku' | 'revoked' | 'intermediateRevoked' | 'tampered';
export const FAILURE_VARIANTS: Variant[] = ['expired', 'wrongHost', 'missingIntermediate', 'nameConstraints', 'wrongEku', 'revoked', 'intermediateRevoked', 'tampered'];

export type AttackId = 'ownCa' | 'swapKey' | 'stolenKey' | 'misissuance';
export const ATTACKS: AttackId[] = ['ownCa', 'swapKey', 'stolenKey', 'misissuance'];

export type QDayDeployment = 'classical' | 'pqParallel' | 'compositeParallel' | 'catalyst' | 'dual';
export const QDAY_DEPLOYMENTS: QDayDeployment[] = ['classical', 'pqParallel', 'compositeParallel', 'catalyst', 'dual'];

// ── Protocol limits ───────────────────────────────────────────────────────────

/** RFC 6928 initial window with the common 1460-byte MSS. */
export const TCP_INITIAL_WINDOW = 14_600;
/** RFC 9191 §2.1.1: EAP fragments are often only 1,020 to 1,500 bytes. */
export const EAP_FRAGMENT = 1020;
