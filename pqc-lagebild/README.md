# PQC-Lagebild

Monthly, fully automated measurement behind <https://beyond-shor.eu/de/pqc-lagebild>.

* **A – Lage DE/EU:** TLS key exchange (hybrid/pure ML-KEM), certificate algorithm, DNSSEC algorithm and
  mail-server STARTTLS for ~150 000 domains (all EU ccTLD domains of the Tranco top-1M list plus
  organisation lists for KRITIS sectors, public institutions and large companies). **Only aggregates
  are ever written to disk or published.** No domain list is stored; month-to-month comparison uses
  HMAC-SHA-256 hashes of the domains.
* **B – Software ab Werk:** what current distribution releases do by default (servers and clients),
  tested in rootless Podman containers.
* **F – Besucher:** handled on the blog server (see `server/`), not here.

## Where it runs

| Host | User | What |
|---|---|---|
| scanner host | `pqscan` (no login, rootless Podman, systemd user timers) | A and B, signs results with ML-DSA-65 |
| scanner host | `pqpub` (SSH forced command `tar` of `/srv/pqscan-public`) | read-only hand-over of signed files |
| blog server | root, systemd timer (`systemd/blog/`) | pulls, verifies signatures against the pinned key, installs into `/var/lib/beyond-shor/pqc-lagebild` |

Code lives in `/opt/pqscan/app` (deployed with rsync from this directory), Node 24 in `/opt/pqscan/node`.
State (keys, caches, panel hashes, logs) in `/var/lib/pqscan` (700). Published files in `/srv/pqscan-public`.

The blog server reads the scanner address from `/etc/beyond-shor/pqc-lagebild.env`
(`PQC_LAGEBILD_SCANNER=pqpub@<host>`), which is deliberately not part of this repository.

## Published files (`/srv/pqscan-public`)

| File | Content |
|---|---|
| `lagebild-YYYY-MM.json` + `.sig` | A, schema `beyond-shor/pqc-lagebild@1` |
| `matrix-YYYY-MM.json` + `.sig` | B, schema `beyond-shor/software-matrix@1` |
| `index.json` + `.sig` | newest month of each, with SHA-256 of each file, and run status |

Signatures: hex-encoded ML-DSA-65 over the exact file bytes, newline-terminated (same as `frontend/public/cbom.sig`).
Public key: `frontend/data/pqc-lagebild-public-key.txt`.

## Code layout

```
lib/        config, util (pool, fetch, atomic writes), psl (registrable domain), sign
scan/       A: lists/ (tranco, wikidata, de-sources, mapping), probe, asn, aggregate, run
matrix/     B: distro discovery, container recipes, probes, run
bin/        keygen, run-scan, run-matrix, publish
systemd/    user units for pqscan
test/       node --test
```

### List record (what every list module returns)

```js
{ site: 'bsi.bund.de',           // website host without leading "www.", lower-case ASCII — the unit we measure
  zone: 'bund.de',               // registrable domain (eTLD+1, lib/psl.mjs) — used for DNSSEC
  country: 'DE',                 // ISO 3166-1 alpha-2, EU members only
  category: 'kritis' | 'institutions' | 'corporations' | 'other',
  sector: 'energy' | 'water' | 'health' | 'finance' | 'transport' | 'ict' | 'food' | 'waste'   // kritis
        | 'government' | 'municipality' | 'higher-education' | 'eu-body'                       // institutions
        | null,
  uniform: true | false,         // true = source exists for every EU country (counts in the EU view)
  source: 'wikidata' | 'tranco' | 'german-gov-domains' | … }
```

Priority when a domain appears in several lists: `kritis` > `institutions` > `corporations` > `other`.
