import assert from 'node:assert';
import {
  DEFAULT_CATEGORIES,
  getDefaultCategories,
  getDefaultExpenseCategories,
  getDefaultIncomeCategories,
  getInitialCategoryId,
  buildCategoryTree,
  getCategoryMeta,
} from '../dist/index.js';

console.log('=== Running @ledger/shared Category Unit Tests ===');

// 1. 测试默认分类总数与类型分布
const allCats = getDefaultCategories();
console.log(`Total default categories: ${allCats.length}`);
assert(allCats.length >= 40, 'Should have at least 40 default categories');

const expenseCats = getDefaultExpenseCategories();
const incomeCats = getDefaultIncomeCategories();
console.log(`Expense categories: ${expenseCats.length}, Income categories: ${incomeCats.length}`);

assert.strictEqual(expenseCats.length + incomeCats.length, allCats.length, 'Sum of expense and income must equal total');
assert(expenseCats.length >= 25, 'Should have sufficient expense categories');
assert(incomeCats.length >= 10, 'Should have sufficient income categories');

// 2. 测试大类与小类父子关联
const parentExpense = expenseCats.filter((c) => !c.parent_id);
const subExpense = expenseCats.filter((c) => !!c.parent_id);
console.log(`Expense parent categories: ${parentExpense.length}, subcategories: ${subExpense.length}`);
assert.strictEqual(parentExpense.length, 9, 'Should have 9 main expense categories');

const parentIncome = incomeCats.filter((c) => !c.parent_id);
const subIncome = incomeCats.filter((c) => !!c.parent_id);
console.log(`Income parent categories: ${parentIncome.length}, subcategories: ${subIncome.length}`);
assert.strictEqual(parentIncome.length, 3, 'Should have 3 main income categories');

// 验证所有小类的 parent_id 都必须存在于对应的大类中
const allParentIds = new Set(allCats.filter((c) => !c.parent_id).map((c) => c.category_id));
for (const sub of allCats.filter((c) => !!c.parent_id)) {
  assert(allParentIds.has(sub.parent_id), `Subcategory ${sub.name} (${sub.category_id}) parent_id (${sub.parent_id}) must exist`);
}

// 3. 测试 buildCategoryTree 树形结构构建
const expenseTree = buildCategoryTree(allCats, 'expense');
assert.strictEqual(expenseTree.length, 9, 'Expense tree should have 9 root nodes');
const foodNode = expenseTree.find((n) => n.category.category_id === 'cat_exp_food');
assert(foodNode, 'Food category node must exist in tree');
assert(foodNode.children.length >= 4, 'Food category should have at least 4 children (早餐, 午餐, 晚餐, 零食...)');
assert(foodNode.children.some((c) => c.name === '早餐'), 'Food children should contain 早餐');

const incomeTree = buildCategoryTree(allCats, 'income');
assert.strictEqual(incomeTree.length, 3, 'Income tree should have 3 root nodes');
const salaryNode = incomeTree.find((n) => n.category.category_id === 'cat_inc_salary');
assert(salaryNode, 'Salary category node must exist in tree');
assert(salaryNode.children.length >= 3, 'Salary category should have children');

// 4. 测试 getCategoryMeta 解析大类与小类路径
const bfMeta = getCategoryMeta('cat_exp_food_bf', allCats);
console.log('Subcategory Meta (cat_exp_food_bf):', bfMeta);
assert.strictEqual(bfMeta.name, '早餐');
assert.strictEqual(bfMeta.parentName, '餐饮美食');
assert.strictEqual(bfMeta.fullPath, '餐饮美食 · 早餐');
assert.strictEqual(bfMeta.isParent, false);

const foodMeta = getCategoryMeta('cat_exp_food', allCats);
console.log('Parent Meta (cat_exp_food):', foodMeta);
assert.strictEqual(foodMeta.name, '餐饮美食');
assert.strictEqual(foodMeta.fullPath, '餐饮美食');
assert.strictEqual(foodMeta.isParent, true);

// 5. 测试首选分类获取
const initialExp = getInitialCategoryId('expense', allCats);
assert.strictEqual(initialExp, 'cat_exp_food');
const initialInc = getInitialCategoryId('income', allCats);
assert.strictEqual(initialInc, 'cat_inc_salary');

console.log('🎉 ALL CATEGORY UNIT TESTS PASSED SUCCESSFULLY! 🎉\n');
