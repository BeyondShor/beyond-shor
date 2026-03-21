import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { getArticles } from '@/lib/strapi';
import ArticleCard from '@/components/ArticleCard';
import HndlTimeline from '@/components/HndlTimeline';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'home' });
  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    title: { absolute: 'Beyond Shor — Post-Quantum Cryptography' },
    description: t('heroSubtitle'),
    alternates: {
      canonical: `${BASE_URL}/${locale}`,
      languages: {
        de: `${BASE_URL}/de`,
        en: `${BASE_URL}/en`,
      },
    },
  };
}

export default async function HomePage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('home');

  let articles: Awaited<ReturnType<typeof getArticles>>['data'] = [];
  try {
    const res = await getArticles(1, 6, locale);
    articles = res.data;
  } catch {
    // Strapi not running yet — show placeholder state
  }

  return (
    <>
      {/* ── Hero Section ────────────────────────────────────────────────── */}
      <section
        className="relative grid-bg border-b border-[var(--color-border)] overflow-hidden py-24 sm:py-36 lg:py-44"
        aria-labelledby="hero-heading"
      >
        {/* Radial glow overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(6,182,212,0.08) 0%, transparent 70%)',
          }}
          aria-hidden="true"
        />

        {/* Animated orbs */}
        <div className="orb orb-a" aria-hidden="true" />
        <div className="orb orb-b" aria-hidden="true" />
        <div className="orb orb-c" aria-hidden="true" />

        {/* Scan-line */}
        <div className="scan-line" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl px-4 sm:px-6">
          {/* Label */}
          <p className="mono-label text-[var(--color-primary)] mb-4 animate-fade-up">
            {t('heroLabel')}
          </p>

          {/* Headline */}
          <h1
            id="hero-heading"
            className="gradient-text text-4xl font-bold leading-tight sm:text-5xl lg:text-7xl max-w-3xl animate-fade-up-delay-1"
          >
            {t('heroTitle')}
          </h1>

          {/* Sub-headline */}
          <p className="mt-6 max-w-xl text-lg text-[var(--color-text-muted)] leading-relaxed animate-fade-up-delay-2">
            {t('heroSubtitle')}
          </p>

          {/* CTA */}
          <div className="mt-10 flex flex-wrap gap-4 animate-fade-up-delay-3">
            <Link
              href="/blog"
              className="group relative overflow-hidden rounded-md bg-[var(--color-primary)] px-6 py-3 font-semibold text-[var(--color-bg-base)] text-sm transition-all hover:bg-[var(--color-primary-dim)] hover:shadow-lg hover:shadow-cyan-500/20 focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
            >
              <span className="relative z-10">{t('ctaBlog')}</span>
              <span
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent"
                aria-hidden="true"
              />
            </Link>
            <Link
              href="/about"
              className="glass-panel rounded-md px-6 py-3 font-semibold text-[var(--color-text-muted)] text-sm transition-colors hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]"
            >
              {t('ctaAbout')}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Ticker Strip ─────────────────────────────────────────────────── */}
      <section
        className="border-b border-[var(--color-glass-border)] glass-panel overflow-hidden relative"
        aria-label="Key facts"
      >
        {/* Gradient fades left/right */}
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-28 z-10"
          style={{ background: 'linear-gradient(to right, var(--color-bg-surface), transparent)' }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-28 z-10"
          style={{ background: 'linear-gradient(to left, var(--color-bg-surface), transparent)' }}
          aria-hidden="true"
        />

        {/* Ticker track: 6 items + 6 duplicates → seamless loop via translateX(-50%) */}
        <div className="ticker-track gap-4 py-6 px-2">
          {(() => {
            const items = [
              { label: t('ticker0Label'), value: t('ticker0Value'), href: '#' },
              { label: t('ticker1Label'), value: t('ticker1Value'), href: '#' },
              { label: t('ticker2Label'), value: t('ticker2Value'), href: '#' },
              { label: t('ticker3Label'), value: t('ticker3Value'), href: '#' },
              { label: t('ticker4Label'), value: t('ticker4Value'), href: '#' },
              { label: t('ticker5Label'), value: t('ticker5Value'), href: '#' },
            ];
            return [...items, ...items].map((item, i) => (
              <a
                key={i}
                href={item.href}
                aria-hidden={i >= 6 ? true : undefined}
                tabIndex={i >= 6 ? -1 : undefined}
                className="flex flex-col flex-none w-[260px] glass-panel rounded-lg px-4 py-5
                           hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]
                           transition-colors focus-visible:ring-2
                           focus-visible:ring-[var(--color-primary)] focus-visible:outline-none"
              >
                <p className="min-h-9 text-xs text-[var(--color-text-muted)] font-mono uppercase tracking-wider">
                  {item.label}
                </p>
                <p className="mt-1 text-xl font-bold font-mono text-[var(--color-primary)] leading-tight">
                  {item.value}
                </p>
              </a>
            ));
          })()}
        </div>
      </section>

      {/* ── HNDL Timeline ────────────────────────────────────────────────── */}
      <HndlTimeline locale={locale} />

      {/* ── Latest Articles ──────────────────────────────────────────────── */}
      <section
        className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24"
        aria-labelledby="articles-heading"
      >
        <div className="flex items-center justify-between mb-10">
          <h2
            id="articles-heading"
            className="text-2xl font-bold gradient-text"
          >
            {t('latestArticles')}
          </h2>
          <Link
            href="/blog"
            className="mono-label text-[var(--color-primary)] hover:underline"
          >
            {t('viewAll')}
          </Link>
        </div>

        {articles.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((article) => (
              <ArticleCard key={article.id} article={article} locale={locale} />
            ))}
          </div>
        ) : (
          <div
            className="rounded-lg border border-dashed border-[var(--color-border)] p-12 text-center"
            aria-live="polite"
          >
            <p className="font-mono text-[var(--color-primary)] text-sm mb-2">
              {t('noArticles')}
            </p>
            <p className="text-[var(--color-text-muted)] text-sm">
              {t('noArticlesDesc')}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
