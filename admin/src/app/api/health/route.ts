import { db } from '@/lib/db';
import { documents } from '@/lib/schemas';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const required = Object.keys(documents);
    const count = await db.document.count({ where: { key: { in: required } } });
    if (count !== required.length) return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ ok: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
