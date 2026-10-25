import { NextRequest } from 'next/server';
import { getAppearances } from '@/lib/strapi';
import { isYouTubeId, youTubeId } from '@/lib/youtube';

// Serves video thumbnails from our own origin, so visitors of /anderswo never
// contact YouTube. Only IDs that belong to an appearance in Strapi are fetched;
// this is not a general-purpose image proxy.
const DAY = 60 * 60 * 24;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  if (!isYouTubeId(id)) return new Response(null, { status: 400 });

  const known = (await getAppearances()).some((a) => youTubeId(a.url) === id);
  if (!known) return new Response(null, { status: 404 });

  // hqdefault exists for every video (maxresdefault does not); it is 4:3 with
  // letterboxing, which the page crops away with object-fit: cover.
  let res: Response;
  try {
    res = await fetch(`https://i.ytimg.com/vi/${id}/hqdefault.jpg`, {
      next: { revalidate: DAY },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return new Response(null, { status: 502 });
  }
  if (!res.ok) return new Response(null, { status: 502 });

  return new Response(await res.arrayBuffer(), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': `public, max-age=${DAY}, stale-while-revalidate=${7 * DAY}`,
    },
  });
}
