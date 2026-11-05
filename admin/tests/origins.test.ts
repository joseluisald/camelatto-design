import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedOrigins } from '../src/lib/http';

test('local deployment accepts Astro and Next origins even with next start', () => {
  const allowed = allowedOrigins('http://localhost:4321', '');
  for (const origin of ['http://localhost:3001', 'http://localhost:4321', 'http://127.0.0.1:3001', 'http://127.0.0.1:4321']) assert.ok(allowed.has(origin));
  assert.equal(allowed.has('http://localhost.evil.example:3001'), false);
});
test('remote deployment only trusts its origin and explicitly allowed origins', () => {
  const allowed = allowedOrigins('https://studio.example.test/', ' https://portfolio.example.test ');
  assert.ok(allowed.has('https://studio.example.test'));
  assert.ok(allowed.has('https://portfolio.example.test'));
  assert.equal(allowed.has('http://localhost:3001'), false);
  assert.equal(allowed.has('https://malicious.example'), false);
});
