import type { Metadata } from 'next';
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { createHighlighter } from 'shiki';
import PlaygroundWrapper from '@/components/PlaygroundWrapper';
import type { KemAlgorithm } from '@/lib/playground-types';
import type { DsaAlgorithm } from '@/lib/signature-types';
import { getPlaygroundPage } from '@/lib/strapi';

interface PageProps {
  params: Promise<{ locale: string }>;
}

export async function generateStaticParams() {
  return [{ locale: 'de' }, { locale: 'en' }];
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'playground' });
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://beyond-shor.eu';
  const path = locale === 'de' ? '/de/playground' : '/en/playground';

  return {
    title: t('pageTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${siteUrl}${path}`,
      languages: {
        de: `${siteUrl}/de/playground`,
        en: `${siteUrl}/en/playground`,
      },
    },
    openGraph: {
      title: t('pageTitle'),
      description: t('metaDescription'),
      url: `${siteUrl}${path}`,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: t('pageTitle'),
      description: t('metaDescription'),
    },
  };
}

// ── KEM Code snippets ────────────────────────────────────────────────────────

const KEM_SNIPPETS: Record<KemAlgorithm, string> = {
  mlkem: `import { ml_kem1024 } from '@noble/post-quantum/ml-kem.js';

const { publicKey, secretKey } = ml_kem1024.keygen();
const { cipherText, sharedSecret } = ml_kem1024.encapsulate(publicKey);
// Server:
const recovered = ml_kem1024.decapsulate(cipherText, secretKey);`,

  mceliece: `import { mceliece } from 'mceliece';

// Runs in a Web Worker — main thread stays responsive
const { publicKey, privateKey } = await mceliece.keyPair();
const { cyphertext, secret } = await mceliece.encrypt(publicKey);
// Server:
const recovered = await mceliece.decrypt(cyphertext, privateKey);`,

  frodokem: `import { createFrodoKEM1344AES } from '@oqs/liboqs-js';

const alice = await createFrodoKEM1344AES();
const bob   = await createFrodoKEM1344AES();

const { publicKey, secretKey } = alice.generateKeyPair();
const { ciphertext, sharedSecret } = bob.encapsulate(publicKey);
// Server:
const recovered = alice.decapsulate(ciphertext, secretKey);

alice.destroy(); bob.destroy();`,
};

// ── DSA Code snippets ─────────────────────────────────────────────────────────

const DSA_SNIPPETS: Record<DsaAlgorithm, string> = {
  ecdsa: `import { p256 } from '@noble/curves/nist.js';

const sk = p256.utils.randomSecretKey();
const pk = p256.getPublicKey(sk, true);  // 33-byte compressed

const sig = p256.sign(msg, sk, { prehash: true }); // Uint8Array (64 B)
const ok  = p256.verify(sig, msg, pk, { prehash: true });`,

  mldsa65: `import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';

const { secretKey, publicKey } = ml_dsa65.keygen();
const sig = ml_dsa65.sign(msg, secretKey);
const ok  = ml_dsa65.verify(sig, msg, publicKey);`,

  slhdsa128s: `import { slh_dsa_sha2_128s } from '@noble/post-quantum/slh-dsa.js';

const { secretKey, publicKey } = slh_dsa_sha2_128s.keygen();
const sig = slh_dsa_sha2_128s.sign(msg, secretKey);
const ok  = slh_dsa_sha2_128s.verify(sig, msg, publicKey);`,

  slhdsa128f: `import { slh_dsa_sha2_128f } from '@noble/post-quantum/slh-dsa.js';

const { secretKey, publicKey } = slh_dsa_sha2_128f.keygen();
const sig = slh_dsa_sha2_128f.sign(msg, secretKey);
const ok  = slh_dsa_sha2_128f.verify(sig, msg, publicKey);`,
};

// ── Shared highlighter ────────────────────────────────────────────────────────

let _highlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null;

async function getHighlighter() {
  if (!_highlighter) {
    _highlighter = await createHighlighter({
      themes: ['github-dark'],
      langs: ['typescript'],
    });
  }
  return _highlighter;
}

async function getKemSnippetHtmls(): Promise<Record<KemAlgorithm, string>> {
  const h = await getHighlighter();
  const render = (code: string) => h.codeToHtml(code, { lang: 'typescript', theme: 'github-dark' });
  return {
    mlkem:    render(KEM_SNIPPETS.mlkem),
    mceliece: render(KEM_SNIPPETS.mceliece),
    frodokem: render(KEM_SNIPPETS.frodokem),
  };
}

async function getDsaSnippetHtmls(): Promise<Record<DsaAlgorithm, string>> {
  const h = await getHighlighter();
  const render = (code: string) => h.codeToHtml(code, { lang: 'typescript', theme: 'github-dark' });
  return {
    ecdsa:      render(DSA_SNIPPETS.ecdsa),
    mldsa65:    render(DSA_SNIPPETS.mldsa65),
    slhdsa128s: render(DSA_SNIPPETS.slhdsa128s),
    slhdsa128f: render(DSA_SNIPPETS.slhdsa128f),
  };
}

// ── JSON-LD helpers ───────────────────────────────────────────────────────────

function buildHowToSchema(locale: string, t: Awaited<ReturnType<typeof getTranslations>>) {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://beyond-shor.eu';
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    'name': t('pageTitle'),
    'description': t('metaDescription'),
    'url': `${siteUrl}/${locale}/playground`,
    'step': [
      { '@type': 'HowToStep', 'position': 1, 'name': t('step1Title'), 'text': t('howToStep1') },
      { '@type': 'HowToStep', 'position': 2, 'name': t('step2Title'), 'text': t('howToStep2') },
      { '@type': 'HowToStep', 'position': 3, 'name': t('step3Title'), 'text': t('howToStep3') },
      { '@type': 'HowToStep', 'position': 4, 'name': t('step4Title'), 'text': t('howToStep4') },
      { '@type': 'HowToStep', 'position': 5, 'name': t('step5Title'), 'text': t('howToStep5') },
      { '@type': 'HowToStep', 'position': 6, 'name': t('step6Title'), 'text': t('howToStep6') },
    ],
  };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PlaygroundPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [kemSnippetHtmls, dsaSnippetHtmls, t, page] = await Promise.all([
    getKemSnippetHtmls(),
    getDsaSnippetHtmls(),
    getTranslations({ locale, namespace: 'playground' }),
    getPlaygroundPage(locale),
  ]);

  const howToSchema = buildHowToSchema(locale, t);

  const realWorldItems = page?.realWorldItems && page.realWorldItems.length > 0
    ? page.realWorldItems.map(item => ({
        name:        item.name,
        description: item.description,
        link:        item.link ?? '',
      }))
    : undefined;

  const sigRealWorldItems = page?.sigRealWorldItems && page.sigRealWorldItems.length > 0
    ? page.sigRealWorldItems.map(item => ({
        name:        item.name,
        description: item.description,
        link:        item.link ?? '',
      }))
    : undefined;

  return (
    <div className="bg-[var(--color-bg-surface)]">
      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }}
      />

      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <PlaygroundWrapper
          kemSnippetHtmls={kemSnippetHtmls}
          dsaSnippetHtmls={dsaSnippetHtmls}
          realWorldItems={realWorldItems}
          sigRealWorldItems={sigRealWorldItems}
        />
      </div>
    </div>
  );
}
