import type { ContentBlock } from './types';

export interface Heading {
  id: string;
  text: string;
  level: number;
}

/**
 * Simple slugify that matches the ID generation in BlockRenderer's h2/h3 components.
 * Lowercase, strip non-word chars, collapse spaces to hyphens.
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\([^)]+\)/g, '$1');
}

/** Extract h2 and h3 headings from all rich-text blocks. */
export function extractHeadings(blocks: ContentBlock[]): Heading[] {
  const headings: Heading[] = [];
  for (const block of blocks) {
    if (block.__component !== 'shared.rich-text') continue;
    for (const line of block.body.split('\n')) {
      const m = line.match(/^(#{2,3})\s+(.+)/);
      if (!m) continue;
      const text = stripMarkdown(m[2].trim());
      headings.push({ id: slugify(text), text, level: m[1].length });
    }
  }
  return headings;
}
