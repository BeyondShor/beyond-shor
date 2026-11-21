#!/usr/bin/env node
// Runs on a GitHub-hosted Windows or macOS runner (and, for local testing, on Linux):
// records which key-exchange groups the operating system's own TLS clients offer by
// default — via the same ClientHello sink as the distro matrix — and, on Windows, which
// group the built-in Schannel server negotiates with a browser-like client.
//
//   node pqc-lagebild/matrix/os/run-os.mjs --label windows-2025 --out result.json
//
// Every component is isolated: a failure becomes { status: 'error', reason } and the
// run continues. Needs Node 24 (for probe-server.mjs: OpenSSL ≥ 3.5).

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientResult, serverResult, sshResult } from '../results.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MATRIX = join(HERE, '..');
const SINK_PORT = 19443;
const SERVER_PORT = 19444;
const TMP = mkdtempSync(join(os.tmpdir(), 'pqm-'));

const args = process.argv.slice(2);
const opt = (name, def = null) => (args.includes(name) ? args[args.indexOf(name) + 1] : def);
const label = opt('--label', process.env.RUNNER_LABEL ?? `${process.platform}-local`);
const outFile = opt('--out', join(TMP, 'result.json'));

const errors = [];
const packages = {};

/** Run a command; never throws. Returns { ok, stdout, stderr }. */
function run(cmd, cmdArgs, { timeout = 60_000, input } = {}) {
  const r = spawnSync(cmd, cmdArgs, { timeout, input, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  return { ok: !r.error && r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error?.message ?? null };
}
const firstLine = (s) => (s ?? '').split(/\r?\n/).find((l) => l.trim())?.trim() ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitForPort(port, ms = 30_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const ok = await new Promise((res) => {
      const s = net.connect({ host: '127.0.0.1', port }, () => { s.destroy(); res(true); });
      s.on('error', () => res(false));
    });
    if (ok) return true;
    await sleep(300);
  }
  return false;
}

// ── ClientHello sink ─────────────────────────────────────────────────────────

const sinkOut = join(TMP, 'clienthello.jsonl');
writeFileSync(sinkOut, '');
const sink = spawn(process.execPath, [join(MATRIX, 'clienthello-sink.mjs'), String(SINK_PORT), sinkOut], { stdio: 'ignore', windowsHide: true });
const sinkLines = () => readFileSync(sinkOut, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

/** Run one client against the sink and return its result from the ClientHello it sent. */
async function client(key, version, fn) {
  try {
    const before = sinkLines().length;
    await fn(`https://127.0.0.1:${SINK_PORT}/`);
    for (let i = 0; i < 20 && sinkLines().length === before; i++) await sleep(250);
    return [key, clientResult(sinkLines()[before] ?? null, version)];
  } catch (err) {
    return [key, { status: 'error', reason: String(err.message ?? err).slice(0, 200), version }];
  }
}

function sshClient(sshPath) {
  const v = run(sshPath, ['-V']);
  const version = firstLine(v.stderr) ?? firstLine(v.stdout);
  const g = run(sshPath, ['-G', 'pqm.test']);
  const line = g.stdout.split(/\r?\n/).find((l) => /^kexalgorithms /i.test(l));
  return ['openssh-client', sshResult(line ? line.split(' ')[1].trim().split(',') : [], version)];
}

function probe(port) {
  const r = run(process.execPath, [join(MATRIX, 'probe-server.mjs'), 'tls', '127.0.0.1', String(port)], { timeout: 60_000 });
  try { return JSON.parse(firstLine(r.stdout)); } catch { return null; }
}

// ── Windows ──────────────────────────────────────────────────────────────────

const SCHANNEL_SERVER_PS1 = String.raw`
param([int]$Port)
$ErrorActionPreference = 'Stop'
# Self-signed certificate in the user store, so Schannel can use its private key.
$cert = New-SelfSignedCertificate -DnsName 'pqm.test' -CertStoreLocation 'Cert:\CurrentUser\My' -KeyAlgorithm RSA -KeyLength 2048 -NotAfter (Get-Date).AddDays(2)
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
$listener.Start()
$deadline = (Get-Date).AddMinutes(4)
while ((Get-Date) -lt $deadline) {
  if (-not $listener.Pending()) { Start-Sleep -Milliseconds 100; continue }
  $c = $listener.AcceptTcpClient()
  try {
    $ssl = [System.Net.Security.SslStream]::new($c.GetStream(), $false)
    # SslProtocols None = let the operating system choose (the default)
    $ssl.AuthenticateAsServer($cert, $false, [System.Security.Authentication.SslProtocols]::None, $false)
    $ssl.Dispose()
  } catch { }
  finally { $c.Dispose() }
}
`;

async function windows() {
  const sys = process.env.SystemRoot ?? 'C:\\Windows';
  const reg = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    "$k = Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion'; \"$($k.ProductName)|$($k.DisplayVersion)|$($k.CurrentBuild).$($k.UBR)\""]);
  const [productName, displayVersion, build] = (firstLine(reg.stdout) ?? '||').split('|');
  packages.os = productName || null;
  packages['os-display-version'] = displayVersion || null;
  const curlExe = join(sys, 'System32', 'curl.exe');
  const curlV = firstLine(run(curlExe, ['--version']).stdout);
  packages.curl = curlV;
  const psV = firstLine(run('powershell.exe', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']).stdout);
  const pwshV = firstLine(run('pwsh', ['-NoProfile', '-Command',
    '"PowerShell $($PSVersionTable.PSVersion) on $([System.Runtime.InteropServices.RuntimeInformation]::FrameworkDescription)"']).stdout);
  packages['windows-powershell'] = psV;
  packages.pwsh = pwshV;

  const results = {};
  for (const [k, v] of [
    await client('curl-client', curlV, (url) => run(curlExe, ['-s', '-o', 'NUL', '--max-time', '10', url])),
    await client('powershell-client', psV ? `Windows PowerShell ${psV} (.NET Framework)` : null, (url) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      `try { Invoke-WebRequest -UseBasicParsing -TimeoutSec 10 -Uri '${url}' | Out-Null } catch { }`])),
    await client('dotnet-client', pwshV, (url) => run('pwsh', ['-NoProfile', '-NonInteractive', '-Command',
      `$h = [System.Net.Http.HttpClient]::new(); $h.Timeout = [TimeSpan]::FromSeconds(10); try { $h.GetAsync('${url}').GetAwaiter().GetResult() | Out-Null } catch { }`])),
  ]) results[k] = v;

  const sshExe = join(sys, 'System32', 'OpenSSH', 'ssh.exe');
  const [sk, sv] = existsSync(sshExe) ? sshClient(sshExe) : ['openssh-client', { status: 'error', reason: 'ssh.exe not found' }];
  results[sk] = sv;

  // Schannel as a server (SslStream on Windows is a thin layer over Schannel)
  const ps1 = join(TMP, 'schannel-server.ps1');
  writeFileSync(ps1, SCHANNEL_SERVER_PS1);
  const srv = spawn('pwsh', ['-NoProfile', '-NonInteractive', '-File', ps1, '-Port', String(SERVER_PORT)], { stdio: 'ignore', windowsHide: true });
  try {
    if (!(await waitForPort(SERVER_PORT, 60_000))) throw new Error('Schannel test server did not start');
    await sleep(500);
    results['schannel-server'] = serverResult(probe(SERVER_PORT), build ? `Schannel (Windows build ${build})` : 'Schannel');
  } catch (err) {
    results['schannel-server'] = { status: 'error', reason: err.message };
  } finally {
    srv.kill();
  }

  const year = /windows-(\d{4})/.exec(label)?.[1];
  return {
    name: year ? 'Windows Server' : 'Windows',
    version: year ?? (displayVersion ? `11 ${displayVersion}` : '11'),
    osBuild: build || null,
    results,
  };
}

// ── macOS ────────────────────────────────────────────────────────────────────

const TLS_SWIFT = String.raw`
import Foundation
import Network

// usage: pqm-tls urlsession|network <port>
let mode = CommandLine.arguments[1]
let port = UInt16(CommandLine.arguments[2])!
let done = DispatchSemaphore(value: 0)
if mode == "urlsession" {
    let cfg = URLSessionConfiguration.ephemeral
    cfg.timeoutIntervalForRequest = 10
    URLSession(configuration: cfg).dataTask(with: URL(string: "https://127.0.0.1:\(port)/")!) { _, _, _ in done.signal() }.resume()
} else {
    let c = NWConnection(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: port)!, using: .tls)
    c.stateUpdateHandler = { state in
        switch state {
        case .ready, .failed(_), .waiting(_), .cancelled: done.signal()
        default: break
        }
    }
    c.start(queue: .global())
}
_ = done.wait(timeout: .now() + 12)
`;

async function macos() {
  const product = firstLine(run('sw_vers', ['-productVersion']).stdout);
  const build = firstLine(run('sw_vers', ['-buildVersion']).stdout);
  packages.os = product ? `macOS ${product} (${build})` : null;
  const curlV = firstLine(run('/usr/bin/curl', ['--version']).stdout);
  packages.curl = curlV;
  const pyV = firstLine(run('/usr/bin/python3', ['-c', 'import ssl,sys;print(sys.version.split()[0], ssl.OPENSSL_VERSION)']).stdout);
  packages.python = pyV;

  const results = {};
  const add = ([k, v]) => { results[k] = v; };
  add(await client('curl-client', curlV, (url) => run('/usr/bin/curl', ['-s', '-o', '/dev/null', '--max-time', '10', url])));

  const swiftSrc = join(TMP, 'pqm-tls.swift');
  const swiftBin = join(TMP, 'pqm-tls');
  writeFileSync(swiftSrc, TLS_SWIFT);
  const built = run('xcrun', ['swiftc', '-O', swiftSrc, '-o', swiftBin], { timeout: 300_000 });
  const swiftV = firstLine(run('xcrun', ['swift', '--version']).stdout) ?? firstLine(run('xcrun', ['swift', '--version']).stderr);
  packages.swift = swiftV;
  const sysV = product ? `macOS ${product} (${build})` : null;
  if (built.ok) {
    add(await client('urlsession-client', sysV, () => run(swiftBin, ['urlsession', String(SINK_PORT)], { timeout: 30_000 })));
    add(await client('network-framework-client', sysV, () => run(swiftBin, ['network', String(SINK_PORT)], { timeout: 30_000 })));
  } else {
    const reason = `swiftc failed: ${firstLine(built.stderr) ?? built.error ?? 'unknown'}`.slice(0, 200);
    results['urlsession-client'] = { status: 'error', reason };
    results['network-framework-client'] = { status: 'error', reason };
  }
  add(await client('python-client', pyV, (url) => run('/usr/bin/python3', ['-c', pythonClient(url)], { timeout: 30_000 })));
  add(sshClient('/usr/bin/ssh'));
  return { name: 'macOS', version: product, osBuild: build, results };
}

// ── Linux (local self-test of this harness only) ─────────────────────────────

async function linux() {
  const results = {};
  const add = ([k, v]) => { results[k] = v; };
  packages.curl = firstLine(run('curl', ['--version']).stdout);
  add(await client('curl-client', packages.curl, (url) => run('curl', ['-s', '-k', '-o', '/dev/null', '--max-time', '10', url])));
  add(await client('python-client', null, (url) => run('python3', ['-c', pythonClient(url)], { timeout: 30_000 })));
  add(sshClient('ssh'));
  return { name: 'Linux (self-test)', version: os.release(), osBuild: null, results };
}

function pythonClient(url) {
  const port = new URL(url).port;
  return [
    'import socket, ssl',
    'ctx = ssl.create_default_context()',
    `s = socket.create_connection(("127.0.0.1", ${port}), timeout=10)`,
    'try:\n    ctx.wrap_socket(s, server_hostname="python.pqm.test")\nexcept Exception:\n    pass',
  ].join('\n');
}

// ── main ─────────────────────────────────────────────────────────────────────

let info = { name: label, version: null, osBuild: null, results: {} };
try {
  if (!(await waitForPort(SINK_PORT, 15_000))) throw new Error('ClientHello sink did not start');
  if (process.platform === 'win32') info = await windows();
  else if (process.platform === 'darwin') info = await macos();
  else info = await linux();
} catch (err) {
  errors.push(String(err.message ?? err).slice(0, 300));
} finally {
  sink.kill();
}

const distro = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
const release = {
  id: label,
  distro,
  name: info.name,
  version: info.version,
  osBuild: info.osBuild,
  arch: process.arch,
  runnerImage: process.env.ImageVersion ? `${process.env.ImageOS ?? label} ${process.env.ImageVersion}` : null,
  image: label,
  source: 'github-hosted-runner',
  packages,
  results: info.results,
  errors,
  testedAt: new Date().toISOString(),
  runner: { node: process.version, openssl: process.versions.openssl },
};
writeFileSync(outFile, JSON.stringify(release, null, 2) + '\n');
for (const [k, v] of Object.entries(release.results)) {
  console.log(`${k.padEnd(26)} ${v.status} pq=${v.pq} ${v.group ?? v.preferred ?? (v.keyShares ?? []).join('+')} ${v.reason ?? ''}`);
}
console.log(`wrote ${outFile}${errors.length ? ` (errors: ${errors.join(' | ')})` : ''}`);
