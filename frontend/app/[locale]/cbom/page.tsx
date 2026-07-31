import type { Metadata } from 'next';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createHighlighter } from 'shiki';
import ShorSightReport from '@/components/ShorSightReport';
import { model } from '@/lib/shorsight';
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
  return {
    title:       t('pageTitle'),
    description: t('metaDescription', { count: model.algos.length, libs: model.libs.length }),
  };
}

export default async function CbomPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const sigPath = join(process.cwd(), 'public/cbom.sig');
  const cbomSig = existsSync(sigPath) ? readFileSync(sigPath, 'utf8').trim() : null;

  const highlighter = await createHighlighter({ themes: ['github-dark'], langs: ['json'] });
  const cbomHtml = highlighter.codeToHtml(JSON.stringify(cbomData, null, 2), {
    lang: 'json',
    theme: 'github-dark',
  });

  return (
    <div className="bg-[var(--color-bg-surface)]">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
        <ShorSightReport cbomSig={cbomSig} cbomHtml={cbomHtml} />
      </div>
    </div>
  );
}
