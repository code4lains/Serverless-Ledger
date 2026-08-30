import assert from 'node:assert/strict';
import { buildCategoryTree, DEFAULT_CATEGORIES } from '../dist/index.js';

console.log('Testing buildCategoryTree...');
const tree = buildCategoryTree(DEFAULT_CATEGORIES, 'expense');
assert.ok(tree.length > 0, 'Category tree should have root categories');

// Test orphan categories (BUG-SH11)
const customCategories = [
  { category_id: 'root_1', name: '餐饮', type: 'expense', parent_id: null, sort_order: 1 },
  { category_id: 'sub_1', name: '早饭', type: 'expense', parent_id: 'root_1', sort_order: 1 },
  { category_id: 'orphan_1', name: '孤儿分类', type: 'expense', parent_id: 'missing_parent', sort_order: 2 },
];
const customTree = buildCategoryTree(customCategories, 'expense');
assert.equal(customTree.length, 2, 'Orphan categories should be retained as top-level nodes');
assert.ok(customTree.some((n) => n.category.category_id === 'orphan_1'), 'Orphan category must exist in tree');

console.log('Category tests passed!');
