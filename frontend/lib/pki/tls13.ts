// cbom: ml-kem-768:pki-playground
// cbom: x25519:pki-playground
// cbom: aes-128-gcm:pki-playground
//
// A real TLS 1.3 handshake (RFC 8446) between an in-memory client and server:
// X25519MLKEM768 key exchange (RFC 10024), TLS_AES_128_GCM_SHA256, the key schedule,
// encrypted records, CertificateVerify over the actual transcript and both Finished
// messages. Nothing goes over a network; every byte is the byte a real stack would send.
import { sha256 } from '@noble/hashes/sha2.js';
import { hmac } from '@noble/hashes/hmac.js';
import { expand as hkdfExpand, extract as hkdfExtract } from '@noble/hashes/hkdf.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { concat, equalBytes, utf8Bytes, type Bytes } from './der';
import { sign, verify, type AlgId, type KeyPair } from './algorithms';
import { Reader, uint, vec } from './tls-encoding';

// ── Code points ───────────────────────────────────────────────────────────────

export const GROUP_X25519MLKEM768 = 0x11ec;                // RFC 10024
const CIPHER_AES128_GCM_SHA256 = 0x1301;

/** SignatureScheme per algorithm (RFC 8446; ML-DSA: draft-ietf-tls-mldsa). */
export const SIGNATURE_SCHEME: Record<AlgId, number> = {
  'ecdsa-p256': 0x0403,                 // ecdsa_secp256r1_sha256
  mldsa44: 0x0904,
  mldsa65: 0x0905,
  // No assigned code points yet (draft-reddy-tls-composite-mldsa only has placeholders,
  // SLH-DSA has none): the demo uses values from the private-use range (RFC 8446 §4.2.3)
  'composite-mldsa65-p256': 0xfe00,
  slhdsa192s: 0xfe01,
};
export const PRIVATE_USE_SCHEMES = new Set([0xfe00, 0xfe01]);

// ── Key schedule (RFC 8446 §7.1) ──────────────────────────────────────────────

const H = 32;
const zeros = new Uint8Array(H);

export function expandLabel(secret: Bytes, label: string, context: Bytes, length: number): Bytes {
  const info = concat(uint(length, 2), vec(utf8Bytes(`tls13 ${label}`), 1), vec(context, 1));
  return hkdfExpand(sha256, secret, info, length);
}

export const deriveSecret = (secret: Bytes, label: string, transcriptHash: Bytes) => expandLabel(secret, label, transcriptHash, H);

export function handshakeSecrets(sharedSecret: Bytes, helloHash: Bytes) {
  // noble's signature is extract(hash, ikm, salt) — HKDF-Extract(salt, IKM) in RFC 8446 terms
  const early = hkdfExtract(sha256, zeros, zeros);
  const derived = deriveSecret(early, 'derived', sha256(new Uint8Array()));
  const handshake = hkdfExtract(sha256, sharedSecret, derived);
  return {
    early, handshake,
    clientHs: deriveSecret(handshake, 'c hs traffic', helloHash),
    serverHs: deriveSecret(handshake, 's hs traffic', helloHash),
    master: hkdfExtract(sha256, zeros, deriveSecret(handshake, 'derived', sha256(new Uint8Array()))),
  };
}

export const trafficKeys = (secret: Bytes) => ({ key: expandLabel(secret, 'key', new Uint8Array(), 16), iv: expandLabel(secret, 'iv', new Uint8Array(), 12) });

export function finishedVerifyData(baseSecret: Bytes, transcriptHash: Bytes): Bytes {
  return hmac(sha256, expandLabel(baseSecret, 'finished', new Uint8Array(), H), transcriptHash);
}

// ── Records (RFC 8446 §5) ─────────────────────────────────────────────────────

const CT_CHANGE_CIPHER_SPEC = 20, CT_HANDSHAKE = 22, CT_APPLICATION_DATA = 23;
const MAX_FRAGMENT = 16_384;

function nonce(iv: Bytes, seq: number): Bytes {
  const n = iv.slice();
  const s = uint(seq, 8);
  for (let i = 0; i < 8; i++) n[4 + i] ^= s[i];
  return n;
}

async function aesGcm(mode: 'encrypt' | 'decrypt', key: Bytes, iv: Bytes, aad: Bytes, data: Bytes): Promise<Bytes> {
  const k = await crypto.subtle.importKey('raw', Uint8Array.from(key), 'AES-GCM', false, [mode]);
  const params = { name: 'AES-GCM', iv: Uint8Array.from(iv), additionalData: Uint8Array.from(aad), tagLength: 128 };
  const out = mode === 'encrypt'
    ? await crypto.subtle.encrypt(params, k, Uint8Array.from(data))
    : await crypto.subtle.decrypt(params, k, Uint8Array.from(data));
  return new Uint8Array(out);
}

export const plaintextRecord = (type: number, fragment: Bytes) => concat(Uint8Array.of(type, 3, 3), uint(fragment.length, 2), fragment);

/** TLSCiphertext: opaque_type 23, legacy_version 0x0303, encrypted TLSInnerPlaintext (content ‖ type). */
export async function encryptRecord(keys: { key: Bytes; iv: Bytes }, seq: number, type: number, content: Bytes): Promise<Bytes> {
  const inner = concat(content, Uint8Array.of(type));
  const header = concat(Uint8Array.of(CT_APPLICATION_DATA, 3, 3), uint(inner.length + 16, 2));
  return concat(header, await aesGcm('encrypt', keys.key, nonce(keys.iv, seq), header, inner));
}

async function decryptRecord(keys: { key: Bytes; iv: Bytes }, seq: number, record: Bytes): Promise<{ type: number; content: Bytes }> {
  const inner = await aesGcm('decrypt', keys.key, nonce(keys.iv, seq), record.subarray(0, 5), record.subarray(5));
  let end = inner.length - 1;
  while (end >= 0 && inner[end] === 0) end--;          // strip padding
  return { type: inner[end], content: inner.subarray(0, end) };
}

function splitRecords(stream: Bytes): Bytes[] {
  const out: Bytes[] = [];
  for (let p = 0; p < stream.length;) {
    const len = (stream[p + 3] << 8) | stream[p + 4];
    out.push(stream.subarray(p, p + 5 + len));
    p += 5 + len;
  }
  return out;
}

// ── Handshake messages (RFC 8446 §4) ──────────────────────────────────────────

const msg = (type: number, body: Bytes) => concat(Uint8Array.of(type), uint(body.length, 3), body);
const ext = (type: number, data: Bytes) => concat(uint(type, 2), vec(data, 2));

export interface ClientHelloInfo { message: Bytes; random: Bytes; sessionId: Bytes; mlkemDk: Bytes; x25519Sk: Bytes }

export function clientHello(serverName: string, schemes: number[]): ClientHelloInfo {
  const random = crypto.getRandomValues(new Uint8Array(32));
  // 32-byte legacy_session_id: middlebox compatibility mode, as browsers send it (RFC 8446 §D.4)
  const sessionId = crypto.getRandomValues(new Uint8Array(32));
  const kem = ml_kem768.keygen();
  const xSk = x25519.utils.randomSecretKey();
  const share = concat(kem.publicKey, x25519.getPublicKey(xSk));       // 1184 + 32 = 1216 bytes
  const name = utf8Bytes(serverName);
  const exts = concat(
    ext(0x0000, vec(concat(Uint8Array.of(0), vec(name, 2)), 2)),                        // server_name
    ext(0x000a, vec(concat(uint(GROUP_X25519MLKEM768, 2)), 2)),                          // supported_groups
    ext(0x000d, vec(concat(...schemes.map((s) => uint(s, 2))), 2)),                     // signature_algorithms
    ext(0x002b, vec(uint(0x0304, 2), 1)),                                                // supported_versions
    ext(0x0033, vec(concat(uint(GROUP_X25519MLKEM768, 2), vec(share, 2)), 2)),           // key_share
  );
  const body = concat(uint(0x0303, 2), random, vec(sessionId, 1), vec(uint(CIPHER_AES128_GCM_SHA256, 2), 2), vec(Uint8Array.of(0), 1), vec(exts, 2));
  return { message: msg(1, body), random, sessionId, mlkemDk: kem.secretKey, x25519Sk: xSk };
}

function parseClientShare(ch: Bytes): Bytes {
  const r = new Reader(ch);
  r.num(1); r.num(3); r.num(2); r.bytes(32); r.vec(1); r.vec(2); r.vec(1);
  const exts = new Reader(r.vec(2));
  while (!exts.done) {
    const type = exts.num(2), data = exts.vec(2);
    if (type === 0x0033) {
      const s = new Reader(new Reader(data).vec(2));
      if (s.num(2) !== GROUP_X25519MLKEM768) throw new Error('unexpected group');
      return s.vec(2);
    }
  }
  throw new Error('no key_share');
}

// ── Result ────────────────────────────────────────────────────────────────────

export interface TlsHandshake {
  clientHello:  Bytes;                        // handshake message
  serverFlight: Bytes;                        // all server records of the first flight, as sent over TCP
  messages: { serverHello: number; encryptedExtensions: number; certificate: number; certificateVerify: number; finished: number };
  records: { kind: 'ServerHello' | 'ChangeCipherSpec' | 'encrypted'; bytes: number }[];
  scheme:       number;
  transcriptHash: Bytes;                      // up to and including Certificate (what CertificateVerify covers)
  clientChecks: { decrypted: boolean; certificateVerify: 'pass' | 'fail' | 'skip'; serverFinished: boolean };
  clientFinished: Bytes;                      // client's encrypted Finished record
  timings: { serverSign: number; clientVerify: number };
}

/**
 * Runs one complete server authentication. `canVerify` says whether the client knows the
 * leaf's signature algorithm; the chain itself is validated separately (validate.ts).
 */
export async function runHandshake(serverName: string, chain: Bytes[], leafKey: KeyPair, leafPublicKey: Bytes, canVerify: boolean): Promise<TlsHandshake> {
  const scheme = SIGNATURE_SCHEME[leafKey.alg];
  const ch = clientHello(serverName, [0x0403, 0x0904, 0x0905, 0x0906, 0xfe00, 0xfe01]);

  // ── Server: key exchange (ML-KEM-768 encapsulation + X25519) ──
  const clientShare = parseClientShare(ch.message);
  const { cipherText, sharedSecret: kemSs } = ml_kem768.encapsulate(clientShare.subarray(0, 1184));
  const sx = x25519.utils.randomSecretKey();
  const serverShare = concat(cipherText, x25519.getPublicKey(sx));        // 1088 + 32 = 1120 bytes
  const sharedSecret = concat(kemSs, x25519.getSharedSecret(sx, clientShare.subarray(1184)));
  const shExts = concat(ext(0x002b, uint(0x0304, 2)), ext(0x0033, concat(uint(GROUP_X25519MLKEM768, 2), vec(serverShare, 2))));
  const serverHello = msg(2, concat(uint(0x0303, 2), crypto.getRandomValues(new Uint8Array(32)), vec(ch.sessionId, 1),
    uint(CIPHER_AES128_GCM_SHA256, 2), Uint8Array.of(0), vec(shExts, 2)));

  const sec = handshakeSecrets(sharedSecret, sha256(concat(ch.message, serverHello)));
  const sKeys = trafficKeys(sec.serverHs);
  const encryptedExtensions = msg(8, vec(new Uint8Array(), 2));
  const certificate = msg(11, concat(vec(new Uint8Array(), 1), vec(concat(...chain.map((d) => concat(vec(d, 3), vec(new Uint8Array(), 2)))), 3)));
  const thCert = sha256(concat(ch.message, serverHello, encryptedExtensions, certificate));
  const cvContent = concat(new Uint8Array(64).fill(0x20), utf8Bytes('TLS 1.3, server CertificateVerify'), Uint8Array.of(0), thCert);
  let t = performance.now();
  const cvSig = sign(leafKey, cvContent);
  const serverSign = performance.now() - t;
  const certificateVerify = msg(15, concat(uint(scheme, 2), vec(cvSig, 2)));
  const finished = msg(20, finishedVerifyData(sec.serverHs, sha256(concat(ch.message, serverHello, encryptedExtensions, certificate, certificateVerify))));

  const protectedStream = concat(encryptedExtensions, certificate, certificateVerify, finished);
  const records: TlsHandshake['records'] = [];
  const shRecord = plaintextRecord(CT_HANDSHAKE, serverHello);
  const ccs = plaintextRecord(CT_CHANGE_CIPHER_SPEC, Uint8Array.of(1));
  records.push({ kind: 'ServerHello', bytes: shRecord.length }, { kind: 'ChangeCipherSpec', bytes: ccs.length });
  const encrypted: Bytes[] = [];
  for (let off = 0, seq = 0; off < protectedStream.length; off += MAX_FRAGMENT, seq++) {
    const rec = await encryptRecord(sKeys, seq, CT_HANDSHAKE, protectedStream.subarray(off, off + MAX_FRAGMENT));
    encrypted.push(rec);
    records.push({ kind: 'encrypted', bytes: rec.length });
  }
  const serverFlight = concat(shRecord, ccs, ...encrypted);

  // ── Client: derive the same keys, decrypt, check CertificateVerify and Finished ──
  const recs = splitRecords(serverFlight);
  const shMsg = recs[0].subarray(5);
  const sShare = (() => {
    const r = new Reader(shMsg);
    r.num(1); r.num(3); r.num(2); r.bytes(32); r.vec(1); r.num(2); r.num(1);
    const e = new Reader(r.vec(2));
    while (!e.done) { const ty = e.num(2), d = e.vec(2); if (ty === 0x0033) { const x = new Reader(d); x.num(2); return x.vec(2); } }
    throw new Error('no key_share');
  })();
  const cSs = concat(ml_kem768.decapsulate(sShare.subarray(0, 1088), ch.mlkemDk), x25519.getSharedSecret(ch.x25519Sk, sShare.subarray(1088)));
  const cSec = handshakeSecrets(cSs, sha256(concat(ch.message, shMsg)));
  let decrypted = true;
  let plain: Bytes = new Uint8Array();
  try {
    const parts: Bytes[] = [];
    const k = trafficKeys(cSec.serverHs);
    for (let i = 2, seq = 0; i < recs.length; i++, seq++) parts.push((await decryptRecord(k, seq, recs[i])).content);
    plain = concat(...parts);
  } catch { decrypted = false; }

  let cvCheck: TlsHandshake['clientChecks']['certificateVerify'] = 'skip';
  let serverFinished = false;
  let clientVerify = 0;
  if (decrypted) {
    // walk the decrypted messages: EE, Certificate, CertificateVerify, Finished
    const m: Bytes[] = [];
    for (let p = 0; p < plain.length;) { const len = (plain[p + 1] << 16) | (plain[p + 2] << 8) | plain[p + 3]; m.push(plain.subarray(p, p + 4 + len)); p += 4 + len; }
    const [ee, cert, cv, fin] = m;
    const th = sha256(concat(ch.message, shMsg, ee, cert));
    if (canVerify) {
      const r = new Reader(cv.subarray(4));
      const sch = r.num(2), sig = r.vec(2);
      t = performance.now();
      const ok = sch === scheme && verify(leafKey.alg, leafPublicKey, concat(new Uint8Array(64).fill(0x20), utf8Bytes('TLS 1.3, server CertificateVerify'), Uint8Array.of(0), th), sig);
      clientVerify = performance.now() - t;
      cvCheck = ok ? 'pass' : 'fail';
    }
    serverFinished = equalBytes(fin.subarray(4), finishedVerifyData(cSec.serverHs, sha256(concat(ch.message, shMsg, ee, cert, cv))));
  }
  const clientFin = msg(20, finishedVerifyData(cSec.clientHs, sha256(concat(ch.message, shMsg, protectedStream))));
  const clientFinished = concat(ccs, await encryptRecord(trafficKeys(cSec.clientHs), 0, CT_HANDSHAKE, clientFin));

  return {
    clientHello: ch.message, serverFlight,
    messages: { serverHello: serverHello.length, encryptedExtensions: encryptedExtensions.length, certificate: certificate.length, certificateVerify: certificateVerify.length, finished: finished.length },
    records, scheme, transcriptHash: thCert,
    clientChecks: { decrypted, certificateVerify: cvCheck, serverFinished },
    clientFinished,
    timings: { serverSign, clientVerify },
  };
}

// ── Transport framing ─────────────────────────────────────────────────────────

/** QUIC long-header packet overhead (RFC 9000 §17.2): 8-byte connection IDs, 2-byte packet numbers. */
const CID = 8, PN = 2, TAG = 16;
const varintLen = (v: number) => (v < 64 ? 1 : v < 16384 ? 2 : v < 1 << 30 ? 4 : 8);
const longHeader = (initial: boolean, payloadLen: number) =>
  1 + 4 + 1 + CID + 1 + CID + (initial ? 1 : 0) + varintLen(PN + payloadLen + TAG) + PN;
const cryptoFrame = (offset: number, len: number) => 1 + varintLen(offset) + varintLen(len) + len;
const DATAGRAM = 1200;

interface Flight { type: 'initial' | 'handshake'; stream: number; extraFirst?: number }

/**
 * Packs CRYPTO streams into QUIC long-header packets and the packets into UDP datagrams
 * of at most 1200 bytes, coalescing packets of different types into one datagram
 * (RFC 9000 §12.2). Every datagram that carries an Initial packet is padded to 1200
 * bytes (§14.1). Returns the UDP payload bytes and the number of datagrams.
 */
function quicFlight(flights: Flight[]): { bytes: number; datagrams: number } {
  const datagrams: { used: number; hasInitial: boolean }[] = [];
  let cur = { used: 0, hasInitial: false };
  datagrams.push(cur);
  for (const f of flights) {
    const initial = f.type === 'initial';
    let offset = 0, first = true;
    while (offset < f.stream) {
      const extra = first ? (f.extraFirst ?? 0) : 0;
      const size = (c: number) => { const pl = cryptoFrame(offset, c) + extra; return longHeader(initial, pl) + pl + TAG; };
      let room = DATAGRAM - cur.used;
      if (size(1) > room) { cur = { used: 0, hasInitial: false }; datagrams.push(cur); room = DATAGRAM; }
      let chunk = Math.min(f.stream - offset, room);
      while (size(chunk) > room) chunk--;
      cur.used += size(chunk);
      cur.hasInitial ||= initial;
      offset += chunk;
      first = false;
    }
  }
  const bytes = datagrams.reduce((s, d) => s + (d.hasInitial ? Math.max(d.used, DATAGRAM) : d.used), 0);
  return { bytes, datagrams: datagrams.length };
}

export interface TransportCost {
  tcpServerBytes:   number;     // first server flight over TCP (records, without TCP/IP headers)
  quicClientBytes:  number;     // client Initial datagrams, each padded to 1200 bytes (RFC 9000 §14.1)
  quicServerBytes:  number;     // server Initial (ServerHello + ACK) and Handshake packets
  quicLimit:        number;     // 3 × bytes received from the unvalidated client (RFC 9000 §8.1)
  eapRoundTrips:    number;     // EAP-TLS fragments of 1020 bytes (RFC 5216 headers), one round trip each
}

export function transportCost(h: TlsHandshake): TransportCost {
  const client = quicFlight([{ type: 'initial', stream: h.clientHello.length }]);
  const quicClientBytes = client.bytes;                         // Initial datagrams padded to ≥ 1200
  const rest = h.messages.encryptedExtensions + h.messages.certificate + h.messages.certificateVerify + h.messages.finished;
  const ACK_FRAME = 4;                                          // minimal ACK frame for the client Initial
  const quicServerBytes = quicFlight([
    { type: 'initial', stream: h.messages.serverHello, extraFirst: ACK_FRAME },
    { type: 'handshake', stream: rest },
  ]).bytes;
  // EAP-TLS (RFC 5216 §3.2): EAP header 4 + Type 1 + Flags 1, plus 4-byte TLS Message Length in the first fragment
  const EAP = 1020;
  const total = h.serverFlight.length;
  let eap = 1, left = total - (EAP - 10);
  while (left > 0) { eap++; left -= EAP - 6; }
  return { tcpServerBytes: h.serverFlight.length, quicClientBytes, quicServerBytes, quicLimit: 3 * quicClientBytes, eapRoundTrips: eap };
}
