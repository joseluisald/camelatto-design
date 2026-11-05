import 'dotenv/config';
import { mkdir, writeFile, rename, access } from 'node:fs/promises';
import path from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { db } from '../src/lib/db';
import { databaseUrl } from '../src/lib/env';
import { buildFront } from '../src/lib/build-front';
import { prepareRelease, commitRelease } from '../../deploy/releases.mjs';

const workspace = path.resolve('..');
const runtimeDir = process.env.PUBLISH_RUNTIME_DIR ? path.resolve(process.env.PUBLISH_RUNTIME_DIR) : null;
const stagingRoot = runtimeDir ? path.join(runtimeDir, 'builds') : path.join(workspace, '.publish');
function inside(parent: string, target: string) { const relative = path.relative(parent, target); if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Caminho fora da área de publicação.'); return target; }
async function exists(file: string) { try { await access(file); return true; } catch { return false; } }
async function promote(from: string, to: string) {
  // Windows scanners/watchers can retain a directory handle briefly after a build.
  for (let attempt = 0; ; attempt++) {
    try { await rename(from, to); return; }
    catch (e) {
      if (attempt >= 9 || !['EPERM', 'EBUSY', 'EACCES'].includes((e as NodeJS.ErrnoException).code || '')) throw e;
      await new Promise(resolve => setTimeout(resolve, Math.min(150 * 2 ** attempt, 2000)));
    }
  }
}
async function processOne() {
  const connection = await mysql.createConnection(databaseUrl());
  let locked = false;
  try {
    const [rows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(CONCAT(DATABASE(), ':camelatto-publisher'), 0) AS acquired");
    locked = Number(rows[0].acquired) === 1;
    if (!locked) return false;
    // An exclusive connection lock is held for the whole build. If we acquired
    // it, no previous worker can still own a running job after a restart.
    await db.publication.updateMany({ where: { status: 'building' }, data: { status: 'failed', message: 'Processamento interrompido. Use Repetir para iniciar outro trabalho.', finishedAt: new Date() } });
    const job = await db.publication.findFirst({ where: { status: 'queued' }, orderBy: { sequence: 'asc' } });
    if (!job) return false;
    const claimed = await db.publication.updateMany({ where: { id: job.id, status: 'queued' }, data: { status: 'building', startedAt: new Date(), message: 'Compilando a LP a partir desta versão.' } });
    if (!claimed.count) return false;
    try {
      if (await db.publication.findFirst({ where: { sequence: { gt: job.sequence }, status: 'published' } })) throw new Error('Uma versão mais recente já foi publicada.');
      const { stage, output } = await buildFront({ snapshot: job.snapshot, id: job.id, workspace, stagingRoot });
      if (process.env.DEPLOY_WEBHOOK_URL) {
        const url = new URL(process.env.DEPLOY_WEBHOOK_URL);
        if (url.protocol !== 'https:') throw new Error('O webhook de produção deve usar HTTPS.');
        await db.publication.update({ where: { id: job.id }, data: { status: 'deploying', message: 'Build concluído. Aguardando confirmação do pipeline de produção.' } });
        const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.DEPLOY_WEBHOOK_TOKEN ? { Authorization: `Bearer ${process.env.DEPLOY_WEBHOOK_TOKEN}` } : {}) }, body: JSON.stringify({ publicationId: job.id, sequence: job.sequence }), signal: AbortSignal.timeout(30000) });
        if (!response.ok) throw new Error('O pipeline recusou a solicitação de deploy.');
      } else if (runtimeDir) {
        const storageDir = path.resolve(process.env.STORAGE_PATH || 'storage');
        const publicDir = await prepareRelease({ source: output, runtimeDir, id: job.id, snapshot: job.snapshot });
        await commitRelease({ runtimeDir, publicDir, snapshot: job.snapshot, storageDir, commit: () => db.publication.update({ where: { id: job.id }, data: { status: 'published', finishedAt: new Date(), message: 'LP publicada. A nova versão já está sendo servida pelo site.' } }) });
      } else {
        // Local publication promotes the complete build and retains the old build for rollback.
        const destination = inside(workspace, path.join(workspace, 'dist'));
        const previous = inside(stage, path.join(stage, 'previous-dist'));
        const storage = path.resolve(process.env.STORAGE_PATH || 'storage');
        await mkdir(storage, { recursive: true });
        const tempSnapshot = path.join(storage, `${job.id}.json`);
        await writeFile(tempSnapshot, JSON.stringify(job.snapshot));
        const hadPrevious = await exists(destination);
        if (hadPrevious) await promote(destination, previous);
        try { await promote(output, destination); await promote(tempSnapshot, path.join(storage, 'published.json')); }
        catch (e) { if (await exists(destination)) await promote(destination, path.join(stage, 'failed-dist')); if (hadPrevious) await promote(previous, destination); throw e; }
        await db.publication.update({ where: { id: job.id }, data: { status: 'published', finishedAt: new Date(), message: 'Build publicado em dist/ neste servidor. Conteúdo público atualizado.' } });
      }
      console.log(`Publicação #${job.sequence} processada.`);
    } catch (e) { await db.publication.update({ where: { id: job.id }, data: { status: 'failed', finishedAt: new Date(), message: e instanceof Error ? e.message : 'Falha ao publicar.' } }); console.error(`Falha na publicação #${job.sequence}.`); }
    return true;
  } finally { if (locked) await connection.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':camelatto-publisher'))"); await connection.end(); }
}
let running = true;
process.on('SIGINT', () => { running = false; }); process.on('SIGTERM', () => { running = false; });
async function main() {
  do {
    try { const processed = await processOne(); if (process.argv.includes('--once')) break; if (!processed) await new Promise(resolve => setTimeout(resolve, 2500)); }
    catch (error) {
      if (process.argv.includes('--once')) throw error;
      console.error('Worker aguardando reconexão com o banco. Nova tentativa em 10 segundos.');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  } while (running);
}
main().catch(e => { console.error(e.code ? `Worker indisponível (${e.code}).` : e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
