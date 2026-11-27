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

// Playground "where are signatures used today" items (signature mode) — the full list,
// written as is (names, descriptions and links). Sources checked 2026-11-27.
export const SIG_REAL_WORLD = {
  de: [
    {
      name: 'Google Cloud KMS',
      description: 'Seit Juli 2026 sind Post-Quanten-Signaturen in Googles Cloud-Schlüsselverwaltung allgemein verfügbar: ML-DSA-44, ML-DSA-65 und ML-DSA-87 sowie SLH-DSA-SHA2-128s, also auch zwei Varianten aus diesem Playground. Für große Daten signiert der Dienst bei SLH-DSA wahlweise einen Hash (Pre-Hash), bei ML-DSA den vorab berechneten 64-Byte-Wert µ (External-µ).',
      link: 'https://cloud.google.com/blog/products/identity-security/future-proofing-data-integrity-quantum-safe-digital-signatures-in-cloud-kms',
    },
    {
      name: 'AWS KMS',
      description: 'AWS KMS signiert seit Juni 2025 mit ML-DSA-44, ML-DSA-65 und ML-DSA-87. Die privaten Schlüssel verlassen dabei nie die Hardware-Sicherheitsmodule des Dienstes. Nachrichten bis 4 KB nimmt KMS direkt an, bei größeren berechnet der Client den 64-Byte-Wert µ selbst (External Mu).',
      link: 'https://aws.amazon.com/about-aws/whats-new/2025/06/aws-kms-post-quantum-ml-dsa-digital-signatures',
    },
    {
      name: 'Windows',
      description: 'Seit dem Update vom November 2025 stellen Windows 11 (24H2 und 25H2) und Windows Server 2025 ML-DSA und ML-KEM über die systemeigene Kryptoschnittstelle CNG bereit, ebenso .NET 10. Jede Windows-Anwendung kann damit Post-Quanten-Signaturen erzeugen und prüfen, ohne eine eigene Bibliothek mitzubringen.',
      link: 'https://techcommunity.microsoft.com/t5/microsoft-security-community/post-quantum-cryptography-apis-now-generally-available-on/ba-p/4469093',
    },
    {
      name: 'Apple CryptoKit',
      description: 'Seit iOS 26, iPadOS 26 und macOS 26 bietet Apples Framework CryptoKit Entwicklern ML-DSA-65 und ML-DSA-87 als native Implementierung an. Apple selbst setzt Post-Quanten-Verfahren bislang nur für die Verschlüsselung ein, etwa in iMessage (PQ3) und bei TLS, noch nicht für eigene Signaturen.',
      link: 'https://support.apple.com/guide/security/quantum-secure-cryptography-apple-devices-secc7c82e533/web',
    },
    {
      name: 'OpenTitan',
      description: 'Der quelloffene Sicherheitschip OpenTitan steckt seit März 2026 in handelsüblichen Chromebooks. Beim Start prüft er die Firmware mit SLH-DSA und ist laut Google der erste kommerziell verfügbare Open-Source-Root-of-Trust mit Post-Quanten-Secure-Boot. Die nächste Generation soll zusätzlich ML-DSA beherrschen.',
      link: 'https://opensource.googleblog.com/2026/03/opentitan-shipping-in-production.html',
    },
  ],
  en: [
    {
      name: 'Google Cloud KMS',
      description: "Since July 2026, post-quantum signatures have been generally available in Google's cloud key management: ML-DSA-44, ML-DSA-65 and ML-DSA-87 plus SLH-DSA-SHA2-128s, which includes two variants from this playground. For large data, the service signs a hash with SLH-DSA (pre-hash) or, with ML-DSA, the precomputed 64-byte value µ (external-µ).",
      link: 'https://cloud.google.com/blog/products/identity-security/future-proofing-data-integrity-quantum-safe-digital-signatures-in-cloud-kms',
    },
    {
      name: 'AWS KMS',
      description: "AWS KMS has been signing with ML-DSA-44, ML-DSA-65 and ML-DSA-87 since June 2025. The private keys never leave the service's hardware security modules. KMS accepts messages of up to 4 KB directly; for larger ones, the client computes the 64-byte value µ itself (External Mu).",
      link: 'https://aws.amazon.com/about-aws/whats-new/2025/06/aws-kms-post-quantum-ml-dsa-digital-signatures',
    },
    {
      name: 'Windows',
      description: "Since the November 2025 update, Windows 11 (24H2 and 25H2) and Windows Server 2025 provide ML-DSA and ML-KEM through the system's own cryptography interface CNG, and so does .NET 10. Any Windows application can create and verify post-quantum signatures without shipping its own library.",
      link: 'https://techcommunity.microsoft.com/t5/microsoft-security-community/post-quantum-cryptography-apis-now-generally-available-on/ba-p/4469093',
    },
    {
      name: 'Apple CryptoKit',
      description: "Since iOS 26, iPadOS 26 and macOS 26, Apple's CryptoKit framework offers developers ML-DSA-65 and ML-DSA-87 as a native implementation. Apple itself uses post-quantum schemes only for encryption so far, for example in iMessage (PQ3) and TLS, not yet for its own signatures.",
      link: 'https://support.apple.com/guide/security/quantum-secure-cryptography-apple-devices-secc7c82e533/web',
    },
    {
      name: 'OpenTitan',
      description: "The open-source security chip OpenTitan has been shipping in commercially available Chromebooks since March 2026. At boot it verifies the firmware with SLH-DSA, and according to Google it is the first commercially available open-source root of trust with post-quantum secure boot. The next generation is to add ML-DSA.",
      link: 'https://opensource.googleblog.com/2026/03/opentitan-shipping-in-production.html',
    },
  ],
};
