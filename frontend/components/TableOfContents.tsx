'use client';

import { useState, useEffect } from 'react';
import type { Heading } from '@/lib/headings';

interface Props {
  headings: Heading[];
  locale: string;
}

export default function TableOfContents({ headings, locale }: Props) {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) setActiveId(visible[0].target.id);
      },
      { rootMargin: '-80px 0% -70% 0%', threshold: 0 },
    );

    headings.forEach((h) => {
      const el = document.getElementById(h.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [headings]);

  if (headings.length < 3) return null;

  return (
    <nav
      className="hidden 2xl:block fixed top-28 z-10 w-52 max-h-[calc(100vh-10rem)] overflow-y-auto"
      style={{ left: 'calc(50% + 26rem)' }}
      aria-label={locale === 'de' ? 'Inhaltsverzeichnis' : 'Table of contents'}
    >
      <p className="mono-label text-[var(--color-primary)] mb-4">
        {locale === 'de' ? '// inhalt' : '// contents'}
      </p>
      <ul className="space-y-1.5 border-l border-[var(--color-border)]">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              onClick={(e) => {
                e.preventDefault();
                document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`block text-xs leading-relaxed transition-colors border-l -ml-px ${
                activeId === h.id
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-base)]'
              }`}
              style={{ paddingLeft: `${0.75 + (h.level - 2) * 0.75}rem` }}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
