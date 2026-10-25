'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import type { TimelineEvent, TimelineCategory } from '@/lib/parseTimeline';

type Category = TimelineCategory;
type TEvent   = TimelineEvent;

// ─── Layout constants ─────────────────────────────────────────────────────────

const START_YEAR  = 1993.5;
const END_YEAR    = 2041.5;
// Two-speed axis: the sparse early decades are compressed, the dense
// period from 2021 onward gets enough room for its cards.
const BREAK_YEAR      = 2021.5;
const PX_PER_YEAR_OLD = 40;
const PX_PER_YEAR     = 150;
const PAD_L       = 64;
const AXIS_Y      = 316;
const TRACK_H     = 610;
const DOT_R       = 7;
const CARD_W      = 148;
const CARD_H      = 80;
const STEM_BASE   = 20;
const STEM_STEP   = 88;   // > CARD_H, so cards on neighbouring levels never overlap
const MAX_LEVEL   = 3;    // levels per side that fit inside TRACK_H
const now = new Date();
const NOW_YEAR = now.getFullYear() + now.getMonth() / 12;
const CURRENT_YEAR = now.getFullYear();
const BREAK_X     = (BREAK_YEAR - START_YEAR) * PX_PER_YEAR_OLD;
const TOTAL_W     = Math.ceil(BREAK_X + (END_YEAR - BREAK_YEAR) * PX_PER_YEAR) + PAD_L + 48;

function xPos(year: number): number {
  const offset = year <= BREAK_YEAR
    ? (year - START_YEAR) * PX_PER_YEAR_OLD
    : BREAK_X + (year - BREAK_YEAR) * PX_PER_YEAR;
  return Math.round(offset) + PAD_L;
}

// ─── Category config ──────────────────────────────────────────────────────────

const CAT: Record<Category, { dot: string; glow: string; bg: string; labelDe: string; labelEn: string }> = {
  HISTORY:    { dot: '#06b6d4', glow: 'rgba(6,182,212,0.5)',   bg: 'rgba(6,182,212,0.10)',   labelDe: 'Geschichte',  labelEn: 'History'    },
  STANDARD:   { dot: '#10b981', glow: 'rgba(16,185,129,0.5)',  bg: 'rgba(16,185,129,0.10)',  labelDe: 'Standard',    labelEn: 'Standard'   },
  HARDWARE:   { dot: '#8b5cf6', glow: 'rgba(139,92,246,0.5)',  bg: 'rgba(139,92,246,0.10)',  labelDe: 'Hardware',    labelEn: 'Hardware'   },
  REGULATION: { dot: '#f59e0b', glow: 'rgba(245,158,11,0.5)',  bg: 'rgba(245,158,11,0.10)',  labelDe: 'Regulatorik', labelEn: 'Regulation' },
  ESTIMATE:   { dot: '#f97316', glow: 'rgba(249,115,22,0.5)',  bg: 'rgba(249,115,22,0.10)',  labelDe: 'Prognose',    labelEn: 'Estimate'   },
  INDUSTRY:   { dot: '#ec4899', glow: 'rgba(236,72,153,0.5)',  bg: 'rgba(236,72,153,0.10)',  labelDe: 'Industrie',   labelEn: 'Industry'   },
};

// ─── Lane assignment ──────────────────────────────────────────────────────────

interface Lane { side: 'top' | 'bottom'; level: number; }

function assignLanes(events: TEvent[]): Lane[] {
  const result: Lane[] = [];
  const taken: Record<string, number> = {};

  for (let i = 0; i < events.length; i++) {
    const x = xPos(events[i].year);
    const prefer: Array<'top' | 'bottom'> = i % 2 === 0 ? ['top', 'bottom'] : ['bottom', 'top'];
    let placed = false;

    outer: for (const side of prefer) {
      for (let lv = 1; lv <= MAX_LEVEL; lv++) {
        const key = `${side}-${lv}`;
        if (x >= (taken[key] ?? -999) + 10) {
          result.push({ side, level: lv });
          taken[key] = x + CARD_W;
          placed = true;
          break outer;
        }
      }
    }
    if (!placed) result.push({ side: 'top', level: MAX_LEVEL });
  }
  return result;
}

// LANES computed inside component from props

// ─── Q-Day slider ─────────────────────────────────────────────────────────────

const QDAY_MIN = 2028;
const QDAY_MAX = 2040;

const QDAY_LABELS: Array<{ year: number; de: string; en: string }> = [
  { year: 2028, de: 'Pessimistisches Szenario, noch vor den Zieljahren von Google und Cloudflare', en: 'Pessimistic scenario, ahead of Google\'s and Cloudflare\'s target year' },
  { year: 2029, de: 'Gartner: asymmetrische Kryptografie ab hier unsicher; Zieljahr von Google und Cloudflare', en: 'Gartner: asymmetric cryptography unsafe from here; Google\'s and Cloudflare\'s target year' },
  { year: 2030, de: 'NIST will RSA und ECC ab hier abkündigen; EU-Frist für Hochrisiko-Systeme',      en: 'NIST plans to deprecate RSA and ECC; EU deadline for high-risk systems' },
  { year: 2031, de: '50 % Wahrscheinlichkeit nach Michele Mosca (Schätzung von 2015)',           en: '50% probability according to Michele Mosca (2015 estimate)' },
  { year: 2033, de: 'CNSA 2.0: die meisten US-Systemklassen nur noch quantensicher',             en: 'CNSA 2.0: most US system categories quantum-safe only' },
  { year: 2034, de: 'Gartner: asymmetrische Kryptografie ab hier vollständig brechbar',          en: 'Gartner: asymmetric cryptography fully breakable from here' },
  { year: 2036, de: 'GRI-Umfrage 2026: 28 bis 49 % Wahrscheinlichkeit für einen CRQC bis hier', en: 'GRI survey 2026: 28 to 49% probability of a CRQC by here' },
  { year: 2040, de: 'Konservative Obergrenze des BSI (Stand Ende 2024)',                       en: 'Conservative upper bound from the BSI (as of late 2024)' },
];

function getQdayLabel(year: number, locale: string): string {
  const entry = [...QDAY_LABELS].sort((a, b) => Math.abs(a.year - year) - Math.abs(b.year - year))[0];
  return locale === 'en' ? entry.en : entry.de;
}

// ─── Year axis ticks ──────────────────────────────────────────────────────────

const TICK_YEARS = [1994, 2000, 2005, 2010, 2015, 2020, 2022, 2024, 2026, 2028, 2030, 2032, 2034, 2036, 2038, 2040];

// ─── Component ────────────────────────────────────────────────────────────────

export default function HndlTimelineClient({ events, locale }: { events: TEvent[]; locale: string }) {
  const en = locale === 'en';
  const lanes = useMemo(() => assignLanes(events), [events]);
  const [activeCategories, setActiveCategories] = useState<Set<Category>>(
    new Set<Category>(Object.keys(CAT) as Category[]),
  );
  const [qdayYear, setQdayYear] = useState(2030);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to show NOW marker on mount
  useEffect(() => {
    if (scrollRef.current) {
      const nowX = xPos(NOW_YEAR);
      const halfW = scrollRef.current.clientWidth / 2;
      scrollRef.current.scrollLeft = Math.max(0, nowX - halfW);
    }
  }, []);

  function toggleCategory(cat: Category) {
    setActiveCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) {
        if (next.size > 1) next.delete(cat);
      } else {
        next.add(cat);
      }
      return next;
    });
  }

  function handleEventClick(i: number) {
    setSelectedIdx(prev => (prev === i ? null : i));
  }

  const selected = selectedIdx !== null ? events[selectedIdx] : null;

  // Q-Day zone x-coordinates
  const qdayZoneX1 = xPos(QDAY_MIN);
  const qdayZoneX2 = xPos(QDAY_MAX + 0.5);
  const qdayMarkerX = xPos(qdayYear);
  const nowX = xPos(NOW_YEAR);

  return (
    <section className="border-b border-[var(--color-border)]">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="mb-10">
          <p className="mono-label text-[var(--color-primary)] mb-3">
            // harvest now, decrypt later
          </p>
          <h2 className="gradient-text text-2xl sm:text-3xl font-bold mb-4">
            Q-Day Timeline
          </h2>
          <p className="text-[var(--color-text-muted)] text-sm max-w-2xl leading-relaxed">
            {en
              ? 'From Shor\'s algorithm to the NIST standards and regulatory deadlines. Nobody knows exactly when a cryptographically relevant quantum computer will exist. What we do know is that large organisations typically need many years for a full migration, so waiting for certainty means starting too late.'
              : 'Von Shors Algorithmus bis zu den NIST-Standards und regulatorischen Fristen. Wann es einen kryptografisch relevanten Quantencomputer gibt, weiß niemand genau. Sicher ist nur, dass eine vollständige Migration in großen Organisationen viele Jahre dauert. Wer auf Gewissheit wartet, fängt zu spät an.'}
          </p>
        </div>

        {/* ── Category filter pills ────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2 mb-5" role="group" aria-label={en ? 'Filter categories' : 'Kategorien filtern'}>
          {(Object.keys(CAT) as Category[]).map(cat => {
            const active = activeCategories.has(cat);
            return (
              <button
                key={cat}
                onClick={() => toggleCategory(cat)}
                aria-pressed={active}
                className="flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-wider border transition-all duration-150"
                style={{
                  borderColor: active ? `${CAT[cat].dot}80` : 'rgba(255,255,255,0.07)',
                  background:  active ? CAT[cat].bg       : 'transparent',
                  color:       active ? CAT[cat].dot      : 'var(--color-text-dim)',
                }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-none transition-opacity"
                  style={{ background: CAT[cat].dot, opacity: active ? 1 : 0.35 }}
                />
                {en ? CAT[cat].labelEn : CAT[cat].labelDe}
              </button>
            );
          })}
        </div>

        {/* ── Timeline track ───────────────────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="relative rounded-xl glass-panel overflow-x-auto overflow-y-hidden"
          style={{ height: TRACK_H }}
          role="region"
          aria-label={en ? 'Interactive Q-Day Timeline — scroll horizontally' : 'Interaktive Q-Day Timeline — horizontal scrollbar'}
        >
          {/* Scroll hint overlay (fades on hover) */}
          <div
            className="absolute inset-y-0 right-0 w-16 pointer-events-none z-20 transition-opacity duration-300"
            style={{ background: 'linear-gradient(to left, rgba(3,7,18,0.6), transparent)' }}
            aria-hidden="true"
          />

          {/* Inner canvas */}
          <div className="relative" style={{ width: TOTAL_W, height: TRACK_H }}>

            {/* Q-Day danger zone */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{
                left:        qdayZoneX1,
                width:       qdayZoneX2 - qdayZoneX1,
                background:  'linear-gradient(to right, rgba(249,115,22,0.03) 0%, rgba(239,68,68,0.08) 50%, rgba(249,115,22,0.03) 100%)',
                borderLeft:  '1px dashed rgba(249,115,22,0.22)',
                borderRight: '1px dashed rgba(249,115,22,0.22)',
              }}
              aria-hidden="true"
            />

            {/* Q-Day zone label */}
            <div
              className="absolute font-mono text-[9px] uppercase tracking-widest pointer-events-none"
              style={{
                left:  qdayZoneX1 + 8,
                top:   AXIS_Y - 26,
                color: 'rgba(249,115,22,0.45)',
              }}
              aria-hidden="true"
            >
              {en ? 'Q-Day window' : 'Q-Day-Fenster'}
            </div>

            {/* Q-Day marker line (slider position) */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: qdayMarkerX, width: 1, zIndex: 4 }}
              aria-hidden="true"
            >
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(to bottom, transparent 0%, rgba(249,115,22,0.75) 18%, rgba(249,115,22,0.75) 82%, transparent 100%)',
                }}
              />
              <div
                className="absolute font-mono text-[9px] whitespace-nowrap px-1.5 py-0.5 rounded"
                style={{
                  top:        6,
                  left:       7,
                  background: 'rgba(249,115,22,0.14)',
                  border:     '1px solid rgba(249,115,22,0.38)',
                  color:      '#fb923c',
                }}
              >
                Q-Day ~{qdayYear}
              </div>
            </div>

            {/* NOW marker */}
            <div
              className="absolute top-0 bottom-0 pointer-events-none"
              style={{ left: nowX, width: 1, zIndex: 5 }}
              aria-hidden="true"
            >
              <div
                className="absolute inset-0"
                style={{
                  background: 'linear-gradient(to bottom, transparent 0%, rgba(6,182,212,0.85) 18%, rgba(6,182,212,0.85) 82%, transparent 100%)',
                }}
              />
              <div
                className="absolute font-mono text-[9px] whitespace-nowrap px-1.5 py-0.5 rounded"
                style={{
                  bottom:     TRACK_H - AXIS_Y + 10,
                  left:       7,
                  background: 'rgba(6,182,212,0.13)',
                  border:     '1px solid rgba(6,182,212,0.38)',
                  color:      '#06b6d4',
                }}
              >
                {en ? '// NOW' : '// Heute'}
              </div>
            </div>

            {/* Axis line */}
            <div
              className="absolute left-0 right-0"
              style={{
                top:        AXIS_Y,
                height:     1,
                background: 'rgba(255,255,255,0.07)',
              }}
              aria-hidden="true"
            />

            {/* Axis break: the scale changes here */}
            <div
              className="absolute font-mono text-[11px] pointer-events-none"
              style={{
                left:      xPos(BREAK_YEAR),
                top:       AXIS_Y - 9,
                transform: 'translateX(-50%)',
                color:     'var(--color-text-muted)',
                background: 'var(--color-bg-surface)',
                padding:   '0 2px',
              }}
              title={en ? 'Scale changes here' : 'Ab hier anderer Maßstab'}
              aria-hidden="true"
            >
              ≈
            </div>

            {/* Year ticks + labels */}
            {TICK_YEARS.map(yr => {
              const x = xPos(yr);
              return (
                <div
                  key={yr}
                  className="absolute pointer-events-none"
                  style={{ left: x, top: AXIS_Y }}
                  aria-hidden="true"
                >
                  <div
                    style={{
                      width:      1,
                      height:     12,
                      marginLeft: -0.5,
                      background: 'rgba(255,255,255,0.14)',
                    }}
                  />
                  <div
                    className="font-mono text-[10px]"
                    style={{
                      marginTop:       4,
                      transform:       'translateX(-50%)',
                      color:           'var(--color-text-dim)',
                      userSelect:      'none',
                    }}
                  >
                    {yr}
                  </div>
                </div>
              );
            })}

            {/* ── Event nodes ─────────────────────────────────────────────── */}
            {events.map((ev, i) => {
              if (!activeCategories.has(ev.category)) return null;

              const lane      = lanes[i];
              const x         = xPos(ev.year);
              const isTop     = lane.side === 'top';
              const stemH     = STEM_BASE + (lane.level - 1) * STEM_STEP;
              const isActive  = selectedIdx === i;
              const c         = CAT[ev.category];

              const stemTop   = isTop ? AXIS_Y - DOT_R - stemH : AXIS_Y + DOT_R;
              const cardTop   = isTop ? AXIS_Y - DOT_R - stemH - CARD_H : AXIS_Y + DOT_R + stemH;
              const cardLeft  = Math.max(8, Math.min(x - CARD_W / 2, TOTAL_W - CARD_W - 8));

              return (
                <div key={i} style={{ position: 'absolute', left: 0, top: 0 }}>
                  {/* Stem */}
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left:       x - 0.5,
                      top:        stemTop,
                      width:      1,
                      height:     stemH,
                      background: `linear-gradient(to ${isTop ? 'top' : 'bottom'}, ${c.dot}aa, ${c.dot}18)`,
                    }}
                    aria-hidden="true"
                  />

                  {/* Dot */}
                  <button
                    onClick={() => handleEventClick(i)}
                    className="absolute rounded-full transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                    style={{
                      left:             x - DOT_R,
                      top:              AXIS_Y - DOT_R,
                      width:            DOT_R * 2,
                      height:           DOT_R * 2,
                      background:       c.dot,
                      boxShadow:        isActive
                        ? `0 0 0 3px rgba(255,255,255,0.12), 0 0 14px ${c.glow}`
                        : `0 0 0 2px rgba(255,255,255,0.06), 0 0 7px ${c.dot}55`,
                      zIndex:           isActive ? 30 : 12,
                      transform:        isActive ? 'scale(1.3)' : 'scale(1)',
                    }}
                    aria-label={`${ev.label}: ${ev.title}`}
                    aria-pressed={isActive}
                  />

                  {/* Card */}
                  <button
                    onClick={() => handleEventClick(i)}
                    className="absolute rounded-lg text-left transition-all duration-150 focus-visible:outline-none"
                    style={{
                      left:           cardLeft,
                      top:            cardTop,
                      width:          CARD_W,
                      height:         CARD_H,
                      padding:        '8px 10px',
                      background:     isActive ? c.bg : 'rgba(15,23,42,0.72)',
                      border:         `1px solid ${isActive ? `${c.dot}70` : 'rgba(255,255,255,0.06)'}`,
                      backdropFilter: 'blur(8px)',
                      WebkitBackdropFilter: 'blur(8px)',
                      zIndex:         isActive ? 25 : 9,
                      boxShadow:      isActive ? `0 4px 24px ${c.dot}22` : 'none',
                    }}
                    aria-label={`${ev.label}: ${ev.title}`}
                  >
                    {/* Category dot + year */}
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full flex-none"
                        style={{ background: c.dot }}
                      />
                      <span
                        className="font-mono text-[9px] uppercase tracking-wider truncate"
                        style={{ color: c.dot }}
                      >
                        {ev.label}
                      </span>
                    </div>
                    {/* Title */}
                    <p
                      className="text-[11px] font-semibold leading-tight line-clamp-2"
                      style={{ color: isActive ? '#e2e8f0' : '#94a3b8' }}
                    >
                      {ev.title}
                    </p>
                    {/* Caveat indicator */}
                    {ev.caveat && (
                      <span
                        className="mt-1 inline-block font-mono text-[9px]"
                        style={{ color: '#fbbf24', opacity: 0.75 }}
                        aria-label="Einschränkung vorhanden"
                      >
                        ⚠
                      </span>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Scroll hint */}
        <p className="mt-2 text-center mono-label text-[var(--color-text-muted)] sm:hidden">
          {en ? '← scroll →' : '← scrollen →'}
        </p>

        {/* ── Detail panel ─────────────────────────────────────────────────── */}
        <div
          className="mt-4 rounded-xl overflow-hidden transition-all duration-200"
          style={{
            background:   selected ? 'rgba(15,23,42,0.55)' : 'transparent',
            border:       selected ? '1px solid rgba(6,182,212,0.14)' : '1px solid transparent',
            backdropFilter: selected ? 'blur(12px)' : 'none',
          }}
        >
          {selected ? (
            <div className="p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider"
                    style={{
                      background: CAT[selected.category].bg,
                      color:      CAT[selected.category].dot,
                      border:     `1px solid ${CAT[selected.category].dot}40`,
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full flex-none"
                      style={{ background: CAT[selected.category].dot }}
                    />
                    {en ? CAT[selected.category].labelEn : CAT[selected.category].labelDe}
                  </span>
                  <span className="font-mono text-xs text-[var(--color-text-muted)]">
                    {selected.label}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedIdx(null)}
                  className="text-xl leading-none text-[var(--color-text-muted)] hover:text-[var(--color-text-base)] transition-colors flex-none mt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                  aria-label={en ? 'Close detail' : 'Detail schließen'}
                >
                  ×
                </button>
              </div>

              <h3 className="mt-3 text-base font-semibold text-[var(--color-text-base)]">
                {selected.title}
              </h3>
              <p className="mt-2 text-sm text-[var(--color-text-muted)] leading-relaxed">
                {selected.desc}
              </p>

              {selected.caveat && (
                <div
                  className="mt-3 rounded-lg px-3 py-2.5"
                  style={{
                    background: 'rgba(245,158,11,0.07)',
                    border:     '1px solid rgba(245,158,11,0.22)',
                  }}
                >
                  <p className="font-mono text-[10px] uppercase tracking-wider text-[#f59e0b] opacity-70 mb-1">
                    {en ? '⚠ Caveat' : '⚠ Einordnung'}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                    {selected.caveat}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="px-5 py-4">
              <p className="font-mono text-xs text-[var(--color-text-muted)]">
                {en ? '// click an event for details' : '// Ereignis anklicken für Details'}
              </p>
            </div>
          )}
        </div>

        {/* ── Q-Day slider ─────────────────────────────────────────────────── */}
        <div className="mt-4 rounded-xl glass-panel p-5">
          <div className="flex items-center justify-between mb-1">
            <p className="mono-label text-[var(--color-text-muted)]">{en ? 'Adjust Q-Day estimate' : 'Q-Day Schätzung verschieben'}</p>
            <span className="font-mono text-lg font-bold" style={{ color: '#fb923c' }}>
              {qdayYear}
            </span>
          </div>

          <input
            type="range"
            min={QDAY_MIN}
            max={QDAY_MAX}
            step={1}
            value={qdayYear}
            onChange={e => setQdayYear(Number(e.target.value))}
            className="w-full accent-orange-400 mt-3"
            aria-label={en ? `Q-Day estimate: ${qdayYear}` : `Q-Day Schätzung: ${qdayYear}`}
          />

          <div className="flex justify-between mt-1 font-mono text-[10px] text-[var(--color-text-muted)]">
            <span>{QDAY_MIN}</span>
            <span>{QDAY_MAX}</span>
          </div>

          <p className="mt-3 text-xs text-[var(--color-text-muted)] leading-relaxed">
            <span className="font-semibold" style={{ color: '#fb923c' }}>{qdayYear}:</span>{' '}
            {getQdayLabel(qdayYear, locale)}
          </p>

          <div
            className="mt-4 flex items-start gap-3 rounded-lg px-4 py-3"
            style={{
              background: 'rgba(239,68,68,0.07)',
              border:     '1px solid rgba(239,68,68,0.25)',
            }}
          >
            <span className="text-red-400 text-base leading-none mt-0.5 flex-none">⚠</span>
            <p className="text-sm font-semibold text-red-300 leading-snug">
              {en
                ? <>Whenever Q-Day arrives, data you send <span className="text-red-200">today</span> is already exposed.</>
                : <>Egal, wann Q-Day kommt: Was du <span className="text-red-200">heute</span> verschickst, ist schon jetzt gefährdet.</>}
              <span className="block mt-1 text-xs font-normal text-red-400/80">
                {en
                  ? `Traffic recorded today can be decrypted after Q-Day. If Q-Day came in ${qdayYear}, anything that must stay confidential for more than ${Math.max(qdayYear - CURRENT_YEAR, 0)} years would already be affected.`
                  : `Wer heute mitschneidet, kann nach Q-Day entschlüsseln. Käme Q-Day ${qdayYear}, wäre alles schon jetzt betroffen, was länger als ${Math.max(qdayYear - CURRENT_YEAR, 0)} Jahre vertraulich bleiben muss.`}
              </span>
            </p>
          </div>
        </div>

      </div>
    </section>
  );
}
