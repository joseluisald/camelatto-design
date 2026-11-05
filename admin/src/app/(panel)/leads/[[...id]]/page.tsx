import { requireUser } from '@/lib/access';
import { notFound } from 'next/navigation';
import { LeadsList, LeadDetail } from '@/components/leads';
export default async function Page({ params }: { params: Promise<{ id?: string[] }> }) { const user = await requireUser('leads'); const { id } = await params; if (id && id.length > 1) notFound(); return id ? <LeadDetail id={id[0]} admin={user.role === 'admin'} /> : <LeadsList />; }
