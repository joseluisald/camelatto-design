import { Prisma } from '@prisma/client';
import { db } from './db';
import { documents, projectSchema, type DocumentKey } from './schemas';
export const asJson = (value: unknown) => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
export async function createSnapshot() {
  const docs = await db.document.findMany();
  const content = Object.fromEntries(docs.map(d => [d.key, d.data]));
  for (const key of Object.keys(documents) as DocumentKey[]) content[key] = documents[key].parse(content[key]);
  const projects = await db.project.findMany({ where: { status: 'published' }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  const payload = projects.map((p, index) => { const data = projectSchema.parse(p.data); return { ...data, id: p.id, displayId: data.displayId || String(index + 1).padStart(2, '0'), featured: p.featured }; });
  const redirects = await db.redirect.findMany();
  return asJson({ schemaVersion: 1, settings: content.settings, faq: content.faq, portfolio: { ...content, settings: undefined, faq: undefined, projects: payload, projectsHeading: content.projects }, redirects: redirects.flatMap(r => { const p = projects.find(p => p.id === r.projectId); return p && p.slug !== r.slug ? [{ from: r.slug, to: p.slug }] : []; }) });
}
export async function audit(authorId: string, action: string, entity: string, entityId: string) {
  await db.auditLog.create({ data: { authorId, action, entity, entityId } });
}
