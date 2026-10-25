import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getPathname } from '@/i18n/navigation';
import { getAppearances, type Appearance } from '@/lib/strapi';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'elsewhere' });
  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    title: t('title'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${BASE_URL}${getPathname({ locale, href: '/anderswo' })}`,
      languages: {
        de: `${BASE_URL}${getPathname({ locale: 'de', href: '/anderswo' })}`,
        en: `${BASE_URL}${getPathname({ locale: 'en', href: '/anderswo' })}`,
      },
    },
    openGraph: {
      title: `Beyond Shor — ${t('title')}`,
      type: 'website',
    },
  };
}

// Strapi "date" fields are plain YYYY-MM-DD strings — compare them as such
// so the server's timezone cannot shift an item between "upcoming" and "published".
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(`${iso}T00:00:00Z`));
}

export default async function ElsewherePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('elsewhere');
  const items = await getAppearances();

  const today = todayIso();
  // Upcoming items read best in chronological order (next one first)
  const upcoming = items.filter((a) => a.date > today).sort((a, b) => a.date.localeCompare(b.date));
  const published = items.filter((a) => a.date <= today);

  const byYear = new Map<string, Appearance[]>();
  for (const item of published) {
    const year = item.date.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), item]);
  }

  return (
    <div className="bg-[var(--color-bg-surface)]">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <header className="mb-12">
          <p className="mono-label text-[var(--color-primary)] mb-2">{t('label')}</p>
          <h1 className="text-3xl font-bold text-[var(--color-text-base)] sm:text-4xl">{t('title')}</h1>
          <p className="mt-4 max-w-2xl text-base text-[var(--color-text-muted)] leading-relaxed">{t('intro')}</p>
          {items.length > 0 && (
            <p className="mt-3 font-mono text-xs text-[var(--color-text-muted)]">
              {t('count', { count: items.length })}
            </p>
          )}
        </header>

        {items.length === 0 ? (
          <div
            className="rounded-lg border border-dashed border-[var(--color-border)] p-12 text-center"
            aria-live="polite"
          >
            <p className="font-mono text-[var(--color-primary)] text-sm mb-2">{t('empty')}</p>
            <p className="text-[var(--color-text-muted)] text-sm">{t('emptyDesc')}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-12">
            {upcoming.length > 0 && (
              <section aria-labelledby="elsewhere-upcoming">
                <h2 id="elsewhere-upcoming" className="mono-label text-[var(--color-primary)] mb-4">
                  {t('upcoming')}
                </h2>
                <ul className="flex flex-col gap-4 list-none m-0 p-0">
                  {upcoming.map((item) => (
                    <li key={item.documentId}>
                      <AppearanceCard item={item} locale={locale} upcoming t={t} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {[...byYear.entries()].map(([year, list]) => (
              <section key={year} aria-labelledby={`elsewhere-${year}`}>
                <h2 id={`elsewhere-${year}`} className="mono-label text-[var(--color-text-muted)] mb-4">
                  {year}
                </h2>
                <ul className="flex flex-col gap-4 list-none m-0 p-0">
                  {list.map((item) => (
                    <li key={item.documentId}>
                      <AppearanceCard item={item} locale={locale} t={t} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}

        <p className="mt-12 text-xs text-[var(--color-text-muted)] leading-relaxed">{t('privacyNote')}</p>
      </div>
    </div>
  );
}

type T = (key: string, values?: Record<string, string | number>) => string;

function AppearanceCard({ item, locale, upcoming = false, t }: {
  item: Appearance; locale: string; upcoming?: boolean; t: T;
}) {
  const summary = (locale === 'en' ? item.summaryEn || item.summaryDe : item.summaryDe || item.summaryEn) ?? null;
  const showLanguage = item.language.toLowerCase() !== locale;
  const date = formatDate(item.date, locale);

  return (
    <article className="glass-panel card-glass-hover rounded-lg p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 font-mono text-xs text-[var(--color-text-muted)]">
        <span className="mono-label text-[var(--color-primary)]">{t(`kind_${item.kind}`)}</span>
        <span>{item.outlet}</span>
        <span aria-hidden="true">·</span>
        {upcoming
          ? <span className="text-[var(--color-primary)]">{t('upcomingBadge', { date })}</span>
          : <time dateTime={item.date}>{date}</time>}
        {showLanguage && (
          <span className="rounded border border-[var(--color-glass-border)] px-1.5 py-0.5">
            {t(`language_${item.language}`)}
          </span>
        )}
      </div>

      <h3 className="text-lg font-semibold text-[var(--color-text-base)] leading-snug" lang={item.language.toLowerCase()}>
        {item.url
          ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-primary)] transition-colors">{item.title}</a>
          : item.title}
      </h3>

      {summary && (
        <p className="mt-2 text-sm text-[var(--color-text-muted)] leading-relaxed">{summary}</p>
      )}

      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 font-mono text-xs text-[var(--color-primary)] hover:underline"
        >
          {t(`link_${item.kind}`)} <span aria-hidden="true">↗</span>
          <span className="sr-only">{t('newTab')}</span>
        </a>
      )}
    </article>
  );
}
