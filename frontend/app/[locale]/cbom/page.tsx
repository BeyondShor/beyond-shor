import type { Metadata } from 'next';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createHighlighter } from 'shiki';
import CbomSignatureBadge from '@/components/CbomSignatureBadge';
import ShorSightFrame from '@/components/ShorSightFrame';
import ShorSightReport from '@/components/ShorSightReport';
import cbomData from '@/public/cbom.json';

/**
 * From lg upwards the inventory is ShorSight's own UI, built into a static page by
 * shorsight/build_inventory.py and embedded below. It does not fit a phone, so
 * smaller screens get ShorSightReport, a compact rendering of the same data.
 */
const SHORSIGHT_PAGE = '/shorsight/inventory.html';

const assets = cbomData.components.filter(c => c.type === 'cryptographic-asset');
const libs   = cbomData.components.filter(c => c.type === 'library');
const tool   = cbomData.metadata.tools.components[0];
const commit = (() => {
  const prov = cbomData.metadata.properties?.find(p => p.name === 'crypto:provenance');
  try { return prov ? (JSON.parse(prov.value) as { commit?: string }).commit : undefined; }
  catch { return undefined; }
})();

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateStaticParams() {
  return [{ locale: 'de' }, { locale: 'en' }];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'cbom' });
  return {
    title:       t('pageTitle'),
    description: t('metaDescription', { count: assets.length, libs: libs.length }),
  };
}

export default async function CbomPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('cbom');

  const sigPath = join(process.cwd(), 'public/cbom.sig');
  const cbomSig = existsSync(sigPath) ? readFileSync(sigPath, 'utf8').trim() : null;

  const highlighter = await createHighlighter({ themes: ['github-dark'], langs: ['json'] });
  const cbomHtml = highlighter.codeToHtml(JSON.stringify(cbomData, null, 2), {
    lang: 'json',
    theme: 'github-dark',
  });

  const scanned = new Date(cbomData.metadata.timestamp).toLocaleDateString(locale, { dateStyle: 'long' });

  return (
    <div className="bg-[var(--color-bg-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">

        {/* ── hero ──────────────────────────────────────────────────────────── */}
        <header className="mb-12">
          <p className="mono-label text-[var(--color-primary)] mb-2">
            {'// cbom · '}
            <a
              href="https://cyclonedx.org/guides/OWASP_CycloneDX-Authoritative-Guide-to-CBOM-en.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-opacity hover:opacity-80"
            >
              CycloneDX {cbomData.specVersion}
            </a>
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-text-base)]">{t('pageTitle')}</h1>

          <div className="mt-4 max-w-3xl space-y-3">
            <p className="text-[var(--color-text-muted)] leading-relaxed">
              {t('intro', { count: assets.length, libs: libs.length })}
            </p>
            <p className="text-[var(--color-text-muted)] leading-relaxed">
              <span className="hidden lg:inline">{t('embedNote')}</span>
              <span className="lg:hidden">{t('compactNote')}</span>{' '}
              {t('detailNote')}
            </p>
            <p className="text-[var(--color-text-muted)] leading-relaxed">{t('scopeNote')}</p>
          </div>

          {/* scan provenance — a report is only worth as much as its timestamp */}
          <dl className="mt-6 flex flex-wrap gap-x-6 gap-y-2 font-mono text-xs text-[var(--color-text-muted)]">
            <div>
              <dt className="inline">{t('metaScanner')}: </dt>
              <dd className="inline text-[var(--color-text-base)]">{tool?.name ?? 'shorsight'} {tool?.version}</dd>
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

        {/* ── ShorSight: own UI on desktop, compact rendering below lg ──────── */}
        <section className="hidden lg:block">
          <p className="mono-label text-[var(--color-text-muted)] mb-3">{t('embedLabel')}</p>
          <div className="overflow-hidden rounded-xl border border-[var(--color-glass-border)] bg-[#0a0e27] shadow-[0_0_48px_var(--color-primary-glow)]">
            <ShorSightFrame src={SHORSIGHT_PAGE} title={t('embedTitle')} />
          </div>
        </section>

        <section className="lg:hidden">
          <ShorSightReport />
        </section>

        {/* ── export ────────────────────────────────────────────────────────── */}
        <section className="mt-16 space-y-4">
          <div className="mb-5 space-y-1">
            <p className="font-mono text-xs text-[var(--color-primary)]">{'// export'}</p>
            <h2 className="text-lg font-semibold text-[var(--color-text-base)]">{t('exportTitle')}</h2>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="/cbom.json"
              download="cbom.json"
              className="inline-flex items-center gap-2 self-start rounded-lg border border-[var(--color-primary)] px-4 py-2 font-mono text-sm text-[var(--color-primary)] transition-colors hover:bg-[var(--color-primary)] hover:text-[var(--color-bg-base)]"
            >
              {t('downloadBtn')}
            </a>
            <span className="font-mono text-xs text-[var(--color-text-muted)]">
              {t('downloadNote', { spec: cbomData.specVersion })}
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
              <div className="shiki-cbom overflow-x-auto px-5 py-4 text-xs leading-relaxed [&>pre]:!m-0 [&>pre]:!bg-transparent" dangerouslySetInnerHTML={{ __html: cbomHtml }} />
            </div>
          </details>
        </section>
      </div>
    </div>
  );
}
