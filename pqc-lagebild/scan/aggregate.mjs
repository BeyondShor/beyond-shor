// From per-site observations (memory only) to the published, aggregate-only dataset.
// A cell is published only if it rests on at least MIN_CELL reachable sites; sub-metrics
// (DNSSEC, mail) need MIN_CELL answers of their own. Suppressed cells are counted, not listed.

export const CATEGORIES = ['kritis', 'institutions', 'corporations', 'other'];
export const SECTORS = {
  kritis: ['energy', 'water', 'health', 'finance', 'transport', 'ict', 'food', 'waste'],
  institutions: ['government', 'municipality', 'higher-education', 'eu-body'],
};
export const HOSTING = ['cdn', 'cloud', 'other'];

/** Reduce a probe result to the few facts we aggregate. Nothing identifying is kept. */
export function toObservation(record, probe) {
  const w = probe.web ?? {};
  const m = probe.mail ?? {};
  return {
    country: record.country ?? null,
    category: record.category,
    sector: record.sector ?? null,
    // the EU view may classify a site differently (only uniform sources count there)
    euCategory: record.euCategory ?? record.category,
    euSector: record.euSector !== undefined ? record.euSector : (record.sector ?? null),
    uniform: !!record.uniform,
    reachable: !!w.reachable,
    hosting: w.reachable ? (w.hosting ?? 'unknown') : null,
    tls13: w.protocol === 'TLSv1.3',
    pq: !!w.pq,
    pqPure: !!w.pqPure,
    certKey: w.cert?.key ?? null,
    dnsOk: !!probe.dnssec?.ok,
    dnssecAlgs: probe.dnssec?.ok ? probe.dnssec.algorithms : [],
    mx: !!m.mx,
    mailOk: !!(m.mx && m.ok),
    starttls: !!(m.mx && m.ok && m.starttls),
    mailPq: !!(m.mx && m.ok && m.starttls && m.tls?.ok && m.tls.pq),
    mailTlsOk: !!(m.mx && m.ok && m.starttls && m.tls?.ok),
  };
}

function emptyCounts() {
  return {
    n: 0,
    web: { reachable: 0, tls13: 0, pq: 0, pqPure: 0, cert: { rsa: 0, ecdsa: 0, eddsa: 0, pq: 0, other: 0 } },
    hosting: { cdn: 0, cloud: 0, other: 0, unknown: 0 },
    pqByHosting: { cdn: 0, cloud: 0, other: 0, unknown: 0 },
    dns: { answered: 0, signed: 0, algorithms: {} },
    mail: { withMx: 0, answered: 0, starttls: 0, tls: 0, pq: 0 },
  };
}

function add(c, o) {
  c.n++;
  if (o.dnsOk) {
    c.dns.answered++;
    if (o.dnssecAlgs.length) {
      c.dns.signed++;
      for (const a of o.dnssecAlgs) c.dns.algorithms[a] = (c.dns.algorithms[a] ?? 0) + 1;
    }
  }
  if (o.mx) {
    c.mail.withMx++;
    if (o.mailOk) c.mail.answered++;
    if (o.starttls) c.mail.starttls++;
    if (o.mailTlsOk) c.mail.tls++;
    if (o.mailPq) c.mail.pq++;
  }
  if (!o.reachable) return;
  c.web.reachable++;
  if (o.tls13) c.web.tls13++;
  if (o.pq) c.web.pq++;
  if (o.pqPure) c.web.pqPure++;
  if (o.certKey) c.web.cert[o.certKey in c.web.cert ? o.certKey : 'other']++;
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

/** The observation as the EU view sees it: category/sector from uniform sources only. */
function asEu(o) {
  return o.euCategory === undefined ? o : { ...o, category: o.euCategory, sector: o.euSector ?? null };
}

function inRegion(o, region) {
  return region === 'EU' || o.country === region;
}

export function aggregate(observations, { minCell }) {
  const cells = [];
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
        for (const sector of SECTORS[category] ?? []) {
          const c = emptyCounts();
          base.filter((o) => o.sector === sector).forEach((o) => add(c, o));
          push({ view, region, category, sector }, c);
        }
      }
    }
  }
  return { cells, suppressed };
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
