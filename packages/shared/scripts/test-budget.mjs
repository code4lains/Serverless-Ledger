import assert from 'node:assert';
import {
  getDefaultCategories,
  getBudgetStatus,
  calculateBudgetOverview,
} from '../dist/index.js';

console.log('=== Running @ledger/shared Budget Calculation Unit Tests ===');

// 1. 测试预算预警状态判断
assert.strictEqual(getBudgetStatus(5000, 10000), 'normal', '50% should be normal');
assert.strictEqual(getBudgetStatus(7999, 10000), 'normal', '79.99% should be normal');
assert.strictEqual(getBudgetStatus(8000, 10000), 'warning', '80% should trigger warning');
assert.strictEqual(getBudgetStatus(9500, 10000), 'warning', '95% should trigger warning');
assert.strictEqual(getBudgetStatus(10000, 10000), 'warning', '100% should be warning (not yet strictly exceeded)');
assert.strictEqual(getBudgetStatus(10001, 10000), 'exceeded', '100.01% should be exceeded');
assert.strictEqual(getBudgetStatus(15000, 10000), 'exceeded', '150% should be exceeded');
console.log('✓ Budget status rules (normal / warning >=80% / exceeded >100%) verified!');

// 2. 测试当月小分类归集至大分类与总预算消耗计算
const categories = getDefaultCategories();
const now = new Date();
const currentMonthIso = now.toISOString();

const mockBudgets = [
  {
    budget_id: 'b_total',
    user_id: 'u1',
    ledger_id: 'led_default',
    category_id: null, // 总预算 5000 元 (500000 分)
    period: 'monthly',
    amount: 500000,
    created_at: currentMonthIso,
    updated_at: currentMonthIso,
  },
  {
    budget_id: 'b_food',
    user_id: 'u1',
    ledger_id: 'led_default',
    category_id: 'cat_exp_food', // 餐饮大类预算 2000 元 (200000 分)
    period: 'monthly',
    amount: 200000,
    created_at: currentMonthIso,
    updated_at: currentMonthIso,
  },
  {
    budget_id: 'b_traffic',
    user_id: 'u1',
    ledger_id: 'led_default',
    category_id: 'cat_exp_traffic', // 交通大类预算 500 元 (50000 分)
    period: 'monthly',
    amount: 50000,
    created_at: currentMonthIso,
    updated_at: currentMonthIso,
  },
  {
    budget_id: 'b_entertain',
    user_id: 'u1',
    ledger_id: 'led_default',
    category_id: 'cat_exp_entertain', // 娱乐大类预算 300 元 (30000 分)
    period: 'monthly',
    amount: 30000,
    created_at: currentMonthIso,
    updated_at: currentMonthIso,
  },
];

const mockTransactions = [
  // 餐饮小分类：早餐 20元, 午餐 50元, 晚餐 130元, 买菜 1500元 -> 餐饮共计 1700元 (170000分, 占2000元的 85% -> 预警)
  {
    transaction_id: 'tx1',
    user_id: 'u1',
    ledger_id: 'led_default',
    type: 'expense',
    amount: 2000,
    category_id: 'cat_exp_food_bf', // 早餐 (子类)
    transaction_date: currentMonthIso,
    sync_status: 'synced',
    created_at: currentMonthIso,
    updated_at: currentMonthIso,
  },
  {
    transaction_id: 'tx2',
    user_id: 'u1',
    ledger_id: 'led_default',
    type: 'expense',
    amount: 5000,
    category_id: 'cat_exp_food_lunch', // 午餐 (子类)
    transaction_date: currentMonthIso,
    sync_status: 'synced',
    created_at: currentMonthIso,
    updated_at: currentMonthIso,
  },
  {
    transaction_id: 'tx3',
    user_id: 'u1',
    ledger_id: 'led_default',
    type: 'expense',
    amount: 13000,
    category_id: 'cat_exp_food_dinner', // 晚餐 (子类)
    transaction_date: currentMonthIso,
    sync_status: 'synced',
    created_at: currentMonthIso,
    updated_at: currentMonthIso,
  },
  {
    transaction_id: 'tx4',
    user_id: 'u1',
    ledger_id: 'led_default',
    type: 'expense',
    amount: 150000,
    category_id: 'cat_exp_food_grocery', // 买菜 (子类)
    transaction_date: currentMonthIso,
    sync_status: 'synced',
    created_at: currentMonthIso,
    updated_at: currentMonthIso,
  },
  // 交通小分类：地铁 100元, 加油 300元 -> 交通共计 400元 (40000分, 占500元的 80% -> 预警)
  {
    transaction_id: 'tx5',
    user_id: 'u1',
    ledger_id: 'led_default',
    type: 'expense',
    amount: 10000,
    category_id: 'cat_exp_tr_metro', // 地铁
    transaction_date: currentMonthIso,
    sync_status: 'synced',
    created_at: currentMonthIso,
    updated_at: currentMonthIso,
  },
  {
    transaction_id: 'tx6',
    user_id: 'u1',
    ledger_id: 'led_default',
    type: 'expense',
    amount: 30000,
    category_id: 'cat_exp_tr_gas', // 加油
    transaction_date: currentMonthIso,
    sync_status: 'synced',
    created_at: currentMonthIso,
    updated_at: currentMonthIso,
  },
  // 娱乐小分类：游戏 350元 -> 娱乐共计 350元 (35000分, 占300元的 116.7% -> 超支!)
  {
    transaction_id: 'tx7',
    user_id: 'u1',
    ledger_id: 'led_default',
    type: 'expense',
    amount: 35000,
    category_id: 'cat_exp_ent_game', // 游戏
    transaction_date: currentMonthIso,
    sync_status: 'synced',
    created_at: currentMonthIso,
    updated_at: currentMonthIso,
  },
  // 收入和转账（不应计入支出预算）
  {
    transaction_id: 'tx8',
    user_id: 'u1',
    ledger_id: 'led_default',
    type: 'income',
    amount: 1000000,
    category_id: 'cat_inc_salary',
    transaction_date: currentMonthIso,
    sync_status: 'synced',
    created_at: currentMonthIso,
    updated_at: currentMonthIso,
  },
];

const overview = calculateBudgetOverview(mockBudgets, mockTransactions, categories, {
  ledgerId: 'led_default',
  period: 'monthly',
});

console.log('Calculated Overview:', JSON.stringify(overview, null, 2));

// 验证总预算
assert(overview.totalBudget, 'Total budget progress must be present');
assert.strictEqual(overview.totalBudget.budget_amount, 500000);
// 总支出 = 1700 + 400 + 350 = 2450元 (245000分)
assert.strictEqual(overview.totalBudget.spent_amount, 245000);
assert.strictEqual(overview.totalBudget.remaining_amount, 255000);
assert.strictEqual(overview.totalBudget.percentage, 49);
assert.strictEqual(overview.totalBudget.status, 'normal');

// 验证大分类预算
assert.strictEqual(overview.categoryBudgets.length, 3);

// 休闲娱乐 (超支，排序最前)
const entBudget = overview.categoryBudgets.find((b) => b.category_id === 'cat_exp_entertain');
assert(entBudget);
assert.strictEqual(entBudget.spent_amount, 35000);
assert.strictEqual(entBudget.remaining_amount, -5000);
assert.strictEqual(entBudget.status, 'exceeded');

// 餐饮美食 (85%，预警)
const foodBudget = overview.categoryBudgets.find((b) => b.category_id === 'cat_exp_food');
assert(foodBudget);
assert.strictEqual(foodBudget.spent_amount, 170000);
assert.strictEqual(foodBudget.remaining_amount, 30000);
assert.strictEqual(foodBudget.percentage, 85);
assert.strictEqual(foodBudget.status, 'warning');

// 交通出行 (80%，预警)
const trBudget = overview.categoryBudgets.find((b) => b.category_id === 'cat_exp_traffic');
assert(trBudget);
assert.strictEqual(trBudget.spent_amount, 40000);
assert.strictEqual(trBudget.remaining_amount, 10000);
assert.strictEqual(trBudget.percentage, 80);
assert.strictEqual(trBudget.status, 'warning');

// 验证分类排序：超支在最前
assert.strictEqual(overview.categoryBudgets[0].category_id, 'cat_exp_entertain');

console.log('\n🎉 ALL SHARED BUDGET CALCULATION TESTS PASSED SUCCESSFULLY! 🎉\n');
