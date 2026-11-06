// cbom-ignore — this file contains algorithm names as text patterns, not as crypto implementations
export interface AutoLink {
  slug: string;
  path: string;
}

// ASCII spellings in slugs that stand for German letters in the text
const UMLAUTS: Record<string, string> = { ae: '(?:ae|ä)', oe: '(?:oe|ö)', ue: '(?:ue|ü)', ss: '(?:ss|ß)' };

/**
 * Converts a slug into a case-insensitive regex for the term it names.
 *
 * - "-" also matches a space or nothing: "classic-mceliece" → "Classic McEliece"
 * - umlaut spellings match both forms: "krypto-agilitaet" → "Krypto-Agilität"
 * - suffixes are fine ("FrodoKEM-640", "KEMs"), but the match must not start in
 *   the middle of a word or right after a hyphen: "kem" must not hit the "KEM"
 *   in "ML-KEM", "lwe" not the one in "Module-LWE"
 */
export function slugToRegex(slug: string): RegExp {
  let pattern = '';
  for (let i = 0; i < slug.length; ) {
    const pair = slug.slice(i, i + 2).toLowerCase();
    if (UMLAUTS[pair]) {
      pattern += UMLAUTS[pair];
      i += 2;
      continue;
    }
    const c = slug[i];
    pattern += c === '-' ? '[-\\s]?' : c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    i += 1;
  }
  return new RegExp('(?<![\\p{L}\\p{N}_-])' + pattern, 'giu');
}

/**
 * Preprocesses a markdown string by inserting auto-links for known article slugs.
 *
 * Rules:
 * - Code blocks, inline code, existing markdown links, headings and bare URLs are never touched.
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
  // headings stay plain text, and bare URLs must not get a link spliced into them
  const protectedPattern =
    /```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`|\[([^\]]*)\]\([^)]*\)|\[([^\]]*)\]\[[^\]]*\]|^#{1,6} .*$|https?:\/\/[^\s)]+/gm;

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
