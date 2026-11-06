/// <reference lib="webworker" />
// PKI playground worker: key ceremonies, issuance, validation, attacks and
// benchmarks run here, off the main thread. Private keys never leave the worker —
// except the classical keys Mallory "recovers" in the simulated Q-Day lab.
import { toHex, toPem, type Bytes } from '@/lib/pki/der';
import { keygen } from '@/lib/pki/algorithms';
import {
  benchmarkRun, clientsFor, createPki, currentCrl, handshake, issueLeaf, leafSpec, runAttack, runQDay,
  type LeafResult, type Pki,
} from '@/lib/pki/engine';
import { ALGS } from '@/lib/pki/meta';
import { issueMtc } from '@/lib/pki/mtc';
import { parseCrl } from '@/lib/pki/crl';
import { parseCertificate } from '@/lib/pki/x509';
import type {
  CertView, CrlInfo, HandshakeView, LeafView, MtcSizeRow, PkiRequest, PkiView, WorkerIn, WorkerOut,
} from '@/lib/pki/worker-types';

let pki: Pki | null = null;
let leaf: LeafResult | null = null;
const cancelled = new Set<number>();

const post = (m: WorkerOut) => (self as unknown as Worker).postMessage(m);

function view(der: Bytes): CertView {
  return { der, pem: toPem(der, 'CERTIFICATE'), parsed: parseCertificate(der) };
}

function pkiView(p: Pki): PkiView {
  return {
    profile: p.profile.id,
    host: p.host,
    root: p.root && view(p.root.der),
    issuing: p.issuing && view(p.issuing.der),
    logs: p.logs?.map((l) => ({ name: l.name, alg: ALGS[l.key.alg].name, logIdHex: toHex(l.logId) })),
    cosigners: p.cosigners?.map((c) => ({ id: c.id, role: c.role, alg: ALGS[c.key.alg].name, publicKeyBytes: c.key.publicKey.length })),
    ceremonyMs: p.ceremonyMs,
  };
}

function leafView(l: LeafResult): LeafView {
  return {
    variant: l.variant,
    leaf: view(l.der),
    csrPem: toPem(l.csr, 'CERTIFICATE REQUEST'),
    csrBytes: l.csr.length,
    csrValid: l.csrValid,
    chainBytes: l.chain.map((d) => d.length),
    expectedHost: l.expectedHost,
    timings: l.timings,
    mtc: l.mtc && {
      landmark: view(l.mtc.landmarkRelative),
      standalone: view(l.mtc.standalone),
      proofHashes: l.mtc.proofHashes,
      logSize: l.mtc.logSize,
    },
  };
}

function handshakes(p: Pki, l: LeafResult, crlReachable: boolean): HandshakeView[] {
  const { clients, crl } = clientsFor(p, crlReachable);
  return clients.map((c) => {
    const h = handshake(p, l, c, crl);
    return { ...h, chainBytes: h.flight.certificate };
  });
}

function requirePki(): Pki {
  if (!pki) throw new Error('no PKI yet');
  return pki;
}

async function handle(id: number, req: PkiRequest): Promise<unknown> {
  switch (req.op) {
    case 'createPki':
      pki = createPki(req.profile);
      leaf = null;
      return pkiView(pki);
    case 'issueLeaf': {
      const p = requirePki();
      const l = issueLeaf(p, req.variant);
      if (req.variant === 'ok') leaf = l;
      return { leaf: leafView(l), handshakes: handshakes(p, l, true) };
    }
    case 'handshakes': {
      if (!leaf) throw new Error('no certificate yet');
      return handshakes(requirePki(), leaf, req.crlReachable);
    }
    case 'attack':
      return runAttack(requirePki(), req.attack, req.crlBlocked);
    case 'qday':
      return runQDay(req.deployment);
    case 'benchmark': {
      const t0 = performance.now();
      const bench = createPki(req.profile);
      const ceremony = { ...bench.ceremonyMs, total: performance.now() - t0 };
      const runs = [];
      for (let i = 0; i < req.runs; i++) {
        if (cancelled.has(id)) break;
        const run = benchmarkRun(bench);
        runs.push(run);
        post({ id, progress: { done: i + 1, total: req.runs, run } });
        // yield so a cancel message can arrive between runs
        await new Promise((r) => setTimeout(r, 0));
      }
      return { ceremonyMs: ceremony, runs };
    }
    case 'mtcSizes': {
      // Same certificate contents, logs of different sizes: only the inclusion proof grows
      const p = pki?.profile.mtc ? pki : createPki('web-mtc');
      const key = leaf?.key.alg === 'mldsa44' ? leaf.key : keygen('mldsa44');
      const spec = leafSpec(p, key, 'ok', p.host);
      return req.fills.map((fill): MtcSizeRow => {
        const m = issueMtc(spec, p.cosigners!, fill);
        return { logSize: m.logSize, proofHashes: m.proofHashes, landmarkBytes: m.landmarkRelative.length, standaloneBytes: m.standalone.length };
      });
    }
    case 'crlInfo': {
      const p = requirePki();
      if (!p.issuing) throw new Error('no CRL for this profile');
      const der = currentCrl(p);
      const c = parseCrl(der);
      return { bytes: der.length, signatureBytes: c.signature.length, revoked: c.revokedSerials.length } satisfies CrlInfo;
    }
  }
}

(self as unknown as Worker).onmessage = async (ev: MessageEvent<WorkerIn>) => {
  const m = ev.data;
  if ('cancel' in m) { cancelled.add(m.id); return; }
  try {
    const result = await handle(m.id, m.req);
    post({ id: m.id, ok: true, result });
  } catch (e) {
    post({ id: m.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  } finally {
    cancelled.delete(m.id);
  }
};
