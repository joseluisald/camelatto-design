import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { db } from '../src/lib/db';
import { z } from 'zod';

async function main() {
  const password = process.env.BOOTSTRAP_PASSWORD;
  if (!password || password.length < 12 || password.length > 128) {
    throw new Error('Nenhum usuário foi criado. Defina BOOTSTRAP_PASSWORD no ambiente ou no admin/.env com 12 a 128 caracteres e execute novamente.');
  }
  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const email = z.string().trim().toLowerCase().pipe(z.email()).parse(process.env.BOOTSTRAP_EMAIL || await prompt.question('E-mail do administrador: '));
    const name = z.string().trim().min(2).max(200).parse(process.env.BOOTSTRAP_NAME || await prompt.question('Nome: '));
    if (await db.user.findUnique({ where: { email } })) throw new Error('Já existe um usuário com este e-mail; nenhuma senha foi alterada.');
    const id = randomUUID();
    await db.user.create({ data: { id, email, name, role: 'admin', emailVerified: true, accounts: { create: { id: randomUUID(), accountId: id, providerId: 'credential', password: await hashPassword(password) } } } });
    console.log('Administrador criado e salvo no banco. Entre com o e-mail informado e a senha de BOOTSTRAP_PASSWORD.');
  } finally { prompt.close(); await db.$disconnect(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
