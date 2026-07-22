const express = require('express');
const cors = require('cors');
const compression = require('compression');
const { sendError, setCacheHeaders, parseLimit } = require('./http');

function createApp({ store, config, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(compression());
  const allowedOrigins = new Set(['http://localhost:5173', 'http://127.0.0.1:5173', config.productionOrigin]);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer'
    });
    next();
  });
  app.use(cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) callback(null, true);
      else { const error = new Error('Origin is not allowed by CORS'); error.status = 403; callback(error); }
    },
    methods: ['GET', 'HEAD', 'OPTIONS'], optionsSuccessStatus: 204
  }));
  if (config.requestLogging) app.use((req, res, next) => {
    const started = Date.now();
    res.on('finish', () => logger.info('HTTP request', { method: req.method, path: req.originalUrl, status: res.statusCode, durationMs: Date.now() - started }));
    next();
  });

  const cachedJson = (req, res, body, maxAge = 60) => {
    const etag = setCacheHeaders(res, body, store.getData().metadata.lastUpdated, maxAge);
    const candidates = String(req.headers['if-none-match'] || '').split(',').map((value) => value.trim());
    if (candidates.includes(etag) || candidates.includes('*')) return res.status(304).end();
    return res.json(body);
  };

  app.get('/api/health', (req, res) => {
    const data = store.getData();
    const ready = store.isReady();
    const degraded = Boolean(data.metadata.fetchError || config.configIssues.length);
    const body = {
      status: ready && !degraded ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(), uptime: process.uptime(),
      ready, configurationValid: config.configIssues.length === 0,
      data: {
        lastUpdated: data.metadata.lastUpdated, lastAttempt: data.metadata.lastAttempt,
        hasError: degraded, error: data.metadata.fetchError,
        refreshing: store.isRefreshing(), totalSchools: data.metadata.totalSchools,
        closedSchools: data.metadata.closedSchools
      }
    };
    res.set('Cache-Control', 'no-store');
    res.status(ready && !degraded ? 200 : 503).json(body);
  });

  app.get('/api/live', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ status: 'alive', timestamp: new Date().toISOString(), uptime: process.uptime() });
  });

  app.get('/api/closures', (req, res) => cachedJson(req, res, store.getData()));

  app.get('/api/closures/school/:schoolName', (req, res) => {
    const query = req.params.schoolName.trim();
    if (!query) return sendError(res, 400, 'School name must not be empty');
    if (query.length > 200) return sendError(res, 400, 'School name must be 200 characters or fewer');
    const parsedLimit = parseLimit(req.query.limit, config.searchResultLimit, config.searchResultLimit);
    if (parsedLimit.error) return sendError(res, 400, parsedLimit.error);
    const needle = query.toLocaleLowerCase('en-US');
    const results = [];
    const closures = store.getData().closures;
    outer: for (const [isd, counties] of Object.entries(closures)) {
      for (const [county, schools] of Object.entries(counties)) {
        for (const [school, status] of Object.entries(schools)) {
          if (school.toLocaleLowerCase('en-US').includes(needle)) {
            results.push({ school, isd, county, ...status });
            if (results.length >= parsedLimit.value) break outer;
          }
        }
      }
    }
    return cachedJson(req, res, { query, results, count: results.length, metadata: { lastUpdated: store.getData().metadata.lastUpdated } });
  });

  app.get('/api/closures/isd/:isdName', (req, res) => {
    const isdName = req.params.isdName.trim();
    if (!isdName) return sendError(res, 400, 'ISD name must not be empty');
    const data = store.getData();
    if (!data.closures[isdName]) return sendError(res, 404, 'ISD not found', { isdName });
    return cachedJson(req, res, {
      isdName, status: data.isdStatus[isdName] || null, closures: data.closures[isdName],
      metadata: { lastUpdated: data.metadata.lastUpdated }
    });
  });

  app.get('/api/closures/summary', (req, res) => {
    const data = store.getData();
    const statuses = Object.values(data.isdStatus);
    return cachedJson(req, res, {
      metadata: data.metadata, isdStatus: data.isdStatus,
      statistics: {
        totalISDs: statuses.length,
        isdsFullyClosed: statuses.filter((item) => item.allClosed).length,
        isdsPartiallyClosed: statuses.filter((item) => !item.allClosed && item.closedCount > 0).length,
        isdsFullyOpen: statuses.filter((item) => item.closedCount === 0).length
      }
    });
  });

  app.get('/api/closures/isd-status', (req, res) => cachedJson(req, res, {
    isdStatus: store.getData().isdStatus, metadata: { lastUpdated: store.getData().metadata.lastUpdated }
  }));

  app.get('/api/closures/pull-history', (req, res) => {
    const parsed = parseLimit(req.query.limit, 50, 100);
    if (parsed.error) return sendError(res, 400, parsed.error);
    const data = store.getData();
    return cachedJson(req, res, {
      pullHistory: data.metadata.pullHistory.slice(-parsed.value), totalPulls: data.metadata.pullHistory.length,
      metadata: { lastUpdated: data.metadata.lastUpdated }
    });
  });

  app.get('/api/closures/change-history', (req, res) => {
    const parsed = parseLimit(req.query.limit, 100, 1000);
    if (parsed.error) return sendError(res, 400, parsed.error);
    const type = req.query.type;
    if (type && !['status', 'added', 'removed'].includes(type)) return sendError(res, 400, 'type must be status, added, or removed');
    const history = store.getChangeHistory();
    const body = { metadata: { lastUpdated: store.getData().metadata.lastUpdated } };
    if (!type || type === 'status') body.statusChanges = history.statusChanges.slice(-parsed.value);
    if (!type || type === 'added') body.schoolsAdded = history.schoolsAdded.slice(-parsed.value);
    if (!type || type === 'removed') body.schoolsRemoved = history.schoolsRemoved.slice(-parsed.value);
    body.counts = {
      totalStatusChanges: history.statusChanges.length,
      totalSchoolsAdded: history.schoolsAdded.length,
      totalSchoolsRemoved: history.schoolsRemoved.length
    };
    return cachedJson(req, res, body);
  });

  app.use((req, res) => sendError(res, 404, 'Endpoint not found'));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    logger.error('Request failed', { method: req.method, path: req.originalUrl, error: error.message });
    return sendError(res, error.status || 500, error.status ? error.message : 'Internal Server Error');
  });
  return app;
}

module.exports = { createApp };
