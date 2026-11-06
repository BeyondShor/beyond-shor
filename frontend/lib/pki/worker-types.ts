// Messages between the PKI playground UI and its worker. Type-only imports, so the
// UI bundle stays free of crypto code.
import type { AttackId, ClientId, ProfileId, QDayDeployment, Variant } from './meta';
import type { ParsedCert } from './x509';
import type { ValidationResult } from './validate';
import type { BenchRun, HandshakeResult } from './engine';
import type { AcmeTrace } from './acme';

export interface CertView {
  der:    Uint8Array;
  pem:    string;
  parsed: ParsedCert;
}

export interface PkiView {
  profile:    ProfileId;
  host:       string;
  root?:      CertView;
  issuing?:   CertView;
  logs?:      { name: string; alg: string; logIdHex: string }[];
  cosigners?: { id: string; role: 'ca' | 'mirror'; alg: string; publicKeyBytes: number }[];
  ceremonyMs: Record<string, number>;
}

export interface LeafView {
  variant:      Variant;
  leaf:         CertView;
  csrPem:       string;
  csrBytes:     number;
  csrValid:     boolean;
  chainBytes:   number[];
  expectedHost: string;
  acme?:        AcmeTrace;
  timings:      { keygen: number; csr: number; popCheck: number; validation: number; issue: number };
  mtc?: {
    landmark:    CertView;
    standalone:  CertView;
    proofHashes: number;
    logSize:     number;
  };
}

export type HandshakeView = HandshakeResult;

export interface AttackView {
  attack:      AttackId;
  results:     { client: ClientId; accepted: boolean; validation: ValidationResult }[];
  detectedBy?: 'ctMonitor' | 'issuanceLog' | null;
}

export interface QDayView {
  deployment: QDayDeployment;
  cells:      { client: 'legacy' | 'modern' | 'strict'; legit: boolean; forged: boolean; forgedChecks: ValidationResult }[];
  brokenKeys: { owner: string; alg: string; publicKeyHex: string; recoveredSecretHex: string }[];
  compositeForgeryRejected?: boolean;
}

export type BenchRunView = BenchRun;

export interface MtcSizeRow { logSize: number; proofHashes: number; landmarkBytes: number; standaloneBytes: number }

export interface CrlInfo { bytes: number; signatureBytes: number; revoked: number }

export type PkiRequest =
  | { op: 'createPki'; profile: ProfileId }
  | { op: 'issueLeaf'; variant: Variant }
  | { op: 'handshakes'; crlReachable: boolean }
  | { op: 'attack'; attack: AttackId; crlBlocked: boolean }
  | { op: 'qday'; deployment: QDayDeployment }
  | { op: 'benchmark'; profile: ProfileId; runs: number }
  | { op: 'mtcSizes'; fills: number[] }
  | { op: 'crlInfo' };

export type PkiResponse<R extends PkiRequest['op']> =
  R extends 'createPki' ? PkiView
  : R extends 'issueLeaf' ? { leaf: LeafView; handshakes: HandshakeView[] }
  : R extends 'handshakes' ? HandshakeView[]
  : R extends 'attack' ? AttackView
  : R extends 'qday' ? QDayView
  : R extends 'benchmark' ? { ceremonyMs: Record<string, number>; runs: BenchRunView[] }
  : R extends 'mtcSizes' ? MtcSizeRow[]
  : R extends 'crlInfo' ? CrlInfo
  : never;

export type WorkerIn = { id: number; req: PkiRequest } | { id: number; cancel: true };
export type WorkerOut =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string }
  | { id: number; progress: { done: number; total: number; run?: BenchRunView } };
