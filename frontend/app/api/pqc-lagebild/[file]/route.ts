import { NextRequest } from 'next/server';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { DATA_DIR, FILE_NAME, datasetPublicKey } from '@/lib/pqc-lagebild';

// Serves the signed PQC-Lagebild files (and the public key) so anyone can download and
// verify them. Only names matching the published pattern are served — no directory access.
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string }> },
): Promise<Response> {
  const { file } = await params;
  if (file === 'public-key.txt') {
    return new Response(datasetPublicKey() + '\n', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
    });
  }
  if (!FILE_NAME.test(file)) return new Response(null, { status: 404 });
  const path = join(DATA_DIR, file);
  if (!existsSync(path)) return new Response(null, { status: 404 });
  return new Response(readFileSync(path), {
    headers: {
      'Content-Type': file.endsWith('.sig') ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'Content-Disposition': `inline; filename="${file}"`,
    },
  });
}
