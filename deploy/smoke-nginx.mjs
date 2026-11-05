// Executed inside the Linux image: validates real Nginx routing without a database.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { siteConfig } from '../site.config.mjs';
import { normalizedBase, nginxConfig, proxyHeaders } from './nginx.mjs';
import { prepareRelease, activateRelease } from './releases.mjs';

const root = await mkdtemp(path.join(os.tmpdir(), 'camelatto-nginx-test-'));
const base = normalizedBase(siteConfig.base);
let nginx;
const upstream = createServer(async (request, response) => {
  const chunks = []; for await (const chunk of request) chunks.push(chunk);
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify({ url: request.url, method: request.method, body: Buffer.concat(chunks).toString() }));
});
try {
  const source = path.join(root, 'source'), runtimeDir = path.join(root, 'runtime');
  await mkdir(path.join(source, '_astro'), { recursive: true });
  await mkdir(path.join(source, 'projetos', 'teste'), { recursive: true });
  await writeFile(path.join(source, 'index.html'), 'home-1');
  await writeFile(path.join(source, 'projetos/teste/index.html'), 'case-1');
  await writeFile(path.join(source, '_astro/logo name.svg'), '<svg/>');
  const publicDir = await prepareRelease({ source, runtimeDir, id: 'smoke', snapshot: { private: true } });
  await activateRelease({ runtimeDir, publicDir, snapshot: { private: true }, storageDir: path.join(runtimeDir, 'storage') });
  const configFile = path.join(root, 'nginx.conf');
  await writeFile(configFile, nginxConfig({ base, runtimeDir }));
  await writeFile('/tmp/camelatto-proxy-headers.conf', proxyHeaders);
  upstream.listen(3001, '127.0.0.1'); await once(upstream, 'listening');
  nginx = spawn('nginx', ['-c', configFile, '-g', 'daemon off;'], { stdio: ['ignore', 'ignore', 'inherit'] });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { const response = await fetch('http://127.0.0.1:8080/healthz'); if (response.ok) { ready = true; break; } } catch { /* Wait for the listener. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Nginx must become ready');
  const origin = 'http://127.0.0.1:8080';
  assert.equal((await (await fetch(`${origin}/healthz`)).json()).url, `${base}/admin/api/health`);
  assert.equal(await (await fetch(`${origin}${base}/`)).text(), 'home-1');
  assert.equal(await (await fetch(`${origin}${base}/projetos/teste/`)).text(), 'case-1');
  assert.equal(await (await fetch(`${origin}${base}/projetos/teste`)).text(), 'case-1');
  const asset = await fetch(`${origin}${base}/_astro/logo%20name.svg`);
  assert.equal(await asset.text(), '<svg/>'); assert.ok(asset.headers.get('cache-control').includes('immutable'));
  const admin = await (await fetch(`${origin}${base}/admin/login`)).json(); assert.equal(admin.url, `${base}/admin/login`);
  const lead = await (await fetch(`${origin}${base}/admin/api/public/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"name":"teste"}' })).json();
  assert.equal(lead.method, 'POST'); assert.equal(lead.url, `${base}/admin/api/public/leads`); assert.equal(lead.body, '{"name":"teste"}');
  assert.equal((await fetch(`${origin}${base}/snapshot.json`)).status, 404);
  assert.equal((await fetch(`${origin}${base}/releases/smoke/snapshot.json`)).status, 404);
  console.log('Nginx validado: LP, estudos de caso, assets, admin, leads, healthcheck e arquivos privados.');
} finally {
  if (nginx && nginx.exitCode === null) { const closed = once(nginx, 'close'); nginx.kill('SIGQUIT'); await closed; }
  await new Promise(resolve => upstream.close(resolve));
  const resolved = path.resolve(root);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !/^camelatto-nginx-test-[a-zA-Z0-9]+$/.test(path.basename(resolved))) throw new Error('Limpeza de diretório temporário recusada.');
  await rm(resolved, { recursive: true, force: true });
}
