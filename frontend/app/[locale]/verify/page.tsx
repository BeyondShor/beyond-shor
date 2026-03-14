import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import SignatureVerifier from '@/components/SignatureVerifier';

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ sig?: string; docId?: string }>;
}

export async function generateStaticParams() {
  return [{ locale: 'de' }, { locale: 'en' }];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'verifier' });
  return {
    title: t('pageTitle'),
    description: t('metaDescription'),
  };
}

export default async function VerifyPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const { sig, docId } = await searchParams;
  setRequestLocale(locale);

  return (
    <div className="bg-[var(--color-bg-surface)]">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24">
        <SignatureVerifier defaultSig={sig} defaultDocId={docId} />
      </div>
    </div>
  );
}
