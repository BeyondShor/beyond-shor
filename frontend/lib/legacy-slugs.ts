/**
 * Slugs of published articles that were renamed (2026-11-06: one naming scheme,
 * and slugs double as the terms the autolinker looks for). Old URLs redirect
 * permanently, so links from outside keep working. Never reuse a key as a new slug.
 */
export const LEGACY_SLUGS: Record<string, string> = {
  'ML-KEM': 'ml-kem',
  mceliece: 'goppa-code',
};
