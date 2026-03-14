// ─── Strapi 5 Base Types ────────────────────────────────────────────────────
// In Strapi 5, attributes live at the top level of data objects (no 'attributes' wrapper)

export interface StrapiMedia {
  id: number;
  documentId: string;
  url: string;
  alternativeText: string | null;
  width: number | null;
  height: number | null;
  formats?: Record<string, { url: string; width: number; height: number }>;
}

export interface StrapiPagination {
  page: number;
  pageSize: number;
  pageCount: number;
  total: number;
}

export interface StrapiListResponse<T> {
  data: T[];
  meta: { pagination: StrapiPagination };
}

export interface StrapiSingleResponse<T> {
  data: T;
  meta: Record<string, never>;
}

// ─── Content Types ───────────────────────────────────────────────────────────

export interface Author {
  id: number;
  documentId: string;
  name: string;
  email: string;
  avatar: StrapiMedia | null;
}

export interface Category {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  description: string | null;
}

// ─── Dynamic Zone Blocks ─────────────────────────────────────────────────────

export interface RichTextBlock {
  __component: 'shared.rich-text';
  id: number;
  body: string;
}

export interface MediaBlock {
  __component: 'shared.media';
  id: number;
  file: StrapiMedia;
}

export interface QuoteBlock {
  __component: 'shared.quote';
  id: number;
  title: string;
  body: string;
}

export interface SliderBlock {
  __component: 'shared.slider';
  id: number;
  files: StrapiMedia[];
}

export type ContentBlock = RichTextBlock | MediaBlock | QuoteBlock | SliderBlock;

// ─── Article ─────────────────────────────────────────────────────────────────

export interface Article {
  id: number;
  documentId: string;
  title: string;
  description: string | null;
  slug: string;
  cover?: StrapiMedia | null;
  author: Author | null;
  category: Category | null;
  blocks: ContentBlock[];
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
  pqcSignature?: string | null;
}

// ─── Global / SEO ────────────────────────────────────────────────────────────

export interface SeoMeta {
  metaTitle: string;
  metaDescription: string;
  shareImage: StrapiMedia | null;
}

export interface Global {
  id: number;
  documentId: string;
  siteName: string;
  siteDescription: string;
  favicon: StrapiMedia | null;
  defaultSeo: SeoMeta | null;
}

// ─── About ───────────────────────────────────────────────────────────────────

export interface About {
  id: number;
  documentId: string;
  title: string;
  blocks: ContentBlock[];
}

// Reuses same structure as About (title + dynamic blocks)
export type LegalPage = About;
