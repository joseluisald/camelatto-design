import { FirstAccess } from '@/components/first-access';
export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) { return <FirstAccess token={(await searchParams).token} />; }
