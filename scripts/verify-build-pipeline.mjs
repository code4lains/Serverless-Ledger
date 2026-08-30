import assert from 'node:assert/strict';
import fs from 'node:fs';

console.log('Verifying build pipeline and artifacts...');
assert.ok(fs.existsSync('packages/shared/dist/index.js'), 'Shared dist/index.js must exist');
assert.ok(fs.existsSync('packages/server/dist/index.js') || fs.existsSync('packages/server/dist/_worker.js') || fs.existsSync('packages/server/dist'), 'Server dist must exist');
assert.ok(fs.existsSync('packages/client/dist/index.html'), 'Client dist/index.html must exist');
console.log('Build pipeline verification passed!');
