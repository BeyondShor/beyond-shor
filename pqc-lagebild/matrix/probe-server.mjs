#!/usr/bin/env node
// Probe a TLS server (direct TLS or SMTP STARTTLS) the way a current browser would,
// and once more offering only X25519MLKEM768. Prints one JSON object.
// Runs in the sidecar container (Node 24 with OpenSSL ≥ 3.5), next to the server.
//
//   node probe-server.mjs tls  127.0.0.1 4431
//   node probe-server.mjs smtp 127.0.0.1 25

import net from 'node:net';
import tls from 'node:tls';

// Like Chrome/Firefox: key shares for the hybrid and for X25519, then the classic curves.
const BROWSER_LIKE = '*X25519MLKEM768:*X25519:prime256v1:secp384r1';
const TIMEOUT = 8000;

function smtpStartTls(host, port) {
  return new Promise((resolve, reject) => {
    const sock = net.connect({ host, port });
    let buf = '';
    let stage = 'banner';
    let capabilities = [];
    const fail = (msg) => { sock.destroy(); reject(new Error(msg)); };
    sock.setTimeout(TIMEOUT, () => fail('smtp timeout'));
    sock.on('error', (e) => fail(e.message));
    sock.on('data', (d) => {
      buf += d.toString('latin1');
      // a reply is complete when a line has "<code> " (space, not dash) after the code
      const lines = buf.split('\r\n');
      const done = lines.find((l) => /^\d{3} /.test(l));
      if (!done) return;
      const reply = lines.slice(0, lines.indexOf(done) + 1);
      buf = '';
      const code = done.slice(0, 3);
      if (stage === 'banner') {
        if (code !== '220') return fail(`smtp banner ${code}`);
        stage = 'ehlo';
        sock.write('EHLO pqm.test\r\n');
      } else if (stage === 'ehlo') {
        if (code !== '250') return fail(`smtp ehlo ${code}`);
        capabilities = reply.map((l) => l.slice(4).toUpperCase());
        if (!capabilities.some((c) => c.startsWith('STARTTLS'))) {
          sock.end('QUIT\r\n');
          return resolve({ starttls: false });
        }
        stage = 'starttls';
        sock.write('STARTTLS\r\n');
      } else if (stage === 'starttls') {
        if (code !== '220') return fail(`smtp starttls ${code}`);
        sock.removeAllListeners('data');
        sock.setTimeout(0);
        resolve({ starttls: true, socket: sock });
      }
    });
  });
}

async function handshake(mode, host, port, groups) {
  let socket;
  if (mode === 'smtp') {
    const r = await smtpStartTls(host, port);
    if (!r.starttls) return { ok: false, starttls: false, error: 'no STARTTLS offered' };
    socket = r.socket;
  }
  return new Promise((resolve) => {
    let s;
    const done = (r) => { try { s?.destroy(); } catch { /* ignore */ } resolve(r); };
    try {
      s = tls.connect({
        host, port, socket, servername: 'pqm.test', ecdhCurve: groups,
        rejectUnauthorized: false, timeout: TIMEOUT,
      }, () => {
        const info = s.getEphemeralKeyInfo();
        // For KEM groups OpenSSL exposes no "temp key", so the info object is empty.
        // Only one KEM is ever offered per probe, which makes the result unambiguous.
        const kem = groups.split(':').map((g) => g.replace(/^\*/, '')).find((g) => /MLKEM/.test(g));
        const group = info?.name ?? (kem ?? 'unknown');
        done({ ok: true, protocol: s.getProtocol(), group, cipher: s.getCipher()?.name });
      });
    } catch (e) {
      return done({ ok: false, error: e.message });
    }
    s.on('timeout', () => done({ ok: false, error: 'timeout' }));
    s.on('error', (e) => {
      const alert = /alert number (\d+)/.exec(e.message)?.[1];
      done({ ok: false, error: alert ? `alert ${alert}` : (e.code ?? e.message) });
    });
  });
}

const [mode, host, portStr] = process.argv.slice(2);
const port = Number(portStr);
const result = { mode, port };
try {
  const browser = await handshake(mode, host, port, BROWSER_LIKE);
  result.browserLike = browser;
  if (browser.starttls === false) {
    result.starttls = false;
  } else {
    const only = await handshake(mode, host, port, 'X25519MLKEM768');
    result.x25519mlkem768Only = only;
  }
} catch (e) {
  result.error = e.message;
}
process.stdout.write(JSON.stringify(result) + '\n');
