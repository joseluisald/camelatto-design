import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readlink, access, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { nginxConfig } from './nginx.mjs';
import { prepareRelease, activateRelease, commitRelease, inside } from './releases.mjs';
async function cleanupTestDirectory(directory) {
  const resolved = path.resolve(directory);
  if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !/^camelatto-(release|activation)-test-[a-zA-Z0-9]+$/.test(path.basename(resolved))) throw new Error('Diretório temporário inesperado; limpeza recusada.');
  await rm(resolved, { recursive: true, force: true });
}

test('Nginx preserves nested base and routes admin, leads, media and health to Next', () => {
  const config = nginxConfig({ base: '/portfolio/design/', runtimeDir: '/data' });
  assert.ok(config.includes('location = /portfolio/design/admin {'));
  assert.ok(config.includes('location ^~ /portfolio/design/admin/ {'));
  assert.ok(config.includes('proxy_pass http://127.0.0.1:3001;'));
  assert.ok(config.includes('proxy_pass http://127.0.0.1:3001/portfolio/design/admin/api/health;'));
  assert.ok(config.includes('location ^~ /portfolio/design/_astro/'));
  assert.ok(config.includes('try_files $uri/index.html $uri =404;'));
  assert.equal(config.includes('camelatto-design'), false);
  assert.equal(config.includes('alias "/data/"'), false);
});
test('Nginx also supports a root deployment and rejects config injection', () => {
  const config = nginxConfig({ base: '/', runtimeDir: '/data' });
  assert.ok(config.includes('location ^~ /admin/'));
  assert.equal(config.includes('rewrite ^/'), false);
  assert.equal((config.match(/location \/ \{/g) || []).length, 1);
  assert.throws(() => nginxConfig({ base: '/../../private', runtimeDir: '/data' }));
  assert.throws(() => nginxConfig({ base: '/ok', runtimeDir: '/data\nmalicious;' }));
  assert.throws(() => nginxConfig({ base: '/ok', runtimeDir: '/data', proxyCidrs: '127.0.0.1/999' }));
  assert.throws(() => nginxConfig({ base: '/ok', runtimeDir: '/data', proxyCidrs: '127.0.0.1/24/;invalid' }));
});
test('releases keep snapshots private, preserve old hashed assets and reject incomplete builds', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'camelatto-release-test-'));
  try {
    const source = path.join(root, 'source'); const runtimeDir = path.join(root, 'runtime');
    await mkdir(path.join(source, '_astro'), { recursive: true });
    await writeFile(path.join(source, 'index.html'), '<h1>Primeira versão</h1>');
    await writeFile(path.join(source, '_astro', 'old.hash.js'), 'old asset');
    const publicDir = await prepareRelease({ source, runtimeDir, id: 'version-1', snapshot: { schemaVersion: 1 } });
    assert.equal(await readFile(path.join(publicDir, 'index.html'), 'utf8'), '<h1>Primeira versão</h1>');
    await assert.rejects(access(path.join(publicDir, 'snapshot.json')));
    assert.equal(JSON.parse(await readFile(path.join(runtimeDir, 'releases/version-1/snapshot.json'), 'utf8')).schemaVersion, 1);
    await writeFile(path.join(source, '_astro', 'old.hash.js'), 'should never replace immutable asset');
    await writeFile(path.join(source, '_astro', 'new.hash.js'), 'new asset');
    await prepareRelease({ source, runtimeDir, id: 'version-2', snapshot: null });
    assert.equal(await readFile(path.join(runtimeDir, 'assets/old.hash.js'), 'utf8'), 'old asset');
    assert.equal(await readFile(path.join(runtimeDir, 'assets/new.hash.js'), 'utf8'), 'new asset');
    await assert.rejects(prepareRelease({ source: path.join(root, 'missing'), runtimeDir, id: 'bad', snapshot: null }));
    await assert.rejects(prepareRelease({ source, runtimeDir, id: '../escape', snapshot: null }));
    assert.throws(() => inside(runtimeDir, path.join(root, 'escape')));
  } finally { await cleanupTestDirectory(root); }
});
test('Linux activation swaps complete releases and leaves the active site untouched on invalid input', { skip: process.platform === 'win32' }, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'camelatto-activation-test-'));
  try {
    const runtimeDir = path.join(root, 'runtime'), storageDir = path.join(root, 'storage'), source = path.join(root, 'source');
    await mkdir(source); await writeFile(path.join(source, 'index.html'), 'first');
    const first = await prepareRelease({ source, runtimeDir, id: 'one', snapshot: { version: 1 } });
    await activateRelease({ runtimeDir, publicDir: first, snapshot: { version: 1 }, storageDir });
    await writeFile(path.join(source, 'index.html'), 'second');
    const second = await prepareRelease({ source, runtimeDir, id: 'two', snapshot: { version: 2 } });
    await activateRelease({ runtimeDir, publicDir: second, snapshot: { version: 2 }, storageDir });
    assert.equal(await readFile(path.join(runtimeDir, 'current/index.html'), 'utf8'), 'second');
    assert.equal(await readlink(path.join(runtimeDir, 'current')), second);
    assert.equal(JSON.parse(await readFile(path.join(storageDir, 'published.json'), 'utf8')).version, 2);
    await assert.rejects(activateRelease({ runtimeDir, publicDir: path.join(runtimeDir, 'releases/missing/public'), snapshot: {}, storageDir }));
    assert.equal(await readFile(path.join(runtimeDir, 'current/index.html'), 'utf8'), 'second');
    await assert.rejects(commitRelease({ runtimeDir, publicDir: first, snapshot: { version: 3 }, storageDir, commit: async () => { throw new Error('Simulated database failure'); } }));
    assert.equal(await readFile(path.join(runtimeDir, 'current/index.html'), 'utf8'), 'second');
    assert.equal(JSON.parse(await readFile(path.join(storageDir, 'published.json'), 'utf8')).version, 2);
  } finally { await cleanupTestDirectory(root); }
});
