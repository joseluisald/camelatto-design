import { readImage } from '@/lib/storage';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/access';
export async function GET(_request: Request, context: { params: Promise<{ key: string }> }) {
  const { key } = await context.params;
  if (!/^[0-9a-f-]{36}\.webp$/.test(key)) return new Response(null, { status: 404 });
  // Uploaded draft media remain private until referenced by a published snapshot.
  const latest = await db.publication.findFirst({ where: { status: 'published' }, orderBy: { sequence: 'desc' }, select: { snapshot: true } });
  const published = !!latest && JSON.stringify(latest.snapshot).includes(key);
  if (!published && !await currentUser()) return new Response(null, { status: 404 });
  const image = await readImage(key);
  return image ? new Response(new Uint8Array(image), { headers: { 'Content-Type': 'image/webp', 'Cache-Control': published ? 'public, max-age=3600' : 'private, no-store', 'X-Content-Type-Options': 'nosniff' } }) : new Response(null, { status: 404 });
}
