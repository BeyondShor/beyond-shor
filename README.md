# beyond-shor.eu

Ein Blog über Post-Quanten-Kryptographie — was sie ist, warum sie wichtig ist, und wie sie funktioniert. Geschrieben für alle, die verstehen wollen, was nach Shor kommt.

Der Name ist Programm: Shors Algorithmus kann klassische Public-Key-Kryptographie (RSA, ECC) mit einem ausreichend leistungsstarken Quantencomputer brechen. Dieser Blog erklärt die Algorithmen, die das verhindern sollen — und setzt sie gleichzeitig selbst ein.

## Was steckt dahinter?

Der Blog ist selbst ein Experiment in angewandter PQC. Statt PQC nur zu erklären, wird sie hier aktiv eingesetzt:

### Interaktiver KEM-Playground

Drei post-quantensichere Key Encapsulation Mechanisms direkt im Browser vergleichen:

- **ML-KEM-1024** (NIST FIPS 203) — der neue Standard, gitterbasiert, klein und schnell
- **Classic McEliece 8192128** — codebasiert, seit Jahrzehnten analysiert, sehr große Schlüssel
- **FrodoKEM-1344** — konservativ, auf strukturlosen Gittern, Sicherheitslevel 5

Alle drei sind als hybride Verschlüsselung implementiert: der KEM-Shared-Secret wird per HKDF zu einem AES-256-GCM-Schlüssel abgeleitet. So kann man live erleben, wie sich Schlüsselgrößen, Kapselungszeiten und Ciphertext-Größen zwischen den Algorithmen unterscheiden.

### ML-DSA-65-Artikelsignaturen (NIST FIPS 204)

Jeder veröffentlichte Artikel wird serverseitig mit ML-DSA-65 signiert — einem gitterbasierten Signaturverfahren aus der CRYSTALS-Dilithium-Familie. Die Signatur wird in der Datenbank gespeichert und kann im Browser vollständig clientseitig verifiziert werden, ohne Serverrundtrip.

Die signierte Nachricht umfasst `documentId`, `locale`, `title` und den serialisierten Inhalt aller Blöcke — inklusive SHA-256-Hashes eingebetteter Mediendateien. Das macht die Signatur manipulationssicher gegenüber Content-Änderungen, auch an Bildern.

### CBOM (Cryptography Bill of Materials)

Eine maschinenlesbare Übersicht aller kryptographischen Algorithmen im Einsatz — im CycloneDX-1.6-Format, automatisch aus dem Quellcode generiert. Jeder Algorithmus ist mit seinem NIST-Quantensicherheitslevel annotiert. Der Scanner läuft täglich per GitHub Actions und aktualisiert die CBOM automatisch.

## Tech Stack

| Schicht | Technologie |
|---|---|
| Runtime | Node.js 24 |
| Backend / CMS | Strapi 5, SQLite (better-sqlite3) |
| Frontend | Next.js 16, App Router, TypeScript, Tailwind CSS 4 |
| PQC-Bibliotheken | `@noble/post-quantum`, `mceliece`, `@oqs/liboqs-js` |
| Sprachen | Deutsch & Englisch (next-intl) |

## Projektstruktur

```
beyond-shor/
├── config/                    Strapi-Konfiguration
├── src/
│   ├── api/                   Content Types (article, author, category, …)
│   └── admin/                 Strapi Admin-Anpassungen
├── scripts/
│   ├── scan-cbom.mjs          CBOM-Scanner (generiert frontend/public/cbom.json)
│   ├── sign-articles.mjs      Backfill-Skript für Artikel-Signaturen
│   └── generate-pqc-keys.mjs  Einmaliges Keygen für ML-DSA-65
└── frontend/
    ├── app/                   Next.js App Router (Seiten, API-Routes, OG-Images)
    ├── components/            UI-Komponenten inkl. Playground und Signatur-Badge
    └── lib/                   Strapi-Client, Typen, Hilfsfunktionen
```

## Lizenz

MIT
