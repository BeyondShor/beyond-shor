import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractClientHello, parseClientHello, summarizeClientHello, groupName, isPqGroupName } from '../matrix/clienthello.mjs';
import { parseSetupOutput, sshResult, serverResult, clientResult } from '../matrix/run.mjs';
import { isSupported, releasesFor } from '../matrix/releases.mjs';

const fixture = (name) => Buffer.from(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8').trim(), 'hex');

test('parses a real ClientHello from Node 24 / OpenSSL 3.5 (PQ key share)', () => {
  const hs = extractClientHello(fixture('clienthello-node24-openssl35.hex'));
  const hello = parseClientHello(hs);
  assert.equal(hello.sni, 'fixture.pqm.test');
  const s = summarizeClientHello(hello);
  assert.equal(s.pq, true);
  assert.equal(s.keyShares[0], 'X25519MLKEM768');
  assert.ok(s.groups.includes('X25519'));
  assert.equal(s.tls13, true);
  assert.equal(hello.keyShares[0].length, 1216); // 1184-byte ML-KEM-768 key + 32-byte X25519 key
});

test('parses a real ClientHello from OpenSSL 3.0 (classical only)', () => {
  const s = summarizeClientHello(parseClientHello(extractClientHello(fixture('clienthello-openssl30.hex'))));
  assert.equal(s.pq, false);
  assert.equal(s.pqOffered, false);
  assert.deepEqual(s.keyShares, ['X25519']);
});

test('extractClientHello waits for a complete record and handles fragmentation', () => {
  const full = fixture('clienthello-node24-openssl35.hex');
  assert.equal(extractClientHello(full.subarray(0, 100)), null);
  // re-frame the handshake into two records of arbitrary size
  const hs = extractClientHello(full);
  const rec = (body) => Buffer.concat([Buffer.from([22, 3, 1, body.length >> 8, body.length & 255]), body]);
  const split = Buffer.concat([rec(hs.subarray(0, 700)), rec(hs.subarray(700))]);
  assert.deepEqual(extractClientHello(split), hs);
  assert.throws(() => extractClientHello(Buffer.from('474554202f20485454502f312e310d0a', 'hex')), /not a handshake/);
});

test('group names and PQ classification', () => {
  assert.equal(groupName(0x11ec), 'X25519MLKEM768');
  assert.equal(groupName(0x1234), '0x1234');
  assert.equal(isPqGroupName('SecP384r1MLKEM1024'), true);
  assert.equal(isPqGroupName('X25519'), false);
});

test('parseSetupOutput reads status, versions and SSH lists', () => {
  const r = parseSetupOutput([
    'noise', 'STATUS install ok', 'STATUS nginx fail bind() failed', 'VER openssl OpenSSL 3.5.9 x',
    'SSH server mlkem768x25519-sha256,curve25519-sha256', 'SSH client ',
  ].join('\n'));
  assert.equal(r.status.install.ok, true);
  assert.deepEqual(r.status.nginx, { ok: false, reason: 'bind() failed' });
  assert.equal(r.versions.openssl, 'OpenSSL 3.5.9 x');
  assert.deepEqual(r.ssh.server, ['mlkem768x25519-sha256', 'curve25519-sha256']);
  assert.deepEqual(r.ssh.client, []);
});

test('result mappers', () => {
  assert.equal(sshResult(['sntrup761x25519-sha512@openssh.com', 'curve25519-sha256'], 'v').pq, true);
  const old = sshResult(['curve25519-sha256', 'sntrup761x25519-sha512@openssh.com'], 'v');
  assert.equal(old.pq, false);
  assert.equal(old.pqOffered, true);
  assert.equal(sshResult([], 'v').status, 'error');

  const s = serverResult({ browserLike: { ok: true, group: 'X25519MLKEM768', protocol: 'TLSv1.3' }, x25519mlkem768Only: { ok: true } }, 'nginx');
  assert.equal(s.pq, true);
  assert.equal(s.acceptsX25519MLKEM768, true);
  assert.equal(serverResult({ browserLike: { ok: true, group: 'X25519' }, x25519mlkem768Only: { ok: false } }, 'x').pq, false);
  assert.equal(serverResult({ starttls: false }, 'p').tls, false);
  assert.equal(serverResult(null, 'p').status, 'error');

  assert.equal(clientResult(null, 'v').status, 'error');
  assert.equal(clientResult({ pq: true, pqOffered: true, keyShares: ['X25519MLKEM768'], groups: [], tls13: true }, 'v').pq, true);
});

test('release discovery keeps only supported (and LTS where asked) releases', () => {
  const today = '2026-11-21';
  assert.equal(isSupported({ eol: false }, today), true);
  assert.equal(isSupported({ eol: '2026-08-31' }, today), false);
  assert.equal(isSupported({ eol: '2030-01-01', releaseDate: '2027-01-01' }, today), false);
  const ubuntu = releasesFor(
    { distro: 'ubuntu', family: 'deb', name: 'Ubuntu', ltsOnly: true },
    [{ cycle: '26.10', eol: '2027-07-01', lts: false }, { cycle: '26.04', eol: '2031-05-29', lts: true }, { cycle: '24.04', eol: '2029-05-31', lts: true }, { cycle: '20.04', eol: '2025-05-31', lts: true }],
    today,
  );
  assert.deepEqual(ubuntu.map((r) => r.id), ['ubuntu-26.04', 'ubuntu-24.04']);
  assert.equal(ubuntu[0].image, 'public.ecr.aws/docker/library/ubuntu:26.04');
});

// ── additions: more distros, recipes, Windows/macOS import ───────────────────

import { spawnSync } from 'node:child_process';
import { setupScript, clientsScript } from '../matrix/recipes.mjs';
import { DISTROS, rollingReleases } from '../matrix/releases.mjs';
import { validateOsMatrix, sanitizeRelease, MAX_AGE_DAYS } from '../matrix/os-import.mjs';
import { mergeResults, OS_SCHEMA } from '../matrix/os/merge.mjs';

test('every package family has a recipe that is valid shell', () => {
  const families = [...new Set(DISTROS.map((d) => d.family)), 'pacman'];
  for (const f of families) {
    const r = spawnSync('bash', ['-n'], { input: setupScript(f), encoding: 'utf8' });
    assert.equal(r.status, 0, `${f}: ${r.stderr}`);
  }
  assert.equal(spawnSync('bash', ['-n'], { input: clientsScript(), encoding: 'utf8' }).status, 0);
  assert.throws(() => setupScript('nix'), /no recipe/);
});

test('recipes never set groups, ciphers or protocol versions', () => {
  for (const f of ['deb', 'rpm', 'apk', 'zypper', 'pacman']) {
    const s = setupScript(f);
    // reading tls_eecdh_auto_curves for the report is fine; setting anything like it is not
    assert.doesNotMatch(s, /ssl_ecdh_curve|ssl_ciphers|ssl_protocols|SSLOpenSSLConfCmd|SSLCipherSuite|SSLProtocol/, f);
    assert.doesNotMatch(s, /postconf -e[^\n]*(eecdh|_ciphers|_protocols|_mandatory|tls_config)/, f);
  }
});

test('vendor images and rolling releases', () => {
  const rocky = releasesFor(DISTROS.find((d) => d.distro === 'rockylinux'), [{ cycle: '10', eol: '2035-05-31' }], '2026-11-21');
  assert.equal(rocky[0].image, 'quay.io/rockylinux/rockylinux:10');
  const centos = releasesFor(DISTROS.find((d) => d.distro === 'centos-stream'), [{ cycle: '10', eol: '2030-05-31' }], '2026-11-21');
  assert.equal(centos[0].image, 'quay.io/centos/centos:stream10');
  const sles = releasesFor(DISTROS.find((d) => d.distro === 'sles'), [{ cycle: '16.1', eol: '2028-11-30', releaseDate: '2026-11-10' }], '2026-11-21');
  assert.equal(sles[0].image, 'registry.suse.com/bci/bci-base:16.1');
  const rolling = rollingReleases('2026-11-21');
  assert.deepEqual(rolling.map((r) => r.id), ['opensuse-tumbleweed', 'archlinux']);
  assert.ok(rolling.every((r) => r.rolling && r.version === '2026-11-21' && r.eol === null));
});

const osRelease = (over = {}) => ({
  id: 'windows-2025', distro: 'windows', name: 'Windows Server', version: '2025', osBuild: '26100.1', arch: 'x64',
  runnerImage: 'win25 20261117.1', image: 'windows-2025', packages: { curl: 'curl 8.x Schannel' },
  results: { 'curl-client': { status: 'ok', pq: false, pqOffered: false, keyShares: ['X25519'], groups: ['X25519'], tls13: true, version: 'curl' } },
  errors: [], testedAt: '2026-11-01T01:20:00Z', ...over,
});

test('OS matrix: valid, stale, wrong schema, future', () => {
  const now = new Date('2026-11-21T00:00:00Z');
  const ok = validateOsMatrix({ schema: OS_SCHEMA, generatedAt: '2026-11-01T01:30:00Z', releases: [osRelease()] }, now);
  assert.equal(ok.status, 'included');
  assert.equal(ok.releases[0].source, 'github-hosted-runner');
  const old = new Date(now.getTime() - (MAX_AGE_DAYS + 1) * 86_400_000).toISOString();
  assert.equal(validateOsMatrix({ schema: OS_SCHEMA, generatedAt: old, releases: [osRelease()] }, now).status, 'stale');
  assert.equal(validateOsMatrix({ schema: 'x', generatedAt: '2026-11-01T00:00:00Z', releases: [] }, now).status, 'invalid');
  assert.equal(validateOsMatrix({ schema: OS_SCHEMA, generatedAt: '2026-12-30T00:00:00Z', releases: [osRelease()] }, now).status, 'invalid');
  assert.equal(validateOsMatrix({ schema: OS_SCHEMA, generatedAt: '2026-11-01T00:00:00Z', releases: [{ id: 'x' }] }, now).status, 'invalid');
});

test('OS matrix: releases are rebuilt from a whitelist', () => {
  const r = sanitizeRelease(osRelease({ evil: '<script>', results: { 'curl-client': { status: 'ok', pq: 'yes', html: '<b>', keyShares: ['X25519', 5] }, 'Bad Key': { status: 'ok' } } }));
  assert.equal(r.evil, undefined);
  assert.deepEqual(Object.keys(r.results), ['curl-client']);
  assert.equal(r.results['curl-client'].pq, undefined); // not a boolean → dropped
  assert.equal(r.results['curl-client'].html, undefined);
  assert.deepEqual(r.results['curl-client'].keyShares, ['X25519']);
  assert.equal(sanitizeRelease(osRelease({ id: 'linux-1' })), null);
  assert.equal(sanitizeRelease(osRelease({ distro: 'linux' })), null);
});

test('merge keeps only Windows/macOS results, sorted', () => {
  const m = mergeResults([osRelease({ id: 'windows-2025' }), osRelease({ id: 'macos-15', distro: 'macos' }), { id: 'linux-selftest', distro: 'linux' }, null],
    { now: new Date('2026-11-01T01:30:00Z') });
  assert.equal(m.schema, OS_SCHEMA);
  assert.deepEqual(m.releases.map((r) => r.id), ['macos-15', 'windows-2025']);
  assert.equal(validateOsMatrix(m, new Date('2026-11-21T00:00:00Z')).status, 'included');
});
