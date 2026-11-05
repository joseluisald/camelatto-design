import { AuthForm } from '@/components/auth-form';
import Link from 'next/link';
import { db } from '@/lib/db';
export const dynamic = 'force-dynamic';
export default async function Page() {
  if (!await db.user.count()) return <div className="auth-box"><div className="eyebrow">Primeiro acesso</div><h1>Vamos configurar seu acesso.</h1><p>O primeiro administrador ainda não foi cadastrado. Abra o link privado de configuração para criar sua conta e definir a senha.</p><Link className="button primary" href="/primeiro-acesso">Configurar primeiro acesso</Link></div>;
  return <AuthForm mode="login" recoveryEnabled={!!process.env.SMTP_HOST} />;
}
