# HNDL Timeline – Datengrundlage für interaktiven Zeitstrahl

## Hinweis zur Nutzung
Jeder Eintrag enthält: Jahr, Titel, Kategorie, Kurzbeschreibung und optionalen Caveat.
Kategorien: HISTORY | STANDARD | HARDWARE | REGULATION | ESTIMATE | INDUSTRY
Reihenfolge und Anzahl der Einträge müssen mit timeline_en.md übereinstimmen
(scripts/migrate-timeline.mjs ordnet DE und EN über die Position zu).
Stand der Recherche: Oktober 2026.

---

## Einträge

### 1994
**Titel:** Shors Algorithmus
**Kategorie:** HISTORY
**Beschreibung:** Peter Shor zeigt, dass ein Quantencomputer große Zahlen effizient faktorisieren und diskrete Logarithmen berechnen kann. Ein ausreichend großer Quantencomputer würde damit RSA, Diffie-Hellman und Verfahren auf elliptischen Kurven brechen. Mit dieser Arbeit beginnt die Suche nach Alternativen.

---

### 1996
**Titel:** Grovers Algorithmus
**Kategorie:** HISTORY
**Beschreibung:** Lov Grover veröffentlicht einen Quantenalgorithmus für die Suche in unstrukturierten Daten. Er beschleunigt Brute-Force-Angriffe quadratisch und halbiert damit rechnerisch die effektive Stärke symmetrischer Schlüssel: AES-128 käme auf 64 Bit. Grover lässt sich allerdings schlecht parallelisieren, weshalb NIST AES-128 weiterhin für ausreichend hält. Wer auf Nummer sicher gehen will, nimmt AES-256, wie es etwa CNSA 2.0 vorschreibt.

---

### 2015 (August)
**Titel:** NSA kündigt den Wechsel an
**Kategorie:** HISTORY
**Beschreibung:** Die NSA kündigt an, ihre Algorithmen für US-Sicherheitssysteme (Suite B) durch quantenresistente Verfahren zu ersetzen. Wer noch nicht auf Suite B umgestellt habe, solle mit größeren Investitionen warten. Damit wird das Thema zum ersten Mal zur politischen Frage.

---

### 2016 (Dezember)
**Titel:** NIST startet den PQC-Wettbewerb
**Kategorie:** STANDARD
**Beschreibung:** NIST ruft offiziell dazu auf, Post-Quanten-Verfahren für Schlüsselaustausch und Signaturen einzureichen. Der Prozess ist öffentlich: Jede und jeder darf die Kandidaten analysieren und angreifen.

---

### 2017 (November)
**Titel:** 82 Einreichungen bei NIST
**Kategorie:** STANDARD
**Beschreibung:** Bis zum Ende der Frist gehen 82 Vorschläge ein, 69 davon erfüllen die formalen Anforderungen und kommen in die erste Runde. Etliche werden in den folgenden Monaten gebrochen, genau dafür ist der öffentliche Prozess da.

---

### 2019 (Oktober)
**Titel:** Google Sycamore und die „Quantum Supremacy“
**Kategorie:** HARDWARE
**Beschreibung:** Googles Prozessor Sycamore löst mit 53 funktionierenden Qubits ein eigens konstruiertes Sampling-Problem in 200 Sekunden. Nach Googles Schätzung bräuchte ein klassischer Supercomputer dafür 10.000 Jahre.
**Caveat:** Das Problem hat weder praktischen noch kryptografischen Nutzen. IBM hielt dagegen, ein optimierter klassischer Ansatz schaffe es in etwa zweieinhalb Tagen, und spätere Arbeiten haben die klassische Simulation weiter beschleunigt. Für heutige Kryptografie folgt aus dem Ergebnis nichts unmittelbar.

---

### 2022 (Februar)
**Titel:** Rainbow fällt an einem Wochenende
**Kategorie:** HISTORY
**Beschreibung:** Ward Beullens bricht das Signaturverfahren Rainbow, immerhin ein Finalist der dritten NIST-Runde, mit einem Laptop in gut zwei Tagen. Es ist eine deutliche Erinnerung daran, dass neue Verfahren erst einmal Jahre öffentlicher Kryptoanalyse überstehen müssen.

---

### 2022 (Juli)
**Titel:** NIST wählt Kyber, Dilithium, Falcon und SPHINCS+
**Kategorie:** STANDARD
**Beschreibung:** Nach drei Runden gibt NIST die ersten Verfahren bekannt, die standardisiert werden sollen: CRYSTALS-Kyber für den Schlüsselaustausch sowie CRYSTALS-Dilithium, Falcon und SPHINCS+ für Signaturen. Aus ihnen werden später ML-KEM, ML-DSA, FN-DSA und SLH-DSA.

---

### 2022 (Juli)
**Titel:** SIKE in einer Stunde gebrochen
**Kategorie:** HISTORY
**Beschreibung:** Wenige Wochen nach der NIST-Auswahl brechen Wouter Castryck und Thomas Decru SIKE, einen Kandidaten der vierten Runde, auf einem gewöhnlichen Rechner in rund einer Stunde. Zusammen mit Rainbow ist das ein gutes Argument dafür, neue Verfahren zunächst hybrid mit klassischen zu kombinieren.

---

### 2023 (August)
**Titel:** Chrome startet hybriden Schlüsselaustausch
**Kategorie:** INDUSTRY
**Beschreibung:** Mit Chrome 116 beginnt Google, den hybriden Schlüsselaustausch X25519Kyber768 in TLS auszurollen. Seit Chrome 124 (April 2024) ist er auf dem Desktop standardmäßig aktiv, seit Chrome 131 in der finalen Form X25519MLKEM768. Nach und nach ist so ein großer Teil des Webverkehrs gegen „Harvest Now, Decrypt Later“ geschützt.

---

### 2024 (April)
**Titel:** Chen-Preprint: Fehlalarm für Gitterverfahren
**Kategorie:** HISTORY
**Beschreibung:** Yilei Chen veröffentlicht einen Preprint mit einem Quantenalgorithmus für bestimmte Gitterprobleme, also genau die Problemklasse hinter ML-KEM und ML-DSA. Die Fachwelt prüft den Ansatz sofort, nach gut einer Woche finden Hongxun Wu und Thomas Vidick einen Fehler, den Chen bestätigt. Der Algorithmus funktioniert nicht. Selbst in der ursprünglichen Fassung hätte er die Parameter von ML-KEM nicht direkt getroffen.

---

### 2024 (August)
**Titel:** FIPS 203, 204 und 205 veröffentlicht
**Kategorie:** STANDARD
**Beschreibung:** NIST veröffentlicht die ersten drei Post-Quanten-Standards: FIPS 203 (ML-KEM), FIPS 204 (ML-DSA) und FIPS 205 (SLH-DSA). Damit gibt es eine feste Grundlage für Produkte, Zertifizierungen und Ausschreibungen. FN-DSA (Falcon) soll als FIPS 206 folgen.

---

### 2024 (Dezember)
**Titel:** Google Willow: Fehlerkorrektur unter der Schwelle
**Kategorie:** HARDWARE
**Beschreibung:** Googles Chip Willow mit 105 Qubits zeigt Quantenfehlerkorrektur unterhalb der Schwelle: Mit jeder Vergrößerung des Oberflächencodes sinkt der logische Fehler, und zwar jeweils ungefähr um die Hälfte. Das ist ein wichtiger Schritt hin zu fehlertoleranten Rechnern. Eine Gefahr für heutige Kryptografie geht davon noch nicht aus.

---

### 2025 (Februar)
**Titel:** Microsoft Majorana 1
**Kategorie:** HARDWARE
**Beschreibung:** Microsoft stellt den Prototyp Majorana 1 vor und kündigt Fortschritte bei topologischen Qubits an, die schon auf Hardware-Ebene weniger fehleranfällig sein sollen.
**Caveat:** Die Einordnung ist umstritten. Mehrere Forschende bezweifeln, dass wirklich topologische Qubits nachgewiesen wurden und nicht nur Signale, die ihnen ähneln. Belastbare Zeitpläne nennt Microsoft nicht. Strategisch ist der Schritt interessant, als bestätigter Durchbruch sollte er aber nicht gelten.

---

### 2025 (März)
**Titel:** NIST wählt HQC als Backup-KEM
**Kategorie:** STANDARD
**Beschreibung:** NIST wählt HQC als zusätzlichen KEM aus und beendet damit die vierte Runde. HQC beruht auf fehlerkorrigierenden Codes, also auf anderer Mathematik als ML-KEM, und soll einspringen können, falls sich bei Gitterverfahren Schwächen zeigen. Der fertige Standard ist für 2027 angekündigt.

---

### 2025 (Mai)
**Titel:** RSA-2048 mit unter einer Million Qubits
**Kategorie:** ESTIMATE
**Beschreibung:** Craig Gidney (Google) schätzt, dass sich RSA-2048 mit weniger als einer Million verrauschter physischer Qubits in unter einer Woche faktorisieren ließe. 2019 hatte er zusammen mit Martin Ekerå noch 20 Millionen Qubits angesetzt. Der Fortschritt kommt aus besseren Algorithmen und effizienterer Fehlerkorrektur, nicht aus besserer Hardware.
**Caveat:** Das ist eine Ressourcenschätzung, kein Experiment. Die größten heutigen Prozessoren haben einige Hundert bis wenige Tausend physische Qubits.

---

### 2025 (Juni)
**Titel:** EU-Fahrplan für die PQC-Migration
**Kategorie:** REGULATION
**Beschreibung:** Die NIS-Kooperationsgruppe der EU veröffentlicht einen koordinierten Fahrplan für den Umstieg auf Post-Quanten-Kryptografie. Er setzt drei Marken: erste Schritte bis Ende 2026, Hochrisiko-Anwendungen bis Ende 2030, möglichst alle übrigen Systeme bis 2035.

---

### 2026 (Februar)
**Titel:** BSI nennt erstmals Enddaten
**Kategorie:** REGULATION
**Beschreibung:** In der Version 2026-01 seiner TR-02102-1 nennt das BSI erstmals feste Enddaten für klassische asymmetrische Verfahren. Schlüsseleinigung allein mit RSA oder elliptischen Kurven empfiehlt es nur noch bis Ende 2031, bei sehr hohem Schutzbedarf bis Ende 2030, klassische Signaturen bis Ende 2035. Danach sollen diese Verfahren nur noch hybrid zusammen mit PQC eingesetzt werden.

---

### 2026 (März)
**Titel:** Elliptische Kurven werden billiger zu brechen
**Kategorie:** ESTIMATE
**Beschreibung:** Google Quantum AI schätzt, dass sich der diskrete Logarithmus auf 256-Bit-Kurven mit weniger als 500.000 physischen Qubits berechnen ließe, rund zwanzigmal weniger als bisher angenommen. Einen Tag später zeigen Forschende von Caltech und Oratomic, dass auf neutralen Atomen mit effizienteren Fehlerkorrekturcodes schon 10.000 bis 26.000 Qubits für Shors Algorithmus reichen könnten.
**Caveat:** Beides sind Schätzungen. Google hat die Schaltkreise nicht veröffentlicht, sondern belegt ihre Größe mit einem Zero-Knowledge-Beweis, und die Atom-Architektur muss erst noch gebaut werden.

---

### 2026 (Oktober)
**Titel:** BSI rät von Classic McEliece ab
**Kategorie:** HISTORY
**Beschreibung:** Nach mehreren Kryptoanalyse-Arbeiten aus dem Jahr 2026, darunter ein Verfahren, das öffentliche McEliece-Schlüssel von Zufallsdaten unterscheidet, rät das BSI am 1. Oktober davon ab, Classic McEliece in neuen Anwendungen einzusetzen. Ein praktischer Angriff auf die empfohlenen Parameter ist nicht bekannt, und im Hybridbetrieb bleibt mindestens die Sicherheit des klassischen Verfahrens erhalten. ML-KEM und FrodoKEM sind nicht betroffen.
**Caveat:** Ein Teil der Arbeiten ist noch nicht begutachtet, und die konkreten Kostenschätzungen gehen auseinander. Das BSI will seine Bewertung in der nächsten Fassung der TR-02102-1 Anfang 2027 überarbeiten.

---

### 2026 (Dezember)
**Titel:** EU: nationale Übergangspläne
**Kategorie:** REGULATION
**Beschreibung:** Laut EU-Fahrplan sollen alle Mitgliedstaaten bis Ende 2026 die ersten Schritte gegangen sein: nationale Übergangspläne aufstellen, die eingesetzte Kryptografie inventarisieren und Risiken bewerten.
**Caveat:** Der Fahrplan ist eine Empfehlung und kein Gesetz. Er hat aber Gewicht, weil sich nationale Behörden wie das BSI daran ausrichten.

---

### 2027 (Dezember)
**Titel:** Cyber Resilience Act gilt vollständig
**Kategorie:** REGULATION
**Beschreibung:** Ab dem 11. Dezember 2027 gelten alle Pflichten des Cyber Resilience Act. In Kraft ist die Verordnung schon seit dem 10. Dezember 2024, die Meldepflichten für ausgenutzte Schwachstellen und schwere Vorfälle gelten seit dem 11. September 2026. Produkte mit digitalen Elementen müssen dann unter anderem Daten mit Verschlüsselung nach dem Stand der Technik schützen.
**Caveat:** Post-Quanten-Kryptografie nennt der CRA nicht ausdrücklich. Ob und ab wann PQC zum Stand der Technik gehört, ist Auslegungssache. Die Fristen von BSI und EU-Fahrplan sprechen aber dafür, dass sich diese Frage für langlebige Produkte bald stellt.

---

### 2029
**Titel:** Google und Cloudflare wollen fertig sein
**Kategorie:** INDUSTRY
**Beschreibung:** Google will seine Systeme bis Ende 2029 auf Post-Quanten-Kryptografie umstellen (angekündigt im März 2026), Cloudflare folgt im April 2026 mit demselben Zieljahr. Beide begründen das mit neuen Ressourcenschätzungen und Fortschritten bei Hardware und Fehlerkorrektur. Weil der Schlüsselaustausch vielerorts schon hybrid läuft, steht jetzt die Authentifizierung im Vordergrund, also Signaturen und PKI.

---

### 2029
**Titel:** IBM plant Starling
**Kategorie:** HARDWARE
**Beschreibung:** IBM will 2029 mit Starling einen großen fehlertoleranten Quantencomputer in Betrieb nehmen: 200 logische Qubits für 100 Millionen Operationen. Für Shors Algorithmus gegen RSA-2048 oder elliptische Kurven reicht das nach heutigen Schätzungen noch nicht.
**Caveat:** Das ist eine Ankündigung aus IBMs Roadmap, kein Ergebnis.

---

### 2029
**Titel:** Gartner: asymmetrische Kryptografie unsicher
**Kategorie:** ESTIMATE
**Beschreibung:** Gartner erwartet, dass asymmetrische Kryptografie bis 2029 als unsicher gelten muss, und hält sie bis 2034 für vollständig brechbar. Unternehmen sollten deshalb jetzt mit der Migration beginnen.

---

### 2030
**Titel:** NIST: RSA-2048 & Co. werden abgekündigt
**Kategorie:** REGULATION
**Beschreibung:** Nach dem Entwurf von NIST IR 8547 (November 2024) gelten RSA und ECC mit 112 Bit Sicherheit, etwa RSA-2048, nach 2030 als abgekündigt (deprecated). Für neue Systeme sollen sie dann nicht mehr gewählt werden.
**Caveat:** IR 8547 ist noch ein Entwurf (Stand Oktober 2026). Die US-Bundesverwaltung plant aber bereits mit diesen Daten.

---

### 2030 (Dezember)
**Titel:** EU-Frist für Hochrisiko-Anwendungen
**Kategorie:** REGULATION
**Beschreibung:** Bis Ende 2030 soll laut EU-Fahrplan die Migration für Hochrisiko-Anwendungen abgeschlossen sein, etwa in kritischen Infrastrukturen wie Energie, Telekommunikation und Finanzwesen. Das BSI setzt für Anwendungen mit sehr hohem Schutzbedarf dieselbe Frist.

---

### 2031
**Titel:** Mosca: 50 % bis 2031
**Kategorie:** ESTIMATE
**Beschreibung:** Michele Mosca, von dem auch die bekannte Faustformel für die Migrationsdringlichkeit stammt, schätzte 2015 die Wahrscheinlichkeit, dass RSA-2048 bis 2031 gebrochen wird, auf 50 %. Die Schätzung ist alt, wird aber bis heute oft zitiert.

---

### 2031 (Dezember)
**Titel:** BSI: klassische Schlüsseleinigung nur noch hybrid
**Kategorie:** REGULATION
**Beschreibung:** Ab 2032 empfiehlt das BSI Schlüsseleinigung mit RSA oder elliptischen Kurven nur noch in Kombination mit einem Post-Quanten-Verfahren. Wer bis dahin noch rein klassisch arbeitet, weicht von der TR-02102-1 ab.

---

### 2033
**Titel:** CNSA 2.0: die meisten US-Systeme quantensicher
**Kategorie:** REGULATION
**Beschreibung:** Nach CNSA 2.0 sollen Browser, Server, Cloud-Dienste und Betriebssysteme in US-Sicherheitssystemen bis 2033 ausschließlich quantensichere Verfahren nutzen. Software- und Firmware-Signaturen sowie klassische Netzwerktechnik sollen schon bis 2030 umgestellt sein. Neue Anschaffungen sollen schon ab Januar 2027 CNSA-2.0-konform sein.

---

### 2033
**Titel:** Microsoft will komplett umgestellt haben
**Kategorie:** INDUSTRY
**Beschreibung:** Microsoft will alle eigenen Produkte und Dienste bis 2033 auf quantensichere Verfahren umgestellt haben, erste Funktionen sollen schon ab 2029 bereitstehen. Grundlage ist die Kryptobibliothek SymCrypt, die Windows, Azure und Microsoft 365 gemeinsam nutzen.

---

### 2035
**Titel:** EU-Ziel: Migration weitgehend abgeschlossen
**Kategorie:** REGULATION
**Beschreibung:** Bis 2035 soll laut EU-Fahrplan der Übergang für so viele Systeme wie praktisch möglich abgeschlossen sein, mindestens für alle Anwendungen mit mittlerem Risiko.

---

### 2035
**Titel:** USA: RSA und ECC sollen ganz wegfallen
**Kategorie:** REGULATION
**Beschreibung:** Das Memorandum NSM-10 (Mai 2022) gibt der US-Bundesverwaltung 2035 als Ziel vor, das Quantenrisiko so weit wie möglich zu beseitigen. Passend dazu sieht der NIST-Entwurf IR 8547 vor, quantenanfällige Verfahren wie RSA und ECC nach 2035 ganz zu untersagen (disallowed). Im selben Jahr endet auch die BSI-Frist für klassische Signaturen ohne PQC.

---

### ~2036
**Titel:** Expertenumfrage: bis zu 49 % in zehn Jahren
**Kategorie:** ESTIMATE
**Beschreibung:** In der Umfrage des Global Risk Institute (veröffentlicht im März 2026) schätzen 26 Fachleute die Wahrscheinlichkeit für einen kryptografisch relevanten Quantencomputer innerhalb von zehn Jahren auf 28 bis 49 %, je nach Auswertung. Das ist der höchste Wert seit Beginn der jährlichen Umfrage.

---

### ~2040
**Titel:** BSI: obere Grenze des CRQC-Fensters
**Kategorie:** ESTIMATE
**Beschreibung:** In seiner Studie zum Entwicklungsstand von Quantencomputern (Stand Ende 2024) hält das BSI einen kryptografisch relevanten Quantencomputer innerhalb von etwa 16 Jahren für wahrscheinlich, also bis ungefähr 2040. Durchbrüche, etwa bei neuen Fehlerkorrekturcodes oder bei Hardware wie neutralen Atomen, könnten das Fenster auf unter zehn Jahre verkürzen.
