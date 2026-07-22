const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { loadMichiganDataset } = require('../src/dataset');
const { ClosureStore } = require('../src/store');
const { createApp } = require('../src/app');

const silent = { info() {}, error() {} };

async function fixtureServer() {
  const schools = loadMichiganDataset(path.join(__dirname, 'fixtures', 'michigan-small.json'));
  let now = 0;
  const store = new ClosureStore({ schools, publicSource: 'https://example.test/closings', now: () => new Date(1700000000000 + now++ * 1000) });
  await store.refresh(async () => ({ entries: [
    { schoolName: 'Mt. Pleasant Schools', closureStatus: 'Closed Today' },
    { schoolName: 'Unknown Preparatory School', closureStatus: 'Closed' }
  ], diagnostics: { sourceElementCount: 2, malformedEntries: [] } }));
  const config = { productionOrigin: 'https://misnowday.com', requestLogging: false, searchResultLimit: 100, configIssues: [] };
  const server = createApp({ store, config, logger: silent }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { store, server, request: (route, options) => fetch(base + route, options) };
}

test('all public endpoints retain their response contracts', async (t) => {
  const context = await fixtureServer();
  t.after(() => context.server.close());
  const checks = [
    ['/api/health', (body) => assert.equal(body.ready, true)],
    ['/api/live', (body) => assert.equal(body.status, 'alive')],
    ['/api/closures', (body) => assert.ok(body.closures && body.metadata && body.isdStatus)],
    ['/api/closures/school/Mount%20Pleasant', (body) => assert.equal(body.results[0].school, 'Mount Pleasant Public Schools')],
    ['/api/closures/isd/Example%20ISD', (body) => assert.equal(body.isdName, 'Example ISD')],
    ['/api/closures/summary', (body) => assert.equal(body.statistics.totalISDs, 2)],
    ['/api/closures/isd-status', (body) => assert.ok(body.isdStatus['Example ISD'])],
    ['/api/closures/pull-history', (body) => assert.equal(body.totalPulls, 1)],
    ['/api/closures/change-history', (body) => assert.ok(body.counts)]
  ];
  for (const [route, verify] of checks) {
    const response = await context.request(route);
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('content-type'), /application\/json/);
    verify(await response.json());
  }
});

test('validates query parameters and returns consistent JSON errors', async (t) => {
  const context = await fixtureServer();
  t.after(() => context.server.close());
  for (const route of ['/api/closures/pull-history?limit=101', '/api/closures/change-history?type=nope', '/api/closures/isd/Missing', '/missing']) {
    const response = await context.request(route);
    assert.ok([400, 404].includes(response.status));
    const body = await response.json();
    assert.equal(body.error.status, response.status);
    assert.ok(body.error.timestamp);
  }
});

test('supports local CORS origins and rejects unknown origins', async (t) => {
  const context = await fixtureServer();
  t.after(() => context.server.close());
  for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173']) {
    const response = await context.request('/api/closures', { headers: { origin } });
    assert.equal(response.headers.get('access-control-allow-origin'), origin);
  }
  const denied = await context.request('/api/closures', { headers: { origin: 'https://evil.example' } });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.status, 403);
});

test('ETag supports conditional GETs through Express freshness handling', async (t) => {
  const context = await fixtureServer();
  t.after(() => context.server.close());
  const first = await context.request('/api/closures');
  const etag = first.headers.get('etag');
  const second = await context.request('/api/closures', { headers: { 'if-none-match': etag } });
  assert.equal(second.status, 304);
});
