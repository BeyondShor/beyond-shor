// YouTube video IDs are always 11 characters from the URL-safe base64 alphabet.
const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export function isYouTubeId(id: string): boolean {
  return VIDEO_ID.test(id);
}

/** Extracts the video ID from the usual YouTube URL shapes, or returns null. */
export function youTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = u.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = u.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/);
      id = m?.[1] ?? null;
    }
  }
  return id && isYouTubeId(id) ? id : null;
}
