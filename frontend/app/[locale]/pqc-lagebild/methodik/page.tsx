import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { pageMeta } from '@/lib/seo';
import { PQC_LAGEBILD_PUBLIC, loadLagebild, formatMonth, formatNumber } from '@/lib/pqc-lagebild';

export const revalidate = 3600;

interface PageProps { params: Promise<{ locale: string }> }

export async function generateStaticParams() {
  return [{ locale: 'de' }, { locale: 'en' }];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'pqcLagebild.method' });
  return {
    title: t('pageTitle'),
    description: t('metaDescription'),
    ...pageMeta(locale, '/pqc-lagebild/methodik', { title: t('pageTitle'), description: t('metaDescription') }),
    ...(PQC_LAGEBILD_PUBLIC ? {} : { robots: { index: false, follow: false } }),
  };
}

const SECTIONS = ['what', 'who', 'categories', 'how', 'hosting', 'mail', 'privacy', 'views', 'software', 'limits', 'automation', 'optout'] as const;

export default async function MethodPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('pqcLagebild.method');
  const { latest } = loadLagebild();
  const ds = latest?.data ?? null;

  return (
    <div className="bg-[var(--color-bg-surface)]">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <header className="mb-12">
          <p className="mono-label text-[var(--color-primary)] mb-2">{'// pqc-lagebild · '}{t('label')}</p>
          <h1 className="text-3xl sm:text-4xl font-bold text-[var(--color-text-base)]">{t('pageTitle')}</h1>
          <p className="mt-4 text-[var(--color-text-muted)] leading-relaxed">{t('intro')}</p>
          <p className="mt-6">
            <Link href="/pqc-lagebild" className="font-mono text-sm text-[var(--color-primary)] underline underline-offset-4 hover:opacity-80">
              ← {t('back')}
            </Link>
          </p>
        </header>

        <div className="space-y-12">
          {SECTIONS.map((s) => (
            <section key={s} id={s}>
              <h2 className="text-2xl font-bold text-[var(--color-text-base)]">{t(`${s}.title`)}</h2>
              <div className="mt-4 space-y-4 text-[var(--color-text-muted)] leading-relaxed">
                {t(`${s}.body`).split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
              </div>
              {s === 'who' && ds && (
                <div className="mt-6 overflow-x-auto rounded-xl border border-[var(--color-border)]">
                  <table className="min-w-full text-sm">
                    <caption className="px-4 pt-3 text-left font-mono text-xs text-[var(--color-text-muted)]">
                      {t('sourcesCaption', { month: formatMonth(ds.month, locale) })}
                    </caption>
                    <thead className="text-left font-mono text-[11px] uppercase tracking-wider text-[var(--color-text-muted)]">
                      <tr>
                        <th scope="col" className="px-4 py-2">{t('sourcesSource')}</th>
                        <th scope="col" className="px-4 py-2">{t('sourcesLicense')}</th>
                        <th scope="col" className="px-4 py-2 text-right">{t('sourcesCount')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ds.sources.map((src) => (
                        <tr key={src.id} className="border-t border-[var(--color-border-dim)]">
                          <td className="px-4 py-2 text-[var(--color-text-base)]">
                            {src.url ? <a href={src.url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--color-primary)]">{src.label}</a> : src.label}
                            {src.listId && <span className="ml-2 font-mono text-xs text-[var(--color-text-muted)]">ID {src.listId}</span>}
                          </td>
                          <td className="px-4 py-2 text-[var(--color-text-muted)]">{src.license ?? '–'}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-[var(--color-text-muted)]">{formatNumber(src.count, locale)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {s === 'privacy' && ds && (
                <p className="mt-4 font-mono text-xs text-[var(--color-text-muted)]">
                  {t('minCellNow', { min: String(ds.minCell), suppressed: formatNumber(ds.suppressedCells, locale) })}
                </p>
              )}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
