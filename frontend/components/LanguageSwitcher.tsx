'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useRouter, usePathname } from '@/i18n/navigation';

export default function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations('lang');
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const next = locale === 'de' ? 'en' : 'de';

  return (
    <button
      onClick={() => router.replace(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { pathname, params } as any,
        { locale: next },
      )}
      className="mono-label border border-[var(--color-border)] rounded px-2 py-1 text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)] transition-colors cursor-pointer"
      aria-label={t('switchTo', { locale: next.toUpperCase() })}
    >
      {t('switchTo', { locale: next.toUpperCase() })}
    </button>
  );
}
