function createPoller({ refresh, intervalMs, logger = console }) {
  let timer = null;
  let stopped = true;
  const schedule = () => {
    if (!stopped) timer = setTimeout(run, intervalMs);
  };
  const run = async () => {
    try { await refresh(); }
    catch (error) { logger.error('Closure refresh failed', { error: error.message }); }
    finally { schedule(); }
  };
  return {
    start() { if (stopped) { stopped = false; schedule(); } },
    stop() { stopped = true; if (timer) clearTimeout(timer); timer = null; },
    runNow: run
  };
}

module.exports = { createPoller };
