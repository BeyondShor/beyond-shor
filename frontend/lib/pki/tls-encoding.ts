// TLS presentation-language helpers (RFC 8446 §3): fixed-width integers and
// length-prefixed vectors, as used by CT (RFC 6962) and MTC (draft-08).
import { concat, type Bytes } from './der';

export function uint(value: number | bigint, width: number): Bytes {
  let v = BigInt(value);
  const out = new Uint8Array(width);
  for (let i = width - 1; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; }
  if (v !== 0n) throw new Error('value does not fit');
  return out;
}

/** opaque vector with a length prefix of lenBytes bytes */
export function vec(data: Bytes, lenBytes: number): Bytes {
  return concat(uint(data.length, lenBytes), data);
}

export class Reader {
  private p = 0;
  constructor(private readonly b: Bytes) {}
  uint(width: number): bigint {
    if (this.p + width > this.b.length) throw new Error('truncated');
    let v = 0n;
    for (let i = 0; i < width; i++) v = (v << 8n) | BigInt(this.b[this.p++]);
    return v;
  }
  num(width: number): number { return Number(this.uint(width)); }
  bytes(n: number): Bytes {
    if (this.p + n > this.b.length) throw new Error('truncated');
    const out = this.b.subarray(this.p, this.p + n);
    this.p += n;
    return out;
  }
  vec(lenBytes: number): Bytes { return this.bytes(this.num(lenBytes)); }
  get done() { return this.p === this.b.length; }
}
