// Result mappers shared by the container matrix (run.mjs) and the GitHub-runner
// OS matrix (os/run-os.mjs). No dependencies beyond clienthello.mjs, so the OS
// runner can use them straight from a checkout without installing anything.

import { isPqGroupName } from './clienthello.mjs';

const PQ_SSH = new Set(['mlkem768x25519-sha256', 'sntrup761x25519-sha512', 'sntrup761x25519-sha512@openssh.com']);

/** OpenSSH result: PQ means the default preference starts with a post-quantum KEX. */
export function sshResult(kex, version) {
  if (!kex || kex.length === 0) return { status: 'error', reason: 'no kexalgorithms reported' };
  return {
    status: 'ok',
    version,
    pq: PQ_SSH.has(kex[0]),
    pqOffered: kex.some((k) => PQ_SSH.has(k)),
    preferred: kex[0],
    kex,
  };
}

/** TLS server result from probe-server.mjs output. */
export function serverResult(probe, version, extra = {}) {
  if (!probe) return { status: 'error', reason: 'probe failed', version, ...extra };
  if (probe.starttls === false) return { status: 'ok', version, pq: false, tls: false, ...extra };
  const b = probe.browserLike;
  if (!b?.ok) return { status: 'error', reason: b?.error ?? probe.error ?? 'handshake failed', version, ...extra };
  return {
    status: 'ok',
    version,
    pq: isPqGroupName(b.group),
    group: b.group,
    protocol: b.protocol,
    acceptsX25519MLKEM768: probe.x25519mlkem768Only?.ok === true,
    ...extra,
  };
}

/** TLS client result from the sink's ClientHello record. */
export function clientResult(hello, version) {
  if (!hello) return { status: 'error', reason: 'no ClientHello received', version };
  if (hello.error) return { status: 'error', reason: hello.error, version };
  return { status: 'ok', version, pq: hello.pq, pqOffered: hello.pqOffered, keyShares: hello.keyShares, groups: hello.groups, tls13: hello.tls13 };
}
