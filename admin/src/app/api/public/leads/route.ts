import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { leadSchema } from '@/lib/schemas';
import { rateLimit } from '@/lib/rate-limit';
import { corsHeaders, readJson, allowedOrigins } from '@/lib/http';
import { asJson } from '@/lib/content';
export const runtime = 'nodejs';
export async function OPTIONS(request: Request) { return new Response(null, { status: 204, headers: corsHeaders(request) }); }
export async function POST(request: Request) {
  const headers = corsHeaders(request);
  const origin = request.headers.get('origin');
  if (origin && !allowedOrigins().has(origin)) return Response.json({ error: 'Origem não permitida.' }, { status: 403, headers });
  try {
    const data = leadSchema.safeParse(await readJson(request, 24000));
    if (!data.success) return Response.json({ error: 'Confira os campos do formulário.', fields: data.error.flatten().fieldErrors }, { status: 422, headers });
    const value = data.data;
    if (value.website) return Response.json({ ok: true }, { headers });
    // Use a trusted proxy to overwrite X-Forwarded-For in production.
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    if (!await rateLimit(`lead:${ip}`, 10, 600) || !await rateLimit(`lead-email:${value.email}`, 5, 600)) return Response.json({ error: 'Aguarde alguns minutos antes de tentar novamente.' }, { status: 429, headers });
    const previous = await db.submission.findUnique({ where: { key: value.idempotencyKey } });
    if (previous) return Response.json({ ok: true }, { headers });
    try {
      await db.$transaction(async tx => {
        const duplicate = await tx.lead.findFirst({ where: { email: value.email }, select: { id: true } });
        const lead = await tx.lead.create({ data: { name: value.name, email: value.email, phone: value.phone, company: value.company, service: value.service, message: value.message, source: value.source, tags: [], metadata: asJson({ page: value.page, project: value.project, utm: value.utm, privacyVersion: value.privacyVersion, marketingConsent: value.marketingConsent, submittedAt: new Date().toISOString(), possibleDuplicate: duplicate?.id }), events: { create: { type: 'created', text: 'Contato recebido pelo formulário da LP.' } } } });
        await tx.submission.create({ data: { key: value.idempotencyKey, leadId: lead.id } });
      });
    } catch (error) { if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002' && await db.submission.findUnique({ where: { key: value.idempotencyKey } }))) throw error; }
    return Response.json({ ok: true }, { status: 201, headers });
  } catch { return Response.json({ error: 'Não foi possível enviar agora. Seus campos foram preservados; tente novamente.' }, { status: 503, headers }); }
}
