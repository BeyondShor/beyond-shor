# beyond-shor.eu

**Eine interaktive Lernplattform für Post-Quantum-Kryptografie.**

> Dieses Repository enthält den Quellcode von [beyond-shor.eu](https://beyond-shor.eu) — einer zweisprachigen (DE/EN) Plattform, die sich mit Post-Quantum-Kryptografie, Krypto-Agilität und der Migration weg von quantenvulnerablen Algorithmen beschäftigt. Der Code ist zur Einsicht und als Referenz veröffentlicht — nicht als betriebsbereite lokale Installation gedacht.

---

## 🔍 Was diese Plattform ist

beyond-shor.eu ist kein typischer Blog. Es ist eine Plattform, die die Konzepte, die sie erklärt, gleichzeitig demonstriert.

Jeder Artikel wird mit **ML-DSA-65** (NIST FIPS 204) signiert und die Signatur ist direkt im Browser verifizierbar — ohne Serveranfrage, ohne zusätzliches Vertrauen. Das Signieren läuft automatisch über einen Strapi-Lifecycle-Hook bei der Veröffentlichung; die Verifikation läuft clientseitig über [`@noble/post-quantum`](https://github.com/paulmillr/noble-post-quantum).

---

## ✨ Features

### 🔐 ML-DSA-65 Artikel-Signierung
Jeder Artikel wird bei der Veröffentlichung automatisch signiert. Ein Strapi-Lifecycle-Hook serialisiert den Artikelinhalt (inkl. SHA-256-Hashes eingebetteter Medien) und signiert ihn direkt mit ML-DSA-65 — ohne Pre-Hashing, da ML-DSA intern SHAKE-256 per FIPS 204 verwendet. Signatur und Public-Key-Referenz werden zusammen mit dem Artikel gespeichert. Die Verifikation läuft vollständig clientseitig über `@noble/post-quantum` — kein Server, keine Vertrauensannahme jenseits des veröffentlichten Public Keys.

### ⚗️ Hybrid Encryption Playground
Eine interaktive, vollständig clientseitige Demo hybrider Verschlüsselung. Jedes Verfahren kombiniert **X25519** (klassisches ECDH) mit einem post-quantensicheren KEM — die beiden Shared Secrets werden per HKDF zu einem AES-256-GCM-Schlüssel kombiniert. Besucher können Text eingeben, ver- und wieder entschlüsseln — mit Echtzeit-Anzeige von Schlüsselgrößen und Berechnungszeiten auf dem eigenen Gerät. Unterstützte PQC-KEMs:

- **ML-KEM-1024** (NIST FIPS 203) — reines TypeScript, kein WASM
- **Classic McEliece 8192128** — C-Referenzimplementierung via Emscripten/WASM
- **FrodoKEM-1344** — liboqs via WASM

Jedes Verfahren hat eine ausklappbare Implementierungssektion für Entwickler, die es nachbauen möchten.

### 📋 Automatisierte CBOM
Eine täglich aktualisierte Cryptography Bill of Materials nach [CycloneDX v1.6](https://cyclonedx.org). Ein Skript durchsucht die gesamte Codebase automatisch nach kryptografischen Assets, annotiert den Quantum-Safe-Status und modelliert Abhängigkeiten. Das Ergebnis wird als interaktiver Abhängigkeitsgraph und als maschinenlesbares JSON exportiert. Die CBOM ist live unter [beyond-shor.eu/cbom](https://beyond-shor.eu/cbom) abrufbar.

### 🛡️ Anti-Spam ohne reCAPTCHA
Das Kontaktformular schützt sich durch vier unabhängige serverseitige Schichten - datenschutzkonform:

1. **Honeypot-Feld** — für Menschen unsichtbar, von Bots ausgefüllt
2. **Timing-Check** — Einreichungen unter 3 Sekunden werden abgelehnt
3. **HMAC-signierte Mathe-Challenge** — der Server generiert eine Rechenaufgabe und einen signierten Token; ohne das serverseitige Secret ist kein gültiger Token fälschbar
4. **IP-Rate-Limiting** — maximal 3 Einreichungen pro Stunde pro IP

### 🔒 Privacy by Design
Keine Cookies, keine Werbung, kein Google Analytics, kein reCAPTCHA. Analytics über selbst gehostetes [Umami](https://umami.is).

---

## 🧱 Tech-Stack

| Bereich | Technologie |
|---|---|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| CMS | Strapi (headless, selbst gehostet) |
| Analytics | Selbst gehostetes Umami |
| Hosting | Hostinger VPS, Nginx Reverse Proxy |

---

## 📁 Repository-Struktur

```
beyond-shor.eu/
├── frontend/               # Next.js-Anwendung
│   ├── app/                # App Router — Seiten und Layouts
│   ├── components/         # UI-Komponenten (Playground, CBOM, Signatur-Badge)
│   ├── lib/                # Utilities, API-Clients, Autolinker
│   └── public/             # Statische Assets, cbom.json
├── src/
│   └── api/                # Strapi Content Types inkl. Lifecycle Hook (Signierung)
├── scripts/
│   └── scan-cbom.mjs       # Täglicher CBOM-Scan
└── README.md
```

---

## 📄 Lizenz

Der Quellcode in diesem Repository steht unter der [MIT-Lizenz](LICENSE).

Blog-Inhalte (Artikel, Texte, Grafiken) sind © Marvin Sprey und nicht durch die MIT-Lizenz abgedeckt. Alle Rechte vorbehalten.
