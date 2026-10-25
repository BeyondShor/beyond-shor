// Arithmetic in R_q = Z_q[X]/(X^nR + 1) with a negacyclic NTT.
//
// Polynomials are Uint32Array of length nR with coefficients in [0, q).
// "Hat" values are the same arrays in the NTT domain, where multiplication is
// coefficient-wise. Because q < 2^26, every product a·b < 2^52 is exact in a
// double, so `a * b % q` needs no BigInt.

export class Ring {
  readonly q: number;
  readonly nR: number;
  private readonly zetas: Float64Array;     // ψ^bitrev(i), forward butterflies
  private readonly zetasInv: Float64Array;  // ψ^−bitrev(i), inverse butterflies
  private readonly nInv: number;

  constructor(q: number, nR: number) {
    if ((q - 1) % (2 * nR) !== 0) throw new Error('q must be 1 mod 2·nR');
    this.q = q;
    this.nR = nR;
    const psi = primitiveRoot(q, 2 * nR);
    const psiInv = modPow(psi, q - 2, q);
    const logN = Math.log2(nR);
    this.zetas = new Float64Array(nR);
    this.zetasInv = new Float64Array(nR);
    for (let i = 0; i < nR; i++) {
      const e = bitReverse(i, logN);
      this.zetas[i] = modPow(psi, e, q);
      this.zetasInv[i] = modPow(psiInv, e, q);
    }
    this.nInv = modPow(nR, q - 2, q);
  }

  zero(): Uint32Array {
    return new Uint32Array(this.nR);
  }

  // Lift a signed integer coefficient into [0, q)
  fromSigned(v: number): number {
    const r = v % this.q;
    return r < 0 ? r + this.q : r;
  }

  // Centred representative in (−q/2, q/2]
  centered(v: number): number {
    return v > this.q / 2 ? v - this.q : v;
  }

  add(a: Uint32Array, b: Uint32Array): Uint32Array {
    const q = this.q, out = new Uint32Array(this.nR);
    for (let i = 0; i < this.nR; i++) { const s = a[i] + b[i]; out[i] = s >= q ? s - q : s; }
    return out;
  }

  sub(a: Uint32Array, b: Uint32Array): Uint32Array {
    const q = this.q, out = new Uint32Array(this.nR);
    for (let i = 0; i < this.nR; i++) { const s = a[i] - b[i]; out[i] = s < 0 ? s + q : s; }
    return out;
  }

  neg(a: Uint32Array): Uint32Array {
    const q = this.q, out = new Uint32Array(this.nR);
    for (let i = 0; i < this.nR; i++) out[i] = a[i] === 0 ? 0 : q - a[i];
    return out;
  }

  // a ← a + b in place (both in the same domain)
  addInto(a: Uint32Array, b: Uint32Array): void {
    const q = this.q;
    for (let i = 0; i < this.nR; i++) { const s = a[i] + b[i]; a[i] = s >= q ? s - q : s; }
  }

  // Forward negacyclic NTT (Cooley–Tukey, natural order in, bit-reversed out)
  ntt(a: Uint32Array): Uint32Array {
    const q = this.q, n = this.nR, r = Float64Array.from(a);
    let k = 1;
    for (let len = n >> 1; len >= 1; len >>= 1) {
      for (let start = 0; start < n; start += 2 * len) {
        const z = this.zetas[k++];
        for (let j = start; j < start + len; j++) {
          const t = (z * r[j + len]) % q;
          const u = r[j];
          r[j + len] = u - t < 0 ? u - t + q : u - t;
          r[j] = u + t >= q ? u + t - q : u + t;
        }
      }
    }
    return Uint32Array.from(r);
  }

  // Inverse negacyclic NTT (Gentleman–Sande, bit-reversed in, natural order out)
  intt(a: Uint32Array): Uint32Array {
    const q = this.q, n = this.nR, r = Float64Array.from(a);
    let k = n - 1;
    for (let len = 1; len < n; len <<= 1) {
      for (let start = n - 2 * len; start >= 0; start -= 2 * len) {
        const z = this.zetasInv[k--];
        for (let j = start; j < start + len; j++) {
          const u = r[j], v = r[j + len];
          r[j] = u + v >= q ? u + v - q : u + v;
          const diff = u - v < 0 ? u - v + q : u - v;
          r[j + len] = (z * diff) % q;
        }
      }
    }
    const out = new Uint32Array(n);
    for (let i = 0; i < n; i++) out[i] = (r[i] * this.nInv) % q;
    return out;
  }

  // Coefficient-wise product of two NTT-domain polynomials
  mulHat(a: Uint32Array, b: Uint32Array): Uint32Array {
    const q = this.q, out = new Uint32Array(this.nR);
    for (let i = 0; i < this.nR; i++) out[i] = (a[i] * b[i]) % q;
    return out;
  }

  // acc ← acc + a∘b, with acc kept as unreduced doubles (caller reduces once)
  macHat(acc: Float64Array, a: Uint32Array, b: Uint32Array): void {
    const q = this.q;
    for (let i = 0; i < this.nR; i++) acc[i] += (a[i] * b[i]) % q;
  }

  reduce(acc: Float64Array): Uint32Array {
    const q = this.q, out = new Uint32Array(this.nR);
    for (let i = 0; i < this.nR; i++) out[i] = acc[i] % q;
    return out;
  }

  // Product of two coefficient-domain polynomials
  mul(a: Uint32Array, b: Uint32Array): Uint32Array {
    return this.intt(this.mulHat(this.ntt(a), this.ntt(b)));
  }

  // Multiply by a small integer constant
  scale(a: Uint32Array, c: number): Uint32Array {
    const q = this.q, out = new Uint32Array(this.nR), cc = this.fromSigned(c);
    for (let i = 0; i < this.nR; i++) out[i] = (a[i] * cc) % q;
    return out;
  }

  // Largest |centred coefficient| — the "noise" of a polynomial
  infNorm(a: Uint32Array): number {
    let max = 0;
    for (let i = 0; i < this.nR; i++) {
      const c = Math.abs(this.centered(a[i]));
      if (c > max) max = c;
    }
    return max;
  }
}

// ── Number theory helpers ─────────────────────────────────────────────────────

export function modPow(base: number, exp: number, mod: number): number {
  let result = 1;
  let b = base % mod;
  let e = exp;
  while (e > 0) {
    if (e & 1) result = (result * b) % mod;
    b = (b * b) % mod;
    e = Math.floor(e / 2);
  }
  return result;
}

function primeFactors(x: number): number[] {
  const out: number[] = [];
  for (let p = 2; p * p <= x; p++) {
    if (x % p === 0) { out.push(p); while (x % p === 0) x /= p; }
  }
  if (x > 1) out.push(x);
  return out;
}

// Smallest primitive `order`-th root of unity mod prime q
function primitiveRoot(q: number, order: number): number {
  const factors = primeFactors(q - 1);
  for (let g = 2; g < q; g++) {
    if (factors.every((p) => modPow(g, (q - 1) / p, q) !== 1)) {
      return modPow(g, (q - 1) / order, q);
    }
  }
  throw new Error('no generator found');
}

function bitReverse(x: number, bits: number): number {
  let r = 0;
  for (let i = 0; i < bits; i++) { r = (r << 1) | (x & 1); x >>= 1; }
  return r;
}
