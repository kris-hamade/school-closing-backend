const http = require('http');
const { loadMichiganDataset } = require('./dataset');
const { ClosureStore } = require('./store');
const { extractClosureEntries, fetchClosureHtml } = require('./scraper');
const { createPoller } = require('./poller');
const { createApp } = require('./app');

function createService({ config, logger = console, requester, sleep } = {}) {
  const schools = loadMichiganDataset(config.datasetPath);
  const store = new ClosureStore({ schools, publicSource: config.publicSource, matchThreshold: config.matchThreshold });
  const abortController = new AbortController();
  const load = async () => {
    if (config.configIssues.length) throw new Error(config.configIssues.join('; '));
    const html = await fetchClosureHtml(config.sourceUrl, {
      timeoutMs: config.requestTimeoutMs, retries: config.requestRetries,
      retryBaseDelayMs: config.retryBaseDelayMs, requester, sleep, signal: abortController.signal
    });
    return { ...extractClosureEntries(html), schools: loadMichiganDataset(config.datasetPath) };
  };
  const refresh = () => store.refresh(load);
  const poller = createPoller({ refresh, intervalMs: config.pollIntervalMs, logger });
  const app = createApp({ store, config, logger });
  const server = http.createServer(app);
  let stopping = false;

  return {
    app, server, store, refresh,
    async start() {
      try { await refresh(); }
      catch (error) { logger.error('Initial closure refresh failed; starting in degraded mode', { error: error.message }); }
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(config.port, config.host, () => { server.off('error', reject); resolve(); });
      });
      poller.start();
      logger.info('School closing API listening', { host: config.host, port: server.address().port, ready: store.isReady() });
      return server;
    },
    async stop() {
      if (stopping) return;
      stopping = true;
      poller.stop();
      abortController.abort();
      if (!server.listening) return;
      await new Promise((resolve) => {
        const forceClose = setTimeout(() => {
          server.closeAllConnections?.();
          resolve();
        }, config.shutdownTimeoutMs);
        forceClose.unref?.();
        server.close(() => {
          clearTimeout(forceClose);
          resolve();
        });
      });
    }
  };
}

module.exports = { createService };
