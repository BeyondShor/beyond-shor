// Per-domain measurement. Everything here is what any browser or mail server does when it
// connects: DNS lookups, a TLS handshake on 443, and an SMTP greeting + STARTTLS on 25.
// Nothing is sent beyond the handshake; no HTTP requests, no authentication attempts.

import tls from 'node:tls';
import net from 'node:net';
import { Resolver } from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { DNS_SERVER, TIMEOUT_MS, MEASURE_MAIL } from '../lib/config.mjs';

const execFileP = promisify(execFile);

// Chrome-like offer: hybrid first with its own key share, X25519 key share as fallback.
export const BROWSER_GROUPS = '*X25519MLKEM768:*X25519:prime256v1:secp384r1';
// Pure ML-KEM only (no classical component): what a future "PQ-only" client would offer.
export const PURE_GROUPS = 'MLKEM768:MLKEM1024';
export const KEM_GROUPS = new Set(['X25519MLKEM768', 'SecP256r1MLKEM768', 'SecP384r1MLKEM1024', 'MLKEM512', 'MLKEM768', 'MLKEM1024']);

const EHLO_NAME = 'pqc-lagebild.beyond-shor.eu';
const SMTP_TIMEOUT_MS = Math.max(TIMEOUT_MS, 20_000); // greeting delays of 10–20 s are common

const resolver = new Resolver({ timeout: 4000, tries: 2 });
if (DNS_SERVER) resolver.setServers([DNS_SERVER]);
const [DIG_HOST, DIG_PORT] = DNS_SERVER ? DNS_SERVER.split(':') : [null, null];

/**
 * Which group was negotiated. OpenSSL exposes no "temp key" for KEM groups, so Node reports {}.
 * With exactly one KEM group on offer, an empty answer after TLS 1.3 therefore means that group.
 */
export function negotiatedGroup(info, protocol, offered) {
  if (info?.name) return info.name;
  const kems = offered.replace(/\*/g, '').split(':').filter((g) => KEM_GROUPS.has(g));
  if (protocol === 'TLSv1.3' && kems.length === 1) return kems[0];
  if (protocol === 'TLSv1.3' && kems.length > 1) return 'KEM';
  return protocol === 'TLSv1.3' ? 'unknown' : 'rsa-or-none'; // TLS 1.2 RSA key transport has no group
}

export function certSummary(cert) {
  if (!cert) return null;
  const k = cert.publicKey;
  const type = k?.asymmetricKeyType ?? 'unknown';
  const d = k?.asymmetricKeyDetails ?? {};
  let key;
  if (type === 'rsa' || type === 'rsa-pss') key = 'rsa';
  else if (type === 'ec') key = 'ecdsa';
  else if (type === 'ed25519' || type === 'ed448') key = 'eddsa';
  else if (/^(ml-dsa|slh-dsa)/i.test(type)) key = 'pq';
  else key = 'other';
  return { key, bits: d.modulusLength ?? null, curve: d.namedCurve ?? null, sigAlg: cert.signatureAlgorithm ?? null };
}

function errCode(err) {
  const alert = /alert number (\d+)/.exec(err?.message ?? '')?.[1];
  if (alert) return `alert-${alert}`;
  return err?.code ?? 'error';
}

/** One TLS handshake to ip:port with SNI `servername`, offering `groups`. Optionally over an existing socket. */
export function handshake({ ip, port = 443, servername, groups, socket, timeoutMs = TIMEOUT_MS }) {
  return new Promise((resolve) => {
    let s;
    let settled = false;
    const done = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      s?.destroy();
      resolve(r);
    };
    const timer = setTimeout(() => done({ ok: false, error: 'timeout' }), timeoutMs);
    try {
      s = tls.connect(
        {
          ...(socket ? { socket } : { host: ip, port }),
          servername,
          ecdhCurve: groups,
          rejectUnauthorized: false, // we measure key exchange, not certificate validity
          ALPNProtocols: socket ? undefined : ['h2', 'http/1.1'],
        },
        () => {
          const protocol = s.getProtocol();
          const group = negotiatedGroup(s.getEphemeralKeyInfo(), protocol, groups);
          let cert = null;
          try { cert = certSummary(s.getPeerX509Certificate()); } catch { /* no cert */ }
          done({ ok: true, protocol, group, pq: KEM_GROUPS.has(group) || group === 'KEM', cert });
        },
      );
      s.on('error', (e) => done({ ok: false, error: errCode(e) }));
    } catch (e) {
      done({ ok: false, error: errCode(e) });
    }
  });
}

async function resolveIp(host) {
  try {
    const v4 = await resolver.resolve4(host);
    if (v4.length) return { ip: v4[0], family: 4 };
  } catch { /* fall through */ }
  try {
    const v6 = await resolver.resolve6(host);
    if (v6.length) return { ip: v6[0], family: 6 };
  } catch { /* none */ }
  return null;
}

/** DNSKEY algorithms of the zone (empty array = unsigned). Uses dig; Node's resolver has no DNSKEY. */
export async function dnssecAlgorithms(domain) {
  const args = ['+short', '+time=3', '+tries=2', 'DNSKEY', domain];
  if (DIG_HOST) args.unshift(`@${DIG_HOST}`, '-p', DIG_PORT);
  try {
    const { stdout } = await execFileP('dig', args, { timeout: 10_000 });
    const algs = new Set();
    for (const line of stdout.split('\n')) {
      const m = /^(\d+)\s+3\s+(\d+)\s+\S/.exec(line.trim());
      if (m) algs.add(Number(m[2]));
    }
    return { ok: true, algorithms: [...algs].sort((a, b) => a - b) };
  } catch {
    return { ok: false, algorithms: [] };
  }
}

// ── SMTP STARTTLS ─────────────────────────────────────────────────────────────

function smtpExchange(sock) {
  let buf = '';
  const waiters = [];
  sock.setEncoding('latin1');
  sock.on('data', (chunk) => {
    buf += chunk;
    // a reply is complete when a line has "NNN " (space after the code)
    let m;
    while ((m = /^(\d{3}) .*\r?\n/m.exec(buf))) {
      const end = m.index + m[0].length;
      const reply = buf.slice(0, end);
      buf = buf.slice(end);
      waiters.shift()?.resolve({ code: Number(m[1]), text: reply });
    }
  });
  sock.on('error', (e) => { while (waiters.length) waiters.shift().reject(e); });
  sock.on('close', () => { while (waiters.length) waiters.shift().reject(new Error('closed')); });
  return {
    next: () => new Promise((resolve, reject) => waiters.push({ resolve, reject })),
    send: (line) => sock.write(line + '\r\n'),
  };
}

/** Connect to mx:25, EHLO, STARTTLS, then a TLS handshake with browser-like groups. */
export function probeSmtp({ ip, mxHost }) {
  return new Promise((resolve) => {
    let settled = false;
    const sock = net.connect({ host: ip, port: 25 });
    const done = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      resolve(r);
    };
    const timer = setTimeout(() => done({ ok: false, error: 'timeout' }), SMTP_TIMEOUT_MS);
    sock.on('error', (e) => done({ ok: false, error: errCode(e) }));
    sock.on('connect', async () => {
      try {
        const io = smtpExchange(sock);
        const greet = await io.next();
        if (greet.code !== 220) return done({ ok: false, error: `greeting-${greet.code}` });
        io.send(`EHLO ${EHLO_NAME}`);
        const ehlo = await io.next();
        if (ehlo.code !== 250) return done({ ok: false, error: `ehlo-${ehlo.code}` });
        if (!/^250[ -]STARTTLS\b/im.test(ehlo.text)) {
          io.send('QUIT');
          return done({ ok: true, starttls: false });
        }
        io.send('STARTTLS');
        const st = await io.next();
        if (st.code !== 220) return done({ ok: true, starttls: false, error: `starttls-${st.code}` });
        sock.removeAllListeners('data');
        clearTimeout(timer);
        const hs = await handshake({ socket: sock, servername: mxHost, groups: BROWSER_GROUPS, timeoutMs: SMTP_TIMEOUT_MS });
        done({ ok: true, starttls: true, tls: hs });
      } catch (e) {
        done({ ok: false, error: errCode(e) });
      }
    });
  });
}

// Mail is measured in a second phase, once per MX zone (e.g. all *.mail.protection.outlook.com
// hosts share one Microsoft 365 configuration): every mail provider sees exactly one connection
// per month, and the web measurement never waits for slow mail servers.

/** IPv6 first for SMTP: from the scanner's network, several large providers only answer on IPv6. */
async function resolveMailIp(host) {
  try {
    const v6 = await resolver.resolve6(host);
    if (v6.length) return { ip: v6[0], family: 6 };
  } catch { /* fall through */ }
  return resolveIp(host);
}

/** Classify why a mail server could not be measured (for the coverage statistics). */
export function mailErrorClass(error) {
  if (!error) return null;
  if (/^greeting-5|^ehlo-5/.test(error)) return 'refused';
  if (error === 'timeout') return 'timeout';
  if (error === 'ECONNREFUSED' || error === 'ECONNRESET') return 'refused';
  if (error === 'no-address' || error === 'ENOTFOUND') return 'no-address';
  return 'other';
}

/** Lowest-preference MX of a domain and its zone (registrable domain via `mxZoneOf`). */
export async function lookupMx(domain, mxZoneOf = (h) => h) {
  let mx;
  try {
    mx = await resolver.resolveMx(domain);
  } catch (e) {
    return { mx: false, error: e.code === 'ENODATA' || e.code === 'ENOTFOUND' ? null : errCode(e) };
  }
  mx = mx.filter((r) => r.exchange && r.exchange !== '.').sort((a, b) => a.priority - b.priority);
  if (!mx.length) return { mx: false }; // includes RFC 7505 null MX
  const mxHost = mx[0].exchange.toLowerCase().replace(/\.$/, '');
  return { mx: true, mxHost, mxZone: mxZoneOf(mxHost) ?? mxHost };
}

/** One STARTTLS measurement of a mail host. */
export async function probeMailHost(mxHost) {
  const addr = await resolveMailIp(mxHost);
  const r = addr ? await probeSmtp({ ip: addr.ip, mxHost }) : { ok: false, error: 'no-address' };
  return { ...r, errorClass: r.ok ? null : mailErrorClass(r.error) };
}

/**
 * Full measurement of one site (e.g. "bsi.bund.de"; its zone "bund.de" is used for DNSSEC).
 * Tries the bare name first, then www. Mail: MX of the site, else of the zone (looked up only).
 * Returns only facts about the site's own servers; the caller decides what to keep.
 */
export async function probeDomain({ site, zone }, { classifyIp, mxZoneOf }) {
  const result = { web: null, dnssec: null, mail: null };
  const [dnssec, mxSite] = await Promise.all([
    dnssecAlgorithms(zone ?? site),
    MEASURE_MAIL ? lookupMx(site, mxZoneOf) : Promise.resolve(null),
  ]);
  result.dnssec = dnssec;
  // only the MX is looked up here; the SMTP measurement happens later, once per MX zone
  if (MEASURE_MAIL) result.mail = !mxSite.mx && zone && zone !== site ? await lookupMx(zone, mxZoneOf) : mxSite;

  for (const host of [site, `www.${site}`]) {
    const addr = await resolveIp(host);
    if (!addr) continue;
    const browser = await handshake({ ip: addr.ip, servername: host, groups: BROWSER_GROUPS });
    if (!browser.ok) {
      if (host === site) continue; // the bare name may simply not serve TLS; try www
      result.web = { reachable: false, error: browser.error };
      break;
    }
    const pure = await handshake({ ip: addr.ip, servername: host, groups: PURE_GROUPS });
    // Chose a classical group although ML-KEM was offered? Ask once more with only the hybrid:
    // a server that accepts it supports ML-KEM but prefers classical groups.
    const hybridOnly = browser.pq ? null : await handshake({ ip: addr.ip, servername: host, groups: 'X25519MLKEM768' });
    const where = classifyIp(addr.ip);
    result.web = {
      reachable: true,
      host: host === site ? 'bare' : 'www',
      family: addr.family,
      hosting: where.hosting,
      provider: where.provider,
      pqCapable: browser.pq || !!(hybridOnly?.ok && hybridOnly.pq),
      protocol: browser.protocol,
      group: browser.group,
      pq: browser.pq,
      pqPure: pure.ok && pure.pq,
      cert: browser.cert,
    };
    break;
  }
  if (!result.web) result.web = { reachable: false, error: 'no-address-or-tls' };
  return result;
}
