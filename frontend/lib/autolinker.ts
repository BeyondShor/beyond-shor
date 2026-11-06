// cbom-ignore — this file contains algorithm names as text patterns, not as crypto implementations
export interface AutoLink {
  slug: string;
  path: string;
}

/**
 * Converts a slug into a case-insensitive regex that also matches
 * space- or hyphen-separated variants and suffixed versions.
 *
 * Examples:
 *   "frodokem"       → /\bfrodokem/gi  → matches "FrodoKEM", "FrodoKEM-640-AES"
 *   "ml-kem"         → /\bml[-\s]?kem/gi → matches "ML-KEM", "ml kem", "ML-KEM-768"
 */
export function slugToRegex(slug: string): RegExp {
  const pattern =
    '\\b' +
    slug
      .split('')
      .map((c) =>
        c === '-'
          ? '[-\\s]?'
          : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
      )
      .join('');
  return new RegExp(pattern, 'gi');
}

/**
 * Preprocesses a markdown string by inserting auto-links for known article slugs.
 *
 * Rules:
 * - Code blocks, inline code, and existing markdown links are never touched.
 * - Each slug is linked at most once (first occurrence wins).
 * - Longer slugs are matched before shorter ones to avoid partial matches.
 * - The article's own slug is never linked (no self-links).
 */
export function applyAutoLinksToMarkdown(
  markdown: string,
  links: AutoLink[],
  currentSlug: string,
  linked: Set<string> = new Set(),
): string {
  if (!links.length || !markdown) return markdown;

  const relevantLinks = links
    .filter((l) => l.slug !== currentSlug)
    .sort((a, b) => b.slug.length - a.slug.length); // longest slug first

  if (!relevantLinks.length) return markdown;

  // Split into protected segments (code blocks, inline code, existing links)
  // and plain-text segments that are safe to process.
  const protectedPattern =
    /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`|\[([^\]]*)\]\([^)]*\)|\[([^\]]*)\]\[[^\]]*\]/g;

  const segments: Array<{ protected: boolean; content: string }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = protectedPattern.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        protected: false,
        content: markdown.slice(lastIndex, match.index),
      });
    }
    segments.push({ protected: true, content: match[0] });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < markdown.length) {
    segments.push({ protected: false, content: markdown.slice(lastIndex) });
  }

  // A link inserted for one slug becomes a protected segment right away, so a
  // shorter slug can never match inside it: "Classic McEliece" → classic-mceliece
  // must not turn into [Classic [McEliece](/blog/mceliece)](/blog/classic-mceliece).
  for (const link of relevantLinks) {
    if (linked.has(link.slug)) continue;
    const regex = slugToRegex(link.slug);

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.protected) continue;
      regex.lastIndex = 0;
      const m = regex.exec(seg.content);
      if (!m) continue;

      const before = seg.content.slice(0, m.index);
      const after = seg.content.slice(m.index + m[0].length);
      segments.splice(
        i, 1,
        { protected: false, content: before },
        { protected: true, content: `[${m[0]}](${link.path})` },
        { protected: false, content: after },
      );
      linked.add(link.slug);
      break; // first occurrence only
    }
  }

  return segments.map((seg) => seg.content).join('');
}
