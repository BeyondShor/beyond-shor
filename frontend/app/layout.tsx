import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { getLocale } from 'next-intl/server';
import './globals.css';

const fontSans = localFont({
  src: '../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  variable: '--font-inter',
  display: 'swap',
  preload: true,
});

const fontMono = localFont({
  src: '../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
  variable: '--font-jetbrains',
  display: 'swap',
  preload: false,
});

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
    <html lang={locale} className={`${fontSans.variable} ${fontMono.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col antialiased">
        {children}
      </body>
      {/* eslint-disable-next-line @next/next/no-before-interactive-script-component */}
      <script defer src="https://analytics.beyond-shor.eu/script.js" data-website-id="1cfde2d7-291d-4c33-b7a4-e182a6c12d53"></script>
    </html>
  );
}
