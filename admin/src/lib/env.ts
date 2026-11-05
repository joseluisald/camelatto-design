import { z } from 'zod';

export function databaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const value = z.object({ DB_HOST: z.string().min(1), DB_PORT: z.coerce.number().default(3306), DB_USER: z.string().min(1), DB_PASSWORD: z.string(), DB_NAME: z.string().min(1) }).parse(process.env);
  return `mysql://${encodeURIComponent(value.DB_USER)}:${encodeURIComponent(value.DB_PASSWORD)}@${value.DB_HOST}:${value.DB_PORT}/${encodeURIComponent(value.DB_NAME)}`;
}
export function publicOrigin() { return process.env.ADMIN_ORIGIN || 'http://localhost:4321'; }
