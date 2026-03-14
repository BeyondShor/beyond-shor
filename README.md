# beyond-shor.eu

Ein Blog über Post-Quanten-Kryptographie — was sie ist, warum sie wichtig ist, und wie sie funktioniert. Geschrieben für alle, die verstehen wollen, was nach Shor kommt.

## Was steckt dahinter?

Der Blog ist selbst ein Experiment in angewandter PQC:

- **Interaktiver Playground** — ML-KEM-1024, Classic McEliece 8192128 und FrodoKEM-1344 direkt im Browser ausprobieren; hybride Verschlüsselung live erleben
- **ML-DSA-65-Signaturen** (NIST FIPS 204) — jeder Artikel wird kryptographisch signiert und die Signatur ist im Browser verifizierbar
- **CBOM** (Cryptography Bill of Materials) — eine maschinenlesbare Übersicht aller eingesetzten kryptographischen Algorithmen, automatisch aus dem Quellcode generiert

## Tech Stack

| Schicht | Technologie |
|---|---|
| Backend / CMS | Strapi 5, SQLite |
| Frontend | Next.js 16, App Router, TypeScript, Tailwind CSS 4 |
| PQC-Bibliotheken | `@noble/post-quantum`, `mceliece`, `@oqs/liboqs-js` |
| Sprachen | Deutsch & Englisch (next-intl) |

## Lokales Setup

**Voraussetzungen:** Node 24, pnpm 10

```bash
# Repository klonen
git clone git@github.com:BeyondShor/beyond-shor.git
cd beyond-shor

# Backend (Strapi) starten
cp .env.example .env   # Werte anpassen
npm install
npm run dev            # läuft auf http://localhost:1337

# Frontend (Next.js) starten — neues Terminal
cd frontend
cp .env.local.example .env.local   # Werte anpassen
pnpm install
pnpm dev               # läuft auf http://localhost:3000
```

Für die PQC-Funktionen (Artikel-Signaturen, Playground) sind keine zusätzlichen nativen Abhängigkeiten nötig — alle Bibliotheken laufen in reinem JS/WASM.

## Projektstruktur

```
beyond-shor/
├── config/              Strapi-Konfiguration
├── src/
│   ├── api/             Content Types (article, author, category, …)
│   └── admin/           Strapi Admin-Anpassungen
├── scripts/
│   ├── scan-cbom.mjs    CBOM-Scanner (generiert frontend/public/cbom.json)
│   ├── sign-articles.mjs  Backfill-Skript für Artikel-Signaturen
│   └── generate-pqc-keys.mjs  Einmaliges Keygen für ML-DSA-65
└── frontend/
    ├── app/             Next.js App Router
    ├── components/      UI-Komponenten
    └── lib/             Strapi-Client, Typen, Hilfsfunktionen
```

## Lizenz

MIT
