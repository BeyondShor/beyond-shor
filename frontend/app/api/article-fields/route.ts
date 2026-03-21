import { NextRequest, NextResponse } from 'next/server';

const STRAPI_URL       = process.env.STRAPI_URL       ?? 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN ?? '';

// ─── In-memory rate limiter ───────────────────────────────────────────────────
// Max 20 requests per IP per minute. Sufficient for the verify use-case;
// well below any legitimate interactive usage.

const RATE_LIMIT     = 20;
const RATE_WINDOW_MS = 60_000;

interface RateEntry { count: number; resetAt: number }
const rateStore = new Map<string, RateEntry>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();

  // Prune expired entries to prevent unbounded growth.
  if (rateStore.size > 1000) {
    for (const [key, entry] of rateStore) {
      if (entry.resetAt < now) rateStore.delete(key);
    }
  }

  const entry = rateStore.get(ip);
  if (!entry || entry.resetAt < now) {
    rateStore.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Rate limiting — trust X-Forwarded-For only when behind Nginx (see CI/CD docs).
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const documentId = searchParams.get('documentId')?.trim();
  const locale     = searchParams.get('locale') ?? 'de';

  if (!documentId) {
    return NextResponse.json({ error: 'Missing documentId' }, { status: 400 });
  }

  const url = new URL(`${STRAPI_URL}/api/articles`);
  url.searchParams.set('filters[documentId][$eq]', documentId);
  url.searchParams.set('locale', locale);
  url.searchParams.set('fields[0]', 'title');
  url.searchParams.set('populate[0]', 'blocks');
  url.searchParams.set('populate[1]', 'blocks.file');
  url.searchParams.set('populate[2]', 'blocks.files');

  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (STRAPI_API_TOKEN) headers['Authorization'] = `Bearer ${STRAPI_API_TOKEN}`;

  let res: Response;
  try {
    // Cache article data for 60 s — article content rarely changes mid-session,
    // and each unique documentId+locale URL gets its own cache entry.
    res = await fetch(url.toString(), { headers, next: { revalidate: 60 } });
  } catch {
    return NextResponse.json({ error: 'Strapi unreachable' }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: 'Strapi error' }, { status: 502 });
  }

  const data    = await res.json();
  const article = data.data?.[0];

  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  return NextResponse.json({
    title:  article.title  ?? '',
    blocks: article.blocks ?? [],
  });
}
