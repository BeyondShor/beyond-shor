import { NextRequest } from 'next/server';
import { PQ_GROUPS } from '@/lib/pqc-lagebild';

// The TLS group of *this* request's connection, as nginx saw it (X-TLS-Group is set by
// nginx from $ssl_curve and overwrites anything the client sends). Nothing is stored.
export const dynamic = 'force-dynamic';

const ALIASES: Record<string, string> = {
  '0x11ec': 'X25519MLKEM768',
  '0x11eb': 'SecP256r1MLKEM768',
  '0x11ed': 'SecP384r1MLKEM1024',
};

export function GET(req: NextRequest): Response {
  const raw = req.headers.get('x-tls-group');
  const protocol = req.headers.get('x-tls-protocol');
  const group = raw && raw !== '-' ? (ALIASES[raw.toLowerCase()] ?? raw) : null;
  return Response.json(
    { group, protocol: protocol || null, pq: group ? PQ_GROUPS.has(group) : null },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
