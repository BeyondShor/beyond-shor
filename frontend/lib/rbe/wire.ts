// Transport format for ring matrices between browser, worker and the KC API.
//   'u32' — residues mod q (uniform-looking data: A, pk, mpk, ciphertexts)
//   'i16' — centred coefficients that fit in 16 bits (short data: helper keys)

import type { Ring } from './ring';
import { type Mat, mat } from './matrix';

export interface WireMat {
  rows: number;
  cols: number;
  enc: 'u32' | 'i16';
  data: string;   // base64, little-endian
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeMat(ring: Ring, M: Mat, enc: 'u32' | 'i16' = 'u32'): WireMat {
  const count = M.e.length * ring.nR;
  if (enc === 'u32') {
    const buf = new Uint32Array(count);
    M.e.forEach((p, i) => buf.set(p, i * ring.nR));
    return { rows: M.rows, cols: M.cols, enc, data: toBase64(new Uint8Array(buf.buffer)) };
  }
  const buf = new Int16Array(count);
  M.e.forEach((p, i) => p.forEach((v, k) => {
    const c = ring.centered(v);
    if (c < -32768 || c > 32767) throw new Error('coefficient does not fit in 16 bits');
    buf[i * ring.nR + k] = c;
  }));
  return { rows: M.rows, cols: M.cols, enc, data: toBase64(new Uint8Array(buf.buffer)) };
}

// Decodes and validates shape and range; throws on anything malformed
export function decodeMat(ring: Ring, w: WireMat, rows?: number, cols?: number): Mat {
  if (!w || typeof w.data !== 'string' || !Number.isInteger(w.rows) || !Number.isInteger(w.cols)) {
    throw new Error('malformed matrix');
  }
  if ((rows !== undefined && w.rows !== rows) || (cols !== undefined && w.cols !== cols)) {
    throw new Error(`expected ${rows}×${cols}, got ${w.rows}×${w.cols}`);
  }
  const bytes = fromBase64(w.data);
  const count = w.rows * w.cols * ring.nR;
  const entries: Uint32Array[] = [];
  if (w.enc === 'u32') {
    if (bytes.length !== count * 4) throw new Error('wrong data length');
    const all = new Uint32Array(bytes.buffer, bytes.byteOffset, count);
    for (let i = 0; i < w.rows * w.cols; i++) {
      const p = all.slice(i * ring.nR, (i + 1) * ring.nR);
      if (p.some((v) => v >= ring.q)) throw new Error('coefficient out of range');
      entries.push(p);
    }
  } else if (w.enc === 'i16') {
    if (bytes.length !== count * 2) throw new Error('wrong data length');
    const all = new Int16Array(bytes.buffer, bytes.byteOffset, count);
    for (let i = 0; i < w.rows * w.cols; i++) {
      entries.push(Uint32Array.from(all.subarray(i * ring.nR, (i + 1) * ring.nR), (v) => ring.fromSigned(v)));
    }
  } else {
    throw new Error('unknown encoding');
  }
  return mat(w.rows, w.cols, entries);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  if (!/^([0-9a-f]{2})+$/i.test(hex)) throw new Error('malformed hex');
  return Uint8Array.from(hex.match(/../g)!, (h) => parseInt(h, 16));
}
