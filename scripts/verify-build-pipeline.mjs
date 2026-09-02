import assert from 'node:assert/strict';
import fs from 'node:fs';

console.log('Verifying build pipeline and artifacts for v3...');
assert.ok(fs.existsSync('packages/shared/dist/index.js'), 'Shared dist/index.js must exist');
assert.ok(fs.existsSync('packages/client/dist/index.html'), 'Client dist/index.html must exist');
assert.ok(!fs.existsSync('packages/server'), 'packages/server must not exist in v3');
assert.ok(!fs.existsSync('functions'), 'functions directory must not exist in v3');
console.log('✅ Build pipeline verification passed!');
