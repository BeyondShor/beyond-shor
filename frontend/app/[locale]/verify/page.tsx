import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import SignatureVerifier from '@/components/SignatureVerifier';
import { listSignedFiles, datasetPublicKey } from '@/lib/pqc-lagebild';

interface PageProps {
  params:       Promise<{ locale: string }>;
  searchParams: Promise<{ sig?: string; docId?: string; mode?: string; file?: string }>;
}

export async function generateStaticParams() {
  return [{ locale: 'de' }, { locale: 'en' }];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'verifier' });
  return {
    title:       t('pageTitle'),
    description: t('metaDescription'),
    ...pageMeta(locale, '/verify', { title: t('pageTitle'), description: t('metaDescription') }),
  };
}

export default async function VerifyPage({ params, searchParams }: PageProps) {
  const { locale }          = await params;
  const { sig, docId, mode, file } = await searchParams;
  setRequestLocale(locale);

  // Sanitize URL params before forwarding to client component.
  // Signature must be hex-only; documentId must be alphanumeric (Strapi format).
  const safeSig     = /^[0-9a-f\s]*$/i.test(sig   ?? '') ? (sig   ?? '') : '';
  const safeDocId   = /^[0-9a-zA-Z_-]*$/.test(docId ?? '') ? (docId ?? '') : '';
  const defaultMode = mode === 'cbom' ? 'cbom' : mode === 'lagebild' ? 'lagebild' : 'article';
  // Only files that actually exist (and match the published pattern) can be preselected.
  const lagebildFiles = listSignedFiles();
  const safeFile = file && lagebildFiles.includes(file) ? file : '';

  return (
    <div className="bg-[var(--color-bg-surface)]">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <SignatureVerifier
          defaultSig={safeSig}
          defaultDocId={safeDocId}
          defaultMode={defaultMode}
          lagebildFiles={lagebildFiles}
          defaultLagebildFile={safeFile}
          lagebildPublicKey={datasetPublicKey()}
        />
      </div>
    </div>
  );
}
