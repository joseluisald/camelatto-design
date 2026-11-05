// Temporary local account for browser verification. Never used as a production credential.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { hashPassword } from 'better-auth/crypto';
import { db } from '../src/lib/db';
const file = 'storage/review-access.json';
async function main() {
  if (process.argv.includes('--remove')) {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (!String(value.email).endsWith('@review.example.test')) throw new Error('Conta de revisão inválida.');
    await db.auditLog.deleteMany({ where: { authorId: value.id } });
    await db.user.deleteMany({ where: { id: value.id, email: value.email } });
    await unlink(file);
    console.log('Conta temporária e credenciais de revisão removidas.'); return;
  }
  const id = randomUUID(), email = `${id}@review.example.test`, password = randomUUID() + randomUUID();
  await db.user.create({ data: { id, name: 'Revisão do painel', email, role: 'admin', emailVerified: true, accounts: { create: { id: randomUUID(), accountId: id, providerId: 'credential', password: await hashPassword(password) } } } });
  await mkdir('storage', { recursive: true });
  await writeFile(file, JSON.stringify({ id, email, password }), { mode: 0o600 });
  console.log('Conta temporária de revisão criada; credenciais mantidas em arquivo privado.');
}
main().catch(e => { console.error(e.code || e.message); process.exitCode = 1; }).finally(() => db.$disconnect());
