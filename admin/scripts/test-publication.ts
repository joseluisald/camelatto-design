import 'dotenv/config';
import { spawn } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { db } from '../src/lib/db';
import { createSnapshot } from '../src/lib/content';
import { createHash } from 'node:crypto';
async function runWorker() {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--env-file=.env', 'node_modules/tsx/dist/cli.mjs', 'scripts/publish-worker.ts', '--once'], { stdio: 'inherit', windowsHide: true });
    child.on('error', reject); child.on('exit', code => code === 0 ? resolve() : reject(new Error('Worker falhou.')));
  });
}
async function main() {
  const snapshot = await createSnapshot();
  const job = await db.publication.create({ data: { snapshot, createdBy: 'local-validation' } });
  await runWorker();
  const result = await db.publication.findUniqueOrThrow({ where: { id: job.id } });
  if (result.status !== 'published') throw new Error(result.message || 'Publicação não concluída.');
  const stored = JSON.parse(await readFile('storage/published.json', 'utf8'));
  if (JSON.stringify(stored) !== JSON.stringify(snapshot)) throw new Error('Snapshot promovido diverge da publicação.');
  await access('../dist/index.html');
  console.log('Publicação local validada: snapshot → build isolado → promoção de dist → confirmação no banco.');
  const before = createHash('sha256').update(await readFile('../dist/index.html')).digest('hex');
  const failed = await db.publication.create({ data: { snapshot: { schemaVersion: 0 }, createdBy: 'local-validation' } });
  await runWorker();
  if ((await db.publication.findUniqueOrThrow({ where: { id: failed.id } })).status !== 'failed') throw new Error('Snapshot inválido não foi recusado.');
  if (before !== createHash('sha256').update(await readFile('../dist/index.html')).digest('hex')) throw new Error('Uma falha alterou o build anterior.');
  if (JSON.stringify(JSON.parse(await readFile('storage/published.json', 'utf8'))) !== JSON.stringify(snapshot)) throw new Error('Uma falha alterou o snapshot publicado.');
  await db.publication.deleteMany({ where: { createdBy: 'local-validation', status: 'failed' } });
  console.log('Falha simulada validada: dist/ e snapshot anterior permaneceram intactos.');
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
