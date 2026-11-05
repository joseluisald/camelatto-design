'use client';
import { useCallback, useEffect, useState } from 'react';
import { adminUrl } from './paths';
export class RequestError extends Error { constructor(message: string, public fields?: Record<string, string[]>) { super(message); } }
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(adminUrl(`api/manage/${path}`), { method: body === undefined ? 'GET' : 'POST', ...(body instanceof FormData ? { body } : body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), cache: 'no-store' });
  const value = await response.json();
  if (!response.ok) throw new RequestError(value.error || 'Não foi possível concluir.', value.fields);
  return value;
}
export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  useEffect(() => { let cancelled = false; api<T>(path).then(value => { if (!cancelled) { setData(value); setError(''); } }).catch(e => { if (!cancelled) setError(e.message); }); return () => { cancelled = true; }; }, [path, revision]);
  const reload = useCallback(() => setRevision(v => v + 1), []);
  return { data, error, reload };
}
export function date(value?: string | Date | null) { return value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : '—'; }
export const statusLabels: Record<string, string> = { draft: 'Rascunho', published: 'Publicado', archived: 'Arquivado', queued: 'Na fila', building: 'Compilando', ready: 'Aguardando deploy', deploying: 'Em deploy', failed: 'Falhou', new: 'Novo', contacted: 'Em contato', qualified: 'Qualificado', proposal: 'Proposta enviada', won: 'Ganho', lost: 'Perdido', spam: 'Spam' };
