import type { Metadata } from 'next';
import { pageMeta } from '@/lib/seo';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import PkiLab, { type ArticleRef } from '@/components/pki/PkiLab';
import { getArticleBySlug } from '@/lib/strapi';

interface PageProps {
  params: Promise<{ locale: string }>;
}

// Articles of the PKI series; only published ones are linked
const SERIES = ['pki', 'pqc-zertifikate', 'pqc-zertifikatsarten', 'root-ca'] as const;

export const revalidate = 300;

export async function generateStaticParams() {
  return [{ locale: 'de' }, { locale: 'en' }];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pkiLab' });
  return {
    title: t('pageTitle'),
    description: t('metaDescription'),
    ...pageMeta(locale, '/pki', { title: `Beyond Shor — ${t('pageTitle')}`, description: t('metaDescription') }),
  };
}

async function publishedArticles(locale: string): Promise<ArticleRef[]> {
  const found = await Promise.all(SERIES.map(async (slug): Promise<ArticleRef | null> => {
    try {
      const a = await getArticleBySlug(slug, locale);
      return a ? ({ slug, title: a.title } as ArticleRef) : null;
    } catch {
      return null;
    }
  }));
  return found.filter((a): a is ArticleRef => a !== null);
}

const ROLES = ['ca', 'ra', 'subscriber', 'relyingParty'] as const;
const COMPARE = ['trust', 'algorithms', 'transparency', 'lifetime', 'pq'] as const;
const NOTES = ['real', 'tls', 'acme', 'interop', 'composite', 'catalyst', 'mtc', 'simplified', 'shor'] as const;

export default async function PkiPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'pkiLab' });
  const articles = await publishedArticles(locale);

  return (
    <div className="bg-[var(--color-bg-surface)] min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <Link href={{ pathname: '/playground', hash: 'pki' }}
          className="inline-block mb-8 font-mono text-xs text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors">
          {t('back')}
        </Link>

        <header className="mb-12">
          <p className="mono-label text-[var(--color-primary)] mb-2">{t('label')}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-text-base)]">{t('pageTitle')}</h1>
          <p className="mt-4 text-[var(--color-text-muted)] leading-relaxed">{t('intro')}</p>
        </header>

        <div className="space-y-16">
          {/* What a PKI does */}
          <section aria-labelledby="basics-title" className="flex flex-col gap-4">
            <h2 id="basics-title" className="text-xl font-semibold text-[var(--color-text-base)]">{t('basics.title')}</h2>
            <p className="text-[var(--color-text-muted)] leading-relaxed">{t('basics.text')}</p>
            <ul className="grid gap-3 sm:grid-cols-2 list-none m-0 p-0">
              {ROLES.map((r) => (
                <li key={r} className="glass-panel rounded-xl p-4">
                  <span className="block font-mono text-sm text-[var(--color-primary)]">{t(`basics.${r}.name`)}</span>
                  <span className="mt-1 block text-sm text-[var(--color-text-muted)] leading-relaxed">{t(`basics.${r}.desc`)}</span>
                </li>
              ))}
            </ul>
            <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">{t('basics.quantum')}</p>
          </section>

          {/* Internal vs. public */}
          <section aria-labelledby="compare-title" className="flex flex-col gap-4">
            <h2 id="compare-title" className="text-xl font-semibold text-[var(--color-text-base)]">{t('compare.title')}</h2>
            <p className="text-[var(--color-text-muted)] leading-relaxed">{t('compare.text')}</p>
            <div className="rounded-xl border border-[var(--color-border)] overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-base)]">
                    <th className="px-4 py-3 text-left mono-label text-[var(--color-text-muted)] w-[22%]" />
                    <th className="px-4 py-3 text-left mono-label text-violet-300">{t('scope.private')}</th>
                    <th className="px-4 py-3 text-left mono-label text-[var(--color-primary)]">{t('scope.web')}</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE.map((k, i) => (
                    <tr key={k} className={i % 2 ? 'bg-[var(--color-bg-base)]' : ''}>
                      <td className="px-4 py-3 font-mono text-xs text-[var(--color-text-base)] align-top">{t(`compare.${k}.label`)}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)] leading-relaxed align-top">{t(`compare.${k}.private`)}</td>
                      <td className="px-4 py-3 text-[var(--color-text-muted)] leading-relaxed align-top">{t(`compare.${k}.web`)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* The lab */}
          <section aria-labelledby="lab-title" className="flex flex-col gap-4">
            <h2 id="lab-title" className="text-xl font-semibold text-[var(--color-text-base)]">{t('labTitle')}</h2>
            <p className="text-[var(--color-text-muted)] leading-relaxed">{t('labIntro')}</p>
            <PkiLab articles={articles} />
          </section>

          {/* How it is built */}
          <section aria-labelledby="impl-title" className="flex flex-col gap-4">
            <h2 id="impl-title" className="text-xl font-semibold text-[var(--color-text-base)]">{t('impl.title')}</h2>
            <ul className="space-y-3 list-disc pl-5 text-sm text-[var(--color-text-muted)] leading-relaxed marker:text-[var(--color-primary)]">
              {NOTES.map((k) => <li key={k}>{t(`impl.${k}`)}</li>)}
            </ul>
          </section>

          {articles.length > 0 && (
            <section aria-labelledby="series-title" className="flex flex-col gap-3">
              <h2 id="series-title" className="text-xl font-semibold text-[var(--color-text-base)]">{t('series.title')}</h2>
              <ul className="flex flex-col gap-2">
                {articles.map((a) => (
                  <li key={a.slug}>
                    <Link href={{ pathname: '/blog/[slug]', params: { slug: a.slug } }} className="text-[var(--color-primary)] hover:underline">
                      {a.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
