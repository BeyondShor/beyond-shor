// Polynomial arithmetic in R_q = Z_q[X]/(X^N + 1)
// Uses a negacyclic NTT (pre-twist / post-untwist trick) for O(N log N) multiplication.
// All coefficients are kept in [0, Q) throughout; never negative.

import { Q, N, PSI } from './params';

// ── Modular helpers ───────────────────────────────────────────────────────────

function modPow(base: number, exp: number, mod: number): number {
  let result = 1;
  base = ((base % mod) + mod) % mod;
  while (exp > 0) {
    if (exp & 1) result = result * base % mod;
    base = base * base % mod;
    exp >>>= 1;
  }
  return result;
}

// ── Lazy NTT tables ───────────────────────────────────────────────────────────

let _ready = false;
let _psiPow:    number[];  // ψ^i   for i = 0 … N-1
let _psiInvPow: number[];  // ψ^{-i} for i = 0 … N-1
let _nInv:      number;    // N^{-1} mod q

function ensureTables(): void {
  if (_ready) return;
  const psiInv = modPow(PSI, Q - 2, Q);
  _nInv = modPow(N, Q - 2, Q);
  _psiPow    = new Array(N);
  _psiInvPow = new Array(N);
  _psiPow[0] = _psiInvPow[0] = 1;
  for (let i = 1; i < N; i++) {
    _psiPow[i]    = _psiPow[i - 1]    * PSI    % Q;
    _psiInvPow[i] = _psiInvPow[i - 1] * psiInv % Q;
  }
  _ready = true;
}

// ── Cooley–Tukey DIT NTT (standard cyclic, in-place on copy) ─────────────────

function bitRevCopy(a: number[]): number[] {
  const n = a.length;
  const out = [...a];
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const t = out[i]; out[i] = out[j]; out[j] = t; }
  }
  return out;
}

// Computes NTT with the given primitive N-th root `omega`.
// Returns N point-values; does NOT scale.
function rawNTT(a: number[], omega: number): number[] {
  const n = a.length;
  const r = bitRevCopy(a);
  for (let len = 2; len <= n; len <<= 1) {
    const wStep = modPow(omega, n / len, Q);
    const half  = len >> 1;
    for (let i = 0; i < n; i += len) {
      let w = 1;
      for (let j = 0; j < half; j++) {
        const u = r[i + j];
        const v = r[i + j + half] * w % Q;
        r[i + j]        = (u + v) % Q;
        r[i + j + half] = (u - v + Q) % Q;
        w = w * wStep % Q;
      }
    }
  }
  return r;
}

// ── Negacyclic NTT  (multiplication mod X^N + 1) ─────────────────────────────
//
// Pre-twist: a'[i] = a[i] · ψ^i          (shifts cyclic NTT → negacyclic)
// NTT with ω = ψ^2 (primitive N-th root):  A = NTT(a')
// Pointwise multiply, then INTT + untwist.

const OMEGA: number = PSI * PSI % Q; // primitive N-th root of unity

export function negaNTT(a: number[]): number[] {
  ensureTables();
  return rawNTT(a.map((v, i) => v * _psiPow[i] % Q), OMEGA);
}

export function negaINTT(A: number[]): number[] {
  ensureTables();
  const omegaInv = modPow(OMEGA, Q - 2, Q);
  // rawNTT with ω^{-1} gives N·a' (unscaled)
  return rawNTT([...A], omegaInv).map((v, i) => v * _nInv % Q * _psiInvPow[i] % Q);
}

// ── Public polynomial operations ──────────────────────────────────────────────

export function polyMul(a: number[], b: number[]): number[] {
  const C = negaNTT(a).map((v, i) => v * negaNTT(b)[i] % Q);
  return negaINTT(C);
}

export function polyAdd(a: number[], b: number[]): number[] {
  return a.map((v, i) => (v + b[i]) % Q);
}

export function polySub(a: number[], b: number[]): number[] {
  return a.map((v, i) => (v - b[i] + Q) % Q);
}

export function polyNeg(a: number[]): number[] {
  return a.map(v => v === 0 ? 0 : Q - v);
}

// a^{-1} mod (X^N + 1, q)  —  exists iff all N NTT components are ≠ 0 mod q.
export function polyInv(a: number[]): number[] {
  const A = negaNTT(a);
  if (A.some(v => v === 0)) throw new Error('Polynomial not invertible mod q');
  return negaINTT(A.map(v => modPow(v, Q - 2, Q)));
}

// Verify that a · b ≡ 1  (useful for sanity checks)
export function polyIsOne(a: number[]): boolean {
  return a[0] === 1 && a.slice(1).every(v => v === 0);
}
