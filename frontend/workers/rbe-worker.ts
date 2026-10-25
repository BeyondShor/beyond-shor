/// <reference lib="webworker" />
// RBE Web Worker — everything a user does runs here, off the main thread:
// expanding the CRS from the public seed, key generation, encryption, both
// decryption steps, and re-computing the key curator's mpk to audit it.

import type { WorkerInMessage, WorkerOutMessage } from '@/lib/rbe-types';
import {
  type Crs, createContext, setup, keyGen, encrypt, decryptStep1, decryptStep2, register, masterPublicKey,
} from '@/lib/rbe/scheme';
import { encodeMat, decodeMat, fromHex } from '@/lib/rbe/wire';

const ctx = createContext();
const { ring, p, dv } = ctx;
let crs: Crs | null = null;

type OutBody = WorkerOutMessage extends infer T ? T extends unknown ? Omit<T, 'id' | 'ms'> : never : never;

function post(id: string, t0: number, body: OutBody): void {
  (self as unknown as Worker).postMessage({ id, ms: performance.now() - t0, ...body } as WorkerOutMessage);
}

function requireCrs(): Crs {
  if (!crs) throw new Error('CRS not initialised');
  return crs;
}

(self as unknown as Worker).onmessage = (ev: MessageEvent<WorkerInMessage>) => {
  const m = ev.data;
  const t0 = performance.now();
  try {
    switch (m.type) {
      case 'init': {
        crs = setup(ctx, fromHex(m.seed));
        post(m.id, t0, { type: 'init_done', preview: Array.from(crs.A.e[0].subarray(0, 6)) });
        break;
      }
      case 'keygen': {
        const { pk, sk } = keyGen(ctx);
        post(m.id, t0, { type: 'keygen_done', pk: encodeMat(ring, pk), sk: encodeMat(ring, sk) });
        break;
      }
      case 'encrypt': {
        const mpk = decodeMat(ring, m.mpk, p.n, p.k);
        const ct = encrypt(ctx, requireCrs(), mpk, m.target, new TextEncoder().encode(m.message));
        post(m.id, t0, { type: 'encrypt_done', ct: { ct0: encodeMat(ring, ct.ct0), ct1: encodeMat(ring, ct.ct1) } });
        break;
      }
      case 'dec_step1': {
        const ct = { ct0: decodeMat(ring, m.ct.ct0, 1, dv.width), ct1: decodeMat(ring, m.ct.ct1, 1, p.k) };
        const ctReg = decryptStep1(ctx, ct, decodeMat(ring, m.hsk, dv.width, p.k));
        post(m.id, t0, { type: 'dec_step1_done', ctReg: encodeMat(ring, ctReg) });
        break;
      }
      case 'dec_step2': {
        const pt = decryptStep2(ctx, decodeMat(ring, m.ctReg, 1, p.k), decodeMat(ring, m.sk, p.k, 1));
        post(m.id, t0, {
          type: 'dec_step2_done',
          message: new TextDecoder('utf-8', { fatal: false }).decode(pt.message),
          noise: pt.noise,
          value: Array.from(pt.value.subarray(0, 16), (v) => ring.centered(v)),
        });
        break;
      }
      case 'verify_mpk': {
        const c = requireCrs();
        const regs = m.users.map((u) => register(ctx, c, u.id, decodeMat(ring, u.pk, p.n, p.k)));
        const ours = masterPublicKey(ctx, regs);
        const theirs = decodeMat(ring, m.mpk, p.n, p.k);
        const match = ours.e.every((poly, i) => poly.every((v, k) => v === theirs.e[i][k]));
        post(m.id, t0, { type: 'verify_mpk_done', match });
        break;
      }
    }
  } catch (err) {
    post(m.id, t0, { type: 'error', msg: err instanceof Error ? err.message : String(err) });
  }
};
