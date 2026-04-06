'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import LogoMark from './LogoMark';

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
            <LogoMark className="w-5 h-5 shrink-0 text-[var(--color-primary)]" />
            <span className="mono-label text-[var(--color-text-muted)]">Beyond Shor</span>
          </div>

          {/* Tagline */}
          <p className="text-xs text-[var(--color-text-dim)] font-mono text-center">
            {t('tagline')}
          </p>

          {/* Copyright + GitHub */}
          <div className="flex items-center gap-3">
            <p className="text-xs text-[var(--color-text-dim)]">
              © {year} {t('rights')}
            </p>
            <a
              href="https://github.com/BeyondShor/beyond-shor"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub Repository"
              className="text-[var(--color-text-dim)] hover:text-[var(--color-primary)] transition-colors duration-200"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
