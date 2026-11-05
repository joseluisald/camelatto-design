import { Prisma } from '@prisma/client';
import { z, ZodError } from 'zod';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { parse } from 'csv-parse/sync';
import { db } from '@/lib/db';
import { currentUser, can } from '@/lib/access';
import { checkOrigin, readJson } from '@/lib/http';
import { asJson, audit, createSnapshot } from '@/lib/content';
import { projectSchema, documents, leadSchema, leadUpdateSchema, leadStages, type DocumentKey } from '@/lib/schemas';
import { uploadImage } from '@/lib/storage';
import { leadCsv } from '@/lib/csv';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ path: string[] }> };
class ApiError extends Error { constructor(message: string, public status = 400) { super(message); } }
async function authorize(resource: string) {
  const user = await currentUser();
  if (!user) throw new ApiError('Entre para continuar.', 401);
  const area = ['users', 'audit'].includes(resource) ? 'admin' : ['leads', 'tasks'].includes(resource) ? 'leads' : 'content';
  if (!can(user.role, area)) throw new ApiError('Você não tem permissão para esta operação.', 403);
  return user;
}
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
function errorResponse(error: unknown) {
  if (error instanceof ZodError) return json({ error: 'Confira os campos indicados.', fields: error.flatten().fieldErrors }, 422);
  if (error instanceof ApiError) return json({ error: error.message }, error.status);
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') return json({ error: 'Este slug, e-mail ou posição de destaque já está em uso.' }, 409);
    if (error.code === 'P2025') return json({ error: 'Registro não encontrado ou alterado por outra pessoa. Recarregue antes de salvar.' }, 409);
  }
  return json({ error: 'Não foi possível concluir. Confira a conexão e tente novamente.' }, 503);
}
function pagination(url: URL) { const page = Math.max(1, Math.min(100000, Number(url.searchParams.get('page')) || 1)); return { page, take: 20, skip: (page - 1) * 20 }; }
function leadWhere(url: URL): Prisma.LeadWhereInput {
  const q = (url.searchParams.get('q') || '').slice(0, 200);
  const status = url.searchParams.get('status');
  const ownerId = url.searchParams.get('owner');
  const source = url.searchParams.get('source');
  const service = url.searchParams.get('service');
  const tag = url.searchParams.get('tag');
  const from = url.searchParams.get('from'), to = url.searchParams.get('to');
  const date = (v: string | null) => v && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(new Date(v).getTime()) ? new Date(v) : undefined;
  return {
    ...(q ? { OR: ['name', 'email', 'phone', 'company'].map(field => ({ [field]: { contains: q } })) } : {}),
    ...(status && status in leadStages ? { status } : {}), ...(ownerId ? { ownerId } : {}),
    ...(source ? { source } : {}), ...(service ? { service: { contains: service } } : {}),
    ...(tag ? { tags: { array_contains: tag } } : {}),
    ...(date(from) || date(to) ? { createdAt: { gte: date(from), lt: date(to) ? new Date(date(to)!.getTime() + 86400000) : undefined } } : {}),
  };
}
export async function GET(request: Request, context: Context) {
  try {
    const [resource, id, action] = (await context.params).path;
    const user = await authorize(resource);
    const url = new URL(request.url);
    const { page, take, skip } = pagination(url);
    if (resource === 'projects') {
      if (id) return json(await db.project.findUniqueOrThrow({ where: { id } }));
      const q = url.searchParams.get('q') || '', status = url.searchParams.get('status');
      const where = { ...(q ? { OR: [{ title: { contains: q } }, { description: { contains: q } }] } : {}), ...(status && ['draft', 'published', 'archived'].includes(status) ? { status } : {}) };
      const [items, total] = await Promise.all([db.project.findMany({ where, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], skip, take }), db.project.count({ where })]);
      return json({ items, total, page });
    }
    if (resource === 'documents') {
      if (id) return json(await db.document.findUniqueOrThrow({ where: { key: id } }));
      return json(await db.document.findMany());
    }
    if (resource === 'revisions') return json(await db.revision.findMany({ where: { entity: url.searchParams.get('entity') || 'document', entityId: url.searchParams.get('id') || '' }, orderBy: { createdAt: 'desc' }, take: 30 }));
    if (resource === 'publications') return json(await db.publication.findMany({ select: { id: true, sequence: true, status: true, message: true, createdAt: true, startedAt: true, finishedAt: true }, orderBy: { sequence: 'desc' }, take: 30 }));
    if (resource === 'media') return json(await db.media.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }));
    if (resource === 'users') return json(await db.user.findMany({ select: { id: true, name: true, email: true, role: true, createdAt: true }, orderBy: { name: 'asc' } }));
    if (resource === 'audit') return json({ items: await db.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take, skip }), total: await db.auditLog.count(), page });
    if (resource === 'leads') {
      if (id && id !== 'export') {
        const lead = await db.lead.findUniqueOrThrow({ where: { id }, include: { events: { orderBy: { createdAt: 'desc' } }, tasks: { orderBy: { dueAt: 'asc' } } } });
        if (action === 'export') { await audit(user.id, 'export', 'lead', id); return json(lead); }
        return json(lead);
      }
      const where = leadWhere(url);
      if (id === 'export') {
        const rows = await db.lead.findMany({ where, orderBy: { createdAt: 'desc' }, take: 10000 });
        await audit(user.id, 'export', 'leads', 'filtered');
        return new Response(leadCsv(rows), { headers: { 'Content-Type': 'text/csv;charset=utf-8', 'Content-Disposition': 'attachment; filename="leads.csv"', 'Cache-Control': 'no-store' } });
      }
      const [items, total, owners] = await Promise.all([db.lead.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip, take }), db.lead.count({ where }), db.user.findMany({ where: { role: { in: ['admin', 'sales'] } }, select: { id: true, name: true } })]);
      return json({ items, total, page, owners });
    }
    if (resource === 'tasks') return json(await db.task.findMany({ include: { lead: { select: { name: true } } }, orderBy: [{ done: 'asc' }, { dueAt: 'asc' }], take: 200 }));
    throw new ApiError('Recurso não encontrado.', 404);
  } catch (e) { return errorResponse(e); }
}
export async function POST(request: Request, context: Context) {
  try {
    try { checkOrigin(request); } catch { throw new ApiError('Origem não permitida.', 403); }
    const [resource, id, action] = (await context.params).path;
    const user = await authorize(resource);
    if (resource === 'documents' && id === 'settings' && user.role !== 'admin') throw new ApiError('Somente administradores podem alterar configurações globais.', 403);
    if (resource === 'media') {
      if (Number(request.headers.get('content-length') || 0) > 11 * 1024 * 1024) throw new ApiError('A imagem deve ter até 10 MB.');
      const form = await request.formData(); const file = form.get('file');
      if (!(file instanceof File)) throw new ApiError('Selecione uma imagem.');
      const alt = z.string().min(1).max(300).parse(form.get('alt'));
      try { const media = await uploadImage(file, alt); await audit(user.id, 'upload', 'media', media.id); return json(media); } catch (e) { throw new ApiError(e instanceof Error ? e.message : 'Imagem inválida.'); }
    }
    if (resource === 'leads' && id === 'import') {
      const body = z.object({ csv: z.string().max(500000), commit: z.boolean().default(false) }).parse(await readJson(request, 550000));
      let rows: Record<string, string>[];
      try { rows = parse(body.csv.replace(/^\uFEFF/, ''), { columns: true, skip_empty_lines: true, trim: true, delimiter: body.csv.split('\n')[0].includes(';') ? ';' : ',', max_record_size: 20000 }); } catch { throw new ApiError('CSV inválido. Use o modelo disponível.'); }
      if (rows.length > 500) throw new ApiError('Importe no máximo 500 linhas por vez.');
      const valid: z.infer<typeof leadSchema>[] = []; const errors: string[] = [];
      for (const [index, row] of rows.entries()) {
        const parsed = leadSchema.safeParse({ ...row, message: row.message || 'Contato importado por CSV.', idempotencyKey: randomUUID(), source: 'csv' });
        if (parsed.success) valid.push(parsed.data); else errors.push(`Linha ${index + 2}: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
      }
      if (!body.commit) return json({ valid: valid.length, errors, preview: valid.slice(0, 10).map(v => ({ name: v.name, email: v.email })) });
      if (errors.length) throw new ApiError('Corrija todas as linhas antes de importar.');
      let imported = 0;
      for (const value of valid) {
        if (await db.lead.findFirst({ where: { email: value.email } })) continue;
        await db.lead.create({ data: { name: value.name, email: value.email, phone: value.phone, company: value.company, service: value.service, message: value.message, source: 'csv', tags: [], metadata: { importedBy: user.id, privacyVersion: 'imported-unverified' }, events: { create: { type: 'imported', authorId: user.id, text: 'Importado por CSV.' } } } }); imported++;
      }
      await audit(user.id, 'import', 'leads', String(imported));
      return json({ imported, skipped: valid.length - imported });
    }
    const body = await readJson(request);
    if (resource === 'projects') {
      if (action === 'duplicate') {
        const original = await db.project.findUniqueOrThrow({ where: { id } });
        const suffix = randomUUID().slice(0, 6);
        const data = { ...(original.data as object), slug: `${original.slug.slice(0, 140)}-${suffix}`, title: `${original.title.slice(0, 165)} (cópia)`, status: 'draft', featured: null };
        const copy = await db.project.create({ data: { ...original, id: undefined, slug: data.slug, title: data.title, status: 'draft', featured: null, version: 1, data, createdAt: undefined, updatedAt: undefined } });
        await audit(user.id, 'duplicate', 'project', copy.id); return json(copy);
      }
      if (action === 'delete') { if (user.role !== 'admin') throw new ApiError('Somente administradores podem excluir.', 403); const p = await db.project.findUniqueOrThrow({ where: { id } }); if (p.status !== 'archived') throw new ApiError('Arquive o projeto antes de excluir.'); await db.project.delete({ where: { id } }); await audit(user.id, 'delete', 'project', id); return json({ ok: true }); }
      const value = z.object({ data: projectSchema, version: z.number().int().optional() }).parse(body);
      const p = value.data;
      const result = await db.$transaction(async tx => {
        if (await tx.redirect.findUnique({ where: { slug: p.slug } }).then(r => r && r.projectId !== id)) throw new ApiError('Este slug pertence ao histórico de outro projeto.', 409);
        const old = id ? await tx.project.findUniqueOrThrow({ where: { id } }) : null;
        if (old && value.version !== old.version) throw new ApiError('O projeto foi alterado por outra pessoa. Recarregue antes de salvar.', 409);
        if (old) {
          await tx.revision.create({ data: { entity: 'project', entityId: id, data: old.data as Prisma.InputJsonValue, authorId: user.id } });
          if (old.slug !== p.slug && (old.status === 'published' || await tx.publication.count() > 0)) await tx.redirect.upsert({ where: { slug: old.slug }, create: { slug: old.slug, projectId: id }, update: { projectId: id } });
        }
        const data = { slug: p.slug, title: p.title, description: p.description, status: p.status, featured: p.featured, sortOrder: p.sortOrder, data: asJson(p) };
        const result = old ? await tx.project.update({ where: { id, version: value.version }, data: { ...data, version: { increment: 1 } } }) : await tx.project.create({ data });
        await tx.auditLog.create({ data: { authorId: user.id, action: old ? 'update' : 'create', entity: 'project', entityId: result.id } });
        return result;
      });
      return json(result);
    }
    if (resource === 'documents') {
      if (!Object.hasOwn(documents, id)) throw new ApiError('Seção inválida.');
      const input = z.object({ data: z.unknown(), version: z.number().int() }).parse(body);
      const data = documents[id as DocumentKey].parse(input.data);
      const result = await db.$transaction(async tx => {
        const old = await tx.document.findUniqueOrThrow({ where: { key: id } });
        if (old.version !== input.version) throw new ApiError('Esta seção foi alterada por outra pessoa. Recarregue antes de salvar.', 409);
        await tx.revision.create({ data: { entity: 'document', entityId: id, authorId: user.id, data: old.data as Prisma.InputJsonValue } });
        return tx.document.update({ where: { key: id, version: input.version }, data: { data: asJson(data), version: { increment: 1 } } });
      });
      await audit(user.id, 'update', 'document', id); return json(result);
    }
    if (resource === 'publications') {
      if (id && action === 'retry') {
        const previous = await db.publication.findUniqueOrThrow({ where: { id } });
        if (previous.status !== 'failed') throw new ApiError('Somente publicações com falha podem ser repetidas.');
        const result = await db.publication.create({ data: { snapshot: previous.snapshot as Prisma.InputJsonValue, createdBy: user.id } });
        await audit(user.id, 'retry', 'publication', result.id); return json(result);
      }
      const restoreId = z.object({ restoreId: z.string().optional() }).parse(body).restoreId;
      const snapshot = restoreId ? (await db.publication.findUniqueOrThrow({ where: { id: restoreId } })).snapshot as Prisma.InputJsonValue : await createSnapshot();
      const result = await db.publication.create({ data: { snapshot, createdBy: user.id } });
      await audit(user.id, restoreId ? 'restore' : 'queue', 'publication', result.id); return json({ id: result.id });
    }
    if (resource === 'leads') {
      if (id === 'bulk') {
        const input = z.object({ ids: z.array(z.string()).min(1).max(100), status: z.enum(Object.keys(leadStages) as [keyof typeof leadStages, ...(keyof typeof leadStages)[]]).optional(), ownerId: z.string().nullable().optional(), tags: z.array(z.string().max(100)).max(30).optional(), lostReason: z.string().trim().max(2000).optional() }).parse(body);
        if (input.status === 'lost' && !input.lostReason) throw new ApiError('Informe o motivo da perda.');
        if (!input.status && input.ownerId === undefined && !input.tags) throw new ApiError('Selecione uma alteração.');
        if (input.ownerId && !await db.user.findFirst({ where: { id: input.ownerId, role: { in: ['admin', 'sales'] } } })) throw new ApiError('Responsável inválido.');
        await db.$transaction(async tx => {
          for (const leadId of input.ids) {
            const old = await tx.lead.findUniqueOrThrow({ where: { id: leadId } });
            await tx.lead.update({ where: { id: leadId }, data: { ...(input.status ? { status: input.status, firstContactAt: input.status !== 'new' && !old.firstContactAt ? new Date() : old.firstContactAt } : {}), ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}), ...(input.tags ? { tags: input.tags } : {}), ...(input.lostReason ? { lostReason: input.lostReason } : {}), version: { increment: 1 }, events: { create: { authorId: user.id, type: 'bulk', text: `Atualização em lote${input.status ? `: ${leadStages[input.status]}` : ''}.` } } } });
          }
        });
        await audit(user.id, 'bulk', 'leads', String(input.ids.length)); return json({ ok: true });
      }
      if (action === 'note') {
        const text = z.string().trim().min(1).max(5000).parse(body.text);
        const event = await db.leadEvent.create({ data: { leadId: id, authorId: user.id, type: 'note', text } });
        await audit(user.id, 'note', 'lead', id); return json(event);
      }
      if (action === 'anonymize') {
        if (user.role !== 'admin') throw new ApiError('Somente administradores podem anonimizar.', 403);
        await db.$transaction(async tx => {
          await tx.leadEvent.deleteMany({ where: { leadId: id } });
          await tx.task.deleteMany({ where: { leadId: id } });
          await tx.lead.update({ where: { id }, data: { name: 'Contato anonimizado', email: `${id}@anonymous.invalid`, phone: '', company: '', message: '', service: '', status: 'archived', tags: [], metadata: {}, lostReason: null, budget: null, deadline: null, ownerId: null, version: { increment: 1 } } });
        });
        await audit(user.id, 'anonymize', 'lead', id); return json({ ok: true });
      }
      const input = leadUpdateSchema.parse(body);
      if (input.ownerId && !await db.user.findFirst({ where: { id: input.ownerId, role: { in: ['admin', 'sales'] } } })) throw new ApiError('Responsável inválido.');
      if (input.status === 'lost' && !input.lostReason.trim()) throw new ApiError('Informe o motivo da perda.');
      const result = await db.$transaction(async tx => {
        const old = await tx.lead.findUniqueOrThrow({ where: { id } });
        if (input.version !== old.version) throw new ApiError('Outro atendimento alterou este lead. Recarregue antes de salvar.', 409);
        const deadline = input.deadline ? new Date(input.deadline) : null;
        if (deadline && !Number.isFinite(deadline.getTime())) throw new ApiError('Prazo inválido.');
        return tx.lead.update({ where: { id, version: input.version }, data: { ...input, version: { increment: 1 }, deadline, firstContactAt: input.status !== 'new' && !old.firstContactAt ? new Date() : old.firstContactAt, events: { create: { authorId: user.id, type: 'updated', text: old.status !== input.status ? `Etapa: ${leadStages[old.status as keyof typeof leadStages]} → ${leadStages[input.status]}.` : 'Dados do contato atualizados.' } } } });
      });
      await audit(user.id, 'update', 'lead', id); return json(result);
    }
    if (resource === 'tasks') {
      if (id) { const done = z.boolean().parse(body.done); const result = await db.task.update({ where: { id }, data: { done } }); await audit(user.id, done ? 'complete' : 'reopen', 'task', id); return json(result); }
      const value = z.object({ title: z.string().trim().min(1).max(200), leadId: z.string().nullable(), ownerId: z.string().nullable(), dueAt: z.iso.datetime() }).parse(body);
      if (value.ownerId && !await db.user.findFirst({ where: { id: value.ownerId, role: { in: ['admin', 'sales'] } } })) throw new ApiError('Responsável inválido.');
      const result = await db.task.create({ data: { ...value, dueAt: new Date(value.dueAt) } });
      if (value.leadId) await db.leadEvent.create({ data: { leadId: value.leadId, authorId: user.id, type: 'task', text: `Acompanhamento agendado: ${value.title}.` } });
      await audit(user.id, 'create', 'task', result.id); return json(result);
    }
    if (resource === 'users') {
      if (id) {
        const input = z.object({ name: z.string().min(2).max(200), role: z.enum(['admin', 'editor', 'sales']), revoke: z.boolean().default(false) }).parse(body);
        await db.$transaction(async tx => {
          const old = await tx.user.findUniqueOrThrow({ where: { id } });
          if (old.role === 'admin' && input.role !== 'admin' && await tx.user.count({ where: { role: 'admin' } }) <= 1) throw new ApiError('Mantenha pelo menos um administrador.');
          await tx.user.update({ where: { id }, data: { name: input.name, role: input.role } });
          if (input.revoke || old.role !== input.role) await tx.session.deleteMany({ where: { userId: id } });
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        await audit(user.id, 'update', 'user', id); return json({ ok: true });
      }
      const input = z.object({ name: z.string().min(2).max(200), email: z.email().max(254), role: z.enum(['admin', 'editor', 'sales']), password: z.string().min(12).max(128) }).parse(body);
      const userId = randomUUID();
      const result = await db.user.create({ data: { id: userId, name: input.name, email: input.email.toLowerCase(), emailVerified: true, role: input.role, accounts: { create: { id: randomUUID(), accountId: userId, providerId: 'credential', password: await hashPassword(input.password) } } }, select: { id: true } });
      await audit(user.id, 'create', 'user', result.id); return json(result);
    }
    throw new ApiError('Recurso não encontrado.', 404);
  } catch (e) { return errorResponse(e); }
}
