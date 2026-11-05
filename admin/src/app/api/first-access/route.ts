import { createHash, randomUUID } from 'node:crypto';
import { hashPassword } from 'better-auth/crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '@/lib/db';
import { checkOrigin, readJson } from '@/lib/http';
import { rateLimit } from '@/lib/rate-limit';
export async function POST(request: Request) {
  try {
    checkOrigin(request);
    if (!await rateLimit('first-access', 10, 600)) return Response.json({ error: 'Aguarde alguns minutos para tentar novamente.' }, { status: 429 });
    const input = z.object({ token: z.string().min(40).max(100), name: z.string().trim().min(2).max(200), email: z.email().max(254), password: z.string().min(12).max(128) }).parse(await readJson(request, 5000));
    const password = await hashPassword(input.password);
    await db.$transaction(async tx => {
      if (await tx.user.count()) throw new Error('Configuração inicial indisponível.');
      const token = await tx.verification.findFirst({ where: { identifier: 'first-access', value: createHash('sha256').update(input.token).digest('hex'), expiresAt: { gt: new Date() } } });
      if (!token) throw new Error('Link expirado ou inválido. Gere outro pelo comando admin:invite.');
      await tx.verification.delete({ where: { id: token.id } });
      const id = randomUUID();
      await tx.user.create({ data: { id, name: input.name, email: input.email.toLowerCase(), emailVerified: true, role: 'admin', accounts: { create: { id: randomUUID(), accountId: id, providerId: 'credential', password } } } });
      await tx.auditLog.create({ data: { authorId: id, action: 'bootstrap', entity: 'user', entityId: id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return Response.json({ ok: true });
  } catch { return Response.json({ error: 'Não foi possível criar o acesso. Confira os campos, use uma senha com 12 caracteres e um link válido ainda não utilizado.' }, { status: 400 }); }
}
