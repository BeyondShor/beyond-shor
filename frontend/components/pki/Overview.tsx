'use client';

// Animated overview: the same steps the lab runs, as packets moving between the
// parties. The animation follows the real work (key ceremony, request, ACME,
// issuance, handshake); the details below are filled by the same run.
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslations } from 'next-intl';
import { ALGS, PRIVATE_CLIENTS, PROFILES, WEB_CLIENTS, type ProfileId } from '@/lib/pki/meta';
import type { HandshakeView } from '@/lib/pki/worker-types';

export type Phase = 'idle' | 'ceremony' | 'request' | 'validate' | 'issue' | 'handshake' | 'verdict';
export const PHASES: Phase[] = ['ceremony', 'request', 'validate', 'issue', 'handshake', 'verdict'];

type NodeId = 'root' | 'issuing' | 'ra' | 'dns' | 'aux' | 'crl' | 'server' | 'mallory' | 'c0' | 'c1' | 'c2';
type Box = [number, number, number, number];
type Pt = [number, number];

interface Layout { w: number; h: number; nodes: Record<NodeId, Box>; routes: Record<string, Pt[]> }

// Orthogonal routes through the gaps between boxes, so no line runs through a party
// it doesn't concern. Pairs not listed are drawn as straight lines.
const WIDE: Layout = {
  w: 640, h: 468,
  nodes: {
    root: [16, 16, 184, 58], dns: [228, 16, 184, 58], aux: [440, 16, 184, 58],
    issuing: [16, 122, 184, 58], ra: [228, 122, 184, 58], crl: [440, 122, 184, 58],
    server: [228, 228, 184, 58], mallory: [228, 310, 184, 46],
    c0: [16, 398, 184, 58], c1: [228, 398, 184, 58], c2: [440, 398, 184, 58],
  },
  routes: {
    'server>dns': [[320, 257], [426, 257], [426, 45], [320, 45]],
    'issuing>aux': [[108, 151], [108, 98], [532, 98], [532, 45]],
    'root>server': [[108, 45], [214, 45], [214, 257], [320, 257]],
    'server>c0': [[320, 257], [320, 378], [108, 378], [108, 427]],
    'server>c1': [[320, 257], [320, 427]],
    'server>c2': [[320, 257], [320, 378], [532, 378], [532, 427]],
    'crl>c0': [[532, 151], [632, 151], [632, 388], [92, 388], [92, 427]],
    'crl>c1': [[532, 151], [632, 151], [632, 388], [336, 388], [336, 427]],
    'crl>c2': [[532, 151], [632, 151], [632, 388], [548, 388], [548, 427]],
    'aux>c1': [[532, 45], [632, 45], [632, 388], [336, 388], [336, 427]],
  },
};
const NARROW: Layout = {
  w: 360, h: 556,
  nodes: {
    root: [8, 8, 168, 56], dns: [184, 8, 168, 56],
    issuing: [8, 96, 168, 56], ra: [184, 96, 168, 56],
    aux: [8, 184, 168, 56], crl: [184, 184, 168, 56],
    server: [96, 282, 168, 56], mallory: [96, 362, 168, 46],
    c0: [8, 466, 110, 76], c1: [125, 466, 110, 76], c2: [242, 466, 110, 76],
  },
  routes: {
    'server>ra': [[180, 310], [180, 168], [268, 168], [268, 124]],
    'server>dns': [[180, 310], [180, 80], [268, 80], [268, 36]],
    'issuing>server': [[92, 124], [180, 124], [180, 310]],
    'root>server': [[92, 36], [180, 36], [180, 310]],
    'server>c0': [[180, 310], [180, 448], [63, 448], [63, 504]],
    'server>c1': [[180, 310], [180, 504]],
    'server>c2': [[180, 310], [180, 448], [297, 448], [297, 504]],
    'crl>c0': [[268, 212], [356, 212], [356, 458], [50, 458], [50, 504]],
    'crl>c1': [[268, 212], [356, 212], [356, 458], [194, 458], [194, 504]],
    'crl>c2': [[268, 212], [356, 212], [356, 458], [311, 458], [311, 504]],
    'aux>c1': [[92, 212], [4, 212], [4, 458], [166, 458], [166, 504]],
  },
};

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

const DURATION = 1100;          // ms per packet
export const PHASE_MS = 2600;   // minimum time a phase stays on screen

function useNarrow() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia('(max-width: 639px)'); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia('(max-width: 639px)').matches,
    () => false,
  );
}

function useReducedMotion() {
  return useSyncExternalStore(
    (cb) => { const m = window.matchMedia('(prefers-reduced-motion: reduce)'); m.addEventListener('change', cb); return () => m.removeEventListener('change', cb); },
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    () => false,
  );
}

export default function Overview({ profileId, phase, attacker, handshakes, onStart, running, done }: {
  profileId: ProfileId; phase: Phase; attacker: boolean; handshakes: HandshakeView[] | null;
  onStart: () => void; running: boolean; done: boolean;
}) {
  const t = useTranslations('pkiLab');
  const narrow = useNarrow();
  const reduced = useReducedMotion();
  const L = narrow ? NARROW : WIDE;
  const p = PROFILES[profileId];
  const priv = p.scope === 'private';
  const clients = priv ? PRIVATE_CLIENTS : WEB_CLIENTS;
  const kind = p.mtc ? 'mtc' : priv ? 'private' : 'web';

  // packets per phase, read from the profile
  const moves: Record<Phase, Move[]> = {
    idle: [],
    ceremony: p.mtc
      ? [{ from: 'issuing', to: 'root', label: t('overview.pkt.cosignerKey'), delay: 0 }]
      : [{ from: 'root', to: 'issuing', label: t('overview.pkt.caCert'), delay: 0 }],
    request: [{ from: 'server', to: 'ra', label: 'CSR', delay: 0 }],
    validate: [
      { from: 'server', to: 'dns', label: 'TXT', delay: 0 },
      { from: 'ra', to: 'dns', label: t('overview.pkt.lookup'), delay: 900 },
    ],
    issue: p.mtc
      ? [{ from: 'root', to: 'issuing', label: t('overview.pkt.subtree'), delay: 0 },
         { from: 'issuing', to: 'root', label: t('overview.pkt.cosignature'), delay: 700 },
         { from: 'root', to: 'server', label: t('overview.pkt.cert'), delay: 1400 }]
      : priv
        ? [{ from: 'issuing', to: 'aux', label: t('overview.pkt.logEntry'), delay: 0 },
           { from: 'issuing', to: 'server', label: t('overview.pkt.cert'), delay: 600 }]
        : [{ from: 'issuing', to: 'aux', label: t('overview.pkt.precert'), delay: 0 },
           { from: 'aux', to: 'issuing', label: 'SCT', delay: 800 },
           { from: 'issuing', to: 'server', label: t('overview.pkt.cert'), delay: 1500 }],
    handshake: (['c0', 'c1', 'c2'] as const).map((c, i) => ({ from: 'server', to: c, label: t('overview.pkt.chain'), delay: i * 250 })),
    // revocation data: private clients fetch CRLs; browsers use pre-distributed data, the CLI tool checks nothing
    verdict: p.mtc ? [{ from: 'aux', to: 'c1', label: 'Landmark', delay: 0 }]
      : priv ? (['c0', 'c1', 'c2'] as const).map((c, i) => ({ from: 'crl', to: c, label: 'CRL', delay: i * 350 }))
        : (['c0', 'c1'] as const).map((c, i) => ({ from: 'crl', to: c, label: t('overview.pkt.revocation'), delay: i * 350 })),
  };

  const [now, setNow] = useState(0);
  const start = useRef(0);
  useEffect(() => {
    if (phase === 'idle' || reduced) return;
    start.current = performance.now();
    let raf = 0;
    const tick = () => {
      setNow(performance.now() - start.current);
      if (performance.now() - start.current < PHASE_MS + 200) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, reduced]);

  const activeNodes = new Set<NodeId>(moves[phase].flatMap((m) => [m.from, m.to]));
  if (phase === 'ceremony') activeNodes.add('root');
  if (phase === 'request') activeNodes.add('server');

  const label = (id: NodeId): { title: string; sub: string; alg?: string } => {
    switch (id) {
      case 'root': return p.mtc ? { title: t('arch.mtcCa'), sub: t('overview.sub.mtcCa'), alg: ALGS.mldsa44.name } : { title: t(priv ? 'arch.rootPrivate' : 'arch.rootWeb'), sub: t('arch.rootSub'), alg: ALGS[p.root].name };
      case 'issuing': return p.mtc ? { title: t('arch.mirror'), sub: t('arch.mirrorSub'), alg: ALGS.mldsa44.name } : { title: t(priv ? 'arch.issuingPrivate' : 'arch.issuingWeb'), sub: t('overview.sub.issuing'), alg: ALGS[p.intermediate].name };
      case 'ra': return { title: t('overview.node.ra'), sub: t(priv ? 'overview.sub.raPrivate' : 'overview.sub.raWeb') };
      case 'dns': return { title: t('overview.node.dns'), sub: priv ? 'muster.example' : 'example.com' };
      case 'aux': return p.mtc ? { title: t('arch.updateChannel'), sub: t('arch.updateChannelSub') } : priv ? { title: t('arch.issuanceLog'), sub: t('arch.issuanceLogSub') } : { title: t('arch.ct'), sub: t('arch.ctSub') };
      case 'crl': return p.mtc ? { title: t('overview.node.noCrl'), sub: t('overview.sub.noCrl') } : { title: t('arch.crl'), sub: t('overview.sub.crl') };
      case 'server': return { title: t('arch.server'), sub: priv ? 'portal.muster.example' : 'shop.example.com', alg: ALGS[p.leaf].name };
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
    if (!handshakes || !['c0', 'c1', 'c2'].includes(id)) return undefined;
    return handshakes.find((h) => h.client === clients[Number(id[1])])?.accepted;
  };
  const accepted = handshakes?.filter((h) => h.accepted).length ?? 0;
  const stepIndex = PHASES.indexOf(phase);

  return (
    <figure className="rounded-xl border border-[var(--color-glass-border)] bg-[var(--color-bg-surface)]/70 p-3 sm:p-4">
      <svg viewBox={`0 0 ${L.w} ${L.h}`} className="w-full h-auto" role="img" aria-label={t('overview.aria')}>
        <defs>
          <marker id="pki-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
            <path d="M0,0 L6,3 L0,6 z" fill="#475569" />
          </marker>
        </defs>
        {edges.map(([a, b]) => {
          const on = moves[phase].some((m) => (m.from === a && m.to === b) || (m.from === b && m.to === a));
          return <polyline key={`${a}-${b}`} points={route(L, a, b).map((q) => q.join(',')).join(' ')} fill="none"
            stroke={on ? '#06b6d4' : '#1e3a5f'} strokeWidth={on ? 1.6 : 1} strokeDasharray={on ? undefined : '3 4'} />;
        })}
        {(Object.keys(L.nodes) as NodeId[]).filter((id) => id !== 'mallory' || attacker).map((id) => {
          const [x, y, w, h] = L.nodes[id];
          const { title, sub, alg } = label(id);
          const v = phase === 'verdict' || (phase === 'idle' && done) ? verdictOf(id) : undefined;
          const active = activeNodes.has(id);
          const stroke = id === 'mallory' ? '#f87171' : v === true ? '#34d399' : v === false ? '#f87171' : active ? '#06b6d4' : '#1e3a5f';
          const fs = narrow && id.startsWith('c') ? 10 : 12;
          return (
            <g key={id}>
              <rect x={x} y={y} width={w} height={h} rx={8} fill={id === 'mallory' ? '#1a0b10' : '#060b16'}
                stroke={stroke} strokeWidth={active || v !== undefined ? 1.8 : 1} />
              <text x={x + 8} y={y + 17} fill="#e2e8f0" fontSize={fs} fontFamily="'JetBrains Mono',monospace" fontWeight="600">{title}</text>
              <text x={x + 8} y={y + 31} fill="#94a3b8" fontSize={fs - 1.5} fontFamily="Inter,sans-serif">{sub}</text>
              {alg && <text x={x + 8} y={y + h - 8} fill="#06b6d4" fontSize={fs - 1.5} fontFamily="'JetBrains Mono',monospace">{alg}</text>}
              {v !== undefined && (
                <text x={x + w - 10} y={y + 18} textAnchor="end" fill={v ? '#34d399' : '#f87171'} fontSize={14} fontWeight="700">{v ? '✓' : '✗'}</text>
              )}
            </g>
          );
        })}
        {!reduced && moves[phase].map((m, i) => {
          const f = Math.max(0, Math.min(1, (now - m.delay) / DURATION));
          if (now < m.delay || f >= 1) return null;          // packets vanish on arrival
          const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;      // ease in-out
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
            <li key={ph} className={`rounded-full border px-2.5 py-0.5 font-mono text-[0.7rem] ${i === stepIndex
              ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]'
              : i < stepIndex || (phase === 'idle' && done) ? 'border-[var(--color-border)] text-[var(--color-text-base)]' : 'border-[var(--color-border-dim)] text-[var(--color-text-muted)]'}`}>
              {i + 1} {t(`overview.phase.${ph}.short`)}
            </li>
          ))}
        </ol>
        <div aria-live="polite" className="min-h-[3.5rem]">
          {phase === 'idle' ? (
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{t(done ? 'overview.doneText' : 'overview.idleText')}</p>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
              <span className="font-semibold text-[var(--color-text-base)]">{t(`overview.phase.${phase}.short`)}: </span>
              {phase === 'verdict'
                ? t('overview.verdictText', { accepted, total: handshakes?.length ?? 3 })
                : t(`overview.phase.${phase}.${kind}`)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={onStart} disabled={running}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2 font-mono text-sm font-semibold text-[var(--color-bg-base)] hover:opacity-90 disabled:opacity-50">
            {running ? <span className="h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden="true" /> : '▶'}
            {t(done && !running ? 'overview.replay' : 'overview.start')}
          </button>
          {done && !running && (
            <a href="#ceremony" className="font-mono text-xs text-[var(--color-primary)] hover:underline">{t('overview.toDetails')}</a>
          )}
        </div>
      </figcaption>
    </figure>
  );
}
