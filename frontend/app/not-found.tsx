import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '404 — Seite nicht gefunden | Beyond Shor',
};

export default function NotFound() {
  return (
    <div className="grid-bg relative flex min-h-[calc(100vh-16rem)] items-center justify-center overflow-hidden px-4">
      {/* Decorative scan-line */}
      <div className="scan-line" aria-hidden="true" />

      {/* Background orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="orb orb-a opacity-40" />
        <div className="orb orb-c opacity-30" />
      </div>

      <div className="relative text-center animate-fade-up">
        {/* Large gradient 404 */}
        <p
          className="font-mono font-black leading-none tracking-tighter select-none"
          style={{
            fontSize: 'clamp(6rem, 20vw, 13rem)',
            background:
              'linear-gradient(135deg, #1e293b 0%, #0c3553 35%, #06b6d4 65%, #0891b2 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
          aria-hidden="true"
        >
          404
        </p>

        <p className="mono-label text-[var(--color-primary)] mb-4 animate-fade-up-delay-1">
          // route_not_found
        </p>

        <h1 className="text-2xl font-bold text-[var(--color-text-base)] sm:text-3xl mb-3 animate-fade-up-delay-1">
          Seite nicht gefunden
        </h1>

        <p className="text-[var(--color-text-muted)] max-w-xs mx-auto mb-10 animate-fade-up-delay-2">
          Die gesuchte Seite existiert nicht oder wurde verschoben.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)]/10 px-6 py-3 text-sm font-mono font-semibold text-[var(--color-primary)] transition-all hover:bg-[var(--color-primary)]/20 hover:shadow-[0_0_24px_rgba(6,182,212,0.2)] animate-fade-up-delay-2"
        >
          ← Zurück zur Startseite
        </Link>
      </div>
    </div>
  );
}
