# beyond-shor.eu

**Eine interaktive Lernplattform für Post-Quanten Kryptografie.**

> Dieses Repository enthält den Quellcode von [beyond-shor.eu](https://beyond-shor.eu) — einer zweisprachigen (DE/EN) Plattform, die sich mit Post-Quantum-Kryptografie, Krypto-Agilität und der Migration weg von quantenvulnerablen Algorithmen beschäftigt. Der Code ist zur Einsicht und als Referenz veröffentlicht — nicht als betriebsbereite lokale Installation gedacht.

---

## 🔍 Was diese Plattform ist

beyond-shor.eu ist kein typischer Blog. Es ist eine Plattform, die die Konzepte, die sie erklärt, gleichzeitig demonstriert.

Jeder Artikel wird mit **ML-DSA-65** (NIST FIPS 204) signiert und die Signatur ist direkt im Browser verifizierbar — ohne Serveranfrage, ohne zusätzliches Vertrauen. Das Signieren läuft automatisch über einen Strapi-Lifecycle-Hook bei der Veröffentlichung; die Verifikation läuft clientseitig über [`@noble/post-quantum`](https://github.com/paulmillr/noble-post-quantum).

---

## ✨ Features

### 🔐 ML-DSA-65 Artikel-Signierung
Jeder Artikel wird bei der Veröffentlichung automatisch signiert. Ein Strapi-Lifecycle-Hook serialisiert den Artikelinhalt (inkl. SHA-256-Hashes eingebetteter Medien) und signiert ihn direkt mit ML-DSA-65 — ohne Pre-Hashing, da ML-DSA intern SHAKE-256 per FIPS 204 verwendet. Signatur und Public-Key-Referenz werden zusammen mit dem Artikel gespeichert. Die Verifikation läuft vollständig clientseitig über `@noble/post-quantum` — kein Server, keine Vertrauensannahme jenseits des veröffentlichten Public Keys. Sie kann jeweils unter dem [Verifier](https://beyond-shor.eu/verify) geprüft werden. Der public key ist hierbei wie folgt:

_48904116e9d8f6f65aa54c03c32b8a1f8151974448f8f906a9571a5f49491e2f194c7a420f2fb0b55758d936f119fac3498e8ee43aec1a2e33cb1f16956a4674b667783f992995aedc079ed26e8b7d877d4708f4c1e9b514ce93787eff82317f1479b9c827127056b785da1b8e41756f947968a8deed8d9c16a2d92382efcad161b6ec0d970f953743398497e97bfb49928ee6da9bcb2d7c9003a44fc89634c683fa427ff98a9080d3d2229084fdc518595c2703875276616e6e5a252b8db4fd2e75e496dc50f8518463ce1e343897e292c83ffdf9a68f7d80e6a462291183f7a2c5fb863c3b3ee3db20ec0242250c7baea9fea5e98a704c345b078582bd1c65cdf9a515a603eb3549366dc70ad319c355641be8f912d300d919ed439a5a96c77453159497442b5926b76f12a39edd9a1cab11ec23c1606c0e6fcb1830f2c22cc70d7ac9de49389cf866b620e231876cb43bab05df39a124b46bdeb97c8741c22bbcdaeda4ec4275fc7c2222bb528dc37867abbf32c882c1aacb3cdaae048f2c821705cb0bbe32ffd25faa8e2c877320891e1a710c680bc57fe7f19a59e394575f72927f207dd52307e556d4f1186c9c5ed37968ec833889ea4c21f60d48742d8aa3bdc5d1e769a26861da60057323cead790856d67ebf4da85088db3a28b291dbaf5a58d0539bee94f23d72cbc804a13130823332b4e1d9e9dddcfd0a5e9a84ec275c8bdb20470de81e63fe500485e3c3cf58f0bdde61a9055ffd67de022a8b00abc774e724f0131736c62b53ba1d3d15dce8959c488c2d5960fb003e4f415d76d8232df96616768b1dbf59c6e0f6aab95b6b9a7474fc80d4a5fbf71264677941b88ba643b74629c69042ba8078cb390194fa65c44bade688203a8336675d088bdd9a6b29a798cbbd6af5b549b4f0fd67004b351e41aa6bc2732886420a3d7a55e6b617b07bdd8514a157269a75e1850f43a0a7797731fb3acf8fd735314ec8838a191c29fbabc645880c222aaa4fba6dab331949c5dcd0a17986d0dc6aa0f1ae8f259ca085d92c37f7afeb8166bb1c7b83a79e066850b96277a6d7911b031d89fcf79c42a553293356f039c939b0be891a132c0cbb2469c255683a4e4fa28f78621a0e83cdc2baf7d87b2cfc51d358144c48d72b1127b233a11ca74a0df62dcda931345773d6f0e46b6fc9c4b07b5848a5e45daf6644b7e7383e9356bf4cd219dfb1193a2f8cfa94770b63bcf022ac7c94b03e0b7e9a0ca37640a39cbd5cdcc56969bd5a1ebd8d8458adbd94e3195b3ebfe694f6bc169e5347a8c8775978481a0c5eb4c1b3f81aee84cdc0d874e61cef7e4bd48bcb894f3f805accf41696bc0ffa5367f12bdc95fc32daae6f594fad83a3d0019deab6cb28d57fe62ecf4293291430661404f5d35e1ad27b446ecb846cdae1ad6041774ba05f8f9d3548143e61c71c4ee97d8160d8508ca663ad4cfd4408403cbf5bd93cb381d8675e09966f236e37f77b53f2e50b70204cba4547a212ab0564f752c820b6c42ba684a0a7bbefb41ee01512158085ed8b6c43274f96645488b11cfde316aa7bab74410937b7517129e711bb7656f294be4e1cb12e6c9ca29ca34ed352494462da73afa5134733aeb3f57ff9136dcf3ae16bf292d706ae4be9685ff061935126e9058cf17171069f62db49f738d90b7b2d4393b8f1eaa67a974217fd5e2942f310a6a2920d2d927e5b4a37692a379271a88d2967062a8af8228a6cc1bc8956fd9f169b391c7486de0fbd097edb51324bb128f59895ddd80275f4a881fa1a0b0ce26fc48d90df6a8466dc9cd803ba224ecbdda9d2883ef3a713a322b205c72ee9600e88a712b44a3a4458bb71d979ba0ec301710095c83faf9afc8f136fed29ad81dbf16608edcbcb457a2d9f129e66eeda896ad41643c5c2b87e8a5ee82702aca2b3aa66c0dd4239dad9cc7cc6058ded79a89197b65c7a1b73e022f987d7fbb0bbb5bf7e7964dab89fd8ea923e004e6841fd284a1ac343dc3895d6c4093c70e7b6d69ebe68ec4573fbe84f8543165eb71221f5d655e4e6c24db5bdb81e1b4ccd5bd23e233c2ae273b8a67b06e5d5ee301bae22aaa59fecc45cb456fb17e068b8190fb3cde73992a2d41b7540d7ecd369f7f262c746f3add74cb26c9ea387b2a0867622eda9054dd299f2ae3520317a2e6ff5348d58e6aa9561e96668a36212a86c50a80be5d3d906ea6536e06af39a7dba88780895d5216acc77cc6fd99b30bd071b23bfc3d2a4409bdcdbd51796c5e19dc32a5e1e597ce5c8111d4edb9b9e841d1ad96d4f6b26edfe094215a105e398e5fb795dc026d2206eb03e2235e42054be1c6d314640ce9e2addd7dbcf1a6c2c9ac6142ce3398b954160effe0c973ef547b0db77e6c390f7e840c7fa51cfe6b545c30d1aca662d0638ee96441888558259e16b1aa55efd23f5a2389beee31bef30238a677f6fb421a511ab481e70f962a07a231795d63ba1a409544f5793dc1ab2482bd882da9ae1d424ee345375d9a79be06b492f4348f3335bebe3a839fd8db5a1874be10c8c7f3ca1d5161290a5a88be3dd99952509fbbe529e198e3589ea2978077315d1aae2dbdf39ddb7a398a5f254f336ba53c5cade2ee3ee07ba7411f5d65037a5fd0ff112667d35f936ff8cfcbd8f13547b9911b8552724e6a3957f220107bf7f262dc5e390066afaaa07cd88ec799970acf6dd556ca715747f2222eff3569bf080271f8a01441ce5eddaadaaa4c456dfc1_

### ⚗️ Post-Quanten Kryptografie-Playground
Eine interaktive, vollständig clientseitige [Lernplattform](https://beyond-shor.eu/playground) für Post-Quanten Kryptografie - mit hybrider Verschlüsselung, post-quantensicheren Signaturverfahren und statistisch ausgewertetem Benchmarking. Das ist in drei Modi implementiert: 

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
