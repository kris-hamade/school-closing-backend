const fuzzball = require('fuzzball');

const GENERIC_WORDS = new Set([
  'community', 'area', 'public', 'school', 'district', 'city', 'township', 'county',
  'christian', 'catholic', 'lutheran', 'charter', 'private', 'montessori', 'academy'
]);
const SPECIFIC_TYPES = ['christian', 'catholic', 'lutheran', 'charter', 'private', 'montessori', 'academy'];

function normalizeSchoolName(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(acdmy)\b/g, 'academy')
    .replace(/\b(mt)\.?\b/g, 'mount')
    .replace(/\b(st|ste)\.?\b/g, 'saint')
    .replace(/\b(twp)\.?\b/g, 'township')
    .replace(/\b(school district|public school district|public schools|public school|community schools|area schools|consolidated schools?|intermediate school district|schools|school)\b/gi, '')
    .replace(/\b(district|no\.?\s*\d+)\b/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getSchoolTypes(name = '') {
  const lower = String(name).toLowerCase();
  const types = [];
  for (const type of [...SPECIFIC_TYPES, 'public']) {
    if (lower.includes(type) || (type === 'academy' && lower.includes('acdmy'))) types.push(type);
  }
  return types.sort();
}

function hasMeaningfulOverlap(sourceName, targetName) {
  if (!sourceName || !targetName) return false;
  const source = normalizeSchoolName(sourceName);
  const target = normalizeSchoolName(targetName);
  const sourceTypes = getSchoolTypes(sourceName);
  const targetTypes = getSchoolTypes(targetName);
  const sourceSpecific = sourceTypes.filter((type) => SPECIFIC_TYPES.includes(type));
  const targetSpecific = targetTypes.filter((type) => SPECIFIC_TYPES.includes(type));

  if (sourceSpecific.length && targetSpecific.length && !sourceSpecific.some((type) => targetSpecific.includes(type))) {
    return false;
  }
  if ((sourceSpecific.length || targetSpecific.length) && fuzzball.ratio(source, target) < 90) return false;

  const ratio = fuzzball.ratio(source, target);
  if (source.length < 5 || target.length < 5) return source === target || ratio >= 90;
  const significant = (value) => value.split(/\s+/).filter((word) => word.length > 2 && !GENERIC_WORDS.has(word));
  const sourceWords = significant(source);
  const targetWords = significant(target);
  if (!sourceWords.length || !targetWords.length) return ratio >= 95;
  return sourceWords.some((word) => targetWords.includes(word)) && ratio >= 82;
}

function getBestMatchScore(sourceName, targetName) {
  const source = normalizeSchoolName(sourceName);
  const target = normalizeSchoolName(targetName);
  const normalized = Math.max(
    fuzzball.ratio(source, target),
    fuzzball.partial_ratio(source, target),
    fuzzball.token_sort_ratio(source, target)
  );
  return Math.max(normalized, fuzzball.ratio(String(sourceName).toLowerCase(), String(targetName).toLowerCase()));
}

function findMatches(sourceEntries, schools, threshold = 85) {
  const assignments = new Map();
  const sourceMatches = new Map(sourceEntries.map((_, index) => [index, []]));

  for (const school of schools) {
    let best = null;
    sourceEntries.forEach((entry, sourceIndex) => {
      const score = getBestMatchScore(entry.schoolName, school.school);
      if (score >= threshold && hasMeaningfulOverlap(entry.schoolName, school.school) && (!best || score > best.score)) {
        best = { ...entry, sourceIndex, score };
      }
    });
    if (best) {
      assignments.set(school.key, best);
      sourceMatches.get(best.sourceIndex).push({ key: school.key, school: school.school, score: Math.round(best.score) });
    }
  }

  const unmatched = [];
  const ambiguous = [];
  sourceEntries.forEach((entry, index) => {
    const matches = sourceMatches.get(index);
    if (!matches.length) unmatched.push(entry);
    if (matches.length > 1) ambiguous.push({ ...entry, matches });
  });
  return { assignments, unmatched, ambiguous };
}

module.exports = { normalizeSchoolName, getSchoolTypes, hasMeaningfulOverlap, getBestMatchScore, findMatches };
