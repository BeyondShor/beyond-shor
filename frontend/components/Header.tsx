'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import LanguageSwitcher from './LanguageSwitcher';

export default function Header() {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  const NAV_LINKS = [
    { href: '/blog'       as const, label: t('blog')       },
    { href: '/about'      as const, label: t('about')      },
    { href: '/cbom'       as const, label: t('cbom')       },
    { href: '/verify'     as const, label: t('verify')     },
    { href: '/playground' as const, label: t('playground') },
  ];

  // Scroll lock when drawer is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  // Close drawer on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <>
      <header
        className="sticky top-0 z-50 border-b border-[var(--color-glass-border)] glass-panel-strong"
        role="banner"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          {/* Logo */}
          <Link
            href="/"
            className="group flex items-center gap-2"
            aria-label="Beyond Shor — Home"
          >
            <span
              className="font-mono text-[var(--color-primary)] text-lg font-bold select-none"
              aria-hidden="true"
            >
              [
            </span>
            <span className="font-mono text-[var(--color-text-base)] text-sm font-semibold tracking-wide uppercase group-hover:text-[var(--color-primary)] transition-colors">
              Beyond Shor
            </span>
            <span
              className="font-mono text-[var(--color-primary)] text-lg font-bold select-none"
              aria-hidden="true"
            >
              ]
            </span>
          </Link>

          {/* Desktop navigation */}
          <nav aria-label="Main navigation" className="hidden sm:block">
            <ul className="flex items-center gap-6 list-none m-0 p-0">
              {NAV_LINKS.map(({ href, label }) => {
                const active = isActive(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      className={[
                        'mono-label transition-colors duration-200 relative',
                        'after:absolute after:bottom-[-4px] after:left-0 after:h-px after:bg-[var(--color-primary)] after:transition-all after:duration-200',
                        active
                          ? 'text-[var(--color-primary)] after:w-full'
                          : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)] after:w-0 hover:after:w-full',
                      ].join(' ')}
                    >
                      {label}
                    </Link>
                  </li>
                );
              })}
              <li>
                <LanguageSwitcher />
              </li>
            </ul>
          </nav>

          {/* Mobile: language switcher + hamburger */}
          <div className="flex items-center gap-3 sm:hidden">
            <LanguageSwitcher />
            <button
              className={`flex flex-col justify-center items-center gap-[5px] w-8 h-8 rounded focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]${menuOpen ? ' hamburger-open' : ''}`}
              aria-label={menuOpen ? t('closeMenu') : t('openMenu')}
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMenuOpen(v => !v)}
            >
              <span className="hamburger-bar" />
              <span className="hamburger-bar" />
              <span className="hamburger-bar" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile navigation */}
      {menuOpen && (
        <>
          {/* Overlay */}
          <div
            className="mobile-nav-overlay"
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
          />

          {/* Drawer */}
          <nav
            id="mobile-nav"
            className="mobile-nav-drawer"
            aria-label="Mobile navigation"
          >
            {/* Drawer header */}
            <div className="flex items-center justify-between p-5 border-b border-[var(--color-glass-border)]">
              <span className="mono-label text-[var(--color-text-dim)]">// navigation</span>
              <button
                onClick={() => setMenuOpen(false)}
                aria-label={t('closeMenu')}
                className="w-8 h-8 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-primary)] transition-colors"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M2 2l12 12M14 2L2 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Link list */}
            <ul className="flex flex-col gap-3 p-5 list-none m-0">
              {NAV_LINKS.map(({ href, label }, i) => {
                const active = isActive(href);
                return (
                  <li
                    key={href}
                    className={i === 0 ? 'animate-fade-up' : `animate-fade-up-delay-${i}`}
                  >
                    <Link
                      href={href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={active ? 'page' : undefined}
                      className={[
                        'glass-panel flex items-center gap-3 rounded-lg px-4 py-3 transition-colors group',
                        active
                          ? 'text-[var(--color-primary)] border border-[var(--color-primary)] border-opacity-40'
                          : 'text-[var(--color-text-base)] hover:text-[var(--color-primary)]',
                      ].join(' ')}
                    >
                      <span className={[
                        'mono-label transition-colors',
                        active ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-dim)] group-hover:text-[var(--color-primary-dim)]',
                      ].join(' ')}>
                        {String(i + 1).padStart(2, '0')}.
                      </span>
                      <span className="font-semibold">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Drawer footer */}
            <div className="mt-auto p-5 border-t border-[var(--color-glass-border)]">
              <p className="mono-label text-[var(--color-text-dim)] text-center">
                post-quantum cryptography
              </p>
            </div>
          </nav>
        </>
      )}
    </>
  );
}
