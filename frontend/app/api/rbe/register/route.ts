import { NextRequest, NextResponse } from 'next/server';
import { N_MAX }                     from '@/lib/rbe/params';
import { rbeRegister }               from '@/lib/rbe/core';
import { getSession }                from '@/lib/rbe/session-store';
import type { ApiRegisterRequest, ApiRegisterResponse, ApiErrorResponse } from '@/lib/rbe-types';

export async function POST(
  req: NextRequest,
): Promise<NextResponse<ApiRegisterResponse | ApiErrorResponse>> {
  let body: ApiRegisterRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { sessionId, userId, pk } = body;

  if (!sessionId || !userId || !Array.isArray(pk)) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'session_not_found' }, { status: 404 });

  if (session.users.has(userId)) {
    return NextResponse.json({ error: 'user_already_registered' }, { status: 409 });
  }
  if (session.users.size >= N_MAX) {
    return NextResponse.json({ error: 'n_max_reached' }, { status: 403 });
  }

  // Validate pk length
  if (pk.length !== 256 || pk.some(v => typeof v !== 'number' || v < 0 || v >= 12289)) {
    return NextResponse.json({ error: 'invalid_pk' }, { status: 422 });
  }

  session.users.set(userId, { pk });
  session.mpkAgg = rbeRegister(session.mpkAgg, pk);

  return NextResponse.json({
    mpkAgg:     session.mpkAgg,
    registered: [...session.users.keys()],
  });
}
