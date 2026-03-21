# HNDL Timeline – Data Foundation for Interactive Timeline

## Usage Note
Each entry contains: year, title, category, short description (for hover/tooltip) and optional caveat.
Categories: HISTORY | STANDARD | HARDWARE | REGULATION | ESTIMATE

---

## Entries

### 1994
**Title:** Shor's Algorithm
**Category:** HISTORY
**Description:** Peter Shor publishes a quantum algorithm for efficiently factoring large numbers. This theoretically proves that a sufficiently powerful quantum computer could break RSA and ECC. The starting gun for PQC research.

---

### 1996
**Title:** Grover's Algorithm
**Category:** HISTORY
**Description:** Lov Grover publishes a quantum algorithm for searching unstructured datasets that effectively halves the key length of symmetric cryptographic schemes. AES-128 is reduced to an effective security level of 64 bits — considered no longer sufficient. AES-256 and SHA-384, however, remain secure even under quantum attacks, as 128 bits of effective security is considered adequate.

---

### 2015
**Title:** NSA Warning and Course Correction
**Category:** HISTORY
**Description:** The NSA issues an urgent public warning about the threat posed by quantum computers and announces the transition to post-quantum cryptography for US national security systems.

---

### 2016
**Title:** Launch of the NIST Standardisation Process
**Category:** STANDARD
**Description:** The US National Institute of Standards and Technology (NIST) formally launches a global competition to standardise post-quantum cryptographic algorithms. A milestone for the global cryptography community.

---

### 2017
**Title:** 82 Submissions to NIST
**Category:** STANDARD
**Description:** By the submission deadline, 82 algorithm candidates are received, of which 69 are accepted for the first evaluation round. The beginning of a multi-year, public cryptanalysis process.

---

### 2019
**Title:** Google Sycamore – "Quantum Supremacy"
**Category:** HARDWARE
**Description:** Google's 54-qubit processor Sycamore solves a specific sampling problem in 200 seconds, for which Google estimates classical supercomputers would require 10,000 years.
**Caveat:** This milestone relates exclusively to a synthetic benchmarking problem with no cryptographic relevance. IBM researchers contested Google's time estimate, arguing that optimised classical systems could solve the problem significantly faster than Google claimed. This result has no immediate consequences for the security of today's cryptography.

---

### 2022
**Title:** NIST Final Selection: ML-KEM, ML-DSA, SLH-DSA
**Category:** STANDARD
**Description:** After three evaluation rounds, NIST announces its first algorithms for standardisation: ML-KEM (Kyber) for key encapsulation, and ML-DSA (Dilithium) and SLH-DSA (SPHINCS+) as signature schemes.

---

### 2023
**Title:** First Browser Implementation: Chrome with Hybrid PQC
**Category:** STANDARD
**Description:** Google Chrome implements the hybrid post-quantum key exchange X25519Kyber768 for TLS connections. For the first time, a mass-market product actively protects against "Harvest Now, Decrypt Later" attacks.

---

### 2024 (April)
**Title:** The Chen Incident – Cryptographic Community Vigilance
**Category:** HISTORY
**Description:** A preprint claims to have found a new quantum algorithm for certain lattice problems — the very mathematical problems underpinning ML-KEM and ML-DSA. The announcement triggers immediate and intensive scrutiny from the research community. After roughly ten days, a fundamental flaw in the algorithm is identified: the approach does not work. The incident illustrates how the cryptography community responds to potential threats — and that the current lattice-based standards withstood this scrutiny.

---

### 2024 (August)
**Title:** Final NIST Standards: FIPS 203, 204, 205
**Category:** STANDARD
**Description:** NIST publishes its final cryptographic standards: FIPS 203 (ML-KEM), FIPS 204 (ML-DSA) and FIPS 205 (SLH-DSA). The official migration phase for organisations and governments worldwide begins.

---

### 2024 (Late)
**Title:** Google Willow – Error Correction Below Threshold
**Category:** HARDWARE
**Description:** Google's 105-qubit chip Willow demonstrates quantum error correction below the so-called "break-even" threshold for the first time: adding more qubits reduces errors rather than increasing them. An important engineering milestone on the path to scalability — without immediate cryptographic implications.

---

### 2025 (February)
**Title:** Microsoft Majorana 1 – Announcement of Topological Qubits
**Category:** HARDWARE
**Description:** Microsoft presents the Majorana 1 prototype and announces progress towards topological qubits, which aim for inherent fault tolerance at the hardware level.
**Caveat:** The significance of this result is still being debated in the research community. The demonstration of genuine topological qubits — as opposed to merely Majorana-like signals — has been questioned by several researchers. Commercial timelines remain vague. The development is strategically interesting but should not be regarded as a confirmed breakthrough.

---

### 2025 (March)
**Title:** HQC Selected as Fifth NIST Standard
**Category:** STANDARD
**Description:** NIST selects HQC (Hamming Quasi-Cyclic) as its fifth algorithm for standardisation — a code-based KEM serving as a backup to the lattice-based schemes. Round 4 of the NIST process concludes.

---

### 2026 (31 Dec)
**Title:** EU Deadline: National PQC Transition Plans
**Category:** REGULATION
**Description:** Under the EU Commission recommendation (NIS Cooperation Group), all member states must have established national PQC transition plans and implemented first steps — particularly cryptographic inventory and risk analysis — by the end of 2026.

---

### 2027 (December)
**Title:** EU Cyber Resilience Act Enters into Force
**Category:** REGULATION
**Description:** The EU Cyber Resilience Act requires that products with digital elements must comply with the state of the art. PQC is implicitly considered a necessary component — particularly for products brought to market after this date.

---

### 2028
**Title:** Gartner: Earliest Possible Q-Day
**Category:** ESTIMATE
**Description:** Gartner identifies 2028 as the earliest possible point for a cryptographically relevant quantum computer (CRQC). This estimate is considered conservative and is placed earlier or significantly later by other experts.

---

### 2029
**Title:** BSI: DSA Recommendation Expires
**Category:** REGULATION
**Description:** The BSI ends its recommendation for the classical digital signature algorithm DSA. Another classical scheme leaves the recommended algorithm catalogue.

---

### 2030
**Title:** Critical Junction: Q-Day Window Opens
**Category:** ESTIMATE
**Description:** Multiple independent sources converge on 2030 as the possible start of the Q-Day window: NIST considers the break of RSA-2048 possible from this year. IBM, Google and the University of Tokyo consider a quantum computer with 100,000 qubits achievable by then. The World Economic Forum places the break of today's cryptography in the 2030–2035 timeframe. Michele Mosca estimates a 50% probability by 2031.

---

### 2030 (31 Dec)
**Title:** EU Deadline: PQC Transition for High-Risk Systems
**Category:** REGULATION
**Description:** The EU Commission requires that the PQC transition for high-risk use cases — particularly critical infrastructure such as energy, telecommunications and the financial sector — must be completed by the end of 2030.

---

### 2030
**Title:** NIST/NSA: RSA/ECC with 112-Bit Security Deprecated
**Category:** REGULATION
**Description:** NIST and the NSA plan to disallow classical public-key schemes with 112-bit security (e.g. RSA-3072) from 2030 onwards. The official transition period for most standard deployments ends.

---

### 2033
**Title:** NSA CNSA 2.0: US National Security Systems Fully PQC-Compliant
**Category:** REGULATION
**Description:** Under the NSA's CNSA 2.0 guidelines, all US national security systems must be fully migrated to post-quantum algorithms by 2033.

---

### 2034
**Title:** Global Risk Institute: 50% Probability for CRQC
**Category:** ESTIMATE
**Description:** The Global Risk Institute (GRI) expert survey finds a probability of at least 50% for a significant, cryptographically relevant quantum computer by the year 2034.

---

### 2035
**Title:** EU End Goal: Full PQC Transition
**Category:** REGULATION
**Description:** The EU Commission sets 2035 as the target date by which the PQC transition should be completed for as many systems as practically feasible — at minimum for all systems with medium risk.

---

### 2035
**Title:** NIST/NSM-10: Classical Public-Key Schemes No Longer Permitted
**Category:** REGULATION
**Description:** Under US government strategy (NSM-10), classical asymmetric cryptographic schemes are to be prohibited from use in federal agencies from 2035 onwards.

---

### ~2040
**Title:** BSI: Upper Bound of the CRQC Window
**Category:** ESTIMATE
**Description:** The BSI considers (as of 2024) a cryptographically relevant quantum computer likely within a maximum of 16 years — i.e. by approximately 2040. Should advances in hardware and error correction materialise, particularly through new qLDPC codes, this window could shrink to around 2034.

---

## Additional Information for Slider / Interactivity

### Q-Day Range for Slider
- Earliest (optimistic/aggressive): 2028
- Most likely corridor: 2030–2034
- Latest (conservative): 2040+

### Uncertainty Factors (for slider labels or tooltips)
**Accelerators:**
- Algorithmic breakthroughs (e.g. improved factoring methods)
- qLDPC error correction codes (could drastically reduce qubit requirements)
- Massive state-level investment programmes

**Decelerators:**
- Error correction overhead (millions of physical qubits per logical qubit)
- Slow progress in materials research
- Cryogenic scaling challenges (helium-3 requirements, cooling systems)

### HNDL Risk Threshold
Data with a confidentiality requirement of more than 7–10 years is already at risk from HNDL attacks today.

**Particularly affected sectors:**
- Healthcare: Patient records, clinical trials (>10 years protection requirement)
- Financial sector: M&A plans, trade secrets, long-term investment strategies
- Government and military: Intelligence information, military design plans
- Industry: Patents, trade secrets, IP
- Public sector: Passport information, tax records (7–10 year retention obligations)

### Migration Timeframes (for context tooltips)
- Full migration consistently takes 7–10 years, sometimes longer
- Complex PKI / distributed systems: >10 years
- Critical infrastructure: Priority, EU target 2030
- IoT / embedded systems: Particularly challenging, lifecycles >10–20 years
- Financial sector: Early adopter, TLS migration already possible today with minimal effort
