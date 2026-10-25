import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { randomUUID } from 'crypto';
import { randomSeed } from '@/lib/rbe/sample';
import { toHex } from '@/lib/rbe/wire';
import { createSession, checkRateLimit } from '@/lib/rbe/session-store';
import type { ApiSessionResponse, ApiErrorResponse } from '@/lib/rbe-types';

// Setup: the key curator publishes a fresh seed; the CRS A is its SHAKE-256 expansion.
export async function POST(): Promise<NextResponse<ApiSessionResponse | ApiErrorResponse>> {
  const hdrs = await headers();
  const ip = hdrs.get('x-forwarded-for')?.split(',')[0].trim() ?? '0.0.0.0';
  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'rate_limit' }, { status: 429 });
  }

  const sessionId = randomUUID();
  const seed = randomSeed();
  createSession(sessionId, seed);

  return NextResponse.json({ sessionId, seed: toHex(seed) });
}
