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

  // Compute hsk_target = aInv · (mpkAgg − pk_target)
  // This satisfies: a · hsk = mpkAgg − pk_target  (exact ring equality)
  const hsk = rbeHelperKey(session.aInv, session.mpkAgg, targetUser.pk);

  return NextResponse.json({ hsk });
}
