const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { extractClosureEntries, fetchClosureHtml } = require('../src/scraper');

test('extracts only closed entries and records malformed elements', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'closures.html'), 'utf8');
  const result = extractClosureEntries(html);
  assert.deepEqual(result.entries.map((entry) => entry.schoolName), ['Mt. Pleasant Schools', 'Oxford Christian Acdmy', 'Unknown Preparatory School']);
  assert.equal(result.diagnostics.sourceElementCount, 5);
  assert.equal(result.diagnostics.malformedEntries.length, 1);
});

test('rejects empty and structurally unexpected HTML', () => {
  assert.throws(() => extractClosureEntries(''), /empty response/);
  assert.throws(() => extractClosureEntries('<html><body>changed</body></html>'), /expected closure elements/);
});

test('retries retryable failures with exponential delays', async () => {
  let calls = 0;
  const delays = [];
  const requester = async () => {
    calls += 1;
    if (calls < 3) { const error = new Error('temporary'); error.response = { status: 503 }; throw error; }
    return { data: '<html>ok</html>' };
  };
  const html = await fetchClosureHtml('https://example.test', { requester, retries: 2, retryBaseDelayMs: 10, sleep: async (ms) => delays.push(ms) });
  assert.equal(html, '<html>ok</html>');
  assert.equal(calls, 3);
  assert.deepEqual(delays, [10, 20]);
});

test('does not retry a non-retryable client response', async () => {
  let calls = 0;
  const requester = async () => { calls += 1; const error = new Error('bad'); error.response = { status: 404 }; throw error; };
  await assert.rejects(fetchClosureHtml('https://example.test', { requester, retries: 2 }), /HTTP 404/);
  assert.equal(calls, 1);
});
