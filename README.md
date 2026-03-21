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

### ⚗️ Post-Quantum Kryptografie Playground
Eine interaktive, vollständig clientseitige Lernplattofrm für Post-Quantum Kryptografie - mit hybrider Verschlüsselung, post-quantensicheren Signaturverfahren und statistisch ausgewertetem Benchmarking. Das ist in drei Modi implementiert: 

**Einzelner Run:** Der vollständige hybride Handshake wird Schritt für Schritt visualisiert (Schlüsselerzeugung → X25519-DH → KEM-Encapsulation → HKDF → AES-256-GCM-Verschlüsselung → Entschlüsselung). Jeder Schritt zeigt explizit, welche Werte öffentlich übertragen werden und welche privat bleiben. Zusätzlich verfügbar: eine umschaltbare Angreiferperspektive, ein Toggle für Shors Algorithmus (mit Auswirkungen auf den klassischen Kanal), ein Bit-Manipulations-Toggle zur Demonstration von AES-GCM-Authentizität sowie eine separate Server- und Client-Sicht. Einzelne Runs können als Link geteilt werden — der State wird beim Aufruf wiederhergestellt.

**Direktvergleich:** Alle drei KEMs werden parallel ausgeführt und ihre Hauptmetriken (Schlüsselgrößen, Berechnungszeiten) direkt gegenübergestellt.

**20× Benchmark:** Jedes Verfahren wird 20-mal gemessen. Die Ergebnisse werden statistisch ausgewertet und als Box-Plots mit überlagerten Jitter-Punkten auf logarithmischer Y-Achse visualisiert. Ausgewiesene Kennzahlen: arithmetisches Mittel, Median, Standardabweichung (n-1), Variationskoeffizient, 95%-Konfidenzintervall (t-Verteilung, df=19, t=2.093), Min/Max, IQR, Ausreißer nach 1.5×IQR-Regel sowie bereinigter Mittelwert. Alle statistischen Fachbegriffe sind mit Hover-Erklärungen versehen. Benchmarks können ebenfalls als Link geteilt werden.

Jedes Verfahren hat eine ausklappbare Implementierungssektion für Entwickler.

Unterstützte PQC-KEMs:
- **ML-KEM-1024** — reines TypeScript via `@noble/post-quantum`, kein WASM
- **Classic McEliece 8192128** — C-Referenzimplementierung via Emscripten/WASM
- **FrodoKEM-1344-AES** — liboqs via WASM

Unterstützte Signaturverfahren (inkl. 20× Benchmark):
- **ECDSA** (klassisch, als Referenzpunkt)
- **ML-DSA-65**
- **SLH-DSA** — jeweils ein kompakter (kleine Signaturen, langsames Signing) und ein performanter Parametersatz (schnelles Signing, größere Signaturen)

### 📋 Automatisierte & signierte CBOM
Eine täglich aktualisierte Cryptography Bill of Materials nach [CycloneDX v1.6](https://cyclonedx.org). Ein Skript durchsucht die gesamte Codebase automatisch nach kryptografischen Assets — einschließlich aller im Playground eingesetzten Algorithmen — annotiert den Quantum-Safe-Status und modelliert Abhängigkeiten. Das Ergebnis wird als interaktiver Abhängigkeitsgraph und als maschinenlesbares JSON exportiert. Die CBOM wird täglich neu generiert und automatisch mit ML-DSA-65 signiert. Sie ist live unter [beyond-shor.eu/cbom](https://beyond-shor.eu/cbom) abrufbar und kann direkt in Tools wie CBOMkit importiert werden.

### 📅 Interaktive Q-Day Timeline
Eine chronologische, interaktive Timeline von 1994 bis ~2040 — von Shors Algorithmus über die NIST-Standardisierung bis zu regulatorischen Deadlines und Q-Day-Schätzungen. Ereignisse sind nach Kategorien (Geschichte, Standard, Hardware, Regulierung, Prognose) farblich kodiert und per Klick aufklappbar.

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
