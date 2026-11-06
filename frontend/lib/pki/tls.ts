// What a certificate chain costs in a TLS 1.3 handshake: CertificateVerify (RFC 8446
// §4.4.3) and an itemised estimate of the server's first flight.
import { sha256 } from '@noble/hashes/sha2.js';
import { concat, utf8Bytes, type Bytes } from './der';
import { sign, verify, type AlgId, type KeyPair } from './algorithms';
import { EAP_FRAGMENT, SERVER_KEY_SHARE } from './meta';

export { EAP_FRAGMENT, QUIC_AMPLIFICATION_LIMIT, SERVER_KEY_SHARE, TCP_INITIAL_WINDOW } from './meta';

/** RFC 8446 §4.4.3: 64 spaces, context string, a zero byte, then the transcript hash. */
export function certificateVerifyContent(transcriptHash: Bytes): Bytes {
  return concat(new Uint8Array(64).fill(0x20), utf8Bytes('TLS 1.3, server CertificateVerify'), Uint8Array.of(0), transcriptHash);
}

export function signCertificateVerify(leafKey: KeyPair, transcript: Bytes): { signature: Bytes; transcriptHash: Bytes } {
  const transcriptHash = sha256(transcript);
  return { signature: sign(leafKey, certificateVerifyContent(transcriptHash)), transcriptHash };
}

export function verifyCertificateVerify(alg: AlgId, leafPublicKey: Bytes, transcriptHash: Bytes, signature: Bytes): boolean {
  return verify(alg, leafPublicKey, certificateVerifyContent(transcriptHash), signature);
}

// ── Sizes ─────────────────────────────────────────────────────────────────────

export interface FlightEstimate {
  serverHello:         number;   // handshake message incl. 4-byte header
  encryptedExtensions: number;
  certificate:         number;
  certificateVerify:   number;
  finished:            number;
  handshakeBytes:      number;   // sum of handshake messages (what QUIC carries in CRYPTO frames)
  tcpBytes:            number;   // over TCP incl. TLS record overhead
  quicBytes:           number;   // rough UDP payload incl. QUIC packet overhead
  eapRoundTrips:       number;   // server flight in EAP fragments of EAP_FRAGMENT bytes
}

/**
 * Itemised minimal TLS 1.3 server flight (RFC 8446 §4): ServerHello with the
 * supported_versions and key_share extensions, empty EncryptedExtensions, Certificate,
 * CertificateVerify, Finished with SHA-256. Optional extensions (ALPN, OCSP …) left out.
 */
export function estimateFlight(certDers: Bytes[], certVerifySigBytes: number): FlightEstimate {
  const serverHello = 4 + (2 + 32 + 1 + 32 + 2 + 1 + 2) + (2 + 2 + 2) + (2 + 2 + 2 + 2 + SERVER_KEY_SHARE);
  const encryptedExtensions = 4 + 2;
  // Certificate: context<0..255>, certificate_list<0..2^24-1> of CertificateEntry { cert_data<1..2^24-1>, extensions<0..2^16-1> }
  const certificate = 4 + 1 + 3 + certDers.reduce((s, d) => s + 3 + d.length + 2, 0);
  const certificateVerify = 4 + 2 + 2 + certVerifySigBytes;
  const finished = 4 + 32;
  const encrypted = encryptedExtensions + certificate + certificateVerify + finished;
  const handshakeBytes = serverHello + encrypted;

  // TLS records: 5-byte header; encrypted records add a content-type byte and a 16-byte AEAD tag
  const records = Math.ceil(encrypted / 16_384);
  const tcpBytes = (5 + serverHello) + encrypted + records * (5 + 1 + 16);

  // QUIC: estimate ~60 bytes of header, frame and AEAD overhead per 1200-byte datagram
  const quicPayload = 1200 - 60;
  const quicBytes = handshakeBytes + Math.ceil(handshakeBytes / quicPayload) * 60;

  return {
    serverHello, encryptedExtensions, certificate, certificateVerify, finished, handshakeBytes, tcpBytes, quicBytes,
    eapRoundTrips: Math.ceil(tcpBytes / EAP_FRAGMENT),
  };
}
