const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');

function integer(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function publicSourceName(value) {
  if (!value) return 'unknown';
  try {
    const url = new URL(value);
    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return 'configured';
  }
}

function createConfig(env = process.env) {
  const sourceUrl = env.CLOSING_DATA_1?.trim() || null;
  const issues = [];
  if (!sourceUrl) issues.push('CLOSING_DATA_1 is required for upstream refreshes');
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) issues.push('CLOSING_DATA_1 must use HTTP or HTTPS');
    } catch {
      issues.push('CLOSING_DATA_1 must be a valid URL');
    }
  }

  return {
    host: env.HOST?.trim() || '0.0.0.0',
    port: integer(env.PORT, 3023, { max: 65535 }),
    sourceUrl,
    publicSource: publicSourceName(sourceUrl),
    datasetPath: env.MICHIGAN_DATA_PATH
      ? (path.isAbsolute(env.MICHIGAN_DATA_PATH) ? env.MICHIGAN_DATA_PATH : path.resolve(PROJECT_ROOT, env.MICHIGAN_DATA_PATH))
      : path.join(PROJECT_ROOT, 'states', 'michigan.json'),
    pollIntervalMs: integer(env.POLL_INTERVAL_MS, 150000, { min: 1000 }),
    requestTimeoutMs: integer(env.REQUEST_TIMEOUT_MS, 10000, { min: 100, max: 120000 }),
    requestRetries: integer(env.REQUEST_RETRIES, 2, { min: 0, max: 5 }),
    retryBaseDelayMs: integer(env.RETRY_BASE_DELAY_MS, 250, { min: 0, max: 10000 }),
    matchThreshold: integer(env.MATCH_THRESHOLD, 85, { min: 1, max: 100 }),
    searchResultLimit: integer(env.SEARCH_RESULT_LIMIT, 100, { min: 1, max: 1000 }),
    productionOrigin: env.FRONTEND_ORIGIN?.trim() || 'https://misnowday.com',
    requestLogging: env.REQUEST_LOGGING !== 'false',
    shutdownTimeoutMs: integer(env.SHUTDOWN_TIMEOUT_MS, 10000, { min: 100, max: 60000 }),
    configIssues: issues
  };
}

module.exports = { PROJECT_ROOT, createConfig, publicSourceName };
