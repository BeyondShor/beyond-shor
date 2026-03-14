import { NextRequest, NextResponse } from 'next/server';

const STRAPI_URL      = process.env.STRAPI_URL      ?? 'http://localhost:1337';
const STRAPI_API_TOKEN = process.env.STRAPI_API_TOKEN ?? '';

export async function GET(request: NextRequest) {
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
    res = await fetch(url.toString(), { headers, cache: 'no-store' });
  } catch {
    return NextResponse.json({ error: 'Strapi unreachable' }, { status: 502 });
  }

  if (!res.ok) {
    return NextResponse.json({ error: 'Strapi error' }, { status: 502 });
  }

  const data = await res.json();
  const article = data.data?.[0];

  if (!article) {
    return NextResponse.json({ error: 'Article not found' }, { status: 404 });
  }

  return NextResponse.json({
    title:  article.title ?? '',
    blocks: article.blocks ?? [],
  });
}
