/**
 * Auto-links from article text to other articles, and the heading anchors.
 */
import { describe, it, expect } from 'vitest';
import { applyAutoLinksToMarkdown } from '@/lib/autolinker';
import { slugify } from '@/lib/headings';

const links = ['mceliece', 'classic-mceliece', 'frodokem', 'ML-KEM'].map((slug) => ({
  slug,
  path: `/blog/${slug}`,
}));

describe('applyAutoLinksToMarkdown', () => {
  it('never nests a shorter slug inside a longer one', () => {
    const out = applyAutoLinksToMarkdown('Classic McEliece und später nur McEliece.', links, 'frodokem');
    expect(out).toBe(
      '[Classic McEliece](/blog/classic-mceliece) und später nur [McEliece](/blog/mceliece).',
    );
  });

  it('links each slug once, at its first occurrence', () => {
    const out = applyAutoLinksToMarkdown('FrodoKEM, FrodoKEM-1344 und ML-KEM-768', links, 'x');
    expect(out).toBe('[FrodoKEM](/blog/frodokem), FrodoKEM-1344 und [ML-KEM](/blog/ML-KEM)-768');
  });

  it('skips the current article', () => {
    expect(applyAutoLinksToMarkdown('FrodoKEM', links, 'frodokem')).toBe('FrodoKEM');
  });

  it('leaves code and existing links alone', () => {
    const md = '`mceliece` und [Classic McEliece](/blog/classic-mceliece) und FrodoKEM';
    expect(applyAutoLinksToMarkdown(md, links, 'x')).toBe(
      '`mceliece` und [Classic McEliece](/blog/classic-mceliece) und [FrodoKEM](/blog/frodokem)',
    );
  });

  it('shares the linked set across blocks', () => {
    const linked = new Set<string>();
    applyAutoLinksToMarkdown('FrodoKEM', links, 'x', linked);
    expect(applyAutoLinksToMarkdown('FrodoKEM', links, 'x', linked)).toBe('FrodoKEM');
  });
});

describe('term matching', () => {
  const more = ['ml-kem', 'kem', 'learning-with-errors', 'lwe', 'krypto-agilitaet', 'quantenschluesselverteilung', 'pki']
    .map((slug) => ({ slug, path: `/blog/${slug}` }));

  it('does not match a slug right after a hyphen or inside a word', () => {
    // first ML-KEM is linked, the second must not become ML-[KEM]
    const out = applyAutoLinksToMarkdown('ML-KEM und noch einmal ML-KEM, dann ein KEM.', more, 'x');
    expect(out).toBe('[ML-KEM](/blog/ml-kem) und noch einmal ML-KEM, dann ein [KEM](/blog/kem).');
    expect(applyAutoLinksToMarkdown('Module-LWE und X25519MLKEM768', more, 'x')).toBe('Module-LWE und X25519MLKEM768');
  });

  it('matches umlauts through their ASCII spelling', () => {
    expect(applyAutoLinksToMarkdown('Krypto-Agilität und Quantenschlüsselverteilung', more, 'x')).toBe(
      '[Krypto-Agilität](/blog/krypto-agilitaet) und [Quantenschlüsselverteilung](/blog/quantenschluesselverteilung)',
    );
  });

  it('leaves headings and bare URLs alone', () => {
    const md = '## Was eine PKI leistet\nSiehe https://example.org/pki/info und die PKI.';
    expect(applyAutoLinksToMarkdown(md, more, 'x')).toBe(
      '## Was eine PKI leistet\nSiehe https://example.org/pki/info und die [PKI](/blog/pki).',
    );
  });

  it('prefers the longer term', () => {
    expect(applyAutoLinksToMarkdown('Learning With Errors (LWE)', more, 'x')).toBe(
      '[Learning With Errors](/blog/learning-with-errors) ([LWE](/blog/lwe))',
    );
  });
});

describe('slugify', () => {
  it('transliterates umlauts', () => {
    expect(slugify('Einführung')).toBe('einfuehrung');
    expect(slugify('Acht Wochen Kostenschätzungen')).toBe('acht-wochen-kostenschaetzungen');
    expect(slugify('Größe & Maß')).toBe('groesse-mass');
  });
});
