import 'dotenv/config';
import { randomBytes, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { db } from '../src/lib/db';
import { adminUrl } from '../src/lib/paths';
import { publicOrigin } from '../src/lib/env';
import path from 'node:path';
async function main() {
  if (await db.user.count()) throw new Error('O painel já tem usuários. Crie novos acessos pela tela Usuários.');
  const token = randomBytes(32).toString('base64url');
  await db.verification.deleteMany({ where: { identifier: 'first-access' } });
  await db.verification.create({ data: { id: randomBytes(16).toString('hex'), identifier: 'first-access', value: createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
  const storageDir = process.env.STORAGE_PATH || 'storage';
  await mkdir(storageDir, { recursive: true });
  const file = path.join(storageDir, 'first-access-url.txt');
  await writeFile(file, `${publicOrigin()}${adminUrl(`primeiro-acesso?token=${token}`)}\n`, { mode: 0o600 });
  console.log(`Link privado criado em ${file}. Expira em 1 hora e só pode ser usado uma vez.`);
}
main().catch(e => { console.error(e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
