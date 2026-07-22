const crypto = require('crypto');

function sendError(res, status, message, details) {
  const body = { error: { status, message, timestamp: new Date().toISOString() } };
  if (details !== undefined) body.error.details = details;
  return res.status(status).json(body);
}

function setCacheHeaders(res, data, lastUpdated, maxAge = 60) {
  const etag = `\"${crypto.createHash('sha256').update(JSON.stringify(data)).digest('base64url')}\"`;
  res.set('ETag', etag);
  res.set('Cache-Control', `public, max-age=${maxAge}, stale-if-error=300`);
  if (lastUpdated) res.set('Last-Modified', new Date(lastUpdated).toUTCString());
  return etag;
}

function parseLimit(value, fallback, max) {
  if (value === undefined) return { value: fallback };
  if (!/^\d+$/.test(String(value))) return { error: `limit must be an integer between 1 and ${max}` };
  const parsed = Number(value);
  return parsed >= 1 && parsed <= max ? { value: parsed } : { error: `limit must be an integer between 1 and ${max}` };
}

module.exports = { sendError, setCacheHeaders, parseLimit };
