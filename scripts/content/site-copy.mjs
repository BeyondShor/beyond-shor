/**
 * Playground copy that lives in Strapi rather than in the frontend message files.
 * Applied by scripts/update-copy.mjs — edit here, review the diff, then run it.
 * (The About page is maintained directly in Strapi.)
 */

// Playground "who uses this today" items — matched by name, links are kept as they are in Strapi.
export const REAL_WORLD = {
  de: {
    'OpenSSL 3.5.0': 'Seit Version 3.5.0 (April 2025, LTS) bringt OpenSSL ML-KEM (FIPS 203), ML-DSA (FIPS 204) und SLH-DSA (FIPS 205) direkt mit und bietet im TLS-Handshake standardmäßig X25519MLKEM768 an. Weil ein großer Teil der Serverinfrastruktur auf OpenSSL aufsetzt, kommen die Verfahren so auf sehr viele Systeme, ohne dass jemand eine Zusatzbibliothek einbinden muss.',
    'OpenSSH': 'OpenSSH nutzt schon seit Version 9.0 (April 2022) standardmäßig einen post-quantensicheren Schlüsselaustausch, zunächst sntrup761x25519-sha512. Seit OpenSSH 10.0 (April 2025) ist mlkem768x25519-sha256 der Standard, und ab Version 10.1 warnt der Client, wenn eine Verbindung ohne post-quantensicheren Schlüsselaustausch aufgebaut wird.',
    'Chromium': 'Chrome hat den hybriden Schlüsselaustausch X25519Kyber768 mit Version 124 (April 2024) auf dem Desktop für alle TLS-1.3- und QUIC-Verbindungen eingeschaltet und ist mit Chrome 131 auf den finalen Standard X25519MLKEM768 umgestiegen. Damit war Chrome einer der ersten großen Browser, der seine Nutzer gegen „Harvest Now, Decrypt Later“ schützt.',
    'Firefox': 'Firefox nutzt X25519MLKEM768 standardmäßig ab Version 132 auf dem Desktop und ab Version 145 auf Android, für QUIC/HTTP3 seit Version 135. Damit ist auch der Schlüsselaustausch von mehreren hundert Millionen Firefox-Nutzerinnen und -Nutzern gegen spätere Entschlüsselung mit Quantencomputern geschützt.',
    'Signal': 'Signal hat 2023 mit PQXDH zunächst den Sitzungsaufbau quantensicher gemacht. Seit Oktober 2025 kommt mit dem Triple Ratchet ein weiterer Baustein dazu: SPQR (Sparse Post-Quantum Ratchet) setzt ML-KEM-768 über die gesamte Dauer einer Unterhaltung ein, sodass auch Forward Secrecy und Post-Compromise Security gegen Quantenangriffe abgesichert sind.',
  },
  en: {
    'OpenSSL 3.5.0': 'Since version 3.5.0 (April 2025, LTS), OpenSSL ships ML-KEM (FIPS 203), ML-DSA (FIPS 204) and SLH-DSA (FIPS 205) out of the box and offers X25519MLKEM768 in the TLS handshake by default. Because so much server infrastructure is built on OpenSSL, the schemes reach a huge number of systems without anyone having to add an extra library.',
    'OpenSSH': 'OpenSSH has used a post-quantum key exchange by default since version 9.0 (April 2022), initially sntrup761x25519-sha512. Since OpenSSH 10.0 (April 2025) the default is mlkem768x25519-sha256, and from version 10.1 the client warns when a connection is set up without a post-quantum key exchange.',
    'Chromium': 'Chrome turned on the hybrid key exchange X25519Kyber768 for all TLS 1.3 and QUIC connections on desktop with version 124 (April 2024), and switched to the final X25519MLKEM768 standard with Chrome 131. That made it one of the first major browsers to protect its users against "harvest now, decrypt later".',
    'Firefox': 'Firefox uses X25519MLKEM768 by default from version 132 on desktop and version 145 on Android, and for QUIC/HTTP3 since version 135. So the key exchange of several hundred million Firefox users is protected against later decryption by quantum computers as well.',
    'Signal': 'Signal first made session setup quantum-safe with PQXDH in 2023. Since October 2025 the Triple Ratchet adds another layer: SPQR (Sparse Post-Quantum Ratchet) uses ML-KEM-768 throughout a conversation, so forward secrecy and post-compromise security are protected against quantum attacks too.',
  },
};
