# School Closing Backend

Express API that polls an HTML closure source, fuzzy-matches closed organizations to the Michigan district dataset, and serves the result grouped by ISD and county. The default local address is `http://localhost:3023`.

## Requirements

- Node.js 22 or newer
- A closure source URL whose entries use the configured source's `.closing`, `.text--primary.js-sort-value`, and `.text--secondary` markup

## Local setup

```sh
cp .env.example .env
npm ci
npm test
npm start
```

Set `CLOSING_DATA_1` in `.env` to the upstream closure page. The server starts in degraded mode when this value is missing or the initial pull fails; `/api/health` returns 503 until one valid dataset has been loaded. Configuration values and URL credentials/query parameters are never returned by the API.

Useful commands:

```sh
npm run dev            # Node watch mode
npm test               # local-fixture unit and integration tests
npm run test:coverage  # built-in coverage report
npm run lint           # syntax validation
npm start              # production process
node test-matches.js    # safe local matching diagnostic
node test-matches.js --live  # explicitly contact CLOSING_DATA_1
```

Tests do not use the network or production data. Paths are resolved relative to this repository, not the shell's working directory.

## Configuration

See [.env.example](.env.example). Important defaults are port `3023`, poll interval `150000` ms, request timeout `10000` ms, two retries with exponential backoff, match threshold `85`, and search limit `100`. A relative `MICHIGAN_DATA_PATH` is resolved from the repository root.

Allowed browser origins are `http://localhost:5173`, `http://127.0.0.1:5173`, and `FRONTEND_ORIGIN` (default `https://misnowday.com`).

## Reliability model

- Refresh calls share one in-flight promise, so scheduled and manual refreshes cannot overlap.
- Polling schedules the next run only after the current attempt finishes.
- HTTP failures are retried only for network errors, 408, 429, and 5xx responses.
- Empty, unexpected, or wholly malformed source markup is rejected.
- A failed pull preserves the last valid closures and successful `lastUpdated`; `lastAttempt`, `fetchError`, and pull history show the failure.
- SIGINT/SIGTERM stop polling, abort the upstream request, and drain HTTP connections.

Source entries that cannot be matched and entries that match more than one dataset school are exposed in metadata for auditing. Matching remains fuzzy, so these diagnostics should be monitored when either source naming or the district dataset changes.

## Docker

```sh
docker build -t school-closing-api .
docker run --rm -p 3023:3023 -e CLOSING_DATA_1=https://example.com/closings school-closing-api
```

The image uses a pinned Node/Alpine tag, installs from `package-lock.json`, runs as the unprivileged `node` user, and includes an API health check.

## Frontend integration

The adjacent `school-closing` project automatically tries `http://127.0.0.1:3023/api/closures` in development before production. With both projects running, its `/api/closures` response should include `x-closures-upstream: local`.

See [API_DOCUMENTATION.md](API_DOCUMENTATION.md) for endpoint contracts.
