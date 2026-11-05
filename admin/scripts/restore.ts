import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mysql, { type RowDataPacket } from 'mysql2/promise';
import { databaseUrl } from '../src/lib/env';
async function main() {
  const file = process.argv[2];
  if (!file || !process.argv.includes('--confirm-empty-database')) throw new Error('Use: npm run db:restore -- backups/arquivo.json --confirm-empty-database. O destino deve ser um banco vazio.');
  const backup = JSON.parse(await readFile(file, 'utf8'));
  if (backup.format !== 1 || typeof backup.tables !== 'object') throw new Error('Formato de backup inválido.');
  const connection = await mysql.createConnection(databaseUrl());
  try {
    const [existing] = await connection.query<RowDataPacket[]>('SHOW TABLES');
    if (existing.length) throw new Error('Restauração recusada: o banco de destino deve estar vazio. Nenhuma tabela existente foi alterada.');
    for (const [name, entry] of Object.entries(backup.tables) as [string, { schema: string; rows: Record<string, unknown>[] }][]) {
      if (!/^ca_[a-z_]+$/.test(name) || !entry.schema.startsWith(`CREATE TABLE \`${name}\``)) throw new Error('O backup deve conter apenas tabelas ca_.');
    }
    await connection.query('SET FOREIGN_KEY_CHECKS=0');
    for (const [, entry] of Object.entries(backup.tables) as [string, { schema: string }][]) await connection.query(entry.schema);
    for (const [name, entry] of Object.entries(backup.tables) as [string, { rows: Record<string, unknown>[] }][]) {
      const [columns] = await connection.query<RowDataPacket[]>(`SHOW COLUMNS FROM \`${name}\``);
      const types = Object.fromEntries(columns.map(c => [c.Field, String(c.Type)]));
      for (const row of entry.rows) {
        const keys = Object.keys(row); if (keys.some(k => !/^[A-Za-z0-9_]+$/.test(k))) throw new Error('Coluna inválida.');
        const values = keys.map(k => { const v = row[k]; if (v == null) return null; if (/datetime|timestamp/i.test(types[k])) return new Date(String(v)); if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') return v; return JSON.stringify(v); });
        await connection.execute(`INSERT INTO \`${name}\` (${keys.map(k => `\`${k}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, values);
      }
    }
    await connection.query('SET FOREIGN_KEY_CHECKS=1');
    console.log('Backup restaurado no banco vazio. Confira contagens e integridade antes de conectar a aplicação.');
  } finally { await connection.end(); }
}
main().catch(e => { console.error(e.code ? `Falha na restauração (${e.code}).` : e.message); process.exitCode = 1; });
