# School Closing API

Base URL for local development: `http://localhost:3023`. All responses are JSON except a successful conditional request (`304`), which has no body. No authentication is currently required.

Existing frontend response fields are preserved. New operational and matching-diagnostic fields are additive.

## Common behavior

- Success responses use `Cache-Control: public, max-age=60, stale-if-error=300`, ETag, and (after the first valid pull) Last-Modified. Health uses `no-store`.
- Send `If-None-Match` to receive `304 Not Modified` when appropriate.
- Errors have `{ "error": { "status": 400, "message": "...", "timestamp": "...", "details": {} } }`.
- Invalid parameters return 400, unknown ISDs/endpoints return 404, and degraded health returns 503.

## `GET /api/health`

Returns service health and readiness. The original `status`, `timestamp`, `uptime`, and `data.lastUpdated/hasError/error` fields remain. Additive fields include `ready`, `configurationValid`, `data.lastAttempt`, `data.refreshing`, and current counts. Status is 200 only after a successful pull with no current configuration/fetch error; otherwise it is 503.

## `GET /api/live`

Returns `{ status: "alive", timestamp, uptime }` with 200 whenever the HTTP process is responsive. Docker uses this liveness endpoint so a temporary upstream outage does not cause a restart loop.

## `GET /api/closures`

Returns the existing top-level shape:

```json
{
  "closures": { "ISD": { "County": { "School": {
    "closed": true,
    "matchScore": 100,
    "originalStatus": "Closed",
    "matchedSourceName": "School District",
    "lastChecked": "2026-01-01T00:00:00.000Z",
    "firstSeen": "2026-01-01T00:00:00.000Z",
    "lastStatusChange": null
  } } } },
  "metadata": {
    "lastUpdated": "2026-01-01T00:00:00.000Z",
    "lastAttempt": "2026-01-01T00:00:00.000Z",
    "dataSource": "https://example.com/closings",
    "totalSchools": 548,
    "closedSchools": 1,
    "fetchError": null,
    "pullHistory": [],
    "unmatchedSourceEntries": [],
    "ambiguousSourceEntries": [],
    "sourceElementCount": 1,
    "malformedSourceEntries": []
  },
  "isdStatus": { "ISD": { "allClosed": false, "closedCount": 1, "totalCount": 10 } }
}
```

`lastUpdated` is the last successful refresh; `lastAttempt` can be newer after failure. Source URL credentials, query strings, and fragments are redacted from `dataSource`.

## `GET /api/closures/school/:schoolName`

Case-insensitive substring search. Returns `{ query, results, count, metadata: { lastUpdated } }`; each result retains `school`, `isd`, `county`, and the school status fields. `?limit=1..SEARCH_RESULT_LIMIT` is optional (default and maximum 100 unless configured). Empty, over-200-character, and invalid-limit queries return 400.

## `GET /api/closures/isd/:isdName`

Exact, case-sensitive ISD lookup after normal URL decoding. Returns `{ isdName, status, closures, metadata: { lastUpdated } }`, or 404 with `details.isdName`.

## `GET /api/closures/summary`

Returns `{ metadata, isdStatus, statistics }`. Statistics include `totalISDs`, `isdsFullyClosed`, `isdsPartiallyClosed`, and `isdsFullyOpen` and are calculated from the same snapshot as school totals.

## `GET /api/closures/isd-status`

Returns `{ isdStatus, metadata: { lastUpdated } }`.

## `GET /api/closures/pull-history`

Returns `{ pullHistory, totalPulls, metadata: { lastUpdated } }`. `limit` defaults to 50 and must be 1–100. Up to 100 attempts are retained in memory. Entries contain `timestamp`, `success`, `error`, `totalSchools`, and `closedSchools`.

## `GET /api/closures/change-history`

Returns status changes, added schools, and removed schools plus total counts and metadata. `limit` defaults to 100 and must be 1–1000. Optional `type` is `status`, `added`, or `removed`; invalid values return 400. Up to 1000 events of each kind are retained in memory. The initial dataset load intentionally creates no addition events.

## Data lifecycle and diagnostics

All history is in memory and resets on process restart. A source entry is `unmatched` when no district clears both the fuzzy threshold and meaningful-overlap guard. It is `ambiguous` when the same source entry is assigned to multiple dataset schools. Ambiguity is reported rather than silently changing established match assignments; it should be reviewed before tightening matching rules.
