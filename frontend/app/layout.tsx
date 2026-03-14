import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';
import 'katex/dist/katex.min.css';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  ),
  alternates: {
    types: {
      'application/rss+xml': [
        { url: '/de/feed.xml', title: 'Beyond Shor RSS (Deutsch)' },
        { url: '/en/feed.xml', title: 'Beyond Shor RSS (English)' },
      ],
    },
  },
  title: {
    default: 'Beyond Shor — Post-Quantum Cryptography',
    template: '%s | Beyond Shor',
  },
  description:
    'Expert insights on Post-Quantum Cryptography for C-Suite executives and security professionals.',
  keywords: [
    'post-quantum cryptography',
    'PQC',
    'NIST',
    'lattice cryptography',
    'cybersecurity',
    'quantum-safe',
  ],
  authors: [{ name: 'Beyond Shor' }],
  robots: { index: true, follow: true },
  openGraph: {
    type: 'website',
    siteName: 'Beyond Shor',
  },
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <body className="flex min-h-screen flex-col antialiased">
        {children}
      </body>
    </html>
  );
}
