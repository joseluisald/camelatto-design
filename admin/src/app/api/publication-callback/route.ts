import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
export async function POST(request: Request) {
  const raw = await request.text();
  if (raw.length > 5000 || !process.env.PUBLICATION_SECRET) return new Response(null, { status: 403 });
  const signature = Buffer.from(request.headers.get('x-publication-signature') || '', 'hex');
  const expected = createHmac('sha256', process.env.PUBLICATION_SECRET).update(raw).digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return new Response(null, { status: 403 });
  const value = z.object({ publicationId: z.string(), status: z.enum(['published', 'failed']), timestamp: z.number() }).safeParse(JSON.parse(raw));
  if (!value.success || Math.abs(Date.now() - value.data.timestamp) > 300000) return new Response(null, { status: 422 });
  const { publicationId, status } = value.data;
  const result = await db.$transaction(async tx => {
    if (status === 'published') {
      const current = await tx.publication.findUnique({ where: { id: publicationId } });
      if (!current || await tx.publication.count({ where: { sequence: { gt: current.sequence }, status: 'published' } })) return 0;
    }
    return (await tx.publication.updateMany({ where: { id: publicationId, status: 'deploying' }, data: { status, finishedAt: new Date(), message: status === 'published' ? 'Deploy confirmado pelo pipeline de produção.' : 'O pipeline informou uma falha de deploy.' } })).count;
  });
  return Response.json({ updated: result });
}
