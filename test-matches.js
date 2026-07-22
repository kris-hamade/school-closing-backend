const fs = require('fs');
const path = require('path');
const { loadMichiganDataset } = require('./src/dataset');
const { extractClosureEntries, fetchClosureHtml } = require('./src/scraper');
const { findMatches } = require('./src/matching');

async function main() {
  const live = process.argv.includes('--live');
  let html;
  if (live) {
    require('dotenv').config({ path: path.join(__dirname, '.env') });
    if (!process.env.CLOSING_DATA_1) throw new Error('CLOSING_DATA_1 is required with --live');
    html = await fetchClosureHtml(process.env.CLOSING_DATA_1, { timeoutMs: 10000, retries: 1 });
  } else {
    html = fs.readFileSync(path.join(__dirname, 'test', 'fixtures', 'closures.html'), 'utf8');
  }
  const schools = loadMichiganDataset(path.join(__dirname, 'states', 'michigan.json'));
  const { entries } = extractClosureEntries(html);
  const result = findMatches(entries, schools, 85);
  const matches = [...result.assignments.entries()].map(([key, match]) => ({ school: key.split('\0')[2], source: match.schoolName, score: Math.round(match.score) }));
  console.log(JSON.stringify({ mode: live ? 'live' : 'fixture', sourceEntries: entries.length, matches, unmatched: result.unmatched, ambiguous: result.ambiguous }, null, 2));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
