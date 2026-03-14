import { ml_dsa65 } from '@noble/post-quantum/ml-dsa.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Canonical block serialization ──────────────────────────────────────────
// Each block type is mapped to a fixed structure so the representation is
// deterministic regardless of what extra fields Strapi may return.
// Media files are identified by SHA-256 of their binary content so that
// swapping an image invalidates the signature.

async function hashFileNode(url: string): Promise<string> {
  // url is e.g. /uploads/foo.jpg
  const filePath = join((strapi as any).dirs.static.public as string, url);
  const content = readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

async function processBlock(block: any): Promise<any> {
  switch (block.__component) {
    case 'shared.rich-text':
      return { __component: 'shared.rich-text', body: block.body ?? '' };

    case 'shared.quote':
      return { __component: 'shared.quote', body: block.body ?? '', title: block.title ?? '' };

    case 'shared.media': {
      const sha256 = block.file?.url ? await hashFileNode(block.file.url) : null;
      return { __component: 'shared.media', file: sha256 ? { sha256 } : null };
    }

    case 'shared.slider': {
      const files = Array.isArray(block.files) ? block.files : [];
      const hashes = await Promise.all(
        files.map((f: any) => (f.url ? hashFileNode(f.url) : Promise.resolve(null))),
      );
      return { __component: 'shared.slider', files: hashes.map((sha256) => (sha256 ? { sha256 } : null)) };
    }

    default:
      return { __component: block.__component };
  }
}

async function serializeBlocks(blocks: any[]): Promise<string> {
  if (!Array.isArray(blocks) || blocks.length === 0) return '';
  const processed = await Promise.all(blocks.map(processBlock));
  return JSON.stringify(processed);
}

// publishedAt intentionally excluded: Strapi updates it on every write,
// which would immediately invalidate the signature.
// The raw UTF-8 bytes are passed directly to ML-DSA-65 — no pre-hashing.
// ML-DSA internally processes the message with SHAKE-256 per FIPS 204 §5.2.
// cbom: shake-256:article-signing
async function buildMessage(
  documentId: string,
  locale: string,
  title: string,
  blocks: any[],
): Promise<Uint8Array> {
  const raw = [documentId, locale, title, await serializeBlocks(blocks)].join('|');
  return Buffer.from(raw, 'utf8');
}

function getPrivateKey(): Uint8Array {
  const hex = process.env.ML_DSA_PRIVATE_KEY;
  if (!hex) throw new Error('ML_DSA_PRIVATE_KEY not set');
  return Uint8Array.from(Buffer.from(hex, 'hex'));
}

// Fetch article via the REST API to stay completely outside of any Knex
// transaction context. Using strapi.documents().findOne() internally calls
// wrapInTransaction which leaves a stale AsyncLocalStorage context that
// causes the subsequent getConnection() write to fail.
async function fetchArticleForSigning(documentId: string, locale: string): Promise<any | null> {
  const host = process.env.HOST ?? '127.0.0.1';
  const port = process.env.PORT ?? '1337';
  const token = process.env.STRAPI_SIGN_TOKEN ?? process.env.STRAPI_API_TOKEN ?? '';

  const url = new URL(`http://${host}:${port}/api/articles`);
  url.searchParams.set('filters[documentId][$eq]', documentId);
  url.searchParams.set('locale', locale);
  url.searchParams.set('populate[0]', 'blocks');
  url.searchParams.set('populate[1]', 'blocks.file');
  url.searchParams.set('populate[2]', 'blocks.files');

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`Strapi API returned ${res.status}`);
  const data = await res.json() as { data?: any[] };
  return data.data?.[0] ?? null;
}

async function signAndSave(documentId: string, locale: string) {
  // Defer to the next event-loop tick so it runs after the publish transaction
  // has committed — otherwise SQLite deadlocks on the write lock.
  setImmediate(async () => {
    try {
      const article = await fetchArticleForSigning(documentId, locale);
      if (!article?.title) {
        strapi.log.warn(`[pqc] Article not found for signing: ${documentId} (${locale})`);
        return;
      }

      const msg = await buildMessage(documentId, locale, article.title, article.blocks ?? []);
      const sig = ml_dsa65.sign(msg, getPrivateKey());
      const sigHex = Buffer.from(sig).toString('hex');

      await (strapi.db as any).getConnection('articles')
        .where({ document_id: documentId, locale })
        .whereNotNull('published_at')
        .update({ pqc_signature: sigHex });

      strapi.log.info(`[pqc] Signed article ${documentId} (${locale})`);
    } catch (err) {
      strapi.log.error('[pqc] Signing failed:', err);
    }
  });
}

export default {
  // Fires when article is created with publishedAt set ("Save & Publish" in one step,
  // or when a draft is published — Strapi 5 publishes by inserting a new row)
  async afterCreate(event: any) {
    if (event.result?.publishedAt) {
      const { documentId, locale } = event.result;
      if (documentId) await signAndSave(documentId, locale ?? 'de');
    }
  },

  // Fires when a published article's content is updated
  async afterUpdate(event: any) {
    if (event.result?.publishedAt) {
      const { documentId, locale } = event.result;
      if (documentId) await signAndSave(documentId, locale ?? 'de');
    }
  },
};
