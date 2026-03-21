'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export default function NotFoundPage() {
  const t = useTranslations('notFound');

  return (
    <div className="bg-[var(--color-bg-surface)]">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <header className="mb-12">
          <p className="mono-label text-[var(--color-primary)] mb-2">{t('label')}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-text-base)]">
            {t('title')}
          </h1>
          <p className="mt-4 text-[var(--color-text-muted)] leading-relaxed">
            {t('description')}
          </p>
        </header>

        <Link
          href="/"
          className="rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)]/10 px-6 py-2.5 text-sm font-mono font-semibold text-[var(--color-primary)] transition-all hover:bg-[var(--color-primary)]/20"
        >
          {t('back')}
        </Link>
      </div>
    </div>
  );
}
