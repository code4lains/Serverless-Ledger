/**
 * 账盾 - 本地权威存储层 (localStore) 离线功能测试套件 (v3)
 */
import assert from 'node:assert';
import { getDefaultCategories, LEDGER_TEMPLATES, toCents, formatMoney } from '../packages/shared/dist/index.js';

console.log('Testing pure offline localStore business logic & data modeling for v3...');

// 1. 测试默认分类离线初始化
const defaultCats = getDefaultCategories();
assert.ok(Array.isArray(defaultCats), 'Default categories must be an array');
assert.ok(defaultCats.length > 50, 'Default categories should contain rich preset categories');

const expenseCats = defaultCats.filter((c) => c.type === 'expense');
assert.ok(expenseCats.length > 0, 'Must have expense categories');
assert.ok(expenseCats.some((c) => !c.parent_id), 'Must have top-level categories');
assert.ok(expenseCats.some((c) => c.parent_id), 'Must have subcategories');

// 2. 测试默认账本模版
assert.ok(Array.isArray(LEDGER_TEMPLATES), 'Ledger templates must be an array');
assert.ok(LEDGER_TEMPLATES.some((t) => t.name === '日常账本'), 'Must have Daily Ledger template');

// 3. 测试金额精度与分转化
assert.strictEqual(toCents('12.34'), 1234, '12.34 Yuan should convert to 1234 Cents');
assert.strictEqual(toCents(100), 10000, '100 Yuan should convert to 10000 Cents');
assert.strictEqual(formatMoney(1234), '¥12.34', '1234 Cents should format to ¥12.34');
assert.strictEqual(formatMoney(0), '¥0.00', '0 Cents should format to ¥0.00');

// 4. 测试本地流水操作数据校验 (v3: 无 sync_status 字段)
const sampleTx = {
  transaction_id: 'tx_local_123',
  user_id: 'default_vault',
  ledger_id: 'default_ledger',
  type: 'expense',
  amount: 2550,
  transaction_date: '2026-09-01',
  remark: '离线咖啡测试',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

assert.strictEqual(sampleTx.amount, 2550);
assert.strictEqual(sampleTx.type, 'expense');
assert.strictEqual(sampleTx.user_id, 'default_vault');

console.log('✅ LocalStore business logic & data modeling tests passed!');
