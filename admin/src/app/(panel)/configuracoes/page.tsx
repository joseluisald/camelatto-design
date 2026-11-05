import { requireUser } from '@/lib/access';
import { DocumentsScreen } from '@/components/documents';
export default async function Page() { await requireUser('admin'); return <DocumentsScreen settings />; }
