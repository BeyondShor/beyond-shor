# HNDL Timeline – Datengrundlage für interaktiven Zeitstrahl

## Hinweis zur Nutzung
Jeder Eintrag enthält: Jahr, Titel, Kategorie, Kurzbeschreibung und optionalen Caveat.
Kategorien: HISTORY | STANDARD | HARDWARE | REGULATION | ESTIMATE

---

## Einträge

### 1994
**Titel:** Shors Algorithmus
**Kategorie:** HISTORY
**Beschreibung:** Peter Shor veröffentlicht einen Quantenalgorithmus zur effizienten Faktorisierung großer Zahlen. Damit ist theoretisch bewiesen, dass ein hinreichend leistungsfähiger Quantencomputer RSA und ECC brechen kann. Der Startschuss für die PQC-Forschung.

---

### 1996
**Titel:** Grovers Algorithmus
**Kategorie:** HISTORY
**Beschreibung:** Lov Grover veröffentlicht einen Quantenalgorithmus zur Durchsuchung unstrukturierter Datenmengen, der die effektive Schlüssellänge symmetrischer Verfahren halbiert. AES-128 reduziert sich damit auf ein effektives Sicherheitsniveau von 64 Bit – als nicht mehr ausreichend eingestuft. AES-256 und SHA-384 gelten hingegen auch unter Quantenangriffen als sicher, da 128 Bit effektiver Sicherheit als ausreichend betrachtet werden.

---

### 2015
**Titel:** NSA-Warnung und Kurswechsel
**Kategorie:** HISTORY
**Beschreibung:** Die NSA gibt eine dringende öffentliche Warnung vor der Bedrohung durch Quantencomputer heraus und kündigt den Übergang zu post-quantensicherer Kryptografie für US-Sicherheitssysteme an.

---

### 2016
**Titel:** Start des NIST-Standardisierungsprozesses
**Kategorie:** STANDARD
**Beschreibung:** Das US-amerikanische National Institute of Standards and Technology (NIST) startet formal den weltweiten Wettbewerb zur Standardisierung post-quantensicherer Algorithmen. Ein Meilenstein für die globale Krypto-Community.

---

### 2017
**Titel:** 82 Einreichungen bei NIST
**Kategorie:** STANDARD
**Beschreibung:** Bis zur Einreichungsfrist gehen 82 Algorithmen-Kandidaten ein, von denen 69 für die erste Bewertungsrunde akzeptiert werden. Beginn eines mehrjährigen, öffentlichen Kryptanalyse-Prozesses.

---

### 2019
**Titel:** Google Sycamore – „Quantum Supremacy"
**Kategorie:** HARDWARE
**Beschreibung:** Googles 54-Qubit-Prozessor Sycamore löst ein spezielles Sampling-Problem in 200 Sekunden, für das Google schätzt, dass klassische Supercomputer 10.000 Jahre benötigen würden.
**Caveat:** Dieser Meilenstein bezieht sich ausschließlich auf ein synthetisches Benchmarking-Problem ohne kryptografische Relevanz. IBMs Forscher fochten Googles Zeitschätzung an und argumentierten, dass optimierte klassische Systeme das Problem deutlich schneller lösen könnten. Für die Sicherheit heutiger Kryptografie hat dieses Ergebnis keine unmittelbaren Konsequenzen.

---

### 2022
**Titel:** NIST-Finalauswahl: ML-KEM, ML-DSA, SLH-DSA
**Kategorie:** STANDARD
**Beschreibung:** NIST gibt nach drei Bewertungsrunden die Auswahl der ersten zu standardisierenden Algorithmen bekannt: ML-KEM (Kyber) für den Schlüsselaustausch sowie ML-DSA (Dilithium) und SLH-DSA (SPHINCS+) als Signaturverfahren.

---

### 2023
**Titel:** Erste Browser-Implementierung: Chrome mit hybridem PQC
**Kategorie:** STANDARD
**Beschreibung:** Google Chrome implementiert den hybriden Post-Quantum-Schlüsselaustausch X25519Kyber768 für TLS-Verbindungen. Erstmals schützt ein Massenprodukt aktiv gegen „Harvest Now, Decrypt Later"-Angriffe.

---

### 2024 (April)
**Titel:** Chen-Vorfall – Wachsamkeit der Krypto-Community
**Kategorie:** HISTORY
**Beschreibung:** Ein Preprint behauptet, einen neuen Quantenalgorithmus für bestimmte Gitterprobleme gefunden zu haben – jene mathematischen Probleme, auf denen ML-KEM und ML-DSA basieren. Die Meldung löst in der Fachcommunity sofortige und intensive Prüfung aus. Nach rund zehn Tagen wird ein fundamentaler Fehler im Algorithmus identifiziert: der Ansatz funktioniert nicht. Der Vorfall illustriert exemplarisch, wie die Krypto-Community mit potenziellen Bedrohungen umgeht – und dass die aktuellen Gitter-basierten Standards dieser Überprüfung standhielten.

---

### 2024 (August)
**Titel:** Finale NIST-Standards: FIPS 203, 204, 205
**Kategorie:** STANDARD
**Beschreibung:** NIST veröffentlicht die finalen kryptografischen Standards: FIPS 203 (ML-KEM), FIPS 204 (ML-DSA) und FIPS 205 (SLH-DSA). Damit beginnt die offizielle Migrationsphase für Unternehmen und Behörden weltweit.

---

### 2024 (Ende)
**Titel:** Google Willow – Fehlerkorrektur unter der Schwelle
**Kategorie:** HARDWARE
**Beschreibung:** Googles 105-Qubit-Chip Willow demonstriert erstmals Quantenfehlerkorrektur unterhalb der sogenannten „Break-even"-Schwelle: Mehr Qubits reduzieren den Fehler, anstatt ihn zu erhöhen. Ein wichtiger ingenieurstechnischer Meilenstein auf dem Weg zur Skalierung – ohne unmittelbare kryptografische Bedrohung.

---

### 2025 (Februar)
**Titel:** Microsoft Majorana 1 – Ankündigung topologischer Qubits
**Kategorie:** HARDWARE
**Beschreibung:** Microsoft stellt den Majorana-1-Prototypen vor und kündigt Fortschritte bei topologischen Qubits an, die eine inhärente Fehlertoleranz auf Hardware-Ebene anstreben sollen.
**Caveat:** Die Einordnung dieses Ergebnisses wird in der Fachcommunity noch diskutiert. Der Nachweis echter topologischer Qubits – also nicht nur Majorana-ähnlicher Signale – wurde von mehreren Forschern in Frage gestellt. Kommerzielle Timelines bleiben vage. Der Schritt ist strategisch interessant, sollte aber nicht als bestätigter Durchbruch gewertet werden.

---

### 2025 (März)
**Titel:** HQC als fünfter NIST-Standard ausgewählt
**Kategorie:** STANDARD
**Beschreibung:** NIST wählt HQC (Hamming Quasi-Cyclic) als fünften zu standardisierenden Algorithmus aus – einen code-basierten KEM als Backup zu den Gitter-basierten Verfahren. Damit endet Runde 4 des NIST-Prozesses.

---

### 2026 (31.12.)
**Titel:** EU-Deadline: Nationale PQC-Übergangspläne
**Kategorie:** REGULATION
**Beschreibung:** Gemäß der EU-Kommissionsempfehlung (NIS Cooperation Group) müssen alle Mitgliedstaaten bis Ende 2026 nationale PQC-Übergangspläne erstellt und erste Schritte implementiert haben – insbesondere Krypto-Inventarisierung und Risikoanalyse.

---

### 2027 (Dezember)
**Titel:** Cyber Resilience Act (EU) tritt in Kraft
**Kategorie:** REGULATION
**Beschreibung:** Der EU Cyber Resilience Act verlangt, dass Produkte mit digitalen Elementen dem Stand der Technik entsprechen müssen. PQC wird dabei implizit als notwendiger Bestandteil erachtet – insbesondere für Produkte, die nach diesem Datum auf den Markt kommen.

---

### 2028
**Titel:** Gartner: Frühestmöglicher Q-Day
**Kategorie:** ESTIMATE
**Beschreibung:** Gartner nennt 2028 als frühestmöglichen Zeitpunkt für einen kryptografisch relevanten Quantencomputer (CRQC). Diese Schätzung gilt als konservativ und wird von anderen Experten teils früher, teils deutlich später angesetzt.

---

### 2029
**Titel:** BSI: DSA-Empfehlung läuft aus
**Kategorie:** REGULATION
**Beschreibung:** Das BSI beendet die Empfehlung für das klassische digitale Signaturverfahren DSA. Ein weiteres klassisches Verfahren verlässt den empfohlenen Algorithmen-Katalog.

---

### 2030
**Titel:** Kritischer Knotenpunkt: Q-Day-Fenster öffnet sich
**Kategorie:** ESTIMATE
**Beschreibung:** Mehrere unabhängige Quellen konvergieren auf 2030 als möglichen Beginn des Q-Day-Fensters: NIST hält den Bruch von RSA-2048 ab diesem Jahr für möglich. IBM, Google und die Universität Tokio halten einen Quantencomputer mit 100.000 Qubits bis dahin für machbar. Das World Economic Forum sieht den Bruch heutiger Kryptografie im Zeitraum 2030–2035. Michele Mosca schätzt eine 50-prozentige Wahrscheinlichkeit bis 2031.

---

### 2030 (31.12.)
**Titel:** EU-Deadline: PQC-Übergang für Hochrisiko-Systeme
**Kategorie:** REGULATION
**Beschreibung:** Die EU-Kommission verlangt, dass der PQC-Übergang für Hochrisiko-Anwendungsfälle – insbesondere kritische Infrastrukturen wie Energie, Telekommunikation und Finanzsektor – bis Ende 2030 abgeschlossen ist.

---

### 2030
**Titel:** NIST/NSA: RSA/ECC mit 112-Bit-Sicherheit wird ausgemustert
**Kategorie:** REGULATION
**Beschreibung:** NIST und NSA planen, klassische Public-Key-Verfahren mit 112-Bit-Sicherheit (z. B. RSA-3072) ab 2030 nicht mehr zuzulassen. Damit endet die offizielle Übergangsphase für die meisten Standard-Deployments.

---

### 2033
**Titel:** NSA CNSA 2.0: US-Sicherheitssysteme vollständig PQC-konform
**Kategorie:** REGULATION
**Beschreibung:** Gemäß den CNSA-2.0-Richtlinien der NSA müssen alle nationalen Sicherheitssysteme der USA bis 2033 vollständig auf post-quantensichere Algorithmen migriert sein.

---

### 2034
**Titel:** Global Risk Institute: 50%-Wahrscheinlichkeit für CRQC
**Kategorie:** ESTIMATE
**Beschreibung:** Das Global Risk Institute (GRI) ermittelt in seiner Expertenumfrage eine Wahrscheinlichkeit von mindestens 50 % für einen signifikanten, kryptografisch relevanten Quantencomputer bis zum Jahr 2034.

---

### 2035
**Titel:** EU-Endziel: Vollständiger PQC-Übergang
**Kategorie:** REGULATION
**Beschreibung:** Die EU-Kommission setzt 2035 als Zieldatum, bis zu dem der PQC-Übergang für so viele Systeme wie praktisch machbar abgeschlossen sein soll – mindestens für alle Systeme mit mittlerem Risiko.

---

### 2035
**Titel:** NIST/NSM-10: Klassische Public-Key-Verfahren nicht mehr zugelassen
**Kategorie:** REGULATION
**Beschreibung:** Gemäß US-amerikanischer Regierungsstrategie (NSM-10) sollen klassische asymmetrische Kryptografieverfahren ab 2035 in Bundesbehörden nicht mehr eingesetzt werden dürfen.

---

### ~2040
**Titel:** BSI: Obere Grenze des CRQC-Fensters
**Kategorie:** ESTIMATE
**Beschreibung:** Das BSI hält (Stand 2024) einen kryptografisch relevanten Quantencomputer in maximal 16 Jahren – also bis ca. 2040 – für wahrscheinlich. Bei Fortschritten in Hardware und Fehlerkorrektur, insbesondere durch neue qLDPC-Codes, könnte sich dieses Fenster auf ca. 2034 verkürzen.
