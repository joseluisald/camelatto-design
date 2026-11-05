import { Dashboard } from '@/components/dashboard';
import { requireUser } from '@/lib/access';
export default async function Page() { const user = await requireUser(); return <Dashboard name={user.name} role={user.role || 'editor'} />; }
