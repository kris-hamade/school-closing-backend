const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSchoolName, hasMeaningfulOverlap, getBestMatchScore, findMatches } = require('../src/matching');

test('normalizes suffixes, punctuation, ampersands, and Michigan abbreviations', () => {
  assert.equal(normalizeSchoolName('Mt. Pleasant Public Schools'), 'mount pleasant');
  assert.equal(normalizeSchoolName('Sault Ste. Marie Area Schools'), 'sault saint marie');
  assert.equal(normalizeSchoolName('Arts & Technology School District'), 'arts and technology');
});

test('matches supported abbreviations at high confidence', () => {
  assert.ok(getBestMatchScore('Mt. Pleasant Schools', 'Mount Pleasant Public Schools') >= 85);
  assert.equal(hasMeaningfulOverlap('Mt. Pleasant Schools', 'Mount Pleasant Public Schools'), true);
});

test('blocks private/public false positives with the same place name', () => {
  assert.equal(hasMeaningfulOverlap('Oxford Christian Academy', 'Oxford Community Schools'), false);
  assert.equal(hasMeaningfulOverlap('Oxford Christian Acdmy', 'Oxford Christian Academy'), true);
});

test('reports unmatched and one-to-many ambiguous source matches', () => {
  const sources = [{ schoolName: 'Lake Shore Schools', closureStatus: 'Closed' }, { schoolName: 'Nobody Schools', closureStatus: 'Closed' }];
  const schools = [{ key: 'a', school: 'Lake Shore Public Schools' }, { key: 'b', school: 'Lake Shore School District' }];
  const result = findMatches(sources, schools, 85);
  assert.equal(result.assignments.size, 2);
  assert.equal(result.unmatched.length, 1);
  assert.equal(result.ambiguous.length, 1);
});
