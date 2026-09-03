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

// Weekly interval > 1 test
const weeklyRule = {
  rule_id: 'rec_02',
  user_id: 'u1',
  ledger_id: 'led_1',
  type: 'expense',
  amount: 2000,
  frequency: 'weekly',
  day_of_week: 3, // Wednesday
  interval: 2, // every 2 weeks
  start_date: '2026-08-01',
  status: 'active',
};
// 2026-08-31 is Monday (currentIsoDay = 1), desiredDay = 3 (Wednesday)
const weeklyNext = calculateNextRunDate(weeklyRule, '2026-08-31');
// Monday + 16 days = 2026-09-16 (Wednesday 2 weeks ahead)
assert.equal(weeklyNext, '2026-09-16');

console.log('Recurring tests passed!');
