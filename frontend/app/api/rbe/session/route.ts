import { NextResponse }         from 'next/server';
import { headers }              from 'next/headers';
import { randomUUID }           from 'crypto';
import { Q, N, B, N_MAX }      from '@/lib/rbe/params';
import { rbeSetup }             from '@/lib/rbe/core';
import { polyZero }             from '@/lib/rbe/sample';
import { createSession, checkRateLimit } from '@/lib/rbe/session-store';
import type { ApiSetupResponse, ApiErrorResponse } from '@/lib/rbe-types';

export async function POST(): Promise<NextResponse<ApiSetupResponse | ApiErrorResponse>> {
  const hdrs = await headers();
  const ip   = hdrs.get('x-forwarded-for')?.split(',')[0].trim() ?? '0.0.0.0';

  if (!checkRateLimit(ip)) {
    return NextResponse.json({ error: 'rate_limit' }, { status: 429 });
  }

  const { a, aInv } = rbeSetup();
  const sessionId   = randomUUID();

  createSession({
    sessionId,
    a,
    aInv,
    users:   new Map(),
    mpkAgg:  polyZero(),
  });

  return NextResponse.json({
    sessionId,
    a,
    N_max: N_MAX,
    params: { N, Q, B },
  });
}
