import assert from 'node:assert';
import { calculateInviteEligibility } from '../dist/index.js';

console.log('=== Running @ledger/shared Invite Eligibility Unit Tests ===\n');

const DAY_MS = 24 * 60 * 60 * 1000;
const baseTime = new Date('2026-08-01T00:00:00.000Z').getTime();

// 1. 注册满 0 天，未记账 -> 0 个，不能生成
const res1 = calculateInviteEligibility(
  new Date(baseTime).toISOString(),
  false, // hasRecordedTransaction
  0,     // claimedCount
  baseTime
);
console.log('1. Reg 0 days, No transaction:', res1);
assert.strictEqual(res1.total_eligible, 0);
assert.strictEqual(res1.can_generate, false);
assert.strictEqual(res1.has_recorded_transaction, false);

// 2. 注册满 0 天，已记账 -> 0 个（未满3天），不能生成，nextUnlockDate 为 3天后
const res2 = calculateInviteEligibility(
  new Date(baseTime).toISOString(),
  true,  // hasRecordedTransaction
  0,     // claimedCount
  baseTime + 1 * DAY_MS // Day 1
);
console.log('2. Reg 1 day, Has transaction:', res2);
assert.strictEqual(res2.total_eligible, 0);
assert.strictEqual(res2.can_generate, false);
assert.strictEqual(res2.next_unlock_date, new Date(baseTime + 3 * DAY_MS).toISOString());

// 3. 注册满 3 天，未记账 -> 0 个，不能生成
const res3 = calculateInviteEligibility(
  new Date(baseTime).toISOString(),
  false, // hasRecordedTransaction
  0,
  baseTime + 3 * DAY_MS
);
console.log('3. Reg 3 days, No transaction:', res3);
assert.strictEqual(res3.total_eligible, 0);
assert.strictEqual(res3.can_generate, false);

// 4. 注册满 3 天，已记账，0 个已生成 -> 1 个配额，可生成
const res4 = calculateInviteEligibility(
  new Date(baseTime).toISOString(),
  true,  // hasRecordedTransaction
  0,     // claimedCount
  baseTime + 3 * DAY_MS
);
console.log('4. Reg 3 days, Has transaction, 0 claimed:', res4);
assert.strictEqual(res4.total_eligible, 1);
assert.strictEqual(res4.can_generate, true);
assert.strictEqual(res4.next_unlock_date, new Date(baseTime + 33 * DAY_MS).toISOString());

// 5. 注册满 3 天，已记账，已生成 1 个 -> 1 个配额，不能再生成（需等30天后）
const res5 = calculateInviteEligibility(
  new Date(baseTime).toISOString(),
  true,
  1,     // claimedCount
  baseTime + 3 * DAY_MS
);
console.log('5. Reg 3 days, Has transaction, 1 claimed:', res5);
assert.strictEqual(res5.total_eligible, 1);
assert.strictEqual(res5.can_generate, false);
assert.strictEqual(res5.next_unlock_date, new Date(baseTime + 33 * DAY_MS).toISOString());

// 6. 注册满 33 天 (3 + 30)，已记账，已生成 1 个 -> 2 个配额，可生成第 2 个
const res6 = calculateInviteEligibility(
  new Date(baseTime).toISOString(),
  true,
  1,     // claimedCount
  baseTime + 33 * DAY_MS
);
console.log('6. Reg 33 days, Has transaction, 1 claimed:', res6);
assert.strictEqual(res6.total_eligible, 2);
assert.strictEqual(res6.can_generate, true);
assert.strictEqual(res6.next_unlock_date, new Date(baseTime + 63 * DAY_MS).toISOString());

// 7. 注册满 63 天 (3 + 30 + 30)，已记账，已生成 2 个 -> 3 个配额，可生成第 3 个
const res7 = calculateInviteEligibility(
  new Date(baseTime).toISOString(),
  true,
  2,     // claimedCount
  baseTime + 63 * DAY_MS
);
console.log('7. Reg 63 days, Has transaction, 2 claimed:', res7);
assert.strictEqual(res7.total_eligible, 3);
assert.strictEqual(res7.can_generate, true);
assert.strictEqual(res7.next_unlock_date, null); // 达到上限，不再有后续解锁

// 8. 注册满 100 天，已记账，已生成 3 个 -> 3 个配额，达到上限 (3/3)，不能再生成
const res8 = calculateInviteEligibility(
  new Date(baseTime).toISOString(),
  true,
  3,     // claimedCount
  baseTime + 100 * DAY_MS
);
console.log('8. Reg 100 days, Has transaction, 3 claimed:', res8);
assert.strictEqual(res8.total_eligible, 3);
assert.strictEqual(res8.can_generate, false);
assert.strictEqual(res8.next_unlock_date, null);

console.log('\n🎉 ALL INVITE ELIGIBILITY UNIT TESTS PASSED SUCCESSFULLY! 🎉\n');
