import assert from 'node:assert/strict';
import { calculateBudgetOverview } from '../dist/index.js';

console.log('Testing calculateBudgetOverview...');
const budgets = [
  { budget_id: 'b1', user_id: 'u1', ledger_id: 'led_1', period: 'monthly', category_id: null, amount: 500000 },
  { budget_id: 'b2', user_id: 'u1', ledger_id: 'led_2', period: 'monthly', category_id: null, amount: 300000 },
  { budget_id: 'b3', user_id: 'u1', ledger_id: 'led_1', period: 'monthly', category_id: 'cat_food', amount: 100000 },
  { budget_id: 'b4', user_id: 'u1', ledger_id: 'led_2', period: 'monthly', category_id: 'cat_food', amount: 50000 },
];
const transactions = [
  { transaction_id: 't1', user_id: 'u1', ledger_id: 'led_1', type: 'expense', amount: 20000, category_id: 'cat_food', transaction_date: '2026-08-10' },
  { transaction_id: 't2', user_id: 'u1', ledger_id: 'led_2', type: 'expense', amount: 10000, category_id: 'cat_food', transaction_date: '2026-08-11' },
];
const categories = [{ category_id: 'cat_food', name: '餐饮', type: 'expense', sort_order: 1, created_at: '', updated_at: '' }];
const overview = calculateBudgetOverview(budgets, transactions, categories, { ledgerId: 'all', period: 'monthly', year: 2026, month: 7 });
assert.equal(overview.totalBudget?.budget_amount, 800000, 'Total budget should be aggregated across all ledgers');
assert.equal(overview.categoryBudgets.length, 1, 'Category budgets should be grouped and deduplicated');
assert.equal(overview.categoryBudgets[0].budget_amount, 150000, 'Category budget limit should be aggregated');
assert.equal(overview.categoryBudgets[0].spent_amount, 30000, 'Category budget spent should be aggregated');

console.log('Budget tests passed!');
