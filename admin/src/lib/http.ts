import { publicOrigin } from './env';
export function allowedOrigins(origin = publicOrigin(), additional = process.env.ALLOWED_ORIGINS || '') {
  const canonical = new URL(origin);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(canonical.hostname);
  // `next start` also runs locally. NODE_ENV alone does not identify a remote deployment.
  const loopback = local ? ['localhost', '127.0.0.1', '[::1]'].flatMap(host => [4321, 3001].map(port => `${canonical.protocol}//${host}:${port}`)) : [];
  return new Set([canonical.origin, ...additional.split(',').map(value => value.trim()).filter(Boolean), ...loopback]);
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin || !allowedOrigins().has(origin)) throw new Error('Origem da requisição não permitida.');
}
export function corsHeaders(request: Request) {
  const origin = request.headers.get('origin');
  return { ...(origin && allowedOrigins().has(origin) ? { 'Access-Control-Allow-Origin': origin } : {}), Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' };
}
export async function readJson(request: Request, max = 250000) {
  if (Number(request.headers.get('content-length') || 0) > max) throw new Error('Conteúdo muito grande.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Conteúdo ausente.');
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > max) { await reader.cancel(); throw new Error('Conteúdo muito grande.'); } chunks.push(value); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
