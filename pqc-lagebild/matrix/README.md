# B – Software ab Werk

What current operating systems do **by default**: do their TLS/SSH servers negotiate a
post-quantum key exchange, and do their clients send a PQ key share in the first ClientHello?

## Linux distributions (Hermes VPS, user `pqscan`, rootless Podman)

* Releases: every supported release from endoflife.date (`releases.mjs`), plus the rolling
  distributions openSUSE Tumbleweed and Arch Linux as one dated entry each.
* One pod per release: the release container installs its own packages (`recipes.mjs`, families
  deb/rpm/apk/zypper/pacman) and a sidecar with our Node 24 probes the servers
  (`probe-server.mjs`) and records the clients' ClientHellos (`clienthello-sink.mjs`). Nothing is
  exposed outside the pod.
* Only a certificate, non-colliding ports and (for Postfix) minimal STARTTLS are configured —
  never groups, ciphers or protocol versions (a test enforces this).
* Timer: `pqscan-matrix.timer` (user unit), 1st of the month 03:40 Europe/Berlin.

## Windows and macOS (GitHub-hosted runners)

* `.github/workflows/pqc-matrix-os.yml` runs `os/run-os.mjs` on windows-2025, windows-2022,
  windows-11-arm, macos-26 and macos-15 (1st of the month 01:10 UTC, on dispatch, and on pushes to
  main that touch the workflow or the files it uses), merges the results (`os/merge.mjs`) and
  commits `os-matrix.json` to the data branch `pqc-matrix-data`.
* `bin/run-matrix.mjs` fetches that file, checks schema and age (≤ 40 days), rebuilds every entry
  from a whitelist (`os-import.mjs`) and signs it together with the Linux results
  (`source: 'github-hosted-runner'`). Missing or stale → Linux results are published anyway, the
  reason is in `os.status` / `os.reason`.

After a workflow run, re-import without re-testing the distros:

```
sudo -u pqscan env XDG_RUNTIME_DIR=/run/user/$(id -u pqscan) HOME=/var/lib/pqscan \
  /opt/pqscan/node/bin/node /opt/pqscan/app/bin/run-matrix.mjs --refresh-os
```

## Result keys

Servers: `nginx-server`, `apache-server`, `postfix-server`, `openssh-server`, `schannel-server`.
Clients: `openssl-client`, `curl-client`, `python-client`, `openssh-client`, `powershell-client`,
`dotnet-client`, `urlsession-client`, `network-framework-client`.
TLS: `pq` = PQ group negotiated (server) / PQ key share sent (client); `pqOffered` = PQ group at
least listed. SSH: `pq` = the preferred key exchange is post-quantum.
