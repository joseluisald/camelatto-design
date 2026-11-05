import { requireUser } from '@/lib/access';
import { UsersScreen } from '@/components/operations';
export default async function Page() { await requireUser('admin'); return <UsersScreen />; }
