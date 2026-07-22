const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { createConfig, PROJECT_ROOT, publicSourceName } = require('../src/config');

test('defaults to port 3023 and cwd-independent dataset path', () => {
  const config = createConfig({});
  assert.equal(config.port, 3023);
  assert.equal(config.datasetPath, path.join(PROJECT_ROOT, 'states', 'michigan.json'));
  assert.match(config.configIssues[0], /CLOSING_DATA_1/);
});

test('redacts credentials, query strings, and fragments from public source metadata', () => {
  assert.equal(publicSourceName('https://user:secret@example.test/list?token=secret#x'), 'https://example.test/list');
});
