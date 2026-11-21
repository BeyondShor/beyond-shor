// Minimal TLS ClientHello parser: just enough to see which key-exchange groups a
// client offers (supported_groups) and for which it sends a key share up front.
// A PQ key share in the first ClientHello means the client uses PQ by default;
// a PQ group that is only listed would need a HelloRetryRequest.

// IANA TLS Supported Groups registry (the ones that matter here).
export const GROUP_NAMES = {
  0x0017: 'secp256r1',
  0x0018: 'secp384r1',
  0x0019: 'secp521r1',
  0x001d: 'X25519',
  0x001e: 'X448',
  0x0100: 'ffdhe2048',
  0x0101: 'ffdhe3072',
  0x0102: 'ffdhe4096',
  0x0103: 'ffdhe6144',
  0x0104: 'ffdhe8192',
  0x0200: 'MLKEM512',
  0x0201: 'MLKEM768',
  0x0202: 'MLKEM1024',
  0x11eb: 'SecP256r1MLKEM768',
  0x11ec: 'X25519MLKEM768',
  0x11ed: 'SecP384r1MLKEM1024',
  0x6399: 'X25519Kyber768Draft00', // pre-standard, obsolete
  0x639a: 'SecP256r1Kyber768Draft00',
};

const PQ_GROUPS = new Set([0x0200, 0x0201, 0x0202, 0x11eb, 0x11ec, 0x11ed, 0x6399, 0x639a]);

export const groupName = (code) => GROUP_NAMES[code] ?? `0x${code.toString(16).padStart(4, '0')}`;
export const isPqGroup = (code) => PQ_GROUPS.has(code);
export const isPqGroupName = (name) => Object.entries(GROUP_NAMES).some(([c, n]) => n === name && PQ_GROUPS.has(Number(c)));

/**
 * Collect the handshake bytes of the first ClientHello from raw TLS records.
 * Returns null while more data is needed; throws on anything that is not a ClientHello.
 */
export function extractClientHello(buf) {
  const parts = [];
  let off = 0;
  let need = null; // total handshake length once known (4-byte header + body)
  while (off + 5 <= buf.length) {
    const type = buf[off];
    const len = buf.readUInt16BE(off + 3);
    if (type !== 22) throw new Error(`not a handshake record (content type ${type})`);
    if (off + 5 + len > buf.length) return null;
    parts.push(buf.subarray(off + 5, off + 5 + len));
    off += 5 + len;
    const hs = Buffer.concat(parts);
    if (need === null && hs.length >= 4) {
      if (hs[0] !== 1) throw new Error(`not a ClientHello (handshake type ${hs[0]})`);
      need = 4 + hs.readUIntBE(1, 3);
    }
    if (need !== null && hs.length >= need) return hs.subarray(0, need);
  }
  return null;
}

/** Parse a ClientHello handshake message (starting with type 0x01). */
export function parseClientHello(hs) {
  let p = 4; // type(1) + length(3)
  const u8 = () => hs[p++];
  const u16 = () => { const v = hs.readUInt16BE(p); p += 2; return v; };
  const skip = (n) => { p += n; if (p > hs.length) throw new Error('truncated ClientHello'); };

  const legacyVersion = u16();
  skip(32); // random
  skip(u8()); // session id
  const cipherLen = u16();
  const ciphers = [];
  for (let i = 0; i < cipherLen; i += 2) ciphers.push(hs.readUInt16BE(p + i));
  skip(cipherLen);
  skip(u8()); // compression methods

  const out = { legacyVersion, ciphers, sni: null, groups: [], keyShares: [], versions: [] };
  if (p >= hs.length) return out; // no extensions
  const extEnd = p + 2 + u16();
  while (p + 4 <= extEnd) {
    const type = u16();
    const len = u16();
    const start = p;
    if (type === 0x0000) { // server_name
      p += 2;
      if (u8() === 0) { const n = u16(); out.sni = hs.subarray(p, p + n).toString('ascii'); }
    } else if (type === 0x000a) { // supported_groups
      const n = u16();
      for (let i = 0; i < n; i += 2) out.groups.push(hs.readUInt16BE(p + i));
    } else if (type === 0x0033) { // key_share
      const end = p + 2 + u16();
      while (p + 4 <= end) {
        const group = u16();
        const klen = u16();
        out.keyShares.push({ group, length: klen });
        p += klen;
      }
    } else if (type === 0x002b) { // supported_versions
      const n = u8();
      for (let i = 0; i < n; i += 2) out.versions.push(hs.readUInt16BE(p + i));
    }
    p = start + len;
  }
  return out;
}

/** Turn a parsed ClientHello into the matrix result for one client. */
export function summarizeClientHello(hello) {
  const groups = hello.groups.map(groupName);
  const keyShares = hello.keyShares.map((k) => groupName(k.group));
  const pqKeyShare = hello.keyShares.some((k) => isPqGroup(k.group));
  const pqOffered = hello.groups.some(isPqGroup);
  return {
    pq: pqKeyShare,
    pqOffered,
    keyShares,
    groups,
    tls13: hello.versions.includes(0x0304),
  };
}
