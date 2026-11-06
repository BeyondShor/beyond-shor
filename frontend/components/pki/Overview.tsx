'use client';

// Step-by-step overview: the lab's steps as packets moving between the parties.
// Each step runs the real work (key ceremony, request, ACME, issuance, handshake)
// and shows its actual values; the details below are filled by the same run.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { ALGS, PRIVATE_CLIENTS, PROFILES, WEB_CLIENTS, type ProfileId } from '@/lib/pki/meta';
import type { HandshakeView, LeafView, PkiView } from '@/lib/pki/worker-types';
import { useFormat } from './ui';

export type Phase = 'idle' | 'ceremony' | 'request' | 'validate' | 'issue' | 'handshake' | 'verdict';
export const PHASES: Phase[] = ['ceremony', 'request', 'validate', 'issue', 'handshake', 'verdict'];

type NodeId = 'root' | 'issuing' | 'ra' | 'dns' | 'aux' | 'crl' | 'server' | 'mallory' | 'c0' | 'c1' | 'c2';
type Box = [number, number, number, number];
type Pt = [number, number];

interface Layout { w: number; h: number; nodes: Record<NodeId, Box>; routes: Record<string, Pt[]> }

// Orthogonal routes through the gaps between boxes, so no line runs through a party
// it doesn't concern. Pairs not listed are drawn as straight lines.
const WIDE: Layout = {
  w: 640, h: 492,
  nodes: {
    root: [16, 16, 184, 66], dns: [228, 16, 184, 66], aux: [440, 16, 184, 66],
    issuing: [16, 128, 184, 66], ra: [228, 128, 184, 66], crl: [440, 128, 184, 66],
    server: [228, 240, 184, 66], mallory: [228, 326, 184, 46],
    c0: [16, 410, 184, 66], c1: [228, 410, 184, 66], c2: [440, 410, 184, 66],
  },
  routes: {
    'server>dns': [[320, 273], [426, 273], [426, 49], [320, 49]],
    'issuing>aux': [[108, 161], [108, 105], [532, 105], [532, 49]],
    'root>server': [[108, 49], [214, 49], [214, 273], [320, 273]],
    'server>c0': [[320, 273], [320, 392], [108, 392], [108, 443]],
    'server>c1': [[320, 273], [320, 443]],
    'server>c2': [[320, 273], [320, 392], [532, 392], [532, 443]],
    'crl>c0': [[532, 161], [632, 161], [632, 402], [92, 402], [92, 443]],
    'crl>c1': [[532, 161], [632, 161], [632, 402], [336, 402], [336, 443]],
    'crl>c2': [[532, 161], [632, 161], [632, 402], [548, 402], [548, 443]],
    'aux>c1': [[532, 49], [632, 49], [632, 402], [336, 402], [336, 443]],
  },
};
const NARROW: Layout = {
  w: 360, h: 522,
  nodes: {
    root: [8, 8, 168, 66], dns: [184, 8, 168, 66],
    issuing: [8, 96, 168, 66], ra: [184, 96, 168, 66],
    aux: [8, 184, 168, 66], crl: [184, 184, 168, 66],
    server: [96, 276, 168, 66], mallory: [96, 362, 168, 46],
    c0: [8, 430, 110, 84], c1: [125, 430, 110, 84], c2: [242, 430, 110, 84],
  },
  routes: {
    'server>ra': [[180, 309], [180, 173], [268, 173], [268, 129]],
    'server>dns': [[180, 309], [180, 85], [268, 85], [268, 41]],
    'issuing>server': [[92, 129], [180, 129], [180, 309]],
    'root>server': [[92, 41], [180, 41], [180, 309]],
    'server>c0': [[180, 309], [180, 416], [63, 416], [63, 472]],
    'server>c1': [[180, 309], [180, 472]],
    'server>c2': [[180, 309], [180, 416], [297, 416], [297, 472]],
    'crl>c0': [[268, 217], [356, 217], [356, 423], [50, 423], [50, 472]],
    'crl>c1': [[268, 217], [356, 217], [356, 423], [194, 423], [194, 472]],
    'crl>c2': [[268, 217], [356, 217], [356, 423], [311, 423], [311, 472]],
    'aux>c1': [[92, 217], [4, 217], [4, 423], [166, 423], [166, 472]],
  },
};

/**
 * Text that never gets cut off: measured in the browser, the font shrinks until the
 * text fits on one line; below the minimum size it wraps at word boundaries instead.
 * Runs again once the web fonts have loaded, since the fallback font has other widths.
 */
function FitText({ text, base, min, className, refitKey }: { text: string; base: number; min: number; className: string; refitKey?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  useEffect(() => { let alive = true; document.fonts?.ready.then(() => { if (alive) setFontsReady(true); }); return () => { alive = false; }; }, []);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.whiteSpace = 'nowrap';
      let size = base;
      el.style.fontSize = `${size}px`;
      while (el.scrollWidth > el.clientWidth + 0.5 && size > min) {
        size = Math.max(min, size - 0.25);
        el.style.fontSize = `${size}px`;
      }
      if (el.scrollWidth > el.clientWidth + 0.5) el.style.whiteSpace = 'normal';
    };
    fit();
    // fit again when the available width changes, e.g. when a verdict mark appears next to the title
    let lastWidth = el.clientWidth;
    const ro = new ResizeObserver(() => { if (el.clientWidth !== lastWidth) { lastWidth = el.clientWidth; fit(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, base, min, fontsReady, refitKey]);
  // non-breaking hyphens: wrap only between words ("Werkzeug ohne" / "Update-Kanal", never "ML-" / "DSA")
  return <span ref={ref} className={`min-w-0 flex-1 break-words ${className}`}>{text.replace(/-/g, '\u2011')}</span>;
}

const center = (b: Box): Pt => [b[0] + b[2] / 2, b[1] + b[3] / 2];

function route(L: Layout, a: NodeId, b: NodeId): Pt[] {
  const fwd = L.routes[`${a}>${b}`];
  if (fwd) return fwd;
  const back = L.routes[`${b}>${a}`];
  if (back) return [...back].reverse();
  return [center(L.nodes[a]), center(L.nodes[b])];
}

function pointAt(pts: Pt[], f: number): Pt {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let d = f * seg.reduce((s, x) => s + x, 0);
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const r = seg[i] ? Math.min(1, d / seg[i]) : 1;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * r, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * r];
    }
    d -= seg[i];
  }
  return pts[pts.length - 1];
}

interface Move { from: NodeId; to: NodeId; label: string; delay: number }

const DURATION = 1700;          // ms a packet travels
const PAUSE = 1500;             // ms before the step's animation repeats

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia(query); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export interface TourData { pki: PkiView | null; leaf: LeafView | null; handshakes: HandshakeView[] | null }

export default function Overview({ profileId, step, attacker, data, busy, onStart, onNext, onBack }: {
  profileId: ProfileId; step: number; attacker: boolean; data: TourData; busy: boolean;
  onStart: () => void; onNext: () => void; onBack: () => void;
}) {
  const t = useTranslations('pkiLab');
  const f = useFormat();
  const narrow = useMedia('(max-width: 639px)');
  const reduced = useMedia('(prefers-reduced-motion: reduce)');
  const L = narrow ? NARROW : WIDE;
  const p = PROFILES[profileId];
  const priv = p.scope === 'private';
  const clients = priv ? PRIVATE_CLIENTS : WEB_CLIENTS;
  const kind = p.mtc ? 'mtc' : priv ? 'private' : 'web';
  const phase: Phase = step < 0 ? 'idle' : PHASES[step];
  const handshakes = data.handshakes;

  // packets per step, derived from the profile
  const moves: Record<Phase, Move[]> = {
    idle: [],
    ceremony: p.mtc
      ? [{ from: 'issuing', to: 'root', label: t('overview.pkt.cosignerKey'), delay: 0 }]
      : [{ from: 'root', to: 'issuing', label: t('overview.pkt.caCert'), delay: 0 }],
    request: [{ from: 'server', to: 'ra', label: 'CSR', delay: 0 }],
    validate: [
      { from: 'server', to: 'dns', label: 'TXT', delay: 0 },
      { from: 'ra', to: 'dns', label: t('overview.pkt.lookup'), delay: 1500 },
    ],
    issue: p.mtc
      ? [{ from: 'root', to: 'issuing', label: t('overview.pkt.subtree'), delay: 0 },
         { from: 'issuing', to: 'root', label: t('overview.pkt.cosignature'), delay: 1300 },
         { from: 'root', to: 'server', label: t('overview.pkt.cert'), delay: 2600 }]
      : priv
        ? [{ from: 'issuing', to: 'aux', label: t('overview.pkt.logEntry'), delay: 0 },
           { from: 'issuing', to: 'server', label: t('overview.pkt.cert'), delay: 1300 }]
        : [{ from: 'issuing', to: 'aux', label: t('overview.pkt.precert'), delay: 0 },
           { from: 'aux', to: 'issuing', label: 'SCT', delay: 1300 },
           { from: 'issuing', to: 'server', label: t('overview.pkt.cert'), delay: 2600 }],
    handshake: (['c0', 'c1', 'c2'] as const).map((c, i) => ({ from: 'server', to: c, label: t('overview.pkt.chain'), delay: i * 400 })),
    // revocation data: private clients fetch CRLs; browsers use pre-distributed data, the CLI tool checks nothing
    verdict: p.mtc ? [{ from: 'aux', to: 'c1', label: 'Landmark', delay: 0 }]
      : priv ? (['c0', 'c1', 'c2'] as const).map((c, i) => ({ from: 'crl', to: c, label: 'CRL', delay: i * 500 }))
        : (['c0', 'c1'] as const).map((c, i) => ({ from: 'crl', to: c, label: t('overview.pkt.revocation'), delay: i * 500 })),
  };

  // the step's animation runs in a loop while the step is shown
  const cycle = Math.max(0, ...moves[phase].map((m) => m.delay)) + DURATION + PAUSE;
  const [now, setNow] = useState(0);
  const start = useRef(0);
  useEffect(() => {
    if (phase === 'idle' || reduced) return;
    start.current = performance.now();
    let raf = 0;
    const tick = () => { setNow((performance.now() - start.current) % cycle); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, reduced, cycle]);

  const activeNodes = new Set<NodeId>(moves[phase].flatMap((m) => [m.from, m.to]));
  if (phase === 'ceremony') activeNodes.add('root');
  if (phase === 'request') activeNodes.add('server');

  const label = (id: NodeId): { title: string; sub: string; alg?: string } => {
    switch (id) {
      case 'root': return p.mtc ? { title: t('arch.mtcCa'), sub: t('overview.sub.mtcCa'), alg: ALGS.mldsa44.short } : { title: t(priv ? 'arch.rootPrivate' : 'arch.rootWeb'), sub: t('arch.rootSub'), alg: ALGS[p.root].short };
      case 'issuing': return p.mtc ? { title: t('arch.mirror'), sub: t('arch.mirrorSub'), alg: ALGS.mldsa44.short } : { title: t(priv ? 'arch.issuingPrivate' : 'arch.issuingWeb'), sub: t('overview.sub.issuing'), alg: ALGS[p.intermediate].short };
      case 'ra': return { title: t('overview.node.ra'), sub: t(priv ? 'overview.sub.raPrivate' : 'overview.sub.raWeb') };
      case 'dns': return { title: t('overview.node.dns'), sub: priv ? 'muster.example' : 'example.com' };
      case 'aux': return p.mtc ? { title: t('arch.updateChannel'), sub: t('arch.updateChannelSub') } : priv ? { title: t('arch.issuanceLog'), sub: t('arch.issuanceLogSub') } : { title: t('arch.ct'), sub: t('arch.ctSub') };
      case 'crl': return p.mtc ? { title: t('overview.node.noCrl'), sub: t('overview.sub.noCrl') } : { title: t('arch.crl'), sub: t('overview.sub.crl') };
      case 'server': return { title: t('arch.server'), sub: priv ? 'portal.muster.example' : 'shop.example.com', alg: ALGS[p.leaf].short };
      case 'mallory': return { title: t('arch.mallory'), sub: t('overview.sub.mallory') };
      default: {
        const c = clients[Number(id[1])];
        return { title: t(`clients.${c}.name`), sub: t(`clients.${c}.short`) };
      }
    }
  };

  const edges: [NodeId, NodeId][] = [['root', 'issuing'], ['server', 'ra'], ['ra', 'dns'], ['server', 'dns'], ['issuing', 'aux'], ['issuing', 'server'],
    ['server', 'c0'], ['server', 'c1'], ['server', 'c2']];
  if (p.mtc) edges.push(['root', 'server'], ['aux', 'c1']);
  else if (priv) edges.push(['crl', 'c0'], ['crl', 'c1'], ['crl', 'c2']);
  else edges.push(['crl', 'c0'], ['crl', 'c1']);

  const verdictOf = (id: NodeId) => {
    if (phase !== 'verdict' || !handshakes || !['c0', 'c1', 'c2'].includes(id)) return undefined;
    return handshakes.find((h) => h.client === clients[Number(id[1])])?.accepted;
  };

  // the real values of this run, per step
  const fact = (): string | null => {
    const { pki, leaf } = data;
    switch (phase) {
      case 'ceremony':
        if (!pki) return null;
        if (pki.cosigners) return t('overview.fact.ceremonyMtc', { alg: pki.cosigners[0].alg, pk: f.n(pki.cosigners[0].publicKeyBytes) });
        return t('overview.fact.ceremony', { alg: ALGS[p.root].name, pk: f.n(pki.root!.parsed.publicKey.length), root: f.n(pki.root!.der.length), issuing: f.n(pki.issuing!.der.length) });
      case 'request':
        if (!leaf) return null;
        return t('overview.fact.request', { alg: ALGS[p.leaf].name, ms: f.ms(leaf.timings.keygen), csr: f.n(leaf.csrBytes) });
      case 'validate':
        if (!leaf?.acme) return null;
        return t('overview.fact.validate', {
          name: leaf.acme.txtName, value: `${leaf.acme.txtValue.slice(0, 12)}…`, n: leaf.acme.perspectives.length,
          caa: t(leaf.acme.caa.checked ? (leaf.acme.caa.ok ? 'overview.fact.caaOk' : 'overview.fact.caaBad') : 'overview.fact.caaPrivate'),
        });
      case 'issue':
        if (!leaf) return null;
        if (leaf.mtc) return t('overview.fact.issueMtc', { lr: f.n(leaf.mtc.landmark.der.length), sa: f.n(leaf.mtc.standalone.der.length), hashes: leaf.mtc.proofHashes, size: f.n(leaf.mtc.logSize) });
        return t(priv ? 'overview.fact.issuePrivate' : 'overview.fact.issueWeb', { bytes: f.n(leaf.leaf.der.length), alg: ALGS[p.intermediate].short });
      case 'handshake': {
        // the client that supports the profile best (current client / browser with MTC landmark)
        const h = handshakes?.find((x) => x.client === 'modern' || x.client === 'browserMtc') ?? handshakes?.find((x) => x.validation.path.length > 0);
        if (!h) return null;
        return t('overview.fact.handshake', { tcp: f.n(h.tls.transport.tcpServerBytes), quic: f.n(h.tls.transport.quicServerBytes), limit: f.n(h.tls.transport.quicLimit) });
      }
      case 'verdict':
        if (!handshakes) return null;
        return handshakes.map((h) => `${t(`clients.${h.client}.name`)} ${h.accepted ? '✓' : '✗'}`).join(' · ');
      default: return null;
    }
  };
  const factText = fact();

  return (
    <figure className="rounded-xl border border-[var(--color-glass-border)] bg-[var(--color-bg-surface)]/70 p-3 sm:p-4">
      <svg viewBox={`0 0 ${L.w} ${L.h}`} className="w-full h-auto" role="img" aria-label={t('overview.aria')}>
        {edges.map(([a, b]) => {
          const on = moves[phase].some((m) => (m.from === a && m.to === b) || (m.from === b && m.to === a));
          return <polyline key={`${a}-${b}`} points={route(L, a, b).map((q) => q.join(',')).join(' ')} fill="none"
            stroke={on ? '#06b6d4' : '#1e3a5f'} strokeWidth={on ? 1.6 : 1} strokeDasharray={on ? undefined : '3 4'} />;
        })}
        {(Object.keys(L.nodes) as NodeId[]).filter((id) => id !== 'mallory' || attacker).map((id) => {
          const [x, y, w, h] = L.nodes[id];
          const { title, sub, alg } = label(id);
          const v = verdictOf(id);
          const active = activeNodes.has(id);
          const stroke = id === 'mallory' ? '#f87171' : v === true ? '#34d399' : v === false ? '#f87171' : active ? '#06b6d4' : '#1e3a5f';
          const small = narrow && id.startsWith('c');
          return (
            <g key={id}>
              <rect x={x} y={y} width={w} height={h} rx={8} fill={id === 'mallory' ? '#1a0b10' : '#060b16'}
                stroke={stroke} strokeWidth={active || v !== undefined ? 1.8 : 1} />
              {/* HTML inside the box: titles shrink to fit (or wrap), subtitles wrap — nothing is cut off */}
              <foreignObject x={x + 1} y={y + 1} width={w - 2} height={h - 2}>
                <div className="flex h-full flex-col px-2 py-1.5 leading-tight">
                  <div className="flex items-start gap-1">
                    <FitText text={title} base={small ? 10.5 : 12} min={9} refitKey={String(v)} className="font-mono font-semibold text-[#e2e8f0]" />
                    {v !== undefined && <span className={`shrink-0 font-bold ${v ? 'text-emerald-400' : 'text-red-400'}`}>{v ? '✓' : '✗'}</span>}
                  </div>
                  <span className={`mt-0.5 text-[#94a3b8] ${small ? 'text-[9px]' : narrow ? 'text-[10px]' : 'text-[10.5px]'}`}>{sub}</span>
                  {alg && <span className="mt-auto flex"><FitText text={alg} base={10.5} min={8.5} className="font-mono text-[var(--color-primary)]" /></span>}
                </div>
              </foreignObject>
            </g>
          );
        })}
        {!reduced && moves[phase].map((m, i) => {
          const fr = (now - m.delay) / DURATION;
          if (fr < 0 || fr >= 1) return null;                      // not yet started, or arrived
          const e = fr < 0.5 ? 2 * fr * fr : 1 - (-2 * fr + 2) ** 2 / 2;   // ease in-out
          const [x, y] = pointAt(route(L, m.from, m.to), e);
          const w = Math.max(34, m.label.length * 7 + 14);
          return (
            <g key={`${phase}-${i}`}>
              <rect x={x - w / 2} y={y - 10} width={w} height={20} rx={10} fill="#06b6d4" />
              <text x={x} y={y + 4} textAnchor="middle" fill="#030712" fontSize={11} fontFamily="'JetBrains Mono',monospace" fontWeight="700">{m.label}</text>
            </g>
          );
        })}
      </svg>

      <figcaption className="mt-3 flex flex-col gap-3">
        <ol className="flex flex-wrap gap-1.5" aria-label={t('overview.steps')}>
          {PHASES.map((ph, i) => (
            <li key={ph} aria-current={i === step ? 'step' : undefined}
              className={`rounded-full border px-2.5 py-0.5 font-mono text-[0.7rem] ${i === step
                ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
                : i < step ? 'border-[var(--color-border)] text-[var(--color-text-base)]' : 'border-[var(--color-border-dim)] text-[var(--color-text-muted)]'}`}>
              {i + 1} {t(`overview.phase.${ph}.short`)}
            </li>
          ))}
        </ol>
        <div aria-live="polite" className="flex min-h-[4.5rem] flex-col gap-1.5">
          {phase === 'idle' ? (
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{t('overview.idleText')}</p>
          ) : (
            <>
              <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
                <span className="font-semibold text-[var(--color-text-base)]">{t('overview.stepOf', { n: step + 1, total: PHASES.length })} · {t(`overview.phase.${phase}.short`)}: </span>
                {phase === 'verdict'
                  ? t('overview.verdictText', { accepted: handshakes?.filter((h) => h.accepted).length ?? 0, total: handshakes?.length ?? 3 })
                  : t(`overview.phase.${phase}.${kind}`)}
              </p>
              <p className="font-mono text-xs text-[var(--color-primary)] break-words">
                {busy || !factText ? <span className="text-[var(--color-text-muted)]">{t('overview.running')}</span> : factText}
              </p>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {phase === 'idle' ? (
            <button type="button" onClick={onStart} disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2 font-mono text-sm font-semibold text-[var(--color-bg-base)] hover:opacity-90 disabled:opacity-50">
              ▶ {t('overview.start')}
            </button>
          ) : (
            <>
              <button type="button" onClick={onBack} disabled={busy || step === 0}
                className="rounded-lg border border-[var(--color-border)] px-4 py-2 font-mono text-sm text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] disabled:opacity-40">
                ← {t('overview.back')}
              </button>
              {step < PHASES.length - 1 ? (
                <button type="button" onClick={onNext} disabled={busy}
                  className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2 font-mono text-sm font-semibold text-[var(--color-bg-base)] hover:opacity-90 disabled:opacity-50">
                  {busy && <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" />}
                  {t('overview.next')} →
                </button>
              ) : (
                <button type="button" onClick={onStart} disabled={busy}
                  className="rounded-lg bg-[var(--color-primary)] px-5 py-2 font-mono text-sm font-semibold text-[var(--color-bg-base)] hover:opacity-90 disabled:opacity-50">
                  ↺ {t('overview.restart')}
                </button>
              )}
              <a href="#ceremony" className="ml-1 font-mono text-xs text-[var(--color-primary)] hover:underline">{t('overview.toDetails')}</a>
            </>
          )}
        </div>
      </figcaption>
    </figure>
  );
}
