import { requireUser } from '@/lib/access';
import { AuditScreen } from '@/components/operations';
export default async function Page() { await requireUser('admin'); return <AuditScreen />; }
