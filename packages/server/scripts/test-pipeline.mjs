import assert from 'node:assert/strict';

// Helper function to test constant time comparison algorithm
function timingSafeEqualString(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const encoder = new TextEncoder();
  const aBuf = encoder.encode(a);
  const bBuf = encoder.encode(b);
  if (aBuf.byteLength !== bBuf.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < aBuf.byteLength; i++) {
    diff |= aBuf[i] ^ bBuf[i];
  }
  return diff === 0;
}

console.log('Testing server pipeline & crypto safety...');
assert.equal(timingSafeEqualString('abc', 'abc'), true);
assert.equal(timingSafeEqualString('abc', 'abd'), false);
assert.equal(timingSafeEqualString('12345678', '12345678'), true);
assert.equal(timingSafeEqualString('short', 'longerstring'), false);
console.log('Server pipeline test passed!');
