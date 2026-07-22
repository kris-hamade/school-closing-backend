const dotenv = require('dotenv');
const { createConfig } = require('./src/config');
const { createService } = require('./src/lifecycle');

dotenv.config({ path: require('path').join(__dirname, '.env') });

async function main() {
  const config = createConfig();
  const service = createService({ config, logger: console });
  let shutdownStarted = false;
  const shutdown = async (signal) => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    console.info('Shutting down school closing API', { signal });
    try { await service.stop(); process.exitCode = 0; }
    catch (error) { console.error('Graceful shutdown failed', { error: error.message }); process.exitCode = 1; }
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  await service.start();
}

if (require.main === module) {
  main().catch((error) => { console.error('Unable to start school closing API', { error: error.message }); process.exitCode = 1; });
}

module.exports = { main };
