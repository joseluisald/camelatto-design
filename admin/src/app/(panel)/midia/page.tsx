import { requireUser } from '@/lib/access';
import { MediaScreen } from '@/components/operations';
export default async function Page() { await requireUser('content'); return <MediaScreen />; }
