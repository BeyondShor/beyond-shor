import { NextRequest, NextResponse } from 'next/server';
import { rbeHelperKey }              from '@/lib/rbe/core';
import { getSession }                from '@/lib/rbe/session-store';
import type { ApiHskResponse, ApiErrorResponse } from '@/lib/rbe-types';

export async function GET(
  req: NextRequest,
): Promise<NextResponse<ApiHskResponse | ApiErrorResponse>> {
  const { searchParams } = req.nextUrl;
  const sessionId = searchParams.get('sessionId');
  const targetId  = searchParams.get('targetId');

  if (!sessionId || !targetId) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'session_not_found' }, { status: 404 });

  const targetUser = session.users.get(targetId);
  if (!targetUser) {
    return NextResponse.json({ error: 'user_not_registered' }, { status: 404 });
  }

  // Compute identity-specific helper key bound to targetId.
  // hsk satisfies: a0·hsk0 + (a1 + H(targetId))·hsk1 = mpkAgg − pk_target
  const { hsk0, hsk1 } = rbeHelperKey(
    session.r,
    session.mpkAgg,
    targetUser.pk,
    targetId,
  );

  return NextResponse.json({ hsk0, hsk1 });
}
