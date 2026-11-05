import { requireUser } from '@/lib/access';
import { Shell } from '@/components/shell';
import { siteConfig, joinBase } from '../../../../site.config.mjs';
import { publicOrigin } from '@/lib/env';
export const dynamic = 'force-dynamic';
export default async function Layout({ children }: { children: React.ReactNode }) { const user = await requireUser(); return <Shell user={{ name: user.name, email: user.email, role: user.role || 'editor' }} sitePath={`${process.env.LP_ORIGIN || publicOrigin()}${joinBase(siteConfig.base)}`}>{children}</Shell>; }
