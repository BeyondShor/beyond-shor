'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { cbom, model, risk } from '@/lib/shorsight';
import CbomSignatureBadge from '@/components/CbomSignatureBadge';
import InventoryTab from '@/components/shorsight/InventoryTab';
import RiskTab from '@/components/shorsight/RiskTab';
import { SectionHeader } from '@/components/shorsight/ui';

type Tab = 'inventory' | 'risk';

export default function ShorSightReport({ cbomSig, cbomHtml }: {
  cbomSig?: string | null;
  cbomHtml?: string;
}) {
  const t = useTranslations('cbom');
  const locale = useLocale();
  const [tab, setTab] = useState<Tab>('inventory');

  const openRisks = risk.buckets.acute + risk.buckets.quantum;
  const scanned = new Date(model.timestamp).toLocaleDateString(locale, { dateStyle: 'long' });
  const commit = model.prov[model.sources[0]?.label ?? '']?.commit;

  return (
    <div>

      {/* ── hero ──────────────────────────────────────────────────────────── */}
      <header className="mb-10">
        <p className="mb-2 font-mono text-sm text-[var(--color-primary)]">
          // cbom ·{' '}
          <a
            href="https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-CBOM-en.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 transition-opacity hover:opacity-80"
          >
            CycloneDX {cbom.specVersion}
          </a>
        </p>
        <h1 className="text-3xl font-bold text-[var(--color-text-base)] sm:text-4xl">{t('pageTitle')}</h1>

        <div className="mt-4 max-w-3xl space-y-3">
          <p className="text-base leading-relaxed text-[var(--color-text-muted)]">
            {t('intro', { count: model.algos.length, libs: model.libs.length })}
          </p>
          <p className="text-base leading-relaxed text-[var(--color-text-muted)]">{t('evidenceNote')}</p>
          <p className="text-base leading-relaxed text-[var(--color-text-muted)]">{t('scopeNote')}</p>
        </div>

        {/* scan provenance — a report is only worth as much as its timestamp */}
        <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-[11px] text-[var(--color-text-muted)]">
          <div>
            <dt className="inline">{t('metaScanner')}: </dt>
            <dd className="inline text-[var(--color-text-base)]">
              {model.tool?.name ?? 'shorsight'} {model.tool?.version}
            </dd>
          </div>
          <div>
            <dt className="inline">{t('metaScanned')}: </dt>
            <dd className="inline text-[var(--color-text-base)]">{scanned}</dd>
          </div>
          {commit && (
            <div>
              <dt className="inline">{t('metaCommit')}: </dt>
              <dd className="inline text-[var(--color-text-base)]">{commit.slice(0, 10)}</dd>
            </div>
          )}
        </dl>

        {cbomSig && (
          <div className="mt-6 max-w-xl">
            <CbomSignatureBadge sig={cbomSig} />
          </div>
        )}
      </header>

      {/* ── tabs ──────────────────────────────────────────────────────────── */}
      <div role="tablist" aria-label={t('pageTitle')} className="mb-6 flex flex-wrap gap-2 border-b border-[var(--color-border)]">
        {([
          ['inventory', t('tabInventory'), model.algos.length],
          ['risk',      t('tabRisk'),      openRisks],
        ] as [Tab, string, number][]).map(([id, label, badge]) => (
          <button
            key={id}
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => setTab(id)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === id
                ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-base)]'
            }`}
          >
            {label}
            {badge > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] leading-4 ${
                id === 'risk'
                  ? 'bg-amber-500/15 text-amber-400'
                  : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]'
              }`}>
                {badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'inventory' ? <InventoryTab /> : <RiskTab />}
      </div>

      {/* ── export ────────────────────────────────────────────────────────── */}
      <section className="mt-16 space-y-4">
        <SectionHeader label="// export" title={t('exportTitle')} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <a
            href="/cbom.json"
            download="cbom.json"
            className="inline-flex items-center gap-2 self-start rounded-lg border border-[var(--color-primary)] px-4 py-2 font-mono text-sm text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-[var(--color-bg-base)]"
          >
            {t('downloadBtn')}
          </a>
          <span className="font-mono text-xs text-[var(--color-text-muted)]">
            {t('downloadNote', { spec: cbom.specVersion })}
          </span>
        </div>

        <details className="group overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-base)]">
          <summary className="flex cursor-pointer select-none list-none items-center justify-between px-5 py-4">
            <span className="font-mono text-sm text-[var(--color-primary)]">{t('rawJsonToggle')}</span>
            <svg className="h-4 w-4 text-[var(--color-text-muted)] transition-transform duration-200 group-open:rotate-90" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="border-t border-[var(--color-border)]">
            {cbomHtml
              ? <div className="shiki-cbom overflow-x-auto px-5 py-4 text-xs leading-relaxed [&>pre]:!m-0 [&>pre]:!bg-transparent" dangerouslySetInnerHTML={{ __html: cbomHtml }} />
              : <pre className="overflow-x-auto whitespace-pre px-5 py-4 text-xs leading-relaxed text-[var(--color-text-muted)]">{JSON.stringify(cbom, null, 2)}</pre>}
          </div>
        </details>
      </section>
    </div>
  );
}
