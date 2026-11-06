// Minimal DER (X.690) encoder and parser — just what X.509 certificates,
// PKCS #10 requests and CRLs need. Definite lengths only, low tag numbers only.

export type Bytes = Uint8Array;

const te = new TextEncoder();
const td = new TextDecoder();

export function concat(...parts: Bytes[]): Bytes {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function equalBytes(a: Bytes, b: Bytes): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i];
  return d === 0;
}

export function toHex(b: Bytes): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

export function fromHex(h: string): Bytes {
  const clean = h.replace(/[^0-9a-f]/gi, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function lengthBytes(n: number): Bytes {
  if (n < 0x80) return Uint8Array.of(n);
  const bytes: number[] = [];
  while (n > 0) { bytes.unshift(n & 0xff); n = Math.floor(n / 256); }
  return Uint8Array.of(0x80 | bytes.length, ...bytes);
}

export function tlv(tag: number, content: Bytes): Bytes {
  return concat(Uint8Array.of(tag), lengthBytes(content.length), content);
}

// ── Universal types ───────────────────────────────────────────────────────────

export const TAG = {
  BOOLEAN: 0x01, INTEGER: 0x02, BIT_STRING: 0x03, OCTET_STRING: 0x04, NULL: 0x05,
  OID: 0x06, ENUMERATED: 0x0a, UTF8: 0x0c, RELATIVE_OID: 0x0d, SEQUENCE: 0x30, SET: 0x31,
  PRINTABLE: 0x13, IA5: 0x16, UTC_TIME: 0x17, GENERALIZED_TIME: 0x18,
} as const;

export const seq = (...c: Bytes[]) => tlv(TAG.SEQUENCE, concat(...c));

/** SET OF: DER sorts the encoded elements in ascending byte order (X.690 §11.6). */
export function setOf(...c: Bytes[]): Bytes {
  const sorted = [...c].sort((a, b) => {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  });
  return tlv(TAG.SET, concat(...sorted));
}

export const bool = (v: boolean) => tlv(TAG.BOOLEAN, Uint8Array.of(v ? 0xff : 0x00));
export const nul = () => Uint8Array.of(TAG.NULL, 0x00);
export const octets = (b: Bytes) => tlv(TAG.OCTET_STRING, b);
export const utf8 = (s: string) => tlv(TAG.UTF8, te.encode(s));
export const printable = (s: string) => tlv(TAG.PRINTABLE, te.encode(s));
export const ia5 = (s: string) => tlv(TAG.IA5, te.encode(s));

/** BIT STRING whose content is a whole number of octets. */
export const bitString = (b: Bytes) => tlv(TAG.BIT_STRING, concat(Uint8Array.of(0), b));

/** Unsigned big-endian magnitude → minimal two's-complement INTEGER content. */
function intContent(mag: Bytes): Bytes {
  let i = 0;
  while (i < mag.length - 1 && mag[i] === 0) i++;
  let m: Bytes = mag.slice(i);
  if (m.length === 0) m = Uint8Array.of(0);
  if (m[0] & 0x80) m = concat(Uint8Array.of(0), m);
  return m;
}

export function integer(v: number | bigint | Bytes): Bytes {
  if (v instanceof Uint8Array) return tlv(TAG.INTEGER, intContent(v));
  let n = BigInt(v);
  if (n < 0n) throw new Error('negative INTEGER not supported');
  const bytes: number[] = [];
  do { bytes.unshift(Number(n & 0xffn)); n >>= 8n; } while (n > 0n);
  return tlv(TAG.INTEGER, intContent(Uint8Array.from(bytes)));
}

export const enumerated = (v: number) => tlv(TAG.ENUMERATED, integer(v).slice(2));

function base128(n: bigint): number[] {
  const out = [Number(n & 0x7fn)];
  n >>= 7n;
  while (n > 0n) { out.unshift(Number(n & 0x7fn) | 0x80); n >>= 7n; }
  return out;
}

export function oidContent(dotted: string): Bytes {
  const arcs = dotted.split('.').map((x) => BigInt(x));
  const out = [...base128(arcs[0] * 40n + arcs[1])];
  for (const a of arcs.slice(2)) out.push(...base128(a));
  return Uint8Array.from(out);
}

export const oid = (dotted: string) => tlv(TAG.OID, oidContent(dotted));

/** RELATIVE-OID content: every arc base-128, no first-two-arcs folding. */
export function relativeOidContent(dotted: string): Bytes {
  return Uint8Array.from(dotted.split('.').flatMap((x) => base128(BigInt(x))));
}

export function decodeOid(content: Bytes): string {
  const arcs: bigint[] = [];
  let v = 0n;
  for (const b of content) {
    v = (v << 7n) | BigInt(b & 0x7f);
    if (!(b & 0x80)) { arcs.push(v); v = 0n; }
  }
  const first = arcs[0] < 80n ? arcs[0] / 40n : 2n;
  const second = arcs[0] - first * 40n;
  return [first, second, ...arcs.slice(1)].join('.');
}

// RFC 5280 §4.1.2.5: UTCTime through 2049, GeneralizedTime from 2050 on; seconds, always Z.
export function time(d: Date): Bytes {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  const y = d.getUTCFullYear();
  const rest = `${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return y >= 1950 && y < 2050
    ? tlv(TAG.UTC_TIME, te.encode(`${p(y % 100)}${rest}`))
    : tlv(TAG.GENERALIZED_TIME, te.encode(`${p(y, 4)}${rest}`));
}

export function decodeTime(node: Node): Date {
  const s = td.decode(node.content);
  const utc = node.tag === TAG.UTC_TIME;
  const m = utc
    ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s)
    : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})Z$/.exec(s);
  if (!m) throw new Error(`bad time ${s}`);
  let y = Number(m[1]);
  if (utc) y += y >= 50 ? 1900 : 2000;
  return new Date(Date.UTC(y, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])));
}

/** [n] EXPLICIT — constructed context tag wrapping a complete encoding. */
export const explicit = (n: number, inner: Bytes) => tlv(0xa0 | n, inner);
/** [n] IMPLICIT on a primitive type — replaces the tag, keeps the content. */
export const implicitPrimitive = (n: number, content: Bytes) => tlv(0x80 | n, content);
/** [n] IMPLICIT on a constructed type (SEQUENCE/SET) — replaces the tag. */
export const implicitConstructed = (n: number, content: Bytes) => tlv(0xa0 | n, content);

// ── Parser ────────────────────────────────────────────────────────────────────

export interface Node {
  tag:       number;
  start:     number;   // offset of the tag byte in the buffer
  headerLen: number;
  end:       number;   // offset after the last content byte
  content:   Bytes;    // view into the buffer
  children?: Node[];   // set for constructed encodings
}

export function parse(buf: Bytes, offset = 0, end = buf.length): Node {
  if (offset + 2 > end) throw new Error('DER: truncated header');
  const tag = buf[offset];
  if ((tag & 0x1f) === 0x1f) throw new Error('DER: high tag numbers unsupported');
  let p = offset + 1;
  let len = buf[p++];
  if (len === 0x80) throw new Error('DER: indefinite length not allowed');
  if (len & 0x80) {
    const nb = len & 0x7f;
    if (nb > 4 || p + nb > end) throw new Error('DER: bad length');
    len = 0;
    for (let i = 0; i < nb; i++) len = len * 256 + buf[p++];
    if (len < 0x80 || (nb > 1 && buf[p - nb] === 0)) throw new Error('DER: non-minimal length');
  }
  const contentEnd = p + len;
  if (contentEnd > end) throw new Error('DER: content exceeds buffer');
  const node: Node = { tag, start: offset, headerLen: p - offset, end: contentEnd, content: buf.subarray(p, contentEnd) };
  if (tag & 0x20) {
    node.children = [];
    let q = p;
    while (q < contentEnd) {
      const child = parse(buf, q, contentEnd);
      node.children.push(child);
      q = child.end;
    }
  }
  return node;
}

/** Parse exactly one element spanning the whole buffer. */
export function parseStrict(buf: Bytes): Node {
  const n = parse(buf);
  if (n.end !== buf.length) throw new Error('DER: trailing data');
  return n;
}

export const raw = (buf: Bytes, n: Node): Bytes => buf.subarray(n.start, n.end);

export function child(n: Node, i: number): Node {
  const c = n.children?.[i];
  if (!c) throw new Error(`DER: missing element ${i}`);
  return c;
}

export function readBitString(n: Node): Bytes {
  if (n.tag !== TAG.BIT_STRING || n.content[0] !== 0) throw new Error('DER: expected octet-aligned BIT STRING');
  return n.content.subarray(1);
}

export function readInteger(n: Node): bigint {
  let v = 0n;
  for (const b of n.content) v = (v << 8n) | BigInt(b);
  return v;
}

export const readString = (n: Node) => td.decode(n.content);

// ── PEM ───────────────────────────────────────────────────────────────────────

function b64(bytes: Bytes): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function toPem(der: Bytes, label: string): string {
  const body = b64(der).replace(/.{1,64}/g, '$&\n');
  return `-----BEGIN ${label}-----\n${body}-----END ${label}-----\n`;
}

export function fromBase64(s: string): Bytes {
  const bin = atob(s.replace(/\s+/g, ''));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export const utf8Bytes = (s: string) => te.encode(s);
