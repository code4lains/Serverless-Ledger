import assert from 'node:assert';
import {
  DEFAULT_CATEGORIES,
  getDefaultCategories,
  getDefaultExpenseCategories,
  getDefaultIncomeCategories,
  getDefaultTransferCategories,
  getDefaultLoanCategories,
  getInitialCategoryId,
  buildCategoryTree,
  getCategoryMeta,
} from '../dist/index.js';

console.log('=== Running @ledger/shared Category Unit Tests ===');

// 1. 测试默认分类总数与类型分布
const allCats = getDefaultCategories();
console.log(`Total default categories: ${allCats.length}`);
assert(allCats.length >= 60, 'Should have at least 60 default categories including transfer and loan');

const expenseCats = getDefaultExpenseCategories();
const incomeCats = getDefaultIncomeCategories();
const transferCats = getDefaultTransferCategories();
const loanCats = getDefaultLoanCategories();
console.log(`Expense: ${expenseCats.length}, Income: ${incomeCats.length}, Transfer: ${transferCats.length}, Loan: ${loanCats.length}`);

assert.strictEqual(
  expenseCats.length + incomeCats.length + transferCats.length + loanCats.length,
  allCats.length,
  'Sum of all category types must equal total'
);
assert(expenseCats.length >= 25, 'Should have sufficient expense categories');
assert(incomeCats.length >= 10, 'Should have sufficient income categories');
assert(transferCats.length >= 5, 'Should have sufficient transfer categories');
assert(loanCats.length >= 6, 'Should have sufficient loan categories');

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

// 3. 测试 buildCategoryTree 树形结构构建与排序
const expenseTree = buildCategoryTree(allCats, 'expense');
assert.strictEqual(expenseTree.length, 9, 'Expense tree should have 9 root nodes');
const foodNode = expenseTree.find((n) => n.category.category_id === 'cat_exp_food');
assert(foodNode, 'Food category node must exist in tree');
assert(foodNode.children.length >= 4, 'Food category should have at least 4 children (早餐, 午餐, 晚餐, 零食...)');
assert(foodNode.children.some((c) => c.name === '早餐'), 'Food children should contain 早餐');

// 4. 测试自定义分类及其排序
const customCategoryList = [
  ...allCats,
  {
    category_id: 'cat_custom_parent',
    user_id: 'user_123',
    type: 'expense',
    parent_id: null,
    name: '数码极客',
    icon: 'Laptop',
    color: '#3B82F6',
    sort_order: 5, // 设为排在最前 (小于 10)
    created_at: '2026-08-22T00:00:00.000Z',
    updated_at: '2026-08-22T00:00:00.000Z',
  },
  {
    category_id: 'cat_custom_sub2',
    user_id: 'user_123',
    type: 'expense',
    parent_id: 'cat_custom_parent',
    name: 'Steam充值',
    icon: 'Gamepad2',
    color: '#8B5CF6',
    sort_order: 2,
    created_at: '2026-08-22T00:00:00.000Z',
    updated_at: '2026-08-22T00:00:00.000Z',
  },
  {
    category_id: 'cat_custom_sub1',
    user_id: 'user_123',
    type: 'expense',
    parent_id: 'cat_custom_parent',
    name: 'Switch游戏',
    icon: 'Gamepad2',
    color: '#EC4899',
    sort_order: 1,
    created_at: '2026-08-22T00:00:00.000Z',
    updated_at: '2026-08-22T00:00:00.000Z',
  },
];

const customTree = buildCategoryTree(customCategoryList, 'expense');
assert.strictEqual(customTree[0].category.category_id, 'cat_custom_parent', 'Custom category with sort_order=5 should be first');
assert.strictEqual(customTree[0].children[0].category_id, 'cat_custom_sub1', 'Subcategory Switch游戏 should be sorted first (sort_order=1)');
assert.strictEqual(customTree[0].children[1].category_id, 'cat_custom_sub2', 'Subcategory Steam充值 should be sorted second (sort_order=2)');

// 5. 测试 getCategoryMeta 解析自定义分类与颜色
const customMeta = getCategoryMeta('cat_custom_sub1', customCategoryList);
console.log('Custom Subcategory Meta:', customMeta);
assert.strictEqual(customMeta.name, 'Switch游戏');
assert.strictEqual(customMeta.parentName, '数码极客');
assert.strictEqual(customMeta.fullPath, '数码极客 · Switch游戏');
assert.strictEqual(customMeta.color, '#EC4899');
assert.strictEqual(customMeta.isParent, false);

// 6. 测试首选分类获取
const initialExp = getInitialCategoryId('expense', allCats);
assert.strictEqual(initialExp, 'cat_exp_food');
const initialInc = getInitialCategoryId('income', allCats);
assert.strictEqual(initialInc, 'cat_inc_salary');

console.log('🎉 ALL CATEGORY UNIT TESTS PASSED SUCCESSFULLY! 🎉\n');
