import 'dotenv/config';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { mkdir, writeFile, appendFile, readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { databaseUrl } from '../src/lib/env';

const task = process.argv[2] || 'inspect';
async function main() {
  const connection = await mysql.createConnection(databaseUrl());
  try {
    const [version] = await connection.query<RowDataPacket[]>('SELECT VERSION() AS version');
    const [tables] = await connection.query<RowDataPacket[]>('SHOW TABLES');
    const names = tables.map(row => Object.values(row)[0] as string);
    console.log(JSON.stringify({ engine: version[0].version, tableCount: names.length, adminTables: names.filter(v => v.startsWith('ca_')) }, null, 2));
    if (task === 'inspect') return;
    const backup: Record<string, unknown> = {};
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    for (const name of names) {
      if (!/^[a-zA-Z0-9_]+$/.test(name)) throw new Error('Nome de tabela incompatível com backup seguro.');
      const [schema] = await connection.query<RowDataPacket[]>(`SHOW CREATE TABLE \`${name}\``);
      const [rows] = await connection.query(`SELECT * FROM \`${name}\``);
      backup[name] = { schema: schema[0]['Create Table'], rows };
    }
    const backupDir = process.env.BACKUP_PATH || 'backups';
    await mkdir(backupDir, { recursive: true });
    const file = path.join(backupDir, `database-${Date.now()}.json`);
    await writeFile(file, JSON.stringify({ format: 1, createdAt: new Date(), tables: backup }, (_, v) => typeof v === 'bigint' ? v.toString() : v), { mode: 0o600 });
    await connection.commit();
    console.log(`Backup privado criado em ${file}.`);
    if (task === 'backup') return;
    if (task !== 'setup') throw new Error('Use inspect, backup ou setup.');
    if (names.some(v => v.startsWith('ca_'))) throw new Error('Tabelas ca_ já existem. Setup não reaplica schema nem modifica tabelas existentes.');
    const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], { encoding: 'utf8', env: { ...process.env, DATABASE_URL: databaseUrl() } });
    if (result.status !== 0) throw new Error('Não foi possível gerar a migration.');
    await mkdir('prisma/migrations/0001_initial', { recursive: true });
    await writeFile('prisma/migrations/0001_initial/migration.sql', result.stdout);
    const statements = result.stdout.replace(/--[^\n]*/g, '').split(';').map(s => s.trim()).filter(Boolean);
    if (statements.some(sql => !/^(CREATE TABLE|CREATE (UNIQUE )?INDEX|ALTER TABLE) /i.test(sql) || !sql.includes('`ca_'))) throw new Error('Migration recusada: apenas criação das tabelas ca_ é permitida.');
    for (const statement of statements) await connection.query(statement);
    const env = await readFile('.env', 'utf8').catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    const additions: string[] = [];
    if (env !== null) {
      if (!process.env.BETTER_AUTH_SECRET && !/^BETTER_AUTH_SECRET=/m.test(env)) additions.push(`BETTER_AUTH_SECRET=${randomBytes(48).toString('base64url')}`);
      if (!process.env.PUBLICATION_SECRET && !/^PUBLICATION_SECRET=/m.test(env)) additions.push(`PUBLICATION_SECRET=${randomBytes(48).toString('base64url')}`);
      if (additions.length) await appendFile('.env', `\n${additions.join('\n')}\n`);
    }
    console.log('Tabelas criadas. Segredos são lidos do ambiente de execução ou do .env local. Próximo: npm run content:import e npm run admin:user.');
  } finally { await connection.end(); }
}
main().catch((error: { code?: string; message: string }) => { console.error(error.code ? `Falha de banco (${error.code}). Confira conexão e permissões no .env.` : error.message); process.exitCode = 1; });
