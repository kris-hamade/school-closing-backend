const path = require('path');
const { spawn } = require('child_process');

const backendRoot = path.resolve(__dirname, '..');
const frontendRoot = path.resolve(backendRoot, '..', 'school-closing');
const children = [];

function start(args, cwd, env = {}) {
  const child = spawn(process.execPath, args, {
    cwd, env: { ...process.env, ...env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  children.push(child);
  return child;
}

async function waitFor(url, attempts = 60) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) { lastError = error; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError;
}

async function main() {
  start(['test/fixture-upstream.js'], backendRoot);
  await waitFor('http://127.0.0.1:31234/closings');
  start(['server.js'], backendRoot, { CLOSING_DATA_1: 'http://127.0.0.1:31234/closings', PORT: '3023' });
  const healthResponse = await waitFor('http://127.0.0.1:3023/api/health');
  const health = await healthResponse.json();
  start([path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'), '--host', '127.0.0.1', '--port', '5173'], frontendRoot);
  const mainResponse = await waitFor('http://127.0.0.1:5173/api/closures');
  const mainBody = await mainResponse.json();
  const schoolResponse = await waitFor('http://127.0.0.1:5173/api/closures/school/Pleasant');
  const schoolBody = await schoolResponse.json();
  console.log(JSON.stringify({
    backend: { status: health.status, ready: health.ready, totalSchools: health.data.totalSchools },
    mainProxy: {
      status: mainResponse.status, upstream: mainResponse.headers.get('x-closures-upstream'),
      totalSchools: mainBody.metadata.totalSchools, closedSchools: mainBody.metadata.closedSchools
    },
    schoolProxy: {
      status: schoolResponse.status, upstream: schoolResponse.headers.get('x-closures-upstream'),
      count: schoolBody.count, school: schoolBody.results[0]?.school, closed: schoolBody.results[0]?.closed
    }
  }, null, 2));
}

main()
  .catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; })
  .finally(() => { for (const child of children.reverse()) child.kill(); });
