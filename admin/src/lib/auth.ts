import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import nodemailer from 'nodemailer';
import { db } from './db';
import { adminUrl, adminBase } from './paths';
import { publicOrigin } from './env';
import { allowedOrigins } from './http';

export const auth = betterAuth({
  appName: 'Camelatto Studio',
  baseURL: publicOrigin(),
  basePath: adminUrl('api/auth'),
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(db, { provider: 'mysql' }),
  trustedOrigins: [...allowedOrigins()],
  emailAndPassword: {
    enabled: true, disableSignUp: true, minPasswordLength: 12,
    revokeSessionsOnPasswordReset: true,
    ...(process.env.SMTP_HOST ? { sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
      const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), secure: process.env.SMTP_PORT === '465', auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined });
      await transport.sendMail({ from: process.env.SMTP_FROM, to: user.email, subject: 'Redefinir acesso — Camelatto', text: `Acesse este link para redefinir sua senha: ${url}\nSe não solicitou, ignore esta mensagem.` });
    } } : {}),
  },
  user: { additionalFields: { role: { type: 'string', required: false, defaultValue: 'editor', input: false } } },
  session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 30 },
  advanced: { cookiePrefix: 'camelatto', defaultCookieAttributes: { path: adminBase, sameSite: 'lax', httpOnly: true, secure: publicOrigin().startsWith('https://') } },
  rateLimit: { enabled: true, storage: 'database', modelName: 'authRateLimit', window: 60, max: 30 },
  plugins: [nextCookies()],
});
