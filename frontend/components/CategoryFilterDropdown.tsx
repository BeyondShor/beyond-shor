'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from '@/i18n/navigation';
import { useTranslations } from 'next-intl';

interface Category {
  id: number;
  slug: string;
  name: string;
}

interface Props {
  categories: Category[];
  activeCategory: string | null;
}

export default function CategoryFilterDropdown({ categories, activeCategory }: Props) {
  const t = useTranslations('blog');
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeName = activeCategory
    ? (categories.find((c) => c.slug === activeCategory)?.name ?? activeCategory)
    : null;

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  function navigate(slug: string | null) {
    const qs = slug ? `?category=${encodeURIComponent(slug)}` : '';
    router.push(`${pathname}${qs}`);
    setOpen(false);
  }

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('categoryFilter')}
        className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-mono font-semibold transition-colors ${
          activeCategory
            ? 'border-[var(--color-primary)] bg-[var(--color-primary)] text-[var(--color-bg-base)]'
            : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
        }`}
      >
        <svg
          className="h-3.5 w-3.5 flex-shrink-0"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <path d="M2 4h12M4 8h8M6 12h4" strokeLinecap="round" />
        </svg>
        <span>{activeName ?? t('categoryAll')}</span>
        <svg
          className={`h-3 w-3 flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M2 4l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="listbox"
          aria-label={t('categoryFilter')}
          className="absolute left-0 top-full mt-2 z-20 min-w-[13rem] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-2xl"
        >
          {/* "All" item */}
          <button
            role="option"
            aria-selected={!activeCategory}
            type="button"
            onClick={() => navigate(null)}
            className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-mono font-semibold transition-colors ${
              !activeCategory
                ? 'text-[var(--color-primary)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]'
            }`}
          >
            <span
              className={`h-1.5 w-1.5 flex-shrink-0 rounded-full transition-colors ${
                !activeCategory ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
              }`}
            />
            {t('categoryAll')}
          </button>

          <div className="border-t border-[var(--color-border)]" />

          {categories.map((cat) => (
            <button
              key={cat.id}
              role="option"
              aria-selected={activeCategory === cat.slug}
              type="button"
              onClick={() => navigate(cat.slug)}
              className={`flex w-full items-center gap-3 px-4 py-2.5 text-left text-xs font-mono font-semibold transition-colors ${
                activeCategory === cat.slug
                  ? 'text-[var(--color-primary)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-primary)]'
              }`}
            >
              <span
                className={`h-1.5 w-1.5 flex-shrink-0 rounded-full transition-colors ${
                  activeCategory === cat.slug ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]'
                }`}
              />
              {cat.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
