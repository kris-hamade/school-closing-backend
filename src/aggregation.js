const { findMatches } = require('./matching');

function buildClosureSnapshot(schools, sourceEntries, options = {}) {
  const checkedAt = Object.hasOwn(options, 'checkedAt') ? options.checkedAt : new Date().toISOString();
  const previous = options.previousClosures || null;
  const { assignments, unmatched, ambiguous } = findMatches(sourceEntries, schools, options.matchThreshold);
  const closures = {};
  const stats = {};
  let closedSchools = 0;

  for (const item of schools) {
    closures[item.isd] ||= {};
    closures[item.isd][item.county] ||= {};
    stats[item.isd] ||= { totalCount: 0, closedCount: 0 };
    stats[item.isd].totalCount += 1;
    const match = assignments.get(item.key);
    const old = previous?.[item.isd]?.[item.county]?.[item.school];
    const closed = Boolean(match);
    if (closed) {
      closedSchools += 1;
      stats[item.isd].closedCount += 1;
    }
    closures[item.isd][item.county][item.school] = {
      closed,
      matchScore: match ? Math.round(match.score) : null,
      originalStatus: match?.closureStatus || null,
      matchedSourceName: match?.schoolName || null,
      lastChecked: checkedAt,
      firstSeen: old?.firstSeen || checkedAt,
      lastStatusChange: old && old.closed !== closed ? checkedAt : (old?.lastStatusChange || null)
    };
  }

  const isdStatus = Object.fromEntries(Object.entries(stats).map(([isd, value]) => [isd, {
    allClosed: value.totalCount > 0 && value.closedCount === value.totalCount,
    closedCount: value.closedCount,
    totalCount: value.totalCount
  }]));
  return { closures, isdStatus, totalSchools: schools.length, closedSchools, diagnostics: { unmatchedSourceEntries: unmatched, ambiguousSourceEntries: ambiguous } };
}

function detectChanges(previous, current, timestamp) {
  const changes = { statusChanges: [], schoolsAdded: [], schoolsRemoved: [] };
  if (!previous) return changes;
  const walk = (closures, callback) => {
    for (const [isd, counties] of Object.entries(closures || {})) {
      for (const [county, schools] of Object.entries(counties)) {
        for (const [school, status] of Object.entries(schools)) callback({ isd, county, school, status });
      }
    }
  };
  walk(current, ({ isd, county, school, status }) => {
    const old = previous?.[isd]?.[county]?.[school];
    if (!old) changes.schoolsAdded.push({ timestamp, isd, county, school });
    else if (old.closed !== status.closed) changes.statusChanges.push({
      timestamp, isd, county, school,
      from: old.closed ? 'closed' : 'open', to: status.closed ? 'closed' : 'open'
    });
  });
  walk(previous, ({ isd, county, school }) => {
    if (!current?.[isd]?.[county]?.[school]) changes.schoolsRemoved.push({ timestamp, isd, county, school });
  });
  return changes;
}

module.exports = { buildClosureSnapshot, detectChanges };
