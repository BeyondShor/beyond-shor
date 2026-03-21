import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { generateMathChallenge } from '@/lib/spam';
import ContactForm from './ContactForm';
import SpamInfoPanel from './SpamInfoPanel';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contact' });
  return {
    title: t('title'),
    description: t('intro'),
  };
}

export default async function KontaktPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('contact');
  const { question, token } = generateMathChallenge();

  return (
    <div className="bg-[var(--color-bg-surface)]">
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
      <header className="mb-12">
        <p className="mono-label text-[var(--color-primary)] mb-2">{t('label')}</p>
        <h1 className="text-3xl font-bold text-[var(--color-text-base)] sm:text-4xl">
          {t('title')}
        </h1>
        <p className="mt-4 text-[var(--color-text-muted)] leading-relaxed">
          {t('intro')}
        </p>
      </header>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-6 sm:p-8">
        <ContactForm captchaQuestion={question} captchaToken={token} locale={locale} />
      </div>

      <div className="mt-4">
        <SpamInfoPanel />
      </div>
    </div>
    </div>
  );
}
