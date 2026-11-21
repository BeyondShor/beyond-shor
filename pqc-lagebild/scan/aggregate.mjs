// From per-site observations (memory only) to the published, aggregate-only dataset.
// A cell is published only if it rests on at least MIN_CELL reachable sites; sub-metrics
// (DNSSEC, mail) need MIN_CELL answers of their own. Suppressed cells are counted, not listed.
// Provider rankings name infrastructure operators (CDNs, hosters, mail providers), never sites.

export const CATEGORIES = ['kritis', 'institutions', 'corporations', 'other'];
export const HOSTING = ['cdn', 'cloud', 'other'];
const PROVIDER_TOP = 15;
// Always listed (if ≥ MIN_CELL sites): the hoster this site runs on, so readers can see where it stands.
const PINNED_PROVIDERS = new Set(['Hostinger']);

/** Negotiated TLS group → bucket shown on the page. */
export function groupBucket(group) {
  if (!group) return 'other';
  if (group === 'X25519MLKEM768') return 'X25519MLKEM768';
  if (/MLKEM|^KEM$/.test(group)) return 'other-mlkem';
  if (group === 'X25519') return 'X25519';
  if (group === 'prime256v1' || group === 'secp256r1') return 'P-256';
  if (group === 'secp384r1') return 'P-384';
  if (group === 'rsa-or-none') return 'none';
  return 'other';
}

/** Certificate key → bucket ("RSA-2048", "ECDSA P-256", …). */
export function certKeyBucket(cert) {
  if (!cert) return null;
  if (cert.key === 'rsa') return [2048, 3072, 4096].includes(cert.bits) ? `RSA-${cert.bits}` : 'RSA-other';
  if (cert.key === 'ecdsa') return cert.curve === 'prime256v1' ? 'ECDSA P-256' : cert.curve === 'secp384r1' ? 'ECDSA P-384' : 'ECDSA-other';
  if (cert.key === 'eddsa') return 'EdDSA';
  if (cert.key === 'pq') return 'PQ';
  return 'other';
}

/** Signature algorithm the issuing CA used on the certificate → family. */
export function certSigBucket(sigAlg) {
  if (!sigAlg) return null;
  if (/ml-?dsa|slh-?dsa|dilithium|sphincs/i.test(sigAlg)) return 'PQ';
  if (/pss/i.test(sigAlg)) return 'RSA-PSS';
  if (/rsa/i.test(sigAlg)) return 'RSA';
  if (/ecdsa/i.test(sigAlg)) return 'ECDSA';
  if (/ed25519|ed448/i.test(sigAlg)) return 'EdDSA';
  return 'other';
}

// Mail provider zones → display names (MX host's registrable domain). Unknown zones keep their name,
// but only zones serving at least MIN_CELL domains are ever listed — those are providers, not sites.
const MAIL_PROVIDERS = {
  'outlook.com': 'Microsoft 365', 'google.com': 'Google', 'googlemail.com': 'Google',
  'ionos.de': 'IONOS', 'ionos.com': 'IONOS', 'kundenserver.de': 'IONOS', 'ui-r.com': 'IONOS',
  'gmx.net': 'GMX / WEB.DE', 'web.de': 'GMX / WEB.DE', 'strato.de': 'Strato', 'rzone.de': 'Strato',
  'hornetsecurity.com': 'Hornetsecurity', 'mimecast.com': 'Mimecast', 'pphosted.com': 'Proofpoint',
  'ppe-hosted.com': 'Proofpoint', 'retarus.com': 'Retarus', 'kasserver.com': 'ALL-INKL',
  'hostinger.com': 'Hostinger', 'ovh.net': 'OVHcloud', 'your-server.de': 'Hetzner', 'hetzner.com': 'Hetzner',
  't-online.de': 'Deutsche Telekom', 'telekom.de': 'Deutsche Telekom', 'mailbox.org': 'mailbox.org',
  'posteo.de': 'Posteo', 'zoho.eu': 'Zoho', 'zoho.com': 'Zoho', 'icloud.com': 'Apple iCloud',
  'yahoodns.net': 'Yahoo', 'messagelabs.com': 'Broadcom (Symantec)', 'barracudanetworks.com': 'Barracuda',
  'aruba.it': 'Aruba', 'ovh.com': 'OVHcloud', 'one.com': 'one.com', 'transip.email': 'TransIP',
  'mittwald.de': 'Mittwald', 'agenturserver.de': 'Mittwald', 'netcup.net': 'netcup', 'infomaniak.ch': 'Infomaniak',
  'mx.microsoft': 'Microsoft 365', 'mx.cloudflare.net': 'Cloudflare', 'ispgateway.de': 'domainfactory',
  'secureserver.net': 'GoDaddy', 'antispamcloud.com': 'SpamExperts', 'emailsrvr.com': 'Rackspace',
  'mailcontrol.com': 'Forcepoint', 'iphmx.com': 'Cisco Secure Email', 'trendmicro.eu': 'Trend Micro',
  'eu.trendmicro.com': 'Trend Micro', 'sophos.com': 'Sophos', 'one.com.': 'one.com', 'loopia.se': 'Loopia',
  'seznam.cz': 'Seznam', 'wedos.net': 'WEDOS', 'aruba.it.': 'Aruba', 'register.it': 'Register.it',
  'home.pl': 'home.pl', 'nazwa.pl': 'nazwa.pl', 'zone.eu': 'Zone', 'hostnet.nl': 'Hostnet', 'transip.nl': 'TransIP',
  'combell.net': 'Combell', 'mailprotect.be': 'Combell', 'protonmail.ch': 'Proton', 'tutanota.de': 'Tuta',
  'fastmail.com': 'Fastmail', 'messagingengine.com': 'Fastmail', 'gandi.net': 'Gandi', 'ovh.ca': 'OVHcloud',
  'webgo.de': 'webgo', 'alfahosting-server.de': 'Alfahosting', 'udag.de': 'united-domains', 'hosteurope.de': 'Host Europe',
};
export const KNOWN_MAIL_PROVIDERS = new Set(Object.values(MAIL_PROVIDERS));
// Only listed (commercial) mail providers are ever named; other zones still count in the totals.
export const mailProviderName = (zone) => (zone ? MAIL_PROVIDERS[zone] ?? null : null);

/** Reduce a probe result to the few facts we aggregate. Nothing identifying is kept. */
export function toObservation(record, probe) {
  const w = probe.web ?? {};
  const m = probe.mail ?? {};
  const mailTlsOk = !!(m.mx && m.ok && m.starttls && m.tls?.ok);
  return {
    country: record.country ?? null,
    category: record.category,
    // the EU view may classify a site differently (only uniform sources count there)
    euCategory: record.euCategory ?? record.category,
    uniform: !!record.uniform,
    reachable: !!w.reachable,
    hosting: w.reachable ? (w.hosting ?? 'unknown') : null,
    provider: w.reachable ? (w.provider ?? null) : null,
    tls13: w.protocol === 'TLSv1.3',
    pq: !!w.pq,
    pqCapable: !!(w.pqCapable ?? w.pq),
    pqPure: !!w.pqPure,
    group: w.reachable ? groupBucket(w.group) : null,
    certKey: w.cert?.key ?? null,
    certKeyBucket: certKeyBucket(w.cert),
    certSig: certSigBucket(w.cert?.sigAlg),
    dnsOk: !!probe.dnssec?.ok,
    dnssecAlgs: probe.dnssec?.ok ? probe.dnssec.algorithms : [],
    mx: !!m.mx,
    mailProvider: m.mx ? mailProviderName(m.mxZone) : null,
    mailOk: !!(m.mx && m.ok),
    mailErr: m.mx && !m.ok ? (m.errorClass ?? 'other') : null,
    starttls: !!(m.mx && m.ok && m.starttls),
    mailTlsOk,
    mailPq: mailTlsOk && !!m.tls.pq,
    mailGroup: mailTlsOk ? groupBucket(m.tls.group) : null,
  };
}

const bump = (obj, k) => { if (k != null) obj[k] = (obj[k] ?? 0) + 1; };

function emptyCounts() {
  return {
    n: 0,
    web: { reachable: 0, tls13: 0, pq: 0, pqCapable: 0, pqPure: 0, groups: {}, cert: { rsa: 0, ecdsa: 0, eddsa: 0, pq: 0, other: 0 }, certKeys: {}, certSigs: {} },
    hosting: { cdn: 0, cloud: 0, other: 0, unknown: 0 },
    pqByHosting: { cdn: 0, cloud: 0, other: 0, unknown: 0 },
    dns: { answered: 0, signed: 0, algorithms: {} },
    mail: { withMx: 0, answered: 0, starttls: 0, tls: 0, pq: 0, groups: {}, errors: {} },
  };
}

function add(c, o) {
  c.n++;
  if (o.dnsOk) {
    c.dns.answered++;
    if (o.dnssecAlgs.length) {
      c.dns.signed++;
      for (const a of o.dnssecAlgs) bump(c.dns.algorithms, a);
    }
  }
  if (o.mx) {
    c.mail.withMx++;
    if (o.mailOk) c.mail.answered++;
    else bump(c.mail.errors, o.mailErr);
    if (o.starttls) c.mail.starttls++;
    if (o.mailTlsOk) { c.mail.tls++; bump(c.mail.groups, o.mailGroup); }
    if (o.mailPq) c.mail.pq++;
  }
  if (!o.reachable) return;
  const w = c.web;
  w.reachable++;
  if (o.tls13) w.tls13++;
  if (o.pq) w.pq++;
  if (o.pqCapable) w.pqCapable++;
  if (o.pqPure) w.pqPure++;
  bump(w.groups, o.group);
  if (o.certKey) w.cert[o.certKey in w.cert ? o.certKey : 'other']++;
  bump(w.certKeys, o.certKeyBucket);
  bump(w.certSigs, o.certSig);
  const h = o.hosting in c.hosting ? o.hosting : 'unknown';
  c.hosting[h]++;
  if (o.pq) c.pqByHosting[h]++;
}

function finalize(c, minCell) {
  if (c.web.reachable < minCell) return null;
  const out = { n: c.n, web: c.web, hosting: c.hosting, pqByHosting: c.pqByHosting };
  out.dns = c.dns.answered >= minCell ? c.dns : null;
  out.mail = c.mail.tls >= minCell ? c.mail : null;
  // pqByHosting for a hosting class that is itself too small would single out few sites
  for (const h of Object.keys(out.hosting)) {
    if (out.hosting[h] < minCell) out.pqByHosting[h] = null;
  }
  return out;
}

/** Which observations belong to a view. EU view: only sources that exist for every member state. */
export const VIEWS = {
  eu: (o) => o.uniform,
  de: (o) => o.country === 'DE',
};

export function regionsFor(view, observations) {
  if (view === 'de') return ['DE'];
  const countries = [...new Set(observations.filter(VIEWS.eu).map((o) => o.country).filter(Boolean))].sort();
  return ['EU', ...countries];
}

/** The observation as the EU view sees it: category from uniform sources only. */
function asEu(o) {
  return o.euCategory === undefined ? o : { ...o, category: o.euCategory };
}

function inRegion(o, region) {
  return region === 'EU' || o.country === region;
}

/** Top providers of each hosting class (sites) and of mail (domains), only groups ≥ minCell. */
function providerRankings(pool, minCell) {
  const web = new Map();
  const mail = new Map();
  for (const o of pool) {
    if (o.reachable && o.provider) {
      const k = `${o.hosting}|${o.provider}`;
      const e = web.get(k) ?? { hosting: o.hosting, name: o.provider, n: 0, pq: 0, pqCapable: 0 };
      e.n++;
      if (o.pq) e.pq++;
      if (o.pqCapable) e.pqCapable++;
      web.set(k, e);
    }
    if (o.mx && o.mailProvider && o.mailErr !== 'not-measured') {
      const e = mail.get(o.mailProvider) ?? { name: o.mailProvider, n: 0, answered: 0, tls: 0, pq: 0, group: null, errors: {} };
      e.n++;
      if (o.mailOk) e.answered++;
      else bump(e.errors, o.mailErr);
      if (o.mailTlsOk) { e.tls++; e.group ??= o.mailGroup; }
      if (o.mailPq) e.pq++;
      mail.set(o.mailProvider, e);
    }
  }
  const webTop = [];
  for (const h of HOSTING) {
    const ranked = [...web.values()].filter((e) => e.hosting === h && e.n >= minCell).sort((a, b) => b.n - a.n);
    const top = ranked.slice(0, PROVIDER_TOP);
    for (const e of ranked.slice(PROVIDER_TOP)) if (PINNED_PROVIDERS.has(e.name)) top.push(e);
    webTop.push(...top);
  }
  const mailTop = [...mail.values()].filter((e) => e.n >= minCell).sort((a, b) => b.n - a.n).slice(0, PROVIDER_TOP);
  return { web: webTop, mail: mailTop };
}

export function aggregate(observations, { minCell }) {
  const cells = [];
  const providers = [];
  let suppressed = 0;
  const push = (key, counts) => {
    const f = finalize(counts, minCell);
    if (f) cells.push({ ...key, ...f });
    else suppressed++;
  };

  for (const [view, inView] of Object.entries(VIEWS)) {
    const pool = observations.filter(inView).map((o) => (view === 'eu' ? asEu(o) : o));
    for (const region of regionsFor(view, observations)) {
      const regional = pool.filter((o) => inRegion(o, region));
      for (const category of ['all', ...CATEGORIES]) {
        const base = category === 'all' ? regional : regional.filter((o) => o.category === category);
        const total = emptyCounts();
        base.forEach((o) => add(total, o));
        push({ view, region, category, sector: null }, total);
      }
      if (region === 'EU' || region === 'DE') providers.push({ view, region, ...providerRankings(regional, minCell) });
    }
  }
  return { cells, providers, suppressed };
}

/**
 * Month-over-month change on the same sites (panel), so list churn does not look like migration.
 * `prev` and `now` are Maps hash → compact observation.
 */
export function trend(prev, now, { minCell }) {
  const out = [];
  let suppressed = 0;
  for (const [view, inView] of Object.entries(VIEWS)) {
    const both = [];
    for (const [h, o] of now) {
      const p = prev.get(h);
      if (p && p.reachable && o.reachable && inView(o)) both.push(view === 'eu' ? [asEu(p), asEu(o)] : [p, o]);
    }
    const regions = view === 'de' ? ['DE'] : ['EU', ...new Set(both.map(([, o]) => o.country).filter(Boolean))];
    for (const region of [...new Set(regions)].sort((a, b) => (a === 'EU' ? -1 : b === 'EU' ? 1 : a.localeCompare(b)))) {
      for (const category of ['all', ...CATEGORIES]) {
        const sel = both.filter(([, o]) => inRegion(o, region) && (category === 'all' || o.category === category));
        if (sel.length < minCell) { suppressed++; continue; }
        out.push({
          view, region, category,
          n: sel.length,
          pqBefore: sel.filter(([p]) => p.pq).length,
          pqNow: sel.filter(([, o]) => o.pq).length,
          switchedOn: sel.filter(([p, o]) => !p.pq && o.pq).length,
          switchedOff: sel.filter(([p, o]) => p.pq && !o.pq).length,
        });
      }
    }
  }
  return { cells: out, suppressed };
}

/** Sanity checks before anything is published. Returns a list of problems (empty = fine). */
export function qualityGate({ observations, cells }, previous) {
  const problems = [];
  const total = observations.length;
  const reachable = observations.filter((o) => o.reachable).length;
  if (total < 50_000) problems.push(`population too small: ${total}`);
  if (reachable < total * 0.5) problems.push(`only ${reachable} of ${total} sites reachable`);
  const eu = cells.find((c) => c.view === 'eu' && c.region === 'EU' && c.category === 'all' && c.sector === null);
  if (!eu) problems.push('EU total cell missing');
  if (previous && eu) {
    const prevEu = previous.cells?.find((c) => c.view === 'eu' && c.region === 'EU' && c.category === 'all' && c.sector === null);
    if (prevEu) {
      if (total < previous.population.total * 0.8) problems.push(`population shrank from ${previous.population.total} to ${total}`);
      const d = eu.web.pq / eu.web.reachable - prevEu.web.pq / prevEu.web.reachable;
      if (Math.abs(d) > 0.15) problems.push(`implausible jump of the EU PQ share: ${(d * 100).toFixed(1)} points`);
    }
  }
  return problems;
}
