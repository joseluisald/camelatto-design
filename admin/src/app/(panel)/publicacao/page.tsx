import { requireUser } from '@/lib/access';
import { PublicationsScreen } from '@/components/operations';
export default async function Page() { await requireUser('content'); return <PublicationsScreen />; }
