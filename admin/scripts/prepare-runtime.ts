import 'dotenv/config';
import { mkdir, readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { spawn } from 'node:child_process';
import { db } from '../src/lib/db';
import { databaseUrl } from '../src/lib/env';
import { buildFront } from '../src/lib/build-front';
import { activeRelease, prepareRelease, activateRelease } from '../../deploy/releases.mjs';

const workspace = path.resolve('..');
const runtimeDir = path.resolve(process.env.PUBLISH_RUNTIME_DIR || '/data');
const storageDir = path.resolve(process.env.STORAGE_PATH || path.join(runtimeDir, 'storage'));
async function script(name: string, args: string[] = []) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', `scripts/${name}.ts`, ...args], { cwd: path.join(workspace, 'admin'), env: process.env, stdio: 'inherit' });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`Falha na preparação: ${name}.`)));
  });
}
async function main() {
  await mkdir(storageDir, { recursive: true });
  await mkdir(runtimeDir, { recursive: true });
  let connection: mysql.Connection | undefined;
  let locked = false;
  try {
    connection = await mysql.createConnection(databaseUrl());
    const [rows] = await connection.query<RowDataPacket[]>("SELECT GET_LOCK(CONCAT(DATABASE(), ':camelatto-publisher'), 120) AS acquired");
    locked = Number(rows[0].acquired) === 1;
    if (!locked) throw new Error('Outra publicação está em andamento.');
    if (process.env.DB_BOOTSTRAP_ON_START === 'true') {
      const [tables] = await connection.query<RowDataPacket[]>('SHOW TABLES');
      // Explicit opt-in, and only an entirely empty database can be initialized.
      if (!tables.length) await script('database', ['setup']);
      await script('import-content');
    }
    const published = await db.publication.findFirst({ where: { status: 'published' }, orderBy: { sequence: 'desc' } });
    let snapshot: unknown = published?.snapshot;
    if (!snapshot) {
      try { snapshot = JSON.parse(await readFile(path.join(storageDir, 'published.json'), 'utf8')); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    const id = `boot-${randomUUID()}`;
    const source = snapshot ? (await buildFront({ snapshot, id, workspace, stagingRoot: path.join(runtimeDir, 'builds') })).output : path.join(workspace, 'dist');
    const publicDir = await prepareRelease({ source, runtimeDir, id, snapshot });
    await activateRelease({ runtimeDir, publicDir, snapshot, storageDir });
    console.log(published ? 'LP reconstruída com a última versão publicada no banco.' : 'Build inicial da LP preparado.');
  } catch {
    if (await activeRelease(runtimeDir)) {
      console.error('A preparação não foi concluída. O site anterior foi preservado; confira o banco e os logs privados de build.');
    } else {
      const id = `fallback-${randomUUID()}`;
      const publicDir = await prepareRelease({ source: path.join(workspace, 'dist'), runtimeDir, id, snapshot: null });
      await activateRelease({ runtimeDir, publicDir, snapshot: null, storageDir });
      console.error('Usando o build inicial da imagem. Configure o banco para habilitar o painel e a publicação.');
    }
  } finally {
    if (locked && connection) await connection.query("SELECT RELEASE_LOCK(CONCAT(DATABASE(), ':camelatto-publisher'))").catch(() => {});
    await connection?.end();
    await db.$disconnect();
  }
}
main().catch(() => { console.error('Não foi possível preparar o armazenamento persistente. Confira a permissão de escrita do usuário 1000 em /data.'); process.exitCode = 1; });
