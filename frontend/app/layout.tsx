import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { getLocale } from 'next-intl/server';
import 'katex/dist/katex.min.css';
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
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.svg',       type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon.ico',       sizes: '32x32', type: 'image/x-icon' },
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    siteName: 'Beyond Shor',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Beyond Shor — Post-Quantum Cryptography' }],
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
