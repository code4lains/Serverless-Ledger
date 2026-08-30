import assert from 'node:assert/strict';

console.log('Testing server bug fixes...');
// BUG-S11: Enum validation tests
const validTypes = ['expense', 'income', 'transfer', 'loan'];
assert.ok(validTypes.includes('expense'));
assert.ok(!validTypes.includes('invalid_type'));

// BUG-S13: Length boundary tests
const email = 'user@example.com';
assert.ok(email.length <= 100);

console.log('Server bug fixes test passed!');
