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
import { createHighlighter, type Highlighter } from 'shiki';
import { slugify } from '@/lib/headings';

// ─── Shiki singleton ─────────────────────────────────────────────────────────

let _highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!_highlighterPromise) {
    _highlighterPromise = createHighlighter({
      themes: ['github-dark'],
      langs: ['typescript', 'javascript', 'python', 'bash', 'shell', 'json', 'rust', 'c', 'cpp'],
    });
  }
  return _highlighterPromise;
}

// ─── Heading text helper ─────────────────────────────────────────────────────

function nodeToText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeToText).join('');
  if (node !== null && typeof node === 'object' && 'props' in node) {
    return nodeToText((node as { props: { children?: React.ReactNode } }).props.children);
  }
  return '';
}

// ─── Block Sub-Components ────────────────────────────────────────────────────

async function RichText({ body }: { block: RichTextBlock; body: string }) {
  // Pre-highlight fenced code blocks so the synchronous ReactMarkdown
  // `pre` component can look up already-computed HTML.
  const codeMap = new Map<string, string>();

  try {
    const highlighter = await getHighlighter();
    const codeRegex = /^```(\w+)?[ \t]*\r?\n([\s\S]*?)^```/gm;
    let match: RegExpExecArray | null;

    while ((match = codeRegex.exec(body)) !== null) {
      const lang = (match[1] ?? 'text').toLowerCase();
      const code = match[2].replace(/\n$/, '');
      const key = `${lang}::${code}`;
      if (!codeMap.has(key)) {
        try {
          codeMap.set(key, highlighter.codeToHtml(code, { lang: lang as never, theme: 'github-dark' }));
        } catch {
          // Unknown language — fall back to plain rendering
        }
      }
    }
  } catch {
    // Shiki unavailable — plain code blocks
  }

  return (
    <div className="prose prose-invert prose-pqc prose-lg max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children }) => {
            const isSafe = href && /^(https?:\/\/|\/|#|mailto:)/.test(href);
            if (!isSafe) return <>{children}</>;
            if (href.startsWith('/blog/')) {
              return <Link href={href}>{children}</Link>;
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
          h2: ({ children }) => {
            const id = slugify(nodeToText(children));
            return <h2 id={id}>{children}</h2>;
          },
          h3: ({ children }) => {
            const id = slugify(nodeToText(children));
            return <h3 id={id}>{children}</h3>;
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pre: ({ node, children }: any) => {
            const codeEl = node?.children?.[0];
            if (codeEl?.type === 'element' && codeEl.tagName === 'code') {
              const classNames = codeEl.properties?.className ?? [];
              const className = Array.isArray(classNames) ? String(classNames[0] ?? '') : '';
              const lang = className.replace('language-', '') || 'text';
              const rawCode = (codeEl.children ?? [])
                .filter((c: { type: string }) => c.type === 'text')
                .map((c: { value: string }) => c.value)
                .join('')
                .replace(/\n$/, '');

              const html = codeMap.get(`${lang}::${rawCode}`);
              if (html) {
                return (
                  <div
                    className="not-prose my-6 overflow-hidden rounded-lg border border-[var(--color-border)] text-sm [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:p-5"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                );
              }
            }
            return (
              <pre className="not-prose my-6 overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[#0d1117] p-5 text-sm">
                {children}
              </pre>
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
        alt={block.file.alternativeText || block.file.url.split('/').pop() || 'Bild'}
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
              alt={file.alternativeText || file.url.split('/').pop() || 'Bild'}
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

export default async function BlockRenderer({ blocks, autoLinks, currentSlug }: BlockRendererProps) {
  if (!blocks?.length) return null;

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
      {await Promise.all(
        blocks.map(async (block) => {
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
        }),
      )}
    </div>
  );
}
