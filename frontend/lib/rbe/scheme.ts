// Base RBE construction (paper, Section 3.2), split into the steps the demo shows.
//
//   Setup     crs = A ∈ R_q^{n×(l+1)m}, uniform — expanded from a public seed
//   KeyGen    s ← χ^{k−1}, sk = (−s, 1);  B ← R_q^{n×(k−1)}, e ← χ^n;  pk = (B | B·s + e)
//   Reg       mpk ← mpk + A_{δi} · G⁻¹(pk_i)
//   HskGen    hsk_i = Σ_j H_{δj,i} · G⁻¹(pk_j)        (public data only)
//   Enc       ct0 = r·(A − ĩ⊗G) + e0,  ct1 = r·mpk + ⌊q/2⌋·(0,…,0,msg) + e1
//   Dec       ctReg = ct1 − ct0·hsk_i   (an ordinary dual-Regev ciphertext under pk_i)
//             msg = round(2/q · ctReg·sk_i)
//
// The key curator holds no secret: everything it computes can be recomputed by
// anyone from the seed and the registered public keys.

import { shake256 } from '@noble/hashes/sha3.js';
import { type RbeParams, type Derived, PARAMS, derive } from './params';
import { Ring } from './ring';
import { sampleCbd, sampleUniform, expandUniform } from './sample';
import {
  type Mat, type Gadget, mat, at, zeroMat, toHat, fromHat, mulHat, mulMat, addMat, subMat,
  gadgetMatrix, gInv, hcat, matNorm,
} from './matrix';
import {
  type DeltaChain, type RegisteredChain, deltaChain, registeredChain, helperKeyFromChains, bit,
} from './encoding';

export interface RbeContext {
  p: RbeParams;
  dv: Derived;
  ring: Ring;
  gadget: Gadget;
}

const contexts = new Map<string, RbeContext>();

export function createContext(p: RbeParams = PARAMS): RbeContext {
  const key = JSON.stringify(p);
  let ctx = contexts.get(key);
  if (!ctx) {
    const dv = derive(p);
    ctx = { p, dv, ring: new Ring(p.q, p.nR), gadget: { n: p.n, d: dv.d, L: dv.L } };
    contexts.set(key, ctx);
  }
  return ctx;
}

// ── Identities ────────────────────────────────────────────────────────────────

// Map a user name to an l-bit identity index (the paper's identity space {0,1}^l)
export function identityOf(name: string, p: RbeParams = PARAMS): number {
  const h = shake256(new TextEncoder().encode(`beyond-shor/rbe/id/${name}`), { dkLen: 4 });
  const v = ((h[0] | (h[1] << 8) | (h[2] << 16)) >>> 0) + h[3] * 2 ** 24;
  return v % 2 ** p.ell;
}

// ĩ = (i_0, …, i_{l−1}, 1) ⊗ G  ∈ R_q^{n×(l+1)m}
function identityGadget(ctx: RbeContext, id: number): Mat {
  const G = gadgetMatrix(ctx.ring, ctx.gadget);
  const zero = zeroMat(ctx.ring, G.rows, G.cols);
  const blocks: Mat[] = [];
  for (let k = 0; k < ctx.p.ell; k++) blocks.push(bit(id, k) ? G : zero);
  blocks.push(G);
  return hcat(...blocks);
}

// ── Setup ─────────────────────────────────────────────────────────────────────

export interface Crs {
  seed: Uint8Array;
  A: Mat;      // coefficient domain
  Ahat: Mat;   // NTT domain
}

export function setup(ctx: RbeContext, seed: Uint8Array): Crs {
  const { p, dv, ring } = ctx;
  const entries = expandUniform(ring, seed, p.n * dv.width);
  const A = mat(p.n, dv.width, entries);
  return { seed, A, Ahat: toHat(ring, A) };
}

// ── KeyGen (user, locally) ────────────────────────────────────────────────────

export interface KeyPair {
  pk: Mat;   // (B | B·s + e) ∈ R_q^{n×k}
  sk: Mat;   // (−s, 1)ᵀ ∈ R^{k×1}
}

export function keyGen(ctx: RbeContext): KeyPair {
  const { p, ring } = ctx;
  const s = Array.from({ length: p.k - 1 }, () => sampleCbd(ring, p.eta));
  const B = mat(p.n, p.k - 1, Array.from({ length: p.n * (p.k - 1) }, () => sampleUniform(ring)));
  const Bs = mulMat(ring, B, mat(p.k - 1, 1, s));
  const e = Array.from({ length: p.n }, () => sampleCbd(ring, p.eta));
  const pkCols: Uint32Array[] = [];
  for (let r = 0; r < p.n; r++) {
    for (let c = 0; c < p.k - 1; c++) pkCols.push(at(B, r, c));
    pkCols.push(ring.add(at(Bs, r, 0), e[r]));
  }
  const one = ring.zero(); one[0] = 1;
  const sk = mat(p.k, 1, [...s.map((x) => ring.neg(x)), one]);
  return { pk: mat(p.n, p.k, pkCols), sk };
}

// ── Key curator: registration and helper keys ─────────────────────────────────

export interface Registration {
  id: number;
  pk: Mat;
  term: Mat;              // A_{δi} · G⁻¹(pk_i) ∈ R_q^{n×k}, the contribution to mpk
  chain: RegisteredChain; // precomputed blocks for helper keys
}

const chainCache = new WeakMap<Mat, Map<number, DeltaChain>>();

function chainFor(ctx: RbeContext, crs: Crs, id: number): DeltaChain {
  let byId = chainCache.get(crs.Ahat);
  if (!byId) { byId = new Map(); chainCache.set(crs.Ahat, byId); }
  let c = byId.get(id);
  if (!c) { c = deltaChain(ctx.ring, crs.Ahat, id, ctx.p.ell, ctx.gadget); byId.set(id, c); }
  return c;
}

export function register(ctx: RbeContext, crs: Crs, id: number, pk: Mat): Registration {
  const { ring, gadget } = ctx;
  const chain = chainFor(ctx, crs, id);
  const term = fromHat(ring, mulHat(ring, chain.Adelta, toHat(ring, gInv(ring, pk, gadget))));
  return { id, pk, term, chain: registeredChain(ring, chain, pk, gadget) };
}

export function masterPublicKey(ctx: RbeContext, regs: Registration[]): Mat {
  return regs.reduce((mpk, r) => addMat(ctx.ring, mpk, r.term), zeroMat(ctx.ring, ctx.p.n, ctx.p.k));
}

export function helperKey(ctx: RbeContext, regs: Registration[], target: number): Mat {
  const { p, dv, ring } = ctx;
  return helperKeyFromChains(ring, regs.map((r) => r.chain), target, p.ell, dv.m, p.k);
}

// ── Messages ──────────────────────────────────────────────────────────────────

export function maxMessageBytes(ctx: RbeContext): number {
  return ctx.p.nR / 8 - 1;   // one byte reserved for the terminating zero
}

function encodeMessage(ctx: RbeContext, bytes: Uint8Array): Uint32Array {
  if (bytes.length > maxMessageBytes(ctx)) throw new Error('message too long');
  const poly = ctx.ring.zero();
  bytes.forEach((b, ci) => {
    for (let bi = 0; bi < 8; bi++) if ((b >> bi) & 1) poly[ci * 8 + bi] = ctx.dv.half;
  });
  return poly;
}

function decodeMessage(ctx: RbeContext, poly: Uint32Array): Uint8Array {
  const out: number[] = [];
  for (let ci = 0; ci < ctx.p.nR / 8; ci++) {
    let byte = 0;
    for (let bi = 0; bi < 8; bi++) {
      const v = Math.abs(ctx.ring.centered(poly[ci * 8 + bi]));
      if (v > ctx.p.q / 4) byte |= 1 << bi;
    }
    if (byte === 0) break;
    out.push(byte);
  }
  return Uint8Array.from(out);
}

// ── Encryption (anyone, with crs, mpk and the recipient's identity) ───────────

export interface Ciphertext {
  ct0: Mat;   // 1 × (l+1)m — binds the ciphertext to the identity
  ct1: Mat;   // 1 × k      — carries the message
}

export function encrypt(ctx: RbeContext, crs: Crs, mpk: Mat, id: number, message: Uint8Array): Ciphertext {
  const { p, dv, ring } = ctx;
  const r = mat(1, p.n, Array.from({ length: p.n }, () => sampleCbd(ring, p.eta)));
  const encodedA = subMat(ring, crs.A, identityGadget(ctx, id));         // A − ĩ⊗G
  const e0 = mat(1, dv.width, Array.from({ length: dv.width }, () => sampleCbd(ring, p.eta)));
  const ct0 = addMat(ring, mulMat(ring, r, encodedA), e0);
  const e1 = mat(1, p.k, Array.from({ length: p.k }, () => sampleCbd(ring, p.eta)));
  const ct1 = addMat(ring, mulMat(ring, r, mpk), e1);
  ct1.e[p.k - 1] = ring.add(ct1.e[p.k - 1], encodeMessage(ctx, message));
  return { ct0, ct1 };
}

// ── Decryption (recipient: public hsk first, then the secret sk) ──────────────

// Step 1 — apply the helper key: ct1 − ct0·hsk = r·pk_i + e′ + msg
export function decryptStep1(ctx: RbeContext, ct: Ciphertext, hsk: Mat): Mat {
  return subMat(ctx.ring, ct.ct1, mulMat(ctx.ring, ct.ct0, hsk));
}

export interface Plaintext {
  value: Uint32Array;   // ctReg·sk = ⌊q/2⌋·msg + noise
  message: Uint8Array;
  noise: number;        // largest |coefficient − ⌊q/2⌋·bit|
}

// Step 2 — apply the secret key and round
export function decryptStep2(ctx: RbeContext, ctReg: Mat, sk: Mat): Plaintext {
  const { ring, p, dv } = ctx;
  const value = at(mulMat(ring, ctReg, sk), 0, 0);
  const message = decodeMessage(ctx, value);
  let noise = 0;
  for (let i = 0; i < p.nR; i++) {
    const c = ring.centered(value[i]);
    const err = Math.abs(c) > p.q / 4 ? dv.half - Math.abs(c) : Math.abs(c);
    if (err > noise) noise = err;
  }
  return { value, message, noise };
}

// Largest coefficient of the helper key — it must stay short for decryption to work
export function helperKeyNorm(ctx: RbeContext, hsk: Mat): number {
  return matNorm(ctx.ring, hsk);
}
