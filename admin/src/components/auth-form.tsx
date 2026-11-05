'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpLeft } from 'lucide-react';
import { adminUrl } from '@/lib/paths';
export function AuthForm({ mode, token, recoveryEnabled }: { mode: 'login' | 'recover' | 'reset'; token?: string; recoveryEnabled: boolean }) {
  const [error, setError] = useState(''), [success, setSuccess] = useState(''), [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess(''); setBusy(true);
    const form = new FormData(event.currentTarget);
    const body = mode === 'login' ? { email: form.get('email'), password: form.get('password') } : mode === 'recover' ? { email: form.get('email'), redirectTo: `${window.location.origin}${adminUrl('redefinir-senha')}` } : { token, newPassword: form.get('password') };
    try {
      const endpoint = mode === 'login' ? 'sign-in/email' : mode === 'recover' ? 'request-password-reset' : 'reset-password';
      const response = await fetch(adminUrl(`api/auth/${endpoint}`), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        setError(response.status === 403 ? 'O acesso por este endereço não está habilitado. Use o endereço principal do painel.' : response.status === 429 ? 'Muitas tentativas. Aguarde um minuto antes de tentar novamente.' : mode === 'login' ? response.status === 401 || response.status === 400 ? 'E-mail ou senha inválidos. Confira seus dados e tente novamente.' : 'Não foi possível entrar agora. Tente novamente em instantes.' : 'Não foi possível concluir. O link pode ter expirado; solicite um novo.');
        return;
      }
      if (mode === 'login') window.location.assign(adminUrl());
      else setSuccess(mode === 'recover' ? 'Se houver uma conta para este e-mail, enviaremos as instruções de recuperação.' : 'Senha atualizada. Você já pode entrar.');
    } catch { setError('Não foi possível conectar ao painel. Tente novamente.'); } finally { setBusy(false); }
  }
  return <div className="auth-box"><div className="eyebrow">Seu estúdio, organizado</div><h1>{mode === 'login' ? 'Bem-vinda de volta.' : mode === 'recover' ? 'Recupere seu acesso.' : 'Uma nova senha.'}</h1><p>{mode === 'login' ? 'Entre para cuidar dos seus projetos, conteúdos e novas oportunidades.' : 'Mantenha o acesso ao seu espaço de trabalho seguro.'}</p>{error && <div className="error" role="alert">{error}</div>}{success && <div className="success" role="status">{success}</div>}{mode === 'recover' && !recoveryEnabled ? <div className="notice">A recuperação por e-mail ainda não foi configurada. Solicite ao administrador do painel a configuração do serviço de e-mail.</div> : <form onSubmit={submit}>{mode !== 'reset' && <label className="field"><span>E-mail</span><input name="email" type="email" autoComplete="email" placeholder="voce@exemplo.com" required maxLength={254} /></label>}{mode !== 'recover' && <label className="field"><span>Senha</span><input name="password" type="password" required minLength={mode === 'reset' ? 12 : 1} maxLength={128} autoComplete={mode === 'reset' ? 'new-password' : 'current-password'} placeholder={mode === 'reset' ? 'Pelo menos 12 caracteres' : 'Sua senha'} /></label>}{mode === 'login' && <Link href="/recuperar-acesso" className="accent" style={{ fontSize: 12, justifySelf: 'end' }}>Esqueci minha senha</Link>}<button className="button primary" disabled={busy || (mode === 'reset' && !token)}>{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar no painel' : mode === 'recover' ? 'Enviar instruções' : 'Redefinir senha'}<ArrowRight size={16} /></button></form>}<div className="auth-bottom">{mode !== 'login' ? <Link href="/login"><ArrowUpLeft size={12} /> Voltar ao login</Link> : 'Acesso exclusivo para a equipe Camelatto Design.'}</div></div>;
}
