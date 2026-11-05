import { createHash } from 'node:crypto';
import { db } from './db';
export async function rateLimit(value: string, max = 10, seconds = 600) {
  const key = createHash('sha256').update(value).digest('hex');
  const now = new Date();
  const resetAt = new Date(now.getTime() + seconds * 1000);
  await db.$executeRaw`INSERT INTO ca_rate_limits (\`key\`, count, resetAt) VALUES (${key}, 1, ${resetAt}) ON DUPLICATE KEY UPDATE count = IF(resetAt < ${now}, 1, count + 1), resetAt = IF(resetAt < ${now}, ${resetAt}, resetAt)`;
  const limit = await db.rateLimit.findUniqueOrThrow({ where: { key } });
  return limit.count <= max;
}
