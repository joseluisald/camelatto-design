'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { LayoutDashboard, Layers3, FileText, Images, UsersRound, ListTodo, Settings2, ShieldCheck, History, ArrowUpRight, LogOut, Menu, ChevronRight, Send } from 'lucide-react';
import { adminBase, adminUrl } from '@/lib/paths';
import { can } from '@/lib/access-rules';
const links = [
  { href: '/', label: 'Visão geral', icon: LayoutDashboard, area: null },
  { href: '/projetos', label: 'Projetos', icon: Layers3, area: 'content' },
  { href: '/conteudo', label: 'Conteúdo da LP', icon: FileText, area: 'content' },
  { href: '/midia', label: 'Biblioteca de mídia', icon: Images, area: 'content' },
  { href: '/publicacao', label: 'Publicação', icon: Send, area: 'content' },
  { href: '/leads', label: 'Leads', icon: UsersRound, area: 'leads' },
  { href: '/tarefas', label: 'Acompanhamentos', icon: ListTodo, area: 'leads' },
  { href: '/configuracoes', label: 'Configurações', icon: Settings2, area: 'admin' },
  { href: '/usuarios', label: 'Usuários e acesso', icon: ShieldCheck, area: 'admin' },
  { href: '/auditoria', label: 'Histórico de ações', icon: History, area: 'admin' },
] as const;
function subscribeMobile(callback: () => void) { const query = window.matchMedia('(max-width: 800px)'); query.addEventListener('change', callback); return () => query.removeEventListener('change', callback); }
export function Brand({ stacked = false }: { stacked?: boolean }) { return <div className="brand"><img className="brand-logo" src={adminUrl(stacked ? 'images/logo.png' : 'images/Prancheta%204%4010x.png')} width={stacked ? 2173 : 3037} height={stacked ? 895 : 613} alt="Camelatto Design" /><small>PAINEL ADMINISTRATIVO</small></div>; }
export function Shell({ user, children, sitePath }: { user: { name: string; email: string; role: string }; children: React.ReactNode; sitePath: string }) {
  const currentPath = usePathname();
  const pathname = (currentPath.startsWith(adminBase) ? currentPath.slice(adminBase.length) : currentPath) || '/';
  const [open, setOpen] = useState(false);
  const mobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia('(max-width: 800px)').matches, () => false);
  const sidebar = useRef<HTMLElement>(null);
  useEffect(() => { if (!open) return; sidebar.current?.querySelector('a')?.focus(); const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); document.querySelector<HTMLButtonElement>('.mobile-toggle')?.focus(); } }; window.addEventListener('keydown', escape); return () => window.removeEventListener('keydown', escape); }, [open]);
  const active = links.find(l => l.href === '/' ? pathname === '/' : pathname.startsWith(l.href));
  async function logout() { await fetch(adminUrl('api/auth/sign-out'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); window.location.assign(adminUrl('login')); }
  return <div className="shell"><button className={`mobile-overlay ${open ? 'open' : ''}`} aria-label="Fechar menu" onClick={() => setOpen(false)} /><aside ref={sidebar} inert={mobile && !open} aria-hidden={mobile && !open} className={`sidebar ${open ? 'open' : ''}`}><Brand /><span className="nav-label">Seu espaço de trabalho</span><nav aria-label="Painel administrativo">{links.filter(l => !l.area || can(user.role, l.area)).map(l => <Link className={`nav-link ${active?.href === l.href ? 'active' : ''}`} href={l.href} key={l.href} onClick={() => setOpen(false)} aria-current={active?.href === l.href ? 'page' : undefined}><l.icon size={17} strokeWidth={1.6} />{l.label}</Link>)}</nav><div className="sidebar-bottom"><a className="nav-link" href={sitePath} target="_blank" rel="noreferrer"><ArrowUpRight size={17} />Abrir portfólio</a><div className="profile"><span className="avatar">{user.name.split(' ').map(n => n[0]).slice(0, 2).join('')}</span><div className="profile-text"><strong>{user.name}</strong><small>{{ admin: 'Administrador', editor: 'Editor de conteúdo', sales: 'Atendimento' }[user.role] || user.role}</small></div><button className="icon-button" title="Sair" onClick={logout}><LogOut size={16} /></button></div></div></aside><div className="workspace" inert={mobile && open}><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-toggle" aria-label="Abrir menu" onClick={() => setOpen(!open)}><Menu size={20} /></button><span>Workspace</span><ChevronRight size={12} /><strong>{active?.label || 'Detalhes'}</strong></div><div className="topbar-right"><span className="workspace-label">CAMELATTO DESIGN</span><a className="site-link" href={sitePath} target="_blank" rel="noreferrer">Ver site<ArrowUpRight size={14} /></a></div></header><main className="main" id="conteudo">{children}</main></div></div>;
}
