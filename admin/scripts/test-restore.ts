import 'dotenv/config';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { databaseUrl } from '../src/lib/env';
async function main() {
  const connection = await mysql.createConnection(databaseUrl());
  const testName = `ca_restore_test_${randomUUID().replace(/-/g, '')}`;
  let created = false;
  try {
    const result = spawnSync(process.execPath, ['--env-file=.env', 'node_modules/tsx/dist/cli.mjs', 'scripts/database.ts', 'backup'], { encoding: 'utf8', windowsHide: true });
    if (result.status !== 0) throw new Error('Não foi possível gerar backup para o teste.');
    const latest = (await readdir('backups')).filter(f => /^database-\d+\.json$/.test(f)).sort().at(-1)!;
    const backup = JSON.parse(await readFile(`backups/${latest}`, 'utf8'));
    if (!/^ca_restore_test_[a-f0-9]{32}$/.test(testName) || testName === process.env.DB_NAME) throw new Error('Nome de banco de teste inválido.');
    await connection.query(`CREATE DATABASE \`${testName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); created = true;
    const testUrl = new URL(databaseUrl()); testUrl.pathname = `/${testName}`;
    const restore = spawnSync(process.execPath, ['--env-file=.env', 'node_modules/tsx/dist/cli.mjs', 'scripts/restore.ts', `backups/${latest}`, '--confirm-empty-database'], { encoding: 'utf8', windowsHide: true, env: { ...process.env, DATABASE_URL: testUrl.toString() } });
    if (restore.status !== 0) throw new Error(`Restauração de teste falhou: ${restore.stderr}`);
    for (const [name, entry] of Object.entries(backup.tables) as [string, { rows: unknown[] }][]) {
      if (!/^ca_[a-z_]+$/.test(name)) throw new Error('Tabela inesperada no backup.');
      const [rows] = await connection.query<RowDataPacket[]>(`SELECT COUNT(*) AS total FROM \`${testName}\`.\`${name}\``);
      if (Number(rows[0].total) !== entry.rows.length) throw new Error(`Contagem divergente: ${name}.`);
    }
    console.log(`Restauração validada em banco isolado: ${Object.keys(backup.tables).length} tabelas e contagens conferidas.`);
  } finally {
    if (created && /^ca_restore_test_[a-f0-9]{32}$/.test(testName) && testName !== process.env.DB_NAME) await connection.query(`DROP DATABASE \`${testName}\``);
    await connection.end();
  }
}
main().catch(e => { console.error(e.code ? `Teste de restauração falhou (${e.code}).` : e.message); process.exitCode = 1; });
