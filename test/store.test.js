const test = require('node:test');
const assert = require('node:assert/strict');
const { ClosureStore } = require('../src/store');
const { buildClosureSnapshot, detectChanges } = require('../src/aggregation');

const schools = [
  { key: 'I\0C\0Alpha Public Schools', isd: 'I', county: 'C', school: 'Alpha Public Schools' },
  { key: 'I\0C\0Beta Community Schools', isd: 'I', county: 'C', school: 'Beta Community Schools' }
];
const source = (name) => ({ schoolName: name, closureStatus: 'Closed' });

test('aggregates school and ISD totals consistently', () => {
  const result = buildClosureSnapshot(schools, [source('Alpha Schools')], { checkedAt: '2026-01-01T00:00:00.000Z', matchThreshold: 85 });
  assert.equal(result.totalSchools, 2);
  assert.equal(result.closedSchools, 1);
  assert.deepEqual(result.isdStatus.I, { allClosed: false, closedCount: 1, totalCount: 2 });
  assert.equal(result.closures.I.C['Alpha Public Schools'].closed, true);
});

test('detects status, addition, and removal changes', () => {
  const previous = { I: { C: { Alpha: { closed: false }, Removed: { closed: false } } } };
  const current = { I: { C: { Alpha: { closed: true }, Added: { closed: false } } } };
  const changes = detectChanges(previous, current, 'now');
  assert.equal(changes.statusChanges.length, 1);
  assert.equal(changes.schoolsAdded[0].school, 'Added');
  assert.equal(changes.schoolsRemoved[0].school, 'Removed');
});

test('does not record the initial dataset as added schools', async () => {
  const store = new ClosureStore({ schools, publicSource: 'https://example.test/', now: () => new Date('2026-01-01T00:00:00Z') });
  await store.refresh(async () => ({ entries: [source('Alpha Schools')] }));
  assert.equal(store.getChangeHistory().schoolsAdded.length, 0);
});

test('detects district dataset additions and removals on later refreshes', async () => {
  const store = new ClosureStore({ schools, publicSource: 'https://example.test/' });
  await store.refresh(async () => ({ entries: [] }));
  const changedSchools = [schools[0], { key: 'I\0C\0Gamma Schools', isd: 'I', county: 'C', school: 'Gamma Schools' }];
  await store.refresh(async () => ({ entries: [], schools: changedSchools }));
  assert.equal(store.getChangeHistory().schoolsAdded[0].school, 'Gamma Schools');
  assert.equal(store.getChangeHistory().schoolsRemoved[0].school, 'Beta Community Schools');
});

test('preserves last valid data and freshness timestamp on failure', async () => {
  let tick = 0;
  const times = ['2026-01-01T00:00:00Z', '2026-01-01T00:05:00Z'];
  const store = new ClosureStore({ schools, publicSource: 'https://example.test/', now: () => new Date(times[tick++]) });
  await store.refresh(async () => ({ entries: [source('Alpha Schools')] }));
  const valid = store.getData();
  await assert.rejects(store.refresh(async () => { throw new Error('upstream unavailable'); }));
  const failed = store.getData();
  assert.strictEqual(failed.closures, valid.closures);
  assert.equal(failed.metadata.lastUpdated, '2026-01-01T00:00:00.000Z');
  assert.equal(failed.metadata.lastAttempt, '2026-01-01T00:05:00.000Z');
  assert.equal(failed.metadata.fetchError, 'upstream unavailable');
});

test('deduplicates concurrent refresh requests', async () => {
  const store = new ClosureStore({ schools, publicSource: 'https://example.test/' });
  let calls = 0;
  let resolve;
  const gate = new Promise((done) => { resolve = done; });
  const loader = async () => { calls += 1; await gate; return { entries: [] }; };
  const first = store.refresh(loader);
  const second = store.refresh(loader);
  assert.strictEqual(first, second);
  resolve();
  await Promise.all([first, second]);
  assert.equal(calls, 1);
});
