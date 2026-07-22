const axios = require('axios');
const cheerio = require('cheerio');

function extractClosureEntries(html) {
  if (typeof html !== 'string' || !html.trim()) throw new Error('Upstream returned an empty response');
  const $ = cheerio.load(html);
  const elements = $('.closing');
  if (!elements.length) throw new Error('Upstream HTML did not contain expected closure elements');

  const entries = [];
  const malformed = [];
  elements.each((_, element) => {
    const schoolName = $(element).find('.text--primary.js-sort-value').first().text().trim();
    const closureStatus = $(element).find('.text--secondary').first().text().trim();
    if (!schoolName || !closureStatus) malformed.push({ schoolName: schoolName || null, closureStatus: closureStatus || null });
    else if (/\bclosed\b/i.test(closureStatus) && !/\bnot\s+closed\b/i.test(closureStatus)) entries.push({ schoolName, closureStatus });
  });
  if (malformed.length === elements.length) throw new Error('All upstream closure elements were malformed');

  const deduplicated = [...new Map(entries.map((entry) => [`${entry.schoolName}\0${entry.closureStatus}`, entry])).values()];
  return { entries: deduplicated, diagnostics: { sourceElementCount: elements.length, malformedEntries: malformed } };
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function retryable(error) {
  const status = error.response?.status;
  return !status || status === 408 || status === 429 || status >= 500;
}

async function fetchClosureHtml(url, options = {}) {
  const {
    timeoutMs = 10000, retries = 2, retryBaseDelayMs = 250,
    requester = axios.get, sleep = wait, signal
  } = options;
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await requester(url, {
        timeout: timeoutMs,
        signal,
        responseType: 'text',
        maxContentLength: 5 * 1024 * 1024,
        headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'school-closing-backend/2.0' },
        validateStatus: (status) => status >= 200 && status < 300
      });
      return response.data;
    } catch (error) {
      lastError = error;
      if (attempt === retries || !retryable(error) || signal?.aborted) break;
      await sleep(retryBaseDelayMs * (2 ** attempt));
    }
  }
  const status = lastError?.response?.status;
  throw new Error(status ? `Upstream request failed with HTTP ${status}` : `Upstream request failed: ${lastError?.message || 'unknown error'}`);
}

module.exports = { extractClosureEntries, fetchClosureHtml, retryable };
