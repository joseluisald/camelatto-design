import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { inside } from '../../../deploy/releases.mjs';

export async function buildFront({ snapshot, id, workspace, stagingRoot }: { snapshot: unknown; id: string; workspace: string; stagingRoot: string }) {
  const stage = inside(stagingRoot, path.join(stagingRoot, id));
  const output = inside(stage, path.join(stage, 'dist'));
  await mkdir(stage, { recursive: true });
  const snapshotFile = path.join(stage, 'snapshot.json');
  await writeFile(snapshotFile, JSON.stringify(snapshot), { mode: 0o600 });
  const log: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(workspace, 'node_modules/astro/bin/astro.mjs'), 'build', '--outDir', output], {
      cwd: workspace, env: { ...process.env, NODE_ENV: 'production', CONTENT_SNAPSHOT_FILE: snapshotFile }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => log.push(Buffer.from(chunk)));
    child.stderr.on('data', chunk => log.push(Buffer.from(chunk)));
    const timeout = setTimeout(() => { child.kill(); reject(new Error('Tempo de compilação excedido.')); }, 10 * 60000);
    child.on('error', error => { clearTimeout(timeout); reject(error); });
    child.on('close', code => { clearTimeout(timeout); if (code === 0) resolve(); else reject(new Error('O build da LP falhou. Consulte o log privado de publicação.')); });
  }).finally(() => writeFile(path.join(stage, 'build.log'), Buffer.concat(log), { mode: 0o600 }));
  return { stage, output };
}
