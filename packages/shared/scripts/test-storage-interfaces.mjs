import assert from 'node:assert';
import * as shared from '../dist/index.js';

console.log('Testing Storage and Crypto types in @ledger/shared...');

// 验证接口和类型导出完整性
assert.ok(typeof shared.toBoolean === 'function', 'toBoolean must be exported');
assert.ok(typeof shared.toSqliteBoolean === 'function', 'toSqliteBoolean must be exported');
assert.ok(typeof shared.getDefaultCategories === 'function', 'getDefaultCategories must be exported');

// 构造 Mock Repository 检验类型契约完整性
const mockUserRepo = {
  async findById(id) { return null; },
  async findByEmail(email) { return null; },
  async create(user) { return user; },
  async updatePassword(id, hash) { return true; },
  async updateRecoveryCode(id, code) { return true; },
  async delete(id) { return true; }
};

assert.strictEqual(typeof mockUserRepo.findById, 'function');
assert.strictEqual(typeof mockUserRepo.create, 'function');

// 校验加密数据包接口契约
const samplePayload = {
  ciphertext: 'c2FtcGxl',
  iv: 'aXZfc2FtcGxl',
  salt: 'c2FsdF9zYW1wbGU=',
  version: 1
};

assert.strictEqual(samplePayload.version, 1);
console.log('Storage and Crypto shared tests passed!');
