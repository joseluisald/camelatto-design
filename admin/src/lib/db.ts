import { PrismaClient } from '@prisma/client';
import { databaseUrl } from './env';
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db = globalDb.prisma ?? new PrismaClient({ datasources: { db: { url: databaseUrl() } }, log: ['warn'] });
if (process.env.NODE_ENV !== 'production') globalDb.prisma = db;
