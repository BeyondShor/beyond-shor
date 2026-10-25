import { NextRequest, NextResponse } from 'next/server';
import { helperKey, helperKeyNorm } from '@/lib/rbe/scheme';
import { encodeMat } from '@/lib/rbe/wire';
import { getSession, kcContext } from '@/lib/rbe/session-store';
import { USER_NAMES } from '@/lib/rbe-types';
import type { ApiHskResponse, ApiErrorResponse, UserName } from '@/lib/rbe-types';

// HskGen: hsk_i = Σ_j H_{δj,i} · G⁻¹(pk_j) over all registered users — public data only.
export async function GET(
  req: NextRequest,
): Promise<NextResponse<ApiHskResponse | ApiErrorResponse>> {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  const name = req.nextUrl.searchParams.get('name') as UserName | null;
  if (!sessionId || !name || !USER_NAMES.includes(name)) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'session_not_found' }, { status: 404 });

  const target = session.users.get(name);
  if (!target) return NextResponse.json({ error: 'user_not_registered' }, { status: 404 });

  const ctx = kcContext;
  const hsk = helperKey(ctx, [...session.users.values()], target.id);
  return NextResponse.json({
    identity: target.id,
    hsk: encodeMat(ctx.ring, hsk, 'i16'),
    norm: helperKeyNorm(ctx, hsk),
  });
}
