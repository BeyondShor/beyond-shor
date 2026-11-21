// Orchestrates the software matrix: one rootless Podman pod per release with two
// containers — the release itself (servers + clients from its own packages) and a
// sidecar with our Node 24 (OpenSSL ≥ 3.5) that probes the servers and records the
// clients' ClientHellos. Both share the pod's loopback, so nothing is exposed.

import { execFile } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { setupScript, clientsScript, PORTS } from './recipes.mjs';
import { isPqGroupName } from './clienthello.mjs';
import { log, mapPool } from '../lib/util.mjs';

const exec = promisify(execFile);

const NODE_DIR = process.env.PQSCAN_NODE_DIR ?? '/opt/pqscan/node';
const MATRIX_DIR = process.env.PQSCAN_MATRIX_DIR ?? '/opt/pqscan/app/matrix';
const SIDECAR_IMAGE = 'public.ecr.aws/docker/library/debian:13';

const PQ_SSH = new Set(['mlkem768x25519-sha256', 'sntrup761x25519-sha512', 'sntrup761x25519-sha512@openssh.com']);

async function podman(args, { timeout = 600_000, allowFail = false, stdoutOnFail = false } = {}) {
  try {
    const { stdout } = await exec('podman', args, { timeout, maxBuffer: 32 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    if (stdoutOnFail && typeof err.stdout === 'string' && err.stdout.length > 0) return err.stdout;
    if (allowFail) return null;
    const msg = (err.stderr || err.message || '').toString().trim().split('\n').slice(-2).join(' ');
    throw new Error(`podman ${args[0]} ${args[1] ?? ''}: ${msg}`.slice(0, 300));
  }
}

async function pull(image) {
  for (let i = 0; i < 3; i++) {
    if (await podman(['pull', '-q', image], { allowFail: true, timeout: 900_000 }) !== null) break;
    if (i === 2) throw new Error(`pull failed: ${image}`);
    await new Promise((r) => setTimeout(r, 15_000 * (i + 1)));
  }
  const digest = (await podman(['image', 'inspect', '--format', '{{.Digest}}', image])).trim();
  return digest;
}

/** Parse the STATUS/VER/SSH lines of the setup script. */
export function parseSetupOutput(text) {
  const status = {};
  const versions = {};
  const ssh = {};
  for (const line of text.split('\n')) {
    const m = /^(STATUS|VER|SSH) (\S+) ?(.*)$/.exec(line.trim());
    if (!m) continue;
    const [, kind, key, rest] = m;
    if (kind === 'STATUS') {
      const [state, ...reason] = rest.split(' ');
      status[key] = { ok: state === 'ok', reason: reason.join(' ').trim() || null };
    } else if (kind === 'VER') versions[key] = rest.trim();
    else ssh[key] = rest.trim() ? rest.trim().split(',') : [];
  }
  return { status, versions, ssh };
}

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

async function testRelease(rel, workRoot) {
  const pod = `pqm-${rel.id.replace(/[^a-z0-9.-]/g, '-')}`;
  const work = join(workRoot, rel.id);
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const out = { ...rel, digest: null, packages: {}, results: {}, errors: [] };
  delete out.family;
  const started = Date.now();
  try {
    out.digest = await pull(rel.image);
    await podman(['pod', 'rm', '-f', '--ignore', pod], { allowFail: true });
    // a fixed FQDN: pod names like pqm-ubuntu-24.04 end in a numeric label, which Postfix rejects
    await podman(['pod', 'create', '--name', pod, '--hostname', 'pqm.test']);
    await podman(['run', '-d', '--pod', pod, '--name', `${pod}-sc`,
      '-v', `${NODE_DIR}:/opt/node:ro`, '-v', `${MATRIX_DIR}:/app:ro`, '-v', `${work}:/out:rw`,
      SIDECAR_IMAGE, '/opt/node/bin/node', '/app/clienthello-sink.mjs', String(PORTS.sink), '/out/clienthello.jsonl']);
    await podman(['run', '-d', '--pod', pod, '--name', `${pod}-rel`, rel.image, 'tail', '-f', '/dev/null']);

    const setup = await podman(['exec', `${pod}-rel`, 'sh', '-c', setupScript(rel.family)], { timeout: 1_200_000, stdoutOnFail: true });
    const { status, versions, ssh } = parseSetupOutput(setup);
    out.packages = versions;
    if (!status.install?.ok) {
      const tail = setup.split('\n').filter((l) => l && !/^(STATUS|VER|SSH) /.test(l)).slice(-3).join(' | ');
      throw new Error(`package installation failed (${status.install?.reason ?? 'unknown'}): ${tail}`);
    }

    const probe = async (mode, port) => {
      const raw = await podman(['exec', `${pod}-sc`, '/opt/node/bin/node', '/app/probe-server.mjs', mode, '127.0.0.1', String(port)], { timeout: 60_000, allowFail: true });
      try { return raw ? JSON.parse(raw.trim().split('\n').at(-1)) : null; } catch { return null; }
    };
    for (const [name, comp, mode, port] of [['nginx', 'nginx-server', 'tls', PORTS.nginx], ['apache', 'apache-server', 'tls', PORTS.apache], ['postfix', 'postfix-server', 'smtp', PORTS.postfix]]) {
      if (!status[name]?.ok) {
        out.results[comp] = { status: 'error', reason: `${name} did not start: ${status[name]?.reason ?? 'unknown'}`.slice(0, 200), version: versions[name] ?? null };
        continue;
      }
      const extra = name === 'postfix'
        ? { starttlsByDefault: (versions['postfix-tls-default'] ?? 'none') !== 'none', curvesSetting: versions['postfix-curves'] || null }
        : {};
      out.results[comp] = serverResult(await probe(mode, port), versions[name] ?? null, extra);
    }
    out.results['openssh-server'] = sshResult(ssh.server, versions.openssh ?? null);
    out.results['openssh-client'] = sshResult(ssh.client, versions.openssh ?? null);

    await podman(['exec', `${pod}-rel`, 'sh', '-c', clientsScript()], { timeout: 120_000, allowFail: true });
    await new Promise((r) => setTimeout(r, 1000));
    const hellos = existsSync(join(work, 'clienthello.jsonl'))
      ? readFileSync(join(work, 'clienthello.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
      : [];
    const bySni = (sni) => hellos.find((h) => h.sni === sni);
    out.results['openssl-client'] = clientResult(bySni('openssl.pqm.test'), versions.openssl ?? null);
    out.results['curl-client'] = clientResult(bySni('curl.pqm.test'), versions.curl ?? null);
    out.results['python-client'] = clientResult(bySni('python.pqm.test'), versions.python ?? null);
  } catch (err) {
    out.errors.push(String(err.message ?? err).slice(0, 300));
  } finally {
    await podman(['pod', 'rm', '-f', '--ignore', pod], { allowFail: true });
    rmSync(work, { recursive: true, force: true });
  }
  out.durationSec = Math.round((Date.now() - started) / 1000);
  log(`matrix ${rel.id}: ${Object.keys(out.results).length} results, ${out.errors.length} errors, ${out.durationSec}s`);
  return out;
}

export async function runMatrix(releases, { workRoot, concurrency = 2 } = {}) {
  mkdirSync(workRoot, { recursive: true });
  await pull(SIDECAR_IMAGE);
  return mapPool(releases, concurrency, (rel) => testRelease(rel, workRoot));
}

export async function runnerInfo() {
  const v = (await podman(['version', '--format', '{{.Client.Version}}'], { allowFail: true }))?.trim() ?? null;
  return { node: process.version, openssl: process.versions.openssl, podman: v };
}

/** Remove images we no longer need (keeps the sidecar to speed up next month a little). */
export async function cleanupImages(releases) {
  for (const rel of releases) await podman(['rmi', '-f', rel.image], { allowFail: true });
  await podman(['image', 'prune', '-f'], { allowFail: true });
}
