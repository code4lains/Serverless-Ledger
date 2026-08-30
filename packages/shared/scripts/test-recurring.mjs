import assert from 'node:assert/strict';
import { calculateNextRunDate, formatDateKey } from '../dist/index.js';

console.log('Testing calculateNextRunDate...');
const rule = {
  rule_id: 'rec_01',
  user_id: 'u1',
  ledger_id: 'led_1',
  type: 'expense',
  amount: 1000,
  category_id: 'cat_food',
  frequency: 'daily',
  interval: 1,
  start_date: '2026-09-01',
  status: 'active',
};
const baseDate = new Date('2026-08-25');
const nextDate = calculateNextRunDate(rule, baseDate);
assert.ok(nextDate !== null);
assert.equal(formatDateKey(nextDate), '2026-09-01', 'First occurrence should not be skipped');

console.log('Recurring tests passed!');
