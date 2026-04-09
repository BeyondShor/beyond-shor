import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getDatenschutz } from '@/lib/strapi';
import BlockRenderer from '@/components/BlockRenderer';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'datenschutz' });
  return {
    title: { absolute: `${t('fallbackTitle')} — Beyond Shor` },
    description: 'Datenschutzerklärung gemäß DSGVO.',
    robots: { index: false, follow: false },
  };
}

export default async function DatenschutzPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('datenschutz');

  const datenschutz = await getDatenschutz(locale);

  return (
    <div className="bg-[var(--color-bg-surface)]">
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
      <header className="mb-12">
        <p className="mono-label text-[var(--color-primary)] mb-2">{t('label')}</p>
        <h1 className="text-3xl font-bold text-[var(--color-text-base)] sm:text-4xl">
          {datenschutz?.title ?? t('fallbackTitle')}
        </h1>
      </header>

      {datenschutz?.blocks?.length ? (
        <BlockRenderer blocks={datenschutz.blocks} />
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
