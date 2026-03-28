import { getArticlesForFeed } from '@/lib/strapi';
import type { RichTextBlock } from '@/lib/types';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');

const FEED_META: Record<string, { title: string; description: string; language: string }> = {
  de: {
    title: 'Beyond Shor — Post-Quantum Cryptography',
    description: 'Expertenwissen zu Post-Quanten-Kryptografie für Sicherheitsverantwortliche und IT-Entscheider.',
    language: 'de',
  },
  en: {
    title: 'Beyond Shor — Post-Quantum Cryptography',
    description: 'Expert insights on Post-Quantum Cryptography for C-Suite executives and security professionals.',
    language: 'en',
  },
};

function stripMarkdown(md: string): string {
  return md
    .replace(/#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/^>\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ locale: string }> },
) {
  const { locale } = await params;
  const meta = FEED_META[locale] ?? FEED_META['de'];

  const res = await getArticlesForFeed(locale, 20);
  const articles = res.data;

  const items = articles
    .map((article) => {
      const firstRichText = article.blocks?.find(
        (b): b is RichTextBlock => b.__component === 'shared.rich-text',
      );
      const teaser = firstRichText ? escapeXml(stripMarkdown(firstRichText.body)) : '';
      const link = `${SITE_URL}/${locale}/blog/${article.slug}`;
      const pubDate = new Date(article.publishedAt).toUTCString();

      return `    <item>
      <title>${escapeXml(article.title)}</title>
      <link>${link}</link>
      <guid isPermaLink="true">${link}</guid>
      <pubDate>${pubDate}</pubDate>
      ${teaser ? `<description>${teaser}</description>` : ''}
    </item>`;
    })
    .join('\n');

  const feedUrl = `${SITE_URL}/${locale}/feed.xml`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(meta.title)}</title>
    <link>${SITE_URL}/${locale}</link>
    <description>${escapeXml(meta.description)}</description>
    <language>${meta.language}</language>
    <atom:link href="${feedUrl}" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  });
}
