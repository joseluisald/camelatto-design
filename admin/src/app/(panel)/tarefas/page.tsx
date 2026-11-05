import { requireUser } from '@/lib/access';
import { TasksScreen } from '@/components/leads';
export default async function Page() { await requireUser('leads'); return <TasksScreen />; }
