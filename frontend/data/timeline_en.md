# HNDL Timeline – Data Foundation for Interactive Timeline

## Usage Note
Each entry contains: year, title, category, short description and optional caveat.
Categories: HISTORY | STANDARD | HARDWARE | REGULATION | ESTIMATE | INDUSTRY
Order and number of entries must match timeline_de.md
(scripts/migrate-timeline.mjs pairs DE and EN entries by position).
Research as of October 2026.

---

## Entries

### 1994
**Title:** Shor's Algorithm
**Category:** HISTORY
**Description:** Peter Shor shows that a quantum computer can factor large numbers and compute discrete logarithms efficiently. A large enough quantum computer would therefore break RSA, Diffie-Hellman and elliptic-curve schemes. This paper starts the search for alternatives.

---

### 1996
**Title:** Grover's Algorithm
**Category:** HISTORY
**Description:** Lov Grover publishes a quantum algorithm for searching unstructured data. It speeds up brute-force attacks quadratically, which on paper halves the effective strength of symmetric keys: AES-128 would drop to 64 bits. Grover parallelises poorly, though, which is why NIST still considers AES-128 adequate. If you want to be on the safe side, use AES-256, as CNSA 2.0 requires.

---

### 2015 (August)
**Title:** NSA Announces the Switch
**Category:** HISTORY
**Description:** The NSA announces that it will replace its algorithms for US national security systems (Suite B) with quantum-resistant ones. Organisations that had not yet moved to Suite B were told to hold off on major investments. For the first time, the topic becomes a political question.

---

### 2016 (December)
**Title:** NIST Launches the PQC Competition
**Category:** STANDARD
**Description:** NIST formally calls for submissions of post-quantum schemes for key exchange and signatures. The process is public: anyone may analyse and attack the candidates.

---

### 2017 (November)
**Title:** 82 Submissions to NIST
**Category:** STANDARD
**Description:** By the deadline, 82 proposals arrive, and 69 of them meet the formal requirements for round one. Several are broken within months, which is exactly what the public process is for.

---

### 2019 (October)
**Title:** Google Sycamore and "Quantum Supremacy"
**Category:** HARDWARE
**Description:** Google's Sycamore processor uses 53 working qubits to solve a purpose-built sampling problem in 200 seconds. By Google's estimate, a classical supercomputer would need 10,000 years.
**Caveat:** The problem has no practical or cryptographic use. IBM countered that an optimised classical approach would take about two and a half days, and later work has sped up classical simulation further. Nothing follows from this result for today's cryptography.

---

### 2022 (February)
**Title:** Rainbow Falls in a Weekend
**Category:** HISTORY
**Description:** Ward Beullens breaks the Rainbow signature scheme, a round-three NIST finalist no less, on a laptop in just over two days. It is a clear reminder that new schemes have to survive years of public cryptanalysis first.

---

### 2022 (July)
**Title:** NIST Picks Kyber, Dilithium, Falcon and SPHINCS+
**Category:** STANDARD
**Description:** After three rounds, NIST announces the first schemes to be standardised: CRYSTALS-Kyber for key exchange, and CRYSTALS-Dilithium, Falcon and SPHINCS+ for signatures. They later become ML-KEM, ML-DSA, FN-DSA and SLH-DSA.

---

### 2022 (July)
**Title:** SIKE Broken in an Hour
**Category:** HISTORY
**Description:** A few weeks after NIST's selection, Wouter Castryck and Thomas Decru break SIKE, a round-four candidate, in about an hour on an ordinary computer. Together with Rainbow, it makes a good case for combining new schemes with classical ones in hybrid mode at first.

---

### 2023 (August)
**Title:** Chrome Starts Hybrid Key Exchange
**Category:** INDUSTRY
**Description:** With Chrome 116, Google starts rolling out the hybrid key exchange X25519Kyber768 in TLS. It has been on by default on desktop since Chrome 124 (April 2024), and in its final form X25519MLKEM768 since Chrome 131. Step by step, a large share of web traffic becomes protected against "harvest now, decrypt later".

---

### 2024 (April)
**Title:** Chen Preprint: False Alarm for Lattices
**Category:** HISTORY
**Description:** Yilei Chen publishes a preprint with a quantum algorithm for certain lattice problems, the very problem class behind ML-KEM and ML-DSA. The community examines it immediately, and after just over a week Hongxun Wu and Thomas Vidick find a bug, which Chen confirms. The algorithm does not work. Even in its original form it would not have hit ML-KEM's parameters directly.

---

### 2024 (August)
**Title:** FIPS 203, 204 and 205 Published
**Category:** STANDARD
**Description:** NIST publishes the first three post-quantum standards: FIPS 203 (ML-KEM), FIPS 204 (ML-DSA) and FIPS 205 (SLH-DSA). Products, certifications and procurement now have a fixed basis. FN-DSA (Falcon) is to follow as FIPS 206.

---

### 2024 (December)
**Title:** Google Willow: Error Correction Below Threshold
**Category:** HARDWARE
**Description:** Google's 105-qubit Willow chip demonstrates quantum error correction below threshold: each time the surface code grows, the logical error rate drops, roughly by half each step. It is an important step towards fault-tolerant machines. It poses no threat to today's cryptography yet.

---

### 2025 (February)
**Title:** Microsoft Majorana 1
**Category:** HARDWARE
**Description:** Microsoft presents the Majorana 1 prototype and announces progress on topological qubits, which are meant to be less error-prone at the hardware level.
**Caveat:** The result is disputed. Several researchers doubt that genuine topological qubits were demonstrated rather than signals that merely resemble them. Microsoft gives no firm timelines. Strategically interesting, but it should not be counted as a confirmed breakthrough.

---

### 2025 (March)
**Title:** NIST Selects HQC as Backup KEM
**Category:** STANDARD
**Description:** NIST selects HQC as an additional KEM, which concludes round four. HQC is based on error-correcting codes, so on different mathematics than ML-KEM, and is meant to step in should lattice schemes show weaknesses. The final standard is announced for 2027.

---

### 2025 (May)
**Title:** RSA-2048 with Under a Million Qubits
**Category:** ESTIMATE
**Description:** Craig Gidney (Google) estimates that RSA-2048 could be factored in under a week with fewer than one million noisy physical qubits. In 2019, he and Martin Ekerå had put the figure at 20 million qubits. The progress comes from better algorithms and more efficient error correction, not from better hardware.
**Caveat:** This is a resource estimate, not an experiment. Today's largest processors have a few hundred to a few thousand physical qubits.

---

### 2025 (June)
**Title:** EU Roadmap for PQC Migration
**Category:** REGULATION
**Description:** The EU's NIS Cooperation Group publishes a coordinated roadmap for the transition to post-quantum cryptography. It sets three milestones: first steps by the end of 2026, high-risk use cases by the end of 2030, and as many remaining systems as possible by 2035.

---

### 2026 (February)
**Title:** BSI Sets End Dates for the First Time
**Category:** REGULATION
**Description:** In version 2026-01 of its TR-02102-1, the German BSI sets fixed end dates for classical asymmetric cryptography for the first time. It recommends key agreement with RSA or elliptic curves alone only until the end of 2031 (the end of 2030 for very high protection needs), and classical signatures until the end of 2035. After that, these schemes should only be used in hybrid form together with PQC.

---

### 2026 (March)
**Title:** Elliptic Curves Get Cheaper to Break
**Category:** ESTIMATE
**Description:** Google Quantum AI estimates that the discrete logarithm on 256-bit curves could be computed with fewer than 500,000 physical qubits, about twenty times fewer than previously assumed. A day later, researchers from Caltech and Oratomic show that on neutral atoms with more efficient error-correcting codes, 10,000 to 26,000 qubits might be enough for Shor's algorithm.
**Caveat:** Both are estimates. Google did not publish its circuits but backs their size with a zero-knowledge proof, and the atom architecture has yet to be built.

---

### 2026 (October)
**Title:** BSI Advises Against Classic McEliece
**Category:** HISTORY
**Description:** After several cryptanalysis papers in 2026, including a method that distinguishes McEliece public keys from random data, the German BSI advises on 1 October against using Classic McEliece in new applications. No practical attack on the recommended parameters is known, and in hybrid mode at least the security of the classical scheme is preserved. ML-KEM and FrodoKEM are not affected.
**Caveat:** Some of the papers have not been peer-reviewed yet, and the concrete cost estimates differ. The BSI plans to revise its assessment in the next edition of TR-02102-1 in early 2027.

---

### 2026 (December)
**Title:** EU: National Transition Plans
**Category:** REGULATION
**Description:** According to the EU roadmap, all member states should have taken the first steps by the end of 2026: drawing up national transition plans, taking inventory of the cryptography in use and assessing the risks.
**Caveat:** The roadmap is a recommendation, not a law. It carries weight, though, because national authorities such as the BSI align with it.

---

### 2027 (December)
**Title:** Cyber Resilience Act Fully Applies
**Category:** REGULATION
**Description:** From 11 December 2027, all obligations of the Cyber Resilience Act apply. The regulation has been in force since 10 December 2024, and the reporting obligations for exploited vulnerabilities and severe incidents have applied since 11 September 2026. Among other things, products with digital elements must then protect data with state-of-the-art encryption.
**Caveat:** The CRA does not mention post-quantum cryptography explicitly. Whether and when PQC counts as state of the art is a matter of interpretation. The BSI and EU deadlines suggest, however, that the question will soon come up for long-lived products.

---

### 2029
**Title:** Google and Cloudflare Aim to Be Done
**Category:** INDUSTRY
**Description:** Google aims to move its systems to post-quantum cryptography by the end of 2029 (announced in March 2026), and Cloudflare followed in April 2026 with the same target year. Both cite new resource estimates and progress in hardware and error correction. Since key exchange already runs in hybrid mode in many places, the focus is now on authentication, meaning signatures and PKI.

---

### 2029
**Title:** IBM Plans Starling
**Category:** HARDWARE
**Description:** IBM wants to bring a large fault-tolerant quantum computer, Starling, online in 2029: 200 logical qubits for 100 million operations. By current estimates that is not yet enough to run Shor's algorithm against RSA-2048 or elliptic curves.
**Caveat:** This is an announcement from IBM's roadmap, not a result.

---

### 2029
**Title:** Gartner: Asymmetric Cryptography Unsafe
**Category:** ESTIMATE
**Description:** Gartner expects asymmetric cryptography to be considered unsafe by 2029 and fully breakable by 2034. Organisations should therefore start migrating now.

---

### 2030
**Title:** NIST: RSA-2048 & Co. Get Deprecated
**Category:** REGULATION
**Description:** Under the draft NIST IR 8547 (November 2024), RSA and ECC at 112-bit security, such as RSA-2048, are deprecated after 2030. They should then no longer be chosen for new systems.
**Caveat:** IR 8547 is still a draft (as of October 2026). The US federal government is already planning with these dates, though.

---

### 2030 (December)
**Title:** EU Deadline for High-Risk Use Cases
**Category:** REGULATION
**Description:** By the end of 2030, the EU roadmap expects the migration of high-risk use cases to be complete, for example in critical infrastructure such as energy, telecommunications and finance. The BSI sets the same deadline for applications with very high protection needs.

---

### 2031
**Title:** Mosca: 50% by 2031
**Category:** ESTIMATE
**Description:** In 2015, Michele Mosca, who also came up with the well-known rule of thumb for migration urgency, put the probability of RSA-2048 being broken by 2031 at 50%. The estimate is old but is still quoted often.

---

### 2031 (December)
**Title:** BSI: Classical Key Agreement Only in Hybrid
**Category:** REGULATION
**Description:** From 2032, the BSI only recommends key agreement with RSA or elliptic curves in combination with a post-quantum scheme. Anyone still relying on classical key agreement alone by then deviates from TR-02102-1.

---

### 2033
**Title:** CNSA 2.0: Most US Systems Quantum-Safe
**Category:** REGULATION
**Description:** Under CNSA 2.0, browsers, servers, cloud services and operating systems in US national security systems are to use quantum-safe algorithms exclusively by 2033. Software and firmware signing and traditional networking equipment are to switch by 2030. New acquisitions are expected to be CNSA 2.0 compliant from January 2027.

---

### 2033
**Title:** Microsoft Aims for a Complete Switch
**Category:** INDUSTRY
**Description:** Microsoft wants all its products and services moved to quantum-safe algorithms by 2033, with first capabilities available from 2029. The foundation is SymCrypt, the cryptographic library shared by Windows, Azure and Microsoft 365.

---

### 2035
**Title:** EU Goal: Migration Largely Complete
**Category:** REGULATION
**Description:** By 2035, the EU roadmap expects the transition to be complete for as many systems as practically feasible, at least for all medium-risk use cases.

---

### 2035
**Title:** US: RSA and ECC to Be Phased Out Entirely
**Category:** REGULATION
**Description:** The NSM-10 memorandum (May 2022) sets 2035 as the goal for the US federal government to mitigate quantum risk as far as feasible. In line with this, the draft NIST IR 8547 plans to disallow quantum-vulnerable algorithms such as RSA and ECC entirely after 2035. The BSI deadline for classical signatures without PQC also ends that year.

---

### ~2036
**Title:** Expert Survey: Up to 49% Within Ten Years
**Category:** ESTIMATE
**Description:** In the Global Risk Institute survey (published in March 2026), 26 experts put the probability of a cryptographically relevant quantum computer within ten years at 28 to 49%, depending on how responses are interpreted. That is the highest value since the annual survey began.

---

### ~2040
**Title:** BSI: Upper Bound of the CRQC Window
**Category:** ESTIMATE
**Description:** In its study on the state of quantum computer development (as of late 2024), the German BSI considers a cryptographically relevant quantum computer likely within about 16 years, i.e. by around 2040. Breakthroughs, for instance in new error-correcting codes or hardware such as neutral atoms, could shorten that window to under ten years.
