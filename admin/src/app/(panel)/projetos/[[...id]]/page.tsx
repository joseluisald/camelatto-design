import { requireUser } from '@/lib/access';
import { notFound } from 'next/navigation';
import { ProjectsList, ProjectEditor } from '@/components/projects';
export default async function Page({ params }: { params: Promise<{ id?: string[] }> }) { const user = await requireUser('content'); const { id } = await params; if (id && id.length > 1) notFound(); return !id ? <ProjectsList /> : <ProjectEditor id={id[0] === 'novo' ? undefined : id[0]} admin={user.role === 'admin'} />; }
