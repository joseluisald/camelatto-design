import test from 'node:test';
import assert from 'node:assert/strict';
import { leadSchema, projectSchema, documents } from '../src/lib/schemas';
import { can } from '../src/lib/access-rules';
import { safeCell, leadCsv } from '../src/lib/csv';
import { joinBase, siteConfig, adminBasePath } from '../../site.config.mjs';
import { adminBase, adminUrl } from '../src/lib/paths';

test('prefix works at root, nested paths and with trailing slashes', () => {
  assert.equal(joinBase('/', 'admin'), '/admin');
  assert.equal(joinBase('/portfolio/', '/admin/api/public/leads'), '/portfolio/admin/api/public/leads');
  assert.equal(adminBasePath, joinBase(siteConfig.base, 'admin'));
  assert.equal(adminBase, adminBasePath);
  assert.equal(adminUrl('api/public/leads'), `${adminBasePath}/api/public/leads`);
});
test('permissions isolate content and contact information', () => {
  assert.equal(can('editor', 'leads'), false); assert.equal(can('sales', 'content'), false);
  assert.equal(can('sales', 'admin'), false); assert.equal(can('editor', 'content'), true);
  assert.equal(can('admin', 'leads'), true); assert.equal(can(undefined, 'admin'), false);
});
test('public form validates length, email and idempotency key', () => {
  const valid = { name: 'Pessoa de teste', email: 'pessoa@example.test', message: 'Quero conversar sobre um projeto.', idempotencyKey: '7022d883-dc60-40c5-94ea-15b1900340d9' };
  assert.equal(leadSchema.safeParse(valid).success, true);
  assert.equal(leadSchema.safeParse({ ...valid, email: 'invalid' }).success, false);
  assert.equal(leadSchema.safeParse({ ...valid, message: 'x'.repeat(5001) }).success, false);
  assert.equal(leadSchema.safeParse({ ...valid, idempotencyKey: '../unsafe' }).success, false);
});
test('publication rejects missing content and unsafe URLs', () => {
  assert.equal(projectSchema.safeParse({ title: 'Teste', slug: 'teste', status: 'published' }).success, false);
  assert.equal(documents.navigation.safeParse([{ label: 'Abrir', href: 'javascript:alert(1)' }]).success, false);
  assert.equal(documents.navigation.safeParse([{ label: 'Abrir', href: '//malicious.example' }]).success, false);
});
test('CSV neutralizes formula injection while preserving quoting', () => {
  assert.equal(safeCell(' =HYPERLINK("x")'), '\' =HYPERLINK("x")');
  assert.equal(safeCell('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(safeCell('Pessoa normal'), 'Pessoa normal');
  const csv = leadCsv([{ name: '=1+1', email: 'test@example.test', message: 'Texto; com separador\ne nova linha' }]);
  assert.ok(csv.includes("'=1+1")); assert.ok(csv.includes('"Texto; com separador\ne nova linha"'));
});
