// Tests for the RBE demo (base construction of ePrint 2026/628, Section 3).
// The algebraic identities are checked exactly, not just "decryption works".

import { describe, it, expect } from 'vitest';
import { PARAMS, type RbeParams } from '@/lib/rbe/params';
import { Ring } from '@/lib/rbe/ring';
import { sampleUniform, randomSeed } from '@/lib/rbe/sample';
import {
  mat, at, mulMat, subMat, scaleMat, gadgetMatrix, gInv, fromHat, matNorm, hcat, zeroMat, type Mat,
} from '@/lib/rbe/matrix';
import { deltaChain, deltaH, bit } from '@/lib/rbe/encoding';
import {
  createContext, setup, keyGen, register, masterPublicKey, helperKey, encrypt,
  decryptStep1, decryptStep2, identityOf, helperKeyNorm,
} from '@/lib/rbe/scheme';

const SMALL: RbeParams = { ...PARAMS, nR: 64, ell: 3 };

function schoolbook(ring: Ring, a: Uint32Array, b: Uint32Array): Uint32Array {
  const out = new Float64Array(ring.nR);
  for (let i = 0; i < ring.nR; i++) {
    for (let j = 0; j < ring.nR; j++) {
      const prod = (a[i] * b[j]) % ring.q;
      const idx = i + j;
      if (idx < ring.nR) out[idx] = (out[idx] + prod) % ring.q;
      else out[idx - ring.nR] = (out[idx - ring.nR] - prod + ring.q) % ring.q;   // X^nR = −1
    }
  }
  return Uint32Array.from(out);
}

const equalMat = (A: Mat, B: Mat) => A.e.every((p, i) => p.every((v, k) => v === B.e[i][k]));

function encodedIdentity(ctx: ReturnType<typeof createContext>, A: Mat, j: number): Mat {
  const G = gadgetMatrix(ctx.ring, ctx.gadget);
  const zero = zeroMat(ctx.ring, G.rows, G.cols);
  const blocks: Mat[] = [];
  for (let k = 0; k < ctx.p.ell; k++) blocks.push(bit(j, k) ? G : zero);
  blocks.push(G);
  return subMat(ctx.ring, A, hcat(...blocks));
}

describe('ring arithmetic', () => {
  const ring = new Ring(PARAMS.q, PARAMS.nR);

  it('NTT round-trips', () => {
    const a = sampleUniform(ring);
    expect(Array.from(ring.intt(ring.ntt(a)))).toEqual(Array.from(a));
  });

  it('NTT multiplication matches negacyclic schoolbook multiplication', () => {
    const a = sampleUniform(ring), b = sampleUniform(ring);
    expect(Array.from(ring.mul(a, b))).toEqual(Array.from(schoolbook(ring, a, b)));
  });
});

describe('gadget', () => {
  const ctx = createContext();

  it('G · G⁻¹(X) = X with balanced digits in (−d/2, d/2]', () => {
    const { ring, gadget } = ctx;
    const X = mat(gadget.n, 2, [sampleUniform(ring), sampleUniform(ring)]);
    const D = gInv(ring, X, gadget);
    expect(equalMat(mulMat(ring, gadgetMatrix(ring, gadget), D), X)).toBe(true);
    expect(matNorm(ring, D)).toBeLessThanOrEqual(gadget.d / 2);
  });
});

describe('homomorphic delta encodings (Theorem 4)', () => {
  const ctx = createContext(SMALL);
  const crs = setup(ctx, randomSeed());
  const G = gadgetMatrix(ctx.ring, ctx.gadget);

  it('(A − j̃⊗G)·H_{δi,j} = A_{δi} − δ_i(j)·G for every pair i, j', () => {
    const size = 2 ** SMALL.ell;
    for (let i = 0; i < size; i++) {
      const chain = deltaChain(ctx.ring, crs.Ahat, i, SMALL.ell, ctx.gadget);
      const Adelta = fromHat(ctx.ring, chain.Adelta);
      for (let j = 0; j < size; j++) {
        const H = fromHat(ctx.ring, deltaH(ctx.ring, chain, j, SMALL.ell, ctx.dv.m));
        const lhs = mulMat(ctx.ring, encodedIdentity(ctx, crs.A, j), H);
        const rhs = subMat(ctx.ring, Adelta, scaleMat(ctx.ring, G, i === j ? 1 : 0));
        expect(equalMat(lhs, rhs), `i=${i} j=${j}`).toBe(true);
        expect(matNorm(ctx.ring, H)).toBeLessThanOrEqual(SMALL.ell * ctx.gadget.d / 2);
      }
    }
  });
});

describe('RBE scheme', () => {
  const ctx = createContext();
  const crs = setup(ctx, randomSeed());
  const names = ['alice', 'bob', 'charlie'];
  const ids = names.map((n) => identityOf(n));
  const keys = names.map(() => keyGen(ctx));
  const regs = ids.map((id, u) => register(ctx, crs, id, keys[u].pk));
  const mpk = masterPublicKey(ctx, regs);

  it('demo identities are distinct', () => {
    expect(new Set(ids).size).toBe(names.length);
  });

  it('the CRS is reproducible from its public seed', () => {
    expect(equalMat(setup(ctx, crs.seed).A, crs.A)).toBe(true);
  });

  it('pk·sk is the small key-generation error', () => {
    const e = at(mulMat(ctx.ring, keys[0].pk, keys[0].sk), 0, 0);
    expect(ctx.ring.infNorm(e)).toBeLessThanOrEqual(ctx.p.eta);
  });

  it('(A − ĩ⊗G)·hsk_i = mpk − pk_i (equation 1)', () => {
    ids.forEach((id, u) => {
      const hsk = helperKey(ctx, regs, id);
      const lhs = mulMat(ctx.ring, encodedIdentity(ctx, crs.A, id), hsk);
      expect(equalMat(lhs, subMat(ctx.ring, mpk, keys[u].pk))).toBe(true);
    });
  });

  it('each recipient decrypts their own message', () => {
    ids.forEach((id, u) => {
      const msg = new TextEncoder().encode(`Geheime Nachricht für ${names[u]} – äöü ✓`);
      const ct = encrypt(ctx, crs, mpk, id, msg);
      const pt = decryptStep2(ctx, decryptStep1(ctx, ct, helperKey(ctx, regs, id)), keys[u].sk);
      expect(new TextDecoder().decode(pt.message)).toBe(new TextDecoder().decode(msg));
      expect(pt.noise).toBeLessThan(ctx.p.q / 4);
    });
  });

  it('another user\'s helper key or secret key does not decrypt', () => {
    const msg = new TextEncoder().encode('Nur für Bob');
    const ct = encrypt(ctx, crs, mpk, ids[1], msg);
    const wrongHsk = decryptStep2(ctx, decryptStep1(ctx, ct, helperKey(ctx, regs, ids[0])), keys[0].sk);
    const wrongSk = decryptStep2(ctx, decryptStep1(ctx, ct, helperKey(ctx, regs, ids[1])), keys[0].sk);
    expect(new TextDecoder().decode(wrongHsk.message)).not.toBe('Nur für Bob');
    expect(new TextDecoder().decode(wrongSk.message)).not.toBe('Nur für Bob');
  });

  it('keeps a wide noise margin', () => {
    // Decryption fails once a coefficient's noise exceeds q/4. Measure the noise
    // spread over many encryptions of the all-zero message and require ≥ 6σ headroom.
    let sumSq = 0, count = 0;
    for (let trial = 0; trial < 4; trial++) {
      ids.forEach((id, u) => {
        const ct = encrypt(ctx, crs, mpk, id, new Uint8Array(0));
        const pt = decryptStep2(ctx, decryptStep1(ctx, ct, helperKey(ctx, regs, id)), keys[u].sk);
        for (const v of pt.value) { const c = ctx.ring.centered(v); sumSq += c * c; count++; }
      });
    }
    const sigma = Math.sqrt(sumSq / count);
    const hskNorm = Math.max(...ids.map((id) => helperKeyNorm(ctx, helperKey(ctx, regs, id))));
    console.log(`[rbe] noise σ = ${sigma.toFixed(0)}, margin ${(ctx.p.q / 4 / sigma).toFixed(1)}σ, max |hsk| = ${hskNorm}`);
    expect(ctx.p.q / 4 / sigma).toBeGreaterThan(6);
  });
});
