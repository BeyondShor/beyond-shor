'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { model, risk } from '@/lib/shorsight';
import InventoryTab from '@/components/shorsight/InventoryTab';
import RiskTab from '@/components/shorsight/RiskTab';

type Tab = 'inventory' | 'risk';

/**
 * Compact rendering of the ShorSight result for small screens, where ShorSight's
 * own UI (embedded on /cbom from lg upwards) does not fit. Same data: the signed
 * cbom.json and the governance result written by shorsight/build_inventory.py.
 */
export default function ShorSightReport() {
  const t = useTranslations('cbom');
  const [tab, setTab] = useState<Tab>('inventory');

  const openRisks = risk.buckets.acute + risk.buckets.quantum;

  return (
    <div>
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

    </div>
  );
}
