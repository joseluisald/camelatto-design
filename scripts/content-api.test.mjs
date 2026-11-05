import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchSnapshot } from './content-api.mjs';
const snapshot = { schemaVersion: 1, settings: {}, faq: [], portfolio: { projects: [] } };
test('authenticated builds request the candidate; explicit snapshots stay pinned', async () => {
  const transport = async (url, init) => {
    assert.equal(url.searchParams.get('candidate'), '1');
    assert.equal(init.headers.Authorization, 'Bearer private');
    return Response.json(snapshot);
  };
  assert.deepEqual(await fetchSnapshot({ api: 'https://admin.test/api/public/content', token: 'private', candidate: true, transport }), snapshot);
  await fetchSnapshot({ api: 'https://admin.test/api/public/content?snapshot=version', token: 'private', candidate: true, transport: async url => {
    assert.equal(url.searchParams.get('snapshot'), 'version');
    assert.equal(url.searchParams.has('candidate'), false);
    return Response.json(snapshot);
  } });
});
test('public fetch has no credential; unavailable or invalid snapshots fail the build', async () => {
  await fetchSnapshot({ api: 'https://admin.test/api/public/content', candidate: true, transport: async (url, init) => {
    assert.equal(url.searchParams.has('candidate'), false);
    assert.deepEqual(init.headers, {});
    return Response.json(snapshot);
  } });
  await assert.rejects(fetchSnapshot({ api: 'https://admin.test/content', transport: async () => new Response(null, { status: 503 }) }), /HTTP 503/);
  await assert.rejects(fetchSnapshot({ api: 'https://admin.test/content', transport: async () => Response.json({}) }), /inválido/);
});
