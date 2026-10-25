import { NextRequest, NextResponse } from 'next/server';
import { identityOf, register, masterPublicKey } from '@/lib/rbe/scheme';
import { decodeMat, encodeMat } from '@/lib/rbe/wire';
import { getSession, kcContext } from '@/lib/rbe/session-store';
import { USER_NAMES } from '@/lib/rbe-types';
import type { ApiRegisterRequest, ApiRegisterResponse, ApiErrorResponse, UserName } from '@/lib/rbe-types';

// Reg: mpk ← mpk + A_{δi} · G⁻¹(pk_i). Deterministic, public inputs only.
export async function POST(
  req: NextRequest,
): Promise<NextResponse<ApiRegisterResponse | ApiErrorResponse>> {
  let body: ApiRegisterRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { sessionId, name, pk } = body ?? {};
  if (!sessionId || !USER_NAMES.includes(name)) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const session = getSession(sessionId);
  if (!session) return NextResponse.json({ error: 'session_not_found' }, { status: 404 });
  if (session.users.has(name)) {
    return NextResponse.json({ error: 'user_already_registered' }, { status: 409 });
  }
  if (session.users.size >= kcContext.p.nMax) {
    return NextResponse.json({ error: 'n_max_reached' }, { status: 403 });
  }

  const ctx = kcContext;
  let pkMat;
  try {
    pkMat = decodeMat(ctx.ring, pk, ctx.p.n, ctx.p.k);
  } catch {
    return NextResponse.json({ error: 'invalid_pk' }, { status: 422 });
  }

  const identity = identityOf(name, ctx.p);
  if ([...session.users.values()].some((r) => r.id === identity)) {
    return NextResponse.json({ error: 'identity_taken' }, { status: 409 });
  }

  session.users.set(name, register(ctx, session.crs, identity, pkMat));
  session.mpk = masterPublicKey(ctx, [...session.users.values()]);

  return NextResponse.json({
    identity,
    mpk: encodeMat(ctx.ring, session.mpk),
    registered: [...session.users.entries()].map(([n, r]) => ({ name: n as UserName, identity: r.id })),
  });
}
