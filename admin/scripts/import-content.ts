import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { db } from '../src/lib/db';
import { documents, projectSchema, type DocumentKey } from '../src/lib/schemas';
async function main() {
  const portfolio = JSON.parse(await readFile('../src/data/portfolio.json', 'utf8'));
  const settings = JSON.parse(await readFile('../src/data/settings.json', 'utf8')).site;
  const faq = JSON.parse(await readFile('../src/data/faq.json', 'utf8'));
  for (const key of Object.keys(documents) as DocumentKey[]) {
    const source = key === 'settings' ? settings : key === 'faq' ? faq : key === 'projects' ? { title: 'Projetos em destaque' } : portfolio[key];
    const data = documents[key].parse(source);
    await db.document.upsert({ where: { key }, create: { key, data }, update: {} });
  }
  for (const [index, p] of portfolio.projects.entries()) {
    const data = projectSchema.parse({ ...p, displayId: p.id, status: 'published', featured: index < 3 ? index + 1 : null, sortOrder: index });
    await db.project.upsert({ where: { slug: data.slug }, create: { slug: data.slug, title: data.title, description: data.description, status: data.status, featured: data.featured, sortOrder: index, data }, update: {} });
  }
  console.log('Conteúdo importado. Registros existentes foram preservados.');
}
main().catch(e => { console.error(e.code ? `Importação falhou (${e.code}).` : e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
