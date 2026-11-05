import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { auth } from './auth';
export const roles = ['admin', 'editor', 'sales'] as const;
export type Role = typeof roles[number];
export { can } from './access-rules';
import { can } from './access-rules';
export async function currentUser() { return (await auth.api.getSession({ headers: await headers() }))?.user; }
export async function requireUser(area?: 'content' | 'leads' | 'admin') {
  const user = await currentUser();
  if (!user) redirect('/login');
  if (area && !can(user.role, area)) throw new Error('Você não tem permissão para esta operação.');
  return user;
}
