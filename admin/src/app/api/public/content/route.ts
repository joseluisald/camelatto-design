import { db } from '@/lib/db';
export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('snapshot');
  // Builds can fetch a queued snapshot only using the service secret.
  const authorized = !!process.env.PUBLICATION_SECRET && request.headers.get('authorization') === `Bearer ${process.env.PUBLICATION_SECRET}`;
  const publication = id && authorized ? await db.publication.findUnique({ where: { id } }) : await db.publication.findFirst({ where: { status: 'published' }, orderBy: { sequence: 'desc' } });
  if (!publication || (id && !authorized)) return Response.json({ error: 'Conteúdo indisponível.' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  return Response.json(publication.snapshot, { headers: { 'Cache-Control': id ? 'no-store' : 'public, max-age=60', 'X-Content-Version': publication.id } });
}
