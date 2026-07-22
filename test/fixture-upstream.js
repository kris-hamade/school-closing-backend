const fs = require('fs');
const http = require('http');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'fixtures', 'closures.html'));
const port = Number(process.env.FIXTURE_PORT || 31234);
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(html);
});
server.listen(port, '127.0.0.1', () => console.log(`Fixture upstream listening on ${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.close());
