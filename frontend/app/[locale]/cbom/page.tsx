import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import CbomViewer from '@/components/CbomViewer';
import cbomData from '@/public/cbom.json';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateStaticParams() {
  return [{ locale: 'de' }, { locale: 'en' }];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'cbom' });
  const count = cbomData.components.length;
  return {
    title: t('pageTitle'),
    description: t('metaDescription', { count }),
  };
}

export default async function CbomPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="bg-[var(--color-bg-surface)]">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <CbomViewer />
      </div>
    </div>
  );
}
