const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createConfig } = require('../src/config');
const { createService } = require('../src/lifecycle');

const silent = { info() {}, error() {} };

test('missing upstream configuration starts cleanly in degraded, not-ready mode', async (t) => {
  const config = createConfig({
    MICHIGAN_DATA_PATH: path.join('test', 'fixtures', 'michigan-small.json'),
    REQUEST_LOGGING: 'false'
  });
  config.port = 0;
  config.host = '127.0.0.1';
  config.pollIntervalMs = 60000;
  const service = createService({ config, logger: silent });
  t.after(() => service.stop());
  await service.start();
  const response = await fetch(`http://127.0.0.1:${service.server.address().port}/api/health`);
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.ready, false);
  assert.equal(body.configurationValid, false);
});
