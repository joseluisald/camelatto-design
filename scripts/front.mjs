import { existsSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fetchSnapshot } from './content-api.mjs';

if (existsSync('.env')) process.loadEnvFile('.env');
const mode = process.argv[2] || 'build';
if (!['build', 'dev'].includes(mode)) throw new Error('Use build ou dev.');
const env = { ...process.env };
const api = env.CONTENT_API_URL;
const token = env.CONTENT_API_TOKEN;
const destination = resolve('.content/published.json');
let previous;
async function download(candidate) {
  const snapshot = await fetchSnapshot({ api, token, candidate });
  const content = JSON.stringify(snapshot);
  if (previous === content) return;
  await mkdir(resolve('.content'), { recursive: true });
  await writeFile(`${destination}.tmp`, content);
  await rename(`${destination}.tmp`, destination);
  previous = content;
}
if (api && !env.CONTENT_SNAPSHOT_FILE) {
  await download(mode === 'build');
  env.CONTENT_SNAPSHOT_FILE = destination;
}
if (api && !env.PUBLIC_ADMIN_API_URL) {
  const url = new URL(api);
  url.pathname = url.pathname.replace(/\/content\/?$/, '/leads');
  url.search = '';
  env.PUBLIC_ADMIN_API_URL = url.href;
}
// Service credentials belong only to the downloader, never to Vite or its bundle.
delete env.CONTENT_API_TOKEN;
const child = spawn(process.execPath, ['node_modules/astro/bin/astro.mjs', mode, ...process.argv.slice(3)], { env, stdio: 'inherit', windowsHide: true });
let timer;
if (mode === 'dev' && api && !process.env.CONTENT_SNAPSHOT_FILE) {
  let pending = false;
  timer = setInterval(async () => {
    if (pending) return;
    pending = true;
    try { await download(false); } catch { console.error('Admin indisponível; mantendo o último conteúdo em desenvolvimento.'); }
    finally { pending = false; }
  }, 5000);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', error => { clearInterval(timer); console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { clearInterval(timer); process.exitCode = code ?? 1; });
