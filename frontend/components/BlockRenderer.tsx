'use client';

import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { ContentBlock, RichTextBlock, MediaBlock, QuoteBlock, SliderBlock } from '@/lib/types';
import { getStrapiUrl } from '@/lib/strapi';
import { Link } from '@/i18n/navigation';
import { applyAutoLinksToMarkdown } from '@/lib/autolinker';
import type { AutoLink } from '@/lib/autolinker';

// ─── Block Sub-Components ────────────────────────────────────────────────────

function RichText({
  block,
  body,
}: {
  block: RichTextBlock;
  body: string;
}) {

  return (
    <div className="prose prose-invert prose-pqc prose-lg max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith('/blog/')) {
              return <Link href={href}>{children}</Link>;
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

function MediaBlockRenderer({ block }: { block: MediaBlock }) {
  const url = getStrapiUrl(block.file?.url);
  if (!url) return null;

  return (
    <figure className="my-8 overflow-hidden rounded-lg border border-[var(--color-border)]">
      <Image
        src={url}
        alt={block.file.alternativeText ?? ''}
        width={block.file.width ?? 1200}
        height={block.file.height ?? 675}
        className="w-full object-cover"
      />
    </figure>
  );
}

function Quote({ block }: { block: QuoteBlock }) {
  return (
    <blockquote
      className="my-8 border-l-4 border-[var(--color-primary)] bg-[var(--color-bg-surface)] px-6 py-4 rounded-r-lg"
      aria-label="Quote"
    >
      {block.title && (
        <p className="font-semibold text-[var(--color-primary)] text-sm mono-label mb-2">
          {block.title}
        </p>
      )}
      <p className="text-[var(--color-text-muted)] italic leading-relaxed">{block.body}</p>
    </blockquote>
  );
}

function Slider({ block }: { block: SliderBlock }) {
  if (!block.files?.length) return null;

  return (
    <div
      className="my-8 grid grid-cols-1 gap-4 sm:grid-cols-2"
      role="list"
      aria-label="Image gallery"
    >
      {block.files.map((file) => {
        const url = getStrapiUrl(file.url);
        if (!url) return null;
        return (
          <figure
            key={file.id}
            className="overflow-hidden rounded-lg border border-[var(--color-border)]"
            role="listitem"
          >
            <Image
              src={url}
              alt={file.alternativeText ?? ''}
              width={file.width ?? 800}
              height={file.height ?? 500}
              className="w-full object-cover"
            />
          </figure>
        );
      })}
    </div>
  );
}

// ─── Main Renderer ───────────────────────────────────────────────────────────

interface BlockRendererProps {
  blocks: ContentBlock[];
  autoLinks?: AutoLink[];
  currentSlug?: string;
}

export default function BlockRenderer({ blocks, autoLinks, currentSlug }: BlockRendererProps) {
  if (!blocks?.length) return null;

  // Pre-process all rich-text bodies with a single shared Set so each slug
  // is linked at most once across the entire article, not once per block.
  const linked = new Set<string>();
  const processedBodies = new Map<number, string>();
  if (autoLinks?.length) {
    for (const block of blocks) {
      if (block.__component === 'shared.rich-text') {
        processedBodies.set(
          block.id,
          applyAutoLinksToMarkdown(block.body, autoLinks, currentSlug ?? '', linked),
        );
      }
    }
  }

  return (
    <div className="space-y-6">
      {blocks.map((block) => {
        switch (block.__component) {
          case 'shared.rich-text':
            return (
              <RichText
                key={`${block.__component}-${block.id}`}
                block={block}
                body={processedBodies.get(block.id) ?? block.body}
              />
            );
          case 'shared.media':
            return <MediaBlockRenderer key={`${block.__component}-${block.id}`} block={block} />;
          case 'shared.quote':
            return <Quote key={`${block.__component}-${block.id}`} block={block} />;
          case 'shared.slider':
            return <Slider key={`${block.__component}-${block.id}`} block={block} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
