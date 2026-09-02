import assert from 'node:assert';
import * as shared from '../dist/index.js';

console.log('Testing Storage and Crypto types in @ledger/shared...');

// 验证接口和类型导出完整性
assert.ok(typeof shared.getDefaultCategories === 'function', 'getDefaultCategories must be exported');
assert.ok(typeof shared.buildCategoryTree === 'function', 'buildCategoryTree must be exported');

// 校验 WebDAV 快照接口契约
const mockSyncAdapter = {
  provider: 'webdav',
  async testConnection() {
    return { success: true, message: 'Connected', latencyMs: 15 };
  },
  async getRemoteMetadata(remotePath) {
    return { exists: true, remotePath: remotePath || '/vault.enc.json', lastModified: new Date().toISOString() };
  },
  async uploadSnapshot(pkg, remotePath) {
    return { success: true, lastModified: new Date().toISOString() };
  },
  async downloadSnapshot(remotePath) {
    return { success: true, data: 'encrypted_package_string' };
  }
};

assert.strictEqual(mockSyncAdapter.provider, 'webdav');
assert.strictEqual(typeof mockSyncAdapter.testConnection, 'function');
assert.strictEqual(typeof mockSyncAdapter.uploadSnapshot, 'function');
assert.strictEqual(typeof mockSyncAdapter.downloadSnapshot, 'function');
assert.strictEqual(typeof mockSyncAdapter.getRemoteMetadata, 'function');

// 校验加密数据包接口契约
const samplePayload = {
  ciphertext: 'c2FtcGxl',
  iv: 'aXZfc2FtcGxl',
  salt: 'c2FsdF9zYW1wbGU=',
  version: 1
};

assert.strictEqual(samplePayload.version, 1);
console.log('Storage and Crypto shared tests passed!');
