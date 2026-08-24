import assert from 'node:assert';
import {
  calculateNextRunDate,
  getDueDatesForRule,
  formatFrequencyLabel,
  PRESET_RECURRING_TEMPLATES,
  getDaysInMonth,
} from '../dist/index.js';

console.log('=== Running @ledger/shared Recurring Rules Unit Tests ===\n');

// 1. 测试 getDaysInMonth
console.log('--- 1. Testing getDaysInMonth ---');
assert.strictEqual(getDaysInMonth(2024, 2), 29, '2024年2月(闰年)应为29天');
assert.strictEqual(getDaysInMonth(2025, 2), 28, '2025年2月(平年)应为28天');
assert.strictEqual(getDaysInMonth(2026, 1), 31, '1月应为31天');
assert.strictEqual(getDaysInMonth(2026, 4), 30, '4月应为30天');
console.log('✓ getDaysInMonth passed.');

// 2. 测试每天频率 (Daily)
console.log('\n--- 2. Testing Daily Recurrence ---');
const dailyNext1 = calculateNextRunDate(
  { frequency: 'daily', interval: 1, start_date: '2026-08-01' },
  '2026-08-01'
);
assert.strictEqual(dailyNext1, '2026-08-02', '每天递增应为次日');

const dailyNext3 = calculateNextRunDate(
  { frequency: 'daily', interval: 3, start_date: '2026-08-01' },
  '2026-08-01'
);
assert.strictEqual(dailyNext3, '2026-08-04', '间隔3天递增应为2026-08-04');
console.log('✓ Daily recurrence passed.');

// 3. 测试每周频率 (Weekly)
console.log('\n--- 3. Testing Weekly Recurrence ---');
// 2026-08-24 为周一 (day_of_week: 1)
const weeklyNext = calculateNextRunDate(
  { frequency: 'weekly', interval: 1, day_of_week: 3, start_date: '2026-08-24' },
  '2026-08-24'
);
assert.strictEqual(weeklyNext, '2026-08-26', '周一推算本周三应为2026-08-26');

const weeklyNextMon = calculateNextRunDate(
  { frequency: 'weekly', interval: 1, day_of_week: 1, start_date: '2026-08-24' },
  '2026-08-24'
);
assert.strictEqual(weeklyNextMon, '2026-08-31', '周一推算下周一应为2026-08-31');
console.log('✓ Weekly recurrence passed.');

// 4. 测试每月频率 (Monthly)
console.log('\n--- 4. Testing Monthly Recurrence ---');
const monthlyNext10 = calculateNextRunDate(
  { frequency: 'monthly', interval: 1, day_of_month: 10, start_date: '2026-08-01' },
  '2026-08-10'
);
assert.strictEqual(monthlyNext10, '2026-09-10', '8月10日递增应为9月10日');

// 月末适配：1月31日递增到平年2月应自动对齐为2月28日
const monthlyNextFebEnd = calculateNextRunDate(
  { frequency: 'monthly', interval: 1, day_of_month: 31, start_date: '2025-01-31' },
  '2025-01-31'
);
assert.strictEqual(monthlyNextFebEnd, '2025-02-28', '1月31日递增到2025年2月应截断为2月28日');

// 闰年月末适配：1月31日递增到2024年2月应自动对齐为2月29日
const monthlyNextLeapFebEnd = calculateNextRunDate(
  { frequency: 'monthly', interval: 1, day_of_month: 31, start_date: '2024-01-31' },
  '2024-01-31'
);
assert.strictEqual(monthlyNextLeapFebEnd, '2024-02-29', '1月31日递增到2024年2月(闰年)应截断为2月29日');
console.log('✓ Monthly recurrence & month-end capping passed.');

// 5. 测试每年频率 (Yearly)
console.log('\n--- 5. Testing Yearly Recurrence ---');
const yearlyNext = calculateNextRunDate(
  { frequency: 'yearly', interval: 1, month_of_year: 5, day_of_month: 20, start_date: '2026-05-20' },
  '2026-05-20'
);
assert.strictEqual(yearlyNext, '2027-05-20', '2026年5月20日递增应为2027年5月20日');
console.log('✓ Yearly recurrence passed.');

// 6. 测试多周期补齐生成 getDueDatesForRule
console.log('\n--- 6. Testing getDueDatesForRule Catch-up ---');
const rule1 = {
  rule_id: 'rec_1',
  user_id: 'u1',
  ledger_id: 'l1',
  name: '房租',
  type: 'expense',
  amount: 300000,
  frequency: 'monthly',
  interval: 1,
  day_of_month: 1,
  start_date: '2026-05-01',
  next_run_date: '2026-06-01',
  status: 'active',
  auto_record: 1,
  created_at: '2026-05-01',
  updated_at: '2026-05-01',
};

// 如果当前是 2026-08-15，应补齐 6月1日、7月1日、8月1日 三期
const dueDates = getDueDatesForRule(rule1, '2026-08-15');
assert.deepStrictEqual(dueDates, ['2026-06-01', '2026-07-01', '2026-08-01'], '应生成6月、7月、8月三期');

// 如果已设定 end_date 为 2026-07-15，则只能补齐到 7月1日
const ruleWithEnd = { ...rule1, end_date: '2026-07-15' };
const dueDatesEnd = getDueDatesForRule(ruleWithEnd, '2026-08-15');
assert.deepStrictEqual(dueDatesEnd, ['2026-06-01', '2026-07-01'], '在截止日限制下只能补齐到7月1日');

// 暂停状态应返回空
const rulePaused = { ...rule1, status: 'paused' };
assert.deepStrictEqual(getDueDatesForRule(rulePaused, '2026-08-15'), []);

console.log('✓ Multi-period catch-up generation passed.');

// 7. 测试 formatFrequencyLabel
console.log('\n--- 7. Testing formatFrequencyLabel ---');
assert.strictEqual(formatFrequencyLabel({ frequency: 'daily', interval: 1 }), '每天');
assert.strictEqual(formatFrequencyLabel({ frequency: 'daily', interval: 2 }), '每 2 天');
assert.strictEqual(formatFrequencyLabel({ frequency: 'weekly', day_of_week: 1 }), '每周一');
assert.strictEqual(formatFrequencyLabel({ frequency: 'monthly', day_of_month: 15 }), '每月 15 日');
assert.strictEqual(formatFrequencyLabel({ frequency: 'yearly', month_of_year: 3, day_of_month: 8 }), '每年 3月8日');
console.log('✓ formatFrequencyLabel passed.');

// 8. 测试预置模板
console.log('\n--- 8. Testing PRESET_RECURRING_TEMPLATES ---');
assert.ok(PRESET_RECURRING_TEMPLATES.length >= 5, '至少包含5个常用预置模板');
for (const tmpl of PRESET_RECURRING_TEMPLATES) {
  assert.ok(tmpl.name, '模板必须包含名称');
  assert.ok(tmpl.suggestedAmount > 0, '模板金额必须大于0');
  assert.ok(['daily', 'weekly', 'monthly', 'yearly'].includes(tmpl.frequency), '模板频率有效');
}
console.log('✓ PRESET_RECURRING_TEMPLATES passed.');

console.log('\n🎉 ALL RECURRING RULES UNIT TESTS PASSED SUCCESSFULLY! 🎉\n');
