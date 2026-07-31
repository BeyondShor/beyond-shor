'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  risk, allTuples, SECURITY_GOALS,
  type RiskAsset, type RiskCell, type RiskItem, type RiskTuple,
} from '@/lib/shorsight';
import {
  Badge, Drawer, InfoTip, Panel, PanelTitle, Pill,
  RANK_FILL, RANK_STYLE,
} from './ui';

const REGIMES = ['quantum', 'acute'] as const;
type Regime = (typeof REGIMES)[number];

/* ─── risk management ─────────────────────────────────────────────────────── */

export default function RiskTab() {
  const t = useTranslations('cbom');
  const [openCell, setOpenCell] = useState<{ cell: RiskCell; regime: Regime } | null>(null);

  const { params, buckets, riskMatrix: matrix, items, assets, unknowns } = risk;
  const tuples   = allTuples(matrix);
  const findings = items.filter(i => i.category !== 'none');

  return (
    <div className="space-y-6">

      {/* ── what this is ──────────────────────────────────────────────────── */}
      <Panel>
        <PanelTitle>{t('riskTitle')}</PanelTitle>
        <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
          {t.rich('riskIntro', { b: c => <b className="text-[var(--color-text-base)]">{c}</b> })}
        </p>
      </Panel>

      {/* ── buckets ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RiskCard value={buckets.acute}   label={t('riskCardAcute')}   tone={buckets.acute ? 'text-red-400' : undefined}
          info={t.rich('riskInfoAcute', { b: c => <b>{c}</b>, br: () => <br /> })} />
        <RiskCard value={buckets.quantum} label={t('riskCardQuantum')} tone={buckets.quantum ? 'text-amber-400' : undefined}
          info={t.rich('riskInfoQuantum', {
            b: c => <b>{c}</b>, br: () => <br />,
            crqc: String(params.crqcYear), sig: String(params.crqcYearSignatures),
          })} />
        <RiskCard value={buckets.none}    label={t('riskCardNone')}    tone="text-emerald-400"
          info={t.rich('riskInfoNone', { b: c => <b>{c}</b>, br: () => <br /> })} />
        <RiskCard
          value={`${params.yearsUntilCrqc}${t('yearSuffix')}`}
          label={t('riskCardCrqc', { crqc: String(params.crqcYear), sig: String(params.crqcYearSignatures) })}
          info={t.rich('riskInfoCrqc', {
            b: c => <b>{c}</b>, br: () => <br />,
            crqc: String(params.crqcYear), sig: String(params.crqcYearSignatures),
            a: c => (
              <a href="https://blog.cloudflare.com/post-quantum-roadmap/" target="_blank" rel="noopener noreferrer"
                 className="text-[var(--color-primary)] underline underline-offset-2">{c}</a>
            ),
          })}
        />
      </div>

      {/* ── the two BSI 200-3 matrices ────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {REGIMES.map(regime => (
          <Matrix
            key={regime}
            regime={regime}
            onOpen={cell => setOpenCell({ cell, regime })}
          />
        ))}
      </div>

      {/* ── impact assessment ─────────────────────────────────────────────── */}
      <Panel>
        <PanelTitle>{t('impactTitle')}</PanelTitle>
        <p className="mb-4 text-xs leading-relaxed text-[var(--color-text-muted)]">
          {t.rich('impactIntro', {
            b: c => <b className="text-[var(--color-text-base)]">{c}</b>,
            code: c => <code className="font-mono text-[var(--color-primary)]">{c}</code>,
          })}
        </p>
        <div className="space-y-3">
          {assets.map(a => <AssetCard key={a.asset} asset={a} />)}
        </div>
      </Panel>

      {/* ── treatments ────────────────────────────────────────────────────── */}
      {tuples.length > 0 && (
        <Panel className="!p-0">
          <div className="border-b border-[var(--color-border)] p-4 sm:px-6">
            <PanelTitle>{t('treatmentTitle')}</PanelTitle>
            <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">
              {t.rich('treatmentIntro', { b: c => <b className="text-[var(--color-text-base)]">{c}</b> })}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  <Th>{t('colObject')}</Th>
                  <Th>{t('colRegime')}</Th>
                  <Th>{t('colRisk')}</Th>
                  <Th info={<InfoTip label={t('colImpact')}>{t.rich('impactInfo', { b: c => <b>{c}</b>, br: () => <br />, code: c => <code>{c}</code> })}</InfoTip>}>{t('colImpact')}</Th>
                  <Th info={<InfoTip label={t('colTreatment')}>{t.rich('treatmentInfo', { b: c => <b>{c}</b>, br: () => <br /> })}</InfoTip>}>{t('colTreatment')}</Th>
                  <Th>{t('colTreatmentNote')}</Th>
                  <Th>{t('colDecidedBy')}</Th>
                  <Th>{t('colMigration')}</Th>
                </tr>
              </thead>
              <tbody>
                {tuples.map(tp => (
                  <tr key={`${tp.regime}-${tp.asset}-${tp.component}`} className="border-b border-[var(--color-border-dim)] last:border-0">
                    <Td>
                      <span className="font-mono text-xs font-semibold text-[var(--color-text-base)]">{tp.component}</span>
                      <span className="mt-0.5 block font-mono text-[10px] text-[var(--color-text-muted)]">{tp.asset}</span>
                    </Td>
                    <Td><Badge tone={tp.regime === 'acute' ? 'unsafe' : 'weak'}>{t(`regime_${tp.regime}`)}</Badge></Td>
                    <Td>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] leading-4 ${RANK_STYLE[tp.categoryRank]}`}>
                        {t(`category_${tp.categoryRank}`)}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs tabular-nums text-[var(--color-text-base)]">{tp.impactLevel}</span>
                      {tp.impactState === 'provisional' && (
                        <span title={t('provisionalTitle')} className="text-[var(--color-text-muted)]"> ~</span>
                      )}
                    </Td>
                    <Td>
                      {tp.treatment
                        ? <Pill>{t(`treatment_${tp.treatment}`)}</Pill>
                        : <span className="font-mono text-[11px] text-[var(--color-text-muted)]">—</span>}
                    </Td>
                    <Td className="max-w-xs">
                      <span className="text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                        <TreatmentNote tuple={tp} />
                      </span>
                    </Td>
                    <Td><span className="font-mono text-[11px] text-[var(--color-text-muted)]">{tp.decidedBy || '—'}</span></Td>
                    <Td>
                      <MigrationBadge status={tp.migrationStatus} />
                      {tp.vendorDependency && <span title={t('vendorDepTitle')}> 🔒</span>}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* ── findings ──────────────────────────────────────────────────────── */}
      <Panel className="!p-0">
        <div className="border-b border-[var(--color-border)] p-4 sm:px-6">
          <PanelTitle info={
            <InfoTip label={t('findingsTitle')}>
              {t.rich('findingsInfo', { b: c => <b>{c}</b>, br: () => <br /> })}
            </InfoTip>
          }>
            {t('findingsTitle')}
          </PanelTitle>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>{t('colAsset')}</Th>
                <Th>{t('colRisk')}</Th>
                <Th>{t('colReason')}</Th>
                <Th info={<InfoTip label={t('colMigration')}>{t.rich('migrationInfo', { b: c => <b>{c}</b>, br: () => <br /> })}</InfoTip>}>{t('colMigration')}</Th>
                <Th>{t('colSource')}</Th>
              </tr>
            </thead>
            <tbody>
              {findings.map(i => <FindingRow key={i.component} item={i} />)}
              {unknowns.map(u => (
                <tr key={u.label} className="border-b border-[var(--color-border-dim)] last:border-0">
                  <Td><span className="font-mono text-xs font-semibold text-[var(--color-text-base)]">{u.label}</span></Td>
                  <Td><Badge tone="weak">{t('riskLabelQuantum')}</Badge></Td>
                  <Td><span className="text-[11px] text-[var(--color-text-muted)]">{u.info ?? u.summary}</span></Td>
                  <Td><span className="font-mono text-[11px] text-[var(--color-text-muted)]">—</span></Td>
                  <Td><span className="font-mono text-[11px] text-[var(--color-text-muted)]">{u.asset}</span></Td>
                </tr>
              ))}
              {findings.length === 0 && unknowns.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center font-mono text-xs text-[var(--color-text-muted)]">{t('findingsNone')}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* ── exposure register ─────────────────────────────────────────────── */}
      <Panel className="!p-0">
        <div className="border-b border-[var(--color-border)] p-4 sm:px-6">
          <PanelTitle>{t('registerTitle')}</PanelTitle>
          <p className="text-xs leading-relaxed text-[var(--color-text-muted)]">{t('registerIntro')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <Th>{t('colAsset')}</Th>
                <Th>{t('colOwner')}</Th>
                <Th>{t('colRiskOwner')}</Th>
                <Th>{t('colDataClass')}</Th>
                <Th>{t('colCriticality')}</Th>
                <Th>{t('colShelfLife')}</Th>
                <Th>{t('colDeadline')}</Th>
                <Th>{t('riskCardAcute')}</Th>
                <Th>{t('riskCardQuantum')}</Th>
              </tr>
            </thead>
            <tbody>
              {assets.map(a => (
                <tr key={a.asset} className="border-b border-[var(--color-border-dim)] last:border-0">
                  <Td>
                    <span className="font-mono text-xs font-semibold text-[var(--color-text-base)]">{a.asset}</span>
                    <span className="ml-1.5 font-mono text-[10px] text-[var(--color-text-muted)]">{a.kind}</span>
                  </Td>
                  <Td><Mono>{a.owner || '—'}</Mono></Td>
                  <Td><Mono>{a.riskOwner || '—'}</Mono></Td>
                  <Td>{a.dataClassification ? <Pill>{a.dataClassification}</Pill> : <Mono>—</Mono>}</Td>
                  <Td>
                    <Badge tone={a.criticality === 'high' ? 'unsafe' : a.criticality === 'medium' ? 'weak' : 'unknown'}>
                      {t(`criticality_${a.criticality}`)}
                    </Badge>
                  </Td>
                  <Td><Mono>{a.shelfLifeYears}{t('yearSuffix')}</Mono></Td>
                  <Td><Mono>{a.deadlineYear ? String(a.deadlineYear) : '—'}</Mono></Td>
                  <Td><Mono>{a.acute}</Mono></Td>
                  <Td><Mono>{a.quantum}</Mono></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <CellDrawer entry={openCell} onClose={() => setOpenCell(null)} />
    </div>
  );
}

/* ─── cards ───────────────────────────────────────────────────────────────── */

function RiskCard({ value, label, tone, info }: {
  value: number | string; label: string; tone?: string; info: ReactNode;
}) {
  return (
    <div className="glass-panel rounded-xl px-4 py-3.5">
      <p className={`text-2xl font-bold tabular-nums sm:text-3xl ${tone ?? 'text-[var(--color-text-base)]'}`}>{value}</p>
      <p className="mt-1 font-mono text-[10px] uppercase leading-tight tracking-wider text-[var(--color-text-muted)]">
        {label}
        <InfoTip label={label}>{info}</InfoTip>
      </p>
    </div>
  );
}

/* ─── matrix ──────────────────────────────────────────────────────────────── */

function Matrix({ regime, onOpen }: { regime: Regime; onOpen: (cell: RiskCell) => void }) {
  const t = useTranslations('cbom');
  const { axes } = risk.riskMatrix;
  const cells = risk.riskMatrix[regime].cells;
  const urgencyLabels = regime === 'quantum' ? axes.urgencyQuantum : axes.urgencyAcute;

  return (
    <Panel>
      <PanelTitle
        sub={regime === 'quantum' ? t('matrixSubQuantum') : t('matrixSubAcute')}
        info={
          <InfoTip label={t(`matrixTitle_${regime}`)}>
            {t.rich(regime === 'quantum' ? 'matrixInfoQuantum' : 'matrixInfoAcute', {
              b: c => <b>{c}</b>, br: () => <br />, code: c => <code>{c}</code>,
            })}
          </InfoTip>
        }
      >
        {t(`matrixTitle_${regime}`)}
      </PanelTitle>
      <p className="mb-3 min-h-[2.5rem] text-xs leading-relaxed text-[var(--color-text-muted)]">
        {t(regime === 'quantum' ? 'matrixNoteQuantum' : 'matrixNoteAcute')}
      </p>

      <div className="grid grid-cols-[auto_repeat(4,minmax(0,1fr))] gap-1 text-center">
        <div className="flex flex-col justify-end p-1 text-left font-mono text-[9px] leading-tight text-[var(--color-text-muted)]">
          {t('matrixCorner')}
        </div>
        {[1, 2, 3, 4].map(u => (
          <div key={u} className="p-1 font-mono text-[9px] leading-tight text-[var(--color-text-muted)]">
            <b className="block text-[var(--color-text-base)]">{u}</b>
            {urgencyLabels?.[u - 1] ? t(`urgency_${regime}_${u}`) : u}
          </div>
        ))}

        {[4, 3, 2, 1].map(impact => (
          <Row key={impact} impact={impact} cells={cells} onOpen={onOpen} />
        ))}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {[1, 2, 3, 4].map(rank => (
          <li key={rank} className="flex items-center gap-1.5 font-mono text-[10px] text-[var(--color-text-muted)]">
            <span className="h-2.5 w-2.5 rounded-sm border border-[var(--color-border)]" style={{ background: RANK_FILL[rank] }} />
            {t(`category_${rank}`)}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function Row({ impact, cells, onOpen }: {
  impact: number; cells: RiskCell[]; onOpen: (cell: RiskCell) => void;
}) {
  const t = useTranslations('cbom');
  const { axes } = risk.riskMatrix;
  return (
    <>
      <div className="flex flex-col justify-center p-1 text-left font-mono text-[9px] leading-tight text-[var(--color-text-muted)]">
        <b className="text-[var(--color-text-base)]">{impact}</b>
        {axes.impact?.[impact - 1] ? t(`impact_${impact}`) : ''}
      </div>
      {[1, 2, 3, 4].map(urgency => {
        const cell = cells.find(c => c.impact === impact && c.urgency === urgency);
        const filled = (cell?.count ?? 0) > 0;
        const provisional = filled && cell!.tuples.some(x => x.impactState === 'provisional');
        const style = { background: cell ? RANK_FILL[cell.categoryRank] : undefined };
        const label = t('matrixCellLabel', {
          count: cell?.count ?? 0,
          impact,
          urgency,
          category: cell ? t(`category_${cell.categoryRank}`) : '—',
        });

        if (!filled) {
          return (
            <div key={urgency} style={style}
                 className="flex aspect-square min-h-[2.25rem] items-center justify-center rounded border border-[var(--color-border-dim)] font-mono text-xs text-[var(--color-text-dim)]">
              ·
            </div>
          );
        }
        return (
          <button
            key={urgency}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => onOpen(cell!)}
            style={style}
            className={`flex aspect-square min-h-[2.25rem] items-center justify-center rounded border font-mono text-sm font-bold tabular-nums text-[var(--color-text-base)] transition-all hover:scale-[1.04] hover:border-[var(--color-primary)] ${
              provisional ? 'border-dashed border-[var(--color-text-muted)]' : 'border-[var(--color-border)]'
            }`}
          >
            {cell!.count}
          </button>
        );
      })}
    </>
  );
}

function CellDrawer({ entry, onClose }: {
  entry: { cell: RiskCell; regime: Regime } | null; onClose: () => void;
}) {
  const t = useTranslations('cbom');
  if (!entry) return null;
  const { cell, regime } = entry;

  return (
    <Drawer
      open
      onClose={onClose}
      title={t('cellDrawerTitle', { category: t(`category_${cell.categoryRank}`), count: cell.count })}
      subtitle={
        <span className="font-mono text-[11px] text-[var(--color-text-muted)]">
          {t(`regime_${regime}`)} · {t('colImpact')} {cell.impact} · {t('colUrgency')} {cell.urgency}
        </span>
      }
    >
      <ul className="space-y-2">
        {cell.tuples.map(tp => (
          <li key={`${tp.asset}-${tp.component}`} className="rounded-lg border border-[var(--color-border-dim)] px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-semibold text-[var(--color-text-base)]">{tp.component}</span>
              <span className="font-mono text-[10px] text-[var(--color-text-muted)]">{tp.asset}</span>
              {tp.impactState === 'provisional' && <Badge tone="weak">{t('provisional')}</Badge>}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={tp.quantum}>{t(`quantum_${tp.quantum}`)}</Badge>
              <Badge tone={tp.classical}>{t(`classical_${tp.classical}`)}</Badge>
              <MigrationBadge status={tp.migrationStatus} />
              {tp.treatment && <Pill>{t(`treatment_${tp.treatment}`)}</Pill>}
            </div>
            {tp.treatmentNote && (
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--color-text-muted)]">
                <TreatmentNote tuple={tp} />
              </p>
            )}
          </li>
        ))}
      </ul>
    </Drawer>
  );
}

/* ─── asset impact card ───────────────────────────────────────────────────── */

function AssetCard({ asset }: { asset: RiskAsset }) {
  const t = useTranslations('cbom');
  const provisional = asset.impactState === 'provisional';

  return (
    <div className="rounded-xl border border-[var(--color-border-dim)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold text-[var(--color-text-base)]">{asset.asset}</span>
        <span className="font-mono text-[10px] text-[var(--color-text-muted)]">{asset.kind}</span>
        <span className="ml-auto">
          {provisional
            ? <Badge tone="weak" title={t('needsInputTitle')}>⚠ {t('needsInput')}</Badge>
            : <Badge tone="safe">{t('assessed')}</Badge>}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <Field label={t('colOwner')}       value={asset.owner} />
        <Field label={t('colRiskOwner')}   value={asset.riskOwner} />
        <Field label={t('colDataClass')}   value={asset.dataClassification} />
        <Field label={t('colCriticality')} value={t(`criticality_${asset.criticality}`)} />
        <Field label={t('fieldShelfLife')} value={`${asset.shelfLifeYears}${t('yearSuffix')}`} />
        <Field label={t('fieldMigration')} value={`${asset.migrationYears}${t('yearSuffix')}`} />
        <Field label={t('fieldDeadline')}  value={asset.deadlineYear ? String(asset.deadlineYear) : ''} />
      </dl>

      <p className="mono-label mt-4 mb-2 text-[var(--color-primary)]">{t('objectivesTitle')}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-5">
        {SECURITY_GOALS.map(goal => (
          <Field
            key={goal}
            label={t(`goal_${goal}`)}
            value={asset.securityObjectives[goal] != null ? String(asset.securityObjectives[goal]) : ''}
            info={
              <InfoTip label={t(`goal_${goal}`)}>
                <b className="block text-[var(--color-text-base)]">{t(`goal_${goal}`)}</b>
                <span className="mt-1 block">{t('anchorsLead')}</span>
                <span className="mt-1 block space-y-0.5">
                  {[1, 2, 3, 4].map(n => (
                    <span key={n} className="block">
                      <b className="text-[var(--color-text-base)]">{n}</b> {t(`anchor_${goal}_${n}`)}
                    </span>
                  ))}
                </span>
              </InfoTip>
            }
          />
        ))}
        <Field
          label={t('fieldEconomicDamage')}
          value={asset.economicDamage != null ? String(asset.economicDamage) : ''}
          info={
            <InfoTip label={t('fieldEconomicDamage')}>
              <span className="block">{t('anchorsEconLead')}</span>
              <span className="mt-1 block">
                {[1, 2, 3, 4].map(n => (
                  <span key={n} className="block">
                    <b className="text-[var(--color-text-base)]">{n}</b> {t(`anchor_econ_${n}`)}
                  </span>
                ))}
              </span>
            </InfoTip>
          }
        />
      </dl>
    </div>
  );
}

function Field({ label, value, info }: { label: string; value: string; info?: ReactNode }) {
  return (
    <div>
      <dt className="font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}{info}
      </dt>
      <dd className="mt-0.5 font-mono text-xs text-[var(--color-text-base)]">{value || '—'}</dd>
    </div>
  );
}

/* ─── findings ────────────────────────────────────────────────────────────── */

function FindingRow({ item }: { item: RiskItem }) {
  const t = useTranslations('cbom');
  const { params } = risk;

  const label = item.category === 'acute' ? t('riskLabelAcute')
              : item.urgent               ? t('riskLabelQuantumUrgent')
              : t('riskLabelQuantum');
  const tone = item.category === 'acute' || item.urgent ? 'unsafe' : 'weak';

  // ShorSight ships the reasoning as an English sentence; it is rebuilt from the
  // same numbers here so both locales read natively. Signatures ignore the data
  // shelf-life X — there is no retroactive forgery — and race the earlier CRQC year.
  const asset  = risk.assets.find(a => item.sources.includes(a.asset));
  const isSig  = item.role !== 'confidentiality';
  const x      = isSig ? 0 : asset?.shelfLifeYears ?? params.defaultShelfLifeYears;
  const y      = asset?.migrationYears ?? params.migrationYears;
  const z      = isSig ? params.yearsUntilCrqcSignatures : params.yearsUntilCrqc;
  const crqc   = isSig ? params.crqcYearSignatures : params.crqcYear;

  // years are passed as strings — ICU would otherwise group them as `2.035`
  const mosca = item.category === 'quantum'
    ? t(item.urgent ? 'moscaUrgent' : 'moscaRelaxed', {
        x, y, z, sum: x + y,
        crqc:    String(crqc),
        startBy: String(item.startByYear ?? crqc),
      })
    : null;

  return (
    <tr className="border-b border-[var(--color-border-dim)] last:border-0">
      <Td><span className="font-mono text-xs font-semibold text-[var(--color-text-base)]">{item.component}</span></Td>
      <Td><Badge tone={tone}>{label}</Badge></Td>
      <Td className="max-w-md">
        <span className="text-[11px] leading-relaxed text-[var(--color-text-base)]">
          {item.category === 'acute' ? t('findingSummaryAcute') : t('findingSummaryQuantum')}
        </span>
        {mosca && <span className="mt-1 block text-[11px] leading-relaxed text-[var(--color-text-muted)]">{mosca}</span>}
      </Td>
      <Td>
        <MigrationBadge status={item.migrationStatus} />
        {item.vendorDependency && <span title={t('vendorDepTitle')}> 🔒</span>}
        {item.deadlineYear && (
          <span className="mt-0.5 block font-mono text-[10px] text-[var(--color-text-muted)]">
            {t('byYear', { year: String(item.deadlineYear) })}
          </span>
        )}
      </Td>
      <Td><Mono>{item.sources.join(', ') || '—'}</Mono></Td>
    </tr>
  );
}

/* ─── bits ────────────────────────────────────────────────────────────────── */

/**
 * The treatment note is the risk owner's own wording, recorded in
 * shorsight/governance.beyond-shor.json in English. A translated version is kept
 * per object so the page reads natively; anything not translated yet falls back
 * to the recorded text rather than showing nothing.
 */
function TreatmentNote({ tuple }: { tuple: RiskTuple }) {
  const t = useTranslations('cbom');
  const key = `treatmentNote.${tuple.component.toLowerCase()}`;
  if (t.has(key)) return <>{t(key)}</>;
  return <>{tuple.treatmentNote || '—'}</>;
}

function MigrationBadge({ status }: { status: string }) {
  const t = useTranslations('cbom');
  const key = (status || 'not-started').replace(/\s+/g, '-');
  const tone = key === 'pqc-only' || key === 'not-applicable' ? 'safe'
             : ['in-progress', 'hybrid', 'planned'].includes(key) ? 'weak'
             : 'unknown';
  return <Badge tone={tone}>{t.has(`migration_${key}`) ? t(`migration_${key}`) : status}</Badge>;
}

function Th({ children, info }: { children: ReactNode; info?: ReactNode }) {
  return (
    <th scope="col" className="whitespace-nowrap px-4 py-2.5 font-mono text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
      {children}{info}
    </th>
  );
}

function Td({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <td className={`px-4 py-2.5 align-top ${className}`}>{children}</td>;
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[11px] text-[var(--color-text-muted)]">{children}</span>;
}
