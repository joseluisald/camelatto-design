import { access, cp, mkdir, readFile, readlink, rename, symlink, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function inside(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Caminho fora da área de publicação.');
  return target;
}

export async function prepareRelease({ source, runtimeDir, id, snapshot }) {
  if (!/^[a-zA-Z0-9-]+$/.test(id)) throw new Error('Identificador de publicação inválido.');
  // Never activate an incomplete build or expose snapshots/logs inside the web root.
  await access(path.join(source, 'index.html'));
  const release = inside(runtimeDir, path.join(runtimeDir, 'releases', id));
  const publicDir = path.join(release, 'public');
  await mkdir(release, { recursive: true });
  try { await access(publicDir); throw new Error('Esta versão já tem um build preparado.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  await cp(source, publicDir, { recursive: true, dereference: true });
  if (snapshot) await writeFile(path.join(release, 'snapshot.json'), JSON.stringify(snapshot), { mode: 0o600 });
  try {
    await cp(path.join(publicDir, '_astro'), path.join(runtimeDir, 'assets'), { recursive: true, force: false, errorOnExist: false });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await writeFile(path.join(release, 'release.json'), JSON.stringify({ id, preparedAt: new Date().toISOString() }));
  return publicDir;
}

async function replacePointer(runtimeDir, target) {
  if (process.platform === 'win32') throw new Error('A promoção por symlink exige o container Linux. Use o modo local padrão no Windows.');
  const temp = path.join(runtimeDir, `.current-${randomUUID()}`);
  await symlink(target, temp, 'dir');
  try { await rename(temp, path.join(runtimeDir, 'current')); }
  catch (error) { await unlink(temp).catch(() => {}); throw error; }
}

export async function activateRelease({ runtimeDir, publicDir, snapshot, storageDir }) {
  inside(path.join(runtimeDir, 'releases'), publicDir);
  await access(path.join(publicDir, 'index.html'));
  let previous;
  try { previous = await readlink(path.join(runtimeDir, 'current')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  let pendingSnapshot;
  if (snapshot) {
    await mkdir(storageDir, { recursive: true });
    pendingSnapshot = path.join(storageDir, `.published-${randomUUID()}.json`);
    await writeFile(pendingSnapshot, JSON.stringify(snapshot), { mode: 0o600 });
  }
  try {
    await replacePointer(runtimeDir, publicDir);
    if (pendingSnapshot) await rename(pendingSnapshot, path.join(storageDir, 'published.json'));
  } catch (error) {
    if (previous) await replacePointer(runtimeDir, previous);
    else await unlink(path.join(runtimeDir, 'current')).catch(() => {});
    if (pendingSnapshot) await unlink(pendingSnapshot).catch(() => {});
    throw error;
  }
  return previous;
}

export async function activeRelease(runtimeDir) {
  try { await access(path.join(runtimeDir, 'current', 'index.html')); return await readFile(path.join(runtimeDir, 'current', 'index.html'), 'utf8'); }
  catch { return null; }
}

export async function commitRelease({ runtimeDir, publicDir, snapshot, storageDir, commit }) {
  const snapshotPath = path.join(storageDir, 'published.json');
  let previousSnapshot;
  try { previousSnapshot = await readFile(snapshotPath); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const previous = await activateRelease({ runtimeDir, publicDir, snapshot, storageDir });
  try { await commit(); }
  catch (error) {
    if (previous) await replacePointer(runtimeDir, previous);
    else await unlink(path.join(runtimeDir, 'current'));
    if (previousSnapshot) {
      const temp = path.join(storageDir, `.rollback-${randomUUID()}.json`);
      await writeFile(temp, previousSnapshot, { mode: 0o600 });
      await rename(temp, snapshotPath);
    } else { await unlink(snapshotPath).catch(missing => { if (missing.code !== 'ENOENT') throw missing; }); }
    throw error;
  }
}
