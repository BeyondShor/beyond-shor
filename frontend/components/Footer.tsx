'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';

export default function Footer() {
  const t = useTranslations('footer');
  const pathname = usePathname();
  const year = new Date().getFullYear();

  const linkClass = (href: string) => {
    const active = pathname === href || pathname.startsWith(href + '/');
    return [
      'mono-label transition-colors duration-200 relative',
      'after:absolute after:bottom-[-4px] after:left-0 after:h-px after:bg-[var(--color-primary)] after:transition-all after:duration-200',
      active
        ? 'text-[var(--color-primary)] after:w-full'
        : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)] after:w-0 hover:after:w-full',
    ].join(' ');
  };

  return (
    <footer
      className="mt-auto border-t border-[var(--color-glass-border)] glass-panel-strong"
      role="contentinfo"
    >
      <div
        className="h-px w-full bg-gradient-to-r from-transparent via-[var(--color-primary)] to-transparent opacity-20"
        aria-hidden="true"
      />
      {/* Legal links */}
      <div className="mx-auto max-w-6xl px-4 pt-6 pb-2 sm:px-6 flex justify-center gap-6 border-b border-[var(--color-glass-border)]">
        {/* locale-aware link */}
        <Link href="/kontakt" className={linkClass('/kontakt')} aria-current={pathname === '/kontakt' ? 'page' : undefined}>
          {t('contact')}
        </Link>
        <Link href="/impressum" className={linkClass('/impressum')} aria-current={pathname === '/impressum' ? 'page' : undefined}>
          {t('impressum')}
        </Link>
        <Link href="/datenschutz" className={linkClass('/datenschutz')} aria-current={pathname === '/datenschutz' ? 'page' : undefined}>
          {t('datenschutz')}
        </Link>
        <Link
          href="/rss"
          className={`${linkClass('/rss')} inline-flex items-center gap-1`}
          aria-current={pathname === '/rss' ? 'page' : undefined}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-3.5 h-3.5"
            aria-hidden="true"
          >
            <path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19.01 7.38 20 6.18 20C4.98 20 4 19.01 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/>
          </svg>
          RSS
        </Link>
      </div>
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          {/* Branding */}
          <div className="flex items-center gap-2">
            <span className="font-mono text-[var(--color-primary)] font-bold" aria-hidden="true">
              [
            </span>
            <span className="mono-label text-[var(--color-text-muted)]">Beyond Shor</span>
            <span className="font-mono text-[var(--color-primary)] font-bold" aria-hidden="true">
              ]
            </span>
          </div>

          {/* Tagline */}
          <p className="text-xs text-[var(--color-text-dim)] font-mono text-center">
            {t('tagline')}
          </p>

          {/* Copyright */}
          <p className="text-xs text-[var(--color-text-dim)]">
            © {year} {t('rights')}
          </p>
        </div>
      </div>
    </footer>
  );
}
