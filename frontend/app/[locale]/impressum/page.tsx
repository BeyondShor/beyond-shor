import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getImpressum } from '@/lib/strapi';
import BlockRenderer from '@/components/BlockRenderer';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'impressum' });
  return {
    title: { absolute: `${t('fallbackTitle')} — Beyond Shor` },
    description: 'Impressum und Anbieterkennzeichnung gemäß § 5 TMG.',
  };
}

export default async function ImpressumPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('impressum');

  const impressum = await getImpressum(locale);

  return (
    <div className="bg-[var(--color-bg-surface)]">
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
      <header className="mb-12">
        <p className="mono-label text-[var(--color-primary)] mb-2">{t('label')}</p>
        <h1 className="text-3xl font-bold text-[var(--color-text-base)] sm:text-4xl">
          {impressum?.title ?? t('fallbackTitle')}
        </h1>
      </header>

      {impressum?.blocks?.length ? (
        <BlockRenderer blocks={impressum.blocks} />
      ) : (
        <div
          className="rounded-lg border border-dashed border-[var(--color-border)] p-12 text-center"
          aria-live="polite"
        >
          <p className="font-mono text-[var(--color-primary)] text-sm mb-2">
            {t('notConfiguredLabel')}
          </p>
          <p className="text-[var(--color-text-muted)] text-sm">
            {t('notConfiguredDesc')}
          </p>
        </div>
      )}
    </div>
    </div>
  );
}
