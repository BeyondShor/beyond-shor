import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import HybridPlayground from '@/components/HybridPlayground';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateStaticParams() {
  return [{ locale: 'de' }, { locale: 'en' }];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'playground' });
  return {
    title: t('pageTitle'),
    description: t('metaDescription'),
  };
}

export default async function PlaygroundPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <div className="bg-[var(--color-bg-surface)]">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <HybridPlayground />
      </div>
    </div>
  );
}
