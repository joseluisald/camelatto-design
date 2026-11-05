import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { db } from '../src/lib/db';
import { unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { adminBasePath } from '../../site.config.mjs';
import { loginForTest } from './auth-helper';

test('HTTP: auth, roles, optimistic edits, private drafts, leads and tasks', { skip: !process.env.TEST_BASE_URL, timeout: 180000 }, async () => {
  const origin = process.env.TEST_BASE_URL!;
  const base = `${origin}${adminBasePath}`;
  const suffix = randomUUID(), password = randomUUID() + 'Aa!';
  const userIds: string[] = [], leadIds: string[] = [], projectIds: string[] = [], publicationIds: string[] = [];
  const uploaded: { id: string; storageKey: string }[] = [];
  const cookies: Record<string, string> = {};
  const email = `integration-${suffix}@example.test`;
  async function request(path: string, role?: string, body?: unknown, extra: Record<string, string> = {}) {
    return fetch(`${base}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: { Origin: origin, ...(role ? { Cookie: cookies[role] } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extra }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: 'manual' });
  }
  try {
    for (const role of ['admin', 'editor', 'sales']) {
      const id = randomUUID(); userIds.push(id);
      await db.user.create({ data: { id, name: `Integration ${role}`, email: `${role}-${email}`, role, emailVerified: true, accounts: { create: { id: randomUUID(), accountId: id, providerId: 'credential', password: await hashPassword(password) } } } });
      const login = await loginForTest(`${base}/api/auth/sign-in/email`, origin, `${role}-${email}`, password);
      assert.equal(login.status, 200, `login ${role}: ${await login.clone().text()}`);
      cookies[role] = login.headers.getSetCookie().map(v => v.split(';')[0]).join('; ');
      assert.ok(cookies[role]);
    }
    assert.equal((await request('/api/manage/projects')).status, 401);
    assert.equal((await request('/api/manage/leads', 'editor')).status, 403);
    assert.equal((await request('/api/manage/projects', 'sales')).status, 403);
    assert.equal((await request('/api/manage/users', 'editor')).status, 403);
    assert.equal((await request('/api/manage/documents/settings', 'editor', { data: {}, version: 1 })).status, 403);
    const adminPage = await request('', 'admin'); assert.equal(adminPage.status, 200);
    const anonPage = await request(''); assert.ok([200, 307].includes(anonPage.status));
    if (anonPage.status === 307) assert.equal(new URL(anonPage.headers.get('location')!, origin).pathname, `${adminBasePath}/login`);
    const upload = new FormData();
    upload.set('alt', 'Imagem temporária de teste');
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#8f1b41' } }).png().toBuffer();
    upload.set('file', new File([new Uint8Array(png)], 'test.png', { type: 'image/png' }));
    const uploadedResponse = await fetch(`${base}/api/manage/media`, { method: 'POST', headers: { Origin: origin, Cookie: cookies.editor }, body: upload });
    assert.equal(uploadedResponse.status, 200, await uploadedResponse.clone().text());
    const image = await uploadedResponse.json(); uploaded.push(image);
    assert.equal((await fetch(`${origin}${image.url}`)).status, 404, 'draft media are private');
    assert.equal((await fetch(`${origin}${image.url}`, { headers: { Cookie: cookies.editor } })).status, 200);
    const oldPublic = await request('/api/public/content');
    const oldPublicBody = await oldPublic.text();
    const data = { title: 'Projeto de integração', slug: `integration-${suffix}`, displayId: 'T', description: 'Descrição de integração.', category: 'Teste', year: '2026', contribution: '', image: 'mobile', imageAlt: 'Teste', phoneImage: '', tags: [], stages: [], challenge: 'Desafio', process: 'Processo', solution: 'Solução', results: '', seoTitle: '', seoDescription: '', externalUrl: '', gallery: [], status: 'draft', featured: null, sortOrder: 9999 };
    const create = await request('/api/manage/projects', 'editor', { data }); assert.equal(create.status, 200, await create.clone().text());
    const project = await create.json(); projectIds.push(project.id);
    const update = await request(`/api/manage/projects/${project.id}`, 'editor', { data: { ...data, title: 'Título atualizado' }, version: project.version });
    assert.equal(update.status, 200);
    assert.equal((await request(`/api/manage/projects/${project.id}`, 'editor', { data, version: project.version })).status, 409);
    const afterPublic = await request('/api/public/content'); assert.equal(await afterPublic.text(), oldPublicBody, 'draft must not change public content');
    const queue = await request('/api/manage/publications', 'editor', {}); assert.equal(queue.status, 200); const publication = await queue.json(); publicationIds.push(publication.id);
    assert.equal((await request(`/api/public/content?snapshot=${publication.id}`)).status, 404, 'queued snapshot must remain private');
    const invalid = await request('/api/public/leads', undefined, { name: 'x' }); assert.equal(invalid.status, 422);
    const lead = { name: 'Contato de integração', email, message: 'Tenho interesse em um projeto.', idempotencyKey: randomUUID() };
    assert.equal((await request('/api/public/leads', undefined, lead, { 'X-Forwarded-For': suffix })).status, 201);
    assert.equal((await request('/api/public/leads', undefined, lead, { 'X-Forwarded-For': suffix })).status, 200);
    const created = await db.lead.findMany({ where: { email } }); leadIds.push(...created.map(l => l.id)); assert.equal(created.length, 1);
    const details = await request(`/api/manage/leads/${created[0].id}`, 'sales'); assert.equal(details.status, 200);
    assert.equal((await request(`/api/manage/leads/${created[0].id}/note`, 'sales', { text: 'Nota de integração.' })).status, 200);
    assert.equal((await request('/api/manage/leads/bulk', 'sales', { ids: leadIds, status: 'contacted', ownerId: userIds[2] })).status, 200);
    const updated = await db.lead.findUniqueOrThrow({ where: { id: leadIds[0] } }); assert.ok(updated.firstContactAt); assert.equal(updated.status, 'contacted');
    const task = await request('/api/manage/tasks', 'sales', { title: 'Retornar o contato', leadId: leadIds[0], ownerId: userIds[2], dueAt: new Date().toISOString() }); assert.equal(task.status, 200);
    const taskData = await task.json(); assert.equal((await request(`/api/manage/tasks/${taskData.id}`, 'sales', { done: true })).status, 200);
    assert.equal((await request(`/api/manage/leads/${leadIds[0]}/anonymize`, 'sales', {})).status, 403);
    const badOrigin = await request('/api/manage/publications', 'admin', {}, { Origin: 'https://malicious.example' }); assert.equal(badOrigin.status, 403);
    const exported = await request('/api/manage/leads/export', 'sales'); assert.equal(exported.status, 200); assert.ok((await exported.text()).includes(email));
    const note = await db.leadEvent.findMany({ where: { leadId: leadIds[0], type: 'note' } }); assert.equal(note.length, 1);
    console.log('Integração HTTP aprovada: login, permissões, conflito, rascunho privado, idempotência, notas, tarefas e CSV.');
  } finally {
    await db.task.deleteMany({ where: { leadId: { in: leadIds } } });
    await db.submission.deleteMany({ where: { leadId: { in: leadIds } } });
    await db.lead.deleteMany({ where: { id: { in: leadIds } } });
    await db.revision.deleteMany({ where: { entityId: { in: projectIds } } });
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    await db.publication.deleteMany({ where: { id: { in: publicationIds } } });
    await db.auditLog.deleteMany({ where: { authorId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    for (const image of uploaded) { await db.media.deleteMany({ where: { id: image.id } }); if (/^[0-9a-f-]{36}\.webp$/.test(image.storageKey)) await unlink(path.resolve(process.env.STORAGE_PATH || 'storage', image.storageKey)).catch(() => {}); }
    await db.rateLimit.deleteMany({ where: { key: { in: [`lead:${suffix}`, `lead-email:${email}`].map(k => createHash('sha256').update(k).digest('hex')) } } });
    await db.$disconnect();
  }
});
