const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const files = ['server.js', 'test-matches.js'];
for (const directory of ['src', 'test']) {
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(path.relative(root, full));
    }
  };
  walk(path.join(root, directory));
}
for (const file of files) execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
console.log(`Syntax checked ${files.length} JavaScript files.`);
