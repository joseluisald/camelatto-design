import 'dotenv/config';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { verifyPassword } from 'better-auth/crypto';
import { db } from '../src/lib/db';
import { adminBasePath } from '../../site.config.mjs';
import { loginForTest } from './auth-helper';

function createUser(env: Record<string, string>) {
  return spawnSync(process.execPath, ['--env-file=.env', 'node_modules/tsx/dist/cli.mjs', 'scripts/create-user.ts'], { encoding: 'utf8', windowsHide: true, timeout: 15000, env: { ...process.env, ...env } });
}
test('admin:user rejects a short password before asking for identity', () => {
  const result = createUser({ BOOTSTRAP_PASSWORD: 'testshort', BOOTSTRAP_EMAIL: '', BOOTSTRAP_NAME: '' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Nenhum usuário foi criado/);
  assert.doesNotMatch(result.stdout, /E-mail do administrador:|Nome:/);
  assert.doesNotMatch(result.stderr + result.stdout, /testshort/);
});
test('admin:user creates a credential that can log in and preserves existing users', { skip: !process.env.TEST_BASE_URL, timeout: 60000 }, async () => {
  const email = `cli-${randomUUID()}@example.test`, password = randomUUID() + 'Aa!';
  try {
    const result = createUser({ BOOTSTRAP_EMAIL: ` ${email.toUpperCase()} `, BOOTSTRAP_NAME: 'Teste CLI', BOOTSTRAP_PASSWORD: password });
    assert.equal(result.status, 0, result.stderr);
    const user = await db.user.findUniqueOrThrow({ where: { email }, include: { accounts: true } });
    assert.equal(user.role, 'admin');
    const credential = user.accounts.find(a => a.providerId === 'credential');
    assert.ok(credential?.password);
    assert.equal(await verifyPassword({ hash: credential.password, password }), true);
    const origin = process.env.TEST_BASE_URL!;
    const response = await loginForTest(`${origin}${adminBasePath}/api/auth/sign-in/email`, origin, email, password);
    assert.equal(response.status, 200);
    assert.ok(response.headers.getSetCookie().length);
    const duplicate = createUser({ BOOTSTRAP_EMAIL: email, BOOTSTRAP_NAME: 'Teste CLI', BOOTSTRAP_PASSWORD: randomUUID() });
    assert.equal(duplicate.status, 1);
    assert.equal((await db.account.findUniqueOrThrow({ where: { id: credential.id } })).password, credential.password);
  } finally { await db.user.deleteMany({ where: { email } }); await db.$disconnect(); }
});
