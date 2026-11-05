import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { siteConfig } from '../site.config.mjs';
import { nginxConfig, proxyHeaders } from './nginx.mjs';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const admin = path.join(workspace, 'admin');
for (const key of ['ADMIN_ORIGIN', 'BETTER_AUTH_SECRET', 'PUBLICATION_SECRET']) {
  if (!process.env[key] || (key.endsWith('SECRET') && process.env[key].length < 32)) throw new Error(`Configure ${key} nas variáveis de execução do Coolify.`);
}
const origin = new URL(process.env.ADMIN_ORIGIN);
if (!['http:', 'https:'].includes(origin.protocol) || origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) throw new Error('ADMIN_ORIGIN deve conter somente a origem, sem caminho.');
if (!process.env.DATABASE_URL && (['DB_HOST', 'DB_USER', 'DB_NAME'].some(key => !process.env[key]) || process.env.DB_PASSWORD === undefined)) throw new Error('Configure as variáveis de conexão com o banco no Coolify.');
if (process.env.DEPLOY_WEBHOOK_URL) throw new Error('Remova DEPLOY_WEBHOOK_URL: neste container a publicação é feita diretamente no volume persistente.');
process.env.ADMIN_ORIGIN = origin.origin;
process.env.NODE_ENV = 'production';
process.env.PUBLISH_RUNTIME_DIR ||= '/data';
process.env.STORAGE_PATH ||= path.join(process.env.PUBLISH_RUNTIME_DIR, 'storage');
process.env.BACKUP_PATH ||= path.join(process.env.PUBLISH_RUNTIME_DIR, 'backups');
process.env.LP_ORIGIN ||= origin.origin;

await mkdir(process.env.PUBLISH_RUNTIME_DIR, { recursive: true });
await writeFile('/tmp/camelatto-nginx.conf', nginxConfig({ base: siteConfig.base, runtimeDir: process.env.PUBLISH_RUNTIME_DIR, proxyCidrs: process.env.TRUSTED_PROXY_CIDRS }));
await writeFile('/tmp/camelatto-proxy-headers.conf', proxyHeaders);
async function prepare() {
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/prepare-runtime.ts'], { cwd: admin, env: process.env, stdio: 'inherit' });
    child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error('Falha na preparação do runtime.')));
  });
}
await prepare();
const children = new Set();
let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  const timer = setTimeout(() => { for (const child of children) child.kill('SIGKILL'); process.exit(code); }, 10000);
  timer.unref();
  Promise.all([...children].map(child => new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('close', resolve); }))).then(() => process.exit(code));
}
function start(name, executable, args, cwd) {
  const child = spawn(executable, args, { cwd, env: process.env, stdio: 'inherit' });
  children.add(child);
  child.on('error', () => { console.error(`${name} não iniciou.`); stop(1); });
  child.on('close', () => { children.delete(child); if (!stopping) { console.error(`${name} encerrou. Reiniciando o container.`); stop(1); } });
}
process.on('SIGTERM', () => stop(0));
process.on('SIGINT', () => stop(0));
start('Admin', process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3001'], admin);
start('Publicação', process.execPath, ['--import', 'tsx', 'scripts/publish-worker.ts'], admin);
start('Nginx', 'nginx', ['-c', '/tmp/camelatto-nginx.conf', '-g', 'daemon off;'], workspace);
