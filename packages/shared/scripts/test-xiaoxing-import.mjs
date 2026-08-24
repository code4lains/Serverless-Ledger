import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  detectAndParseBillFile,
  parseXiaoxingLedgerWorkbook,
  getDefaultCategories,
  toYuan,
} from '../dist/index.js';
import * as XLSX from 'xlsx';

console.log('=== Running @ledger/shared Xiaoxing Ledger Import Unit Tests ===\n');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backupFilePath = path.resolve(__dirname, '../../../backup/小星记账_全部账本_2026-08-24_160524.xls');
assert(fs.existsSync(backupFilePath), `Backup file must exist at ${backupFilePath}`);

const fileBuffer = fs.readFileSync(backupFilePath);
const categories = getDefaultCategories();

console.log('--- 1. Testing detectAndParseBillFile with Buffer / ArrayBuffer ---');
const parseResult = detectAndParseBillFile(fileBuffer, '小星记账_全部账本_2026-08-24_160524.xls', categories, 'led_test');

console.log('Parse Result Format:', parseResult.format_name);
console.log('Total Rows:', parseResult.total_rows);
console.log('Valid Rows:', parseResult.valid_rows);
console.log('Total Expense (cents):', parseResult.total_expense, 'Yuan:', (parseResult.total_expense / 100).toFixed(2));
console.log('Total Income (cents):', parseResult.total_income, 'Yuan:', (parseResult.total_income / 100).toFixed(2));
console.log('Warnings/Breakdowns:', parseResult.warnings);

assert.strictEqual(parseResult.format_type, 'xiaoxing');
assert.strictEqual(parseResult.valid_rows, 2457);
assert.strictEqual(parseResult.total_expense, 7000434, 'Total expense must be exactly 70004.34 CNY');
assert.strictEqual(parseResult.total_income, 1068488, 'Total income must be exactly 10684.88 CNY');

console.log('\n--- 2. Validating Parsed Items Structure & Categories ---');
const sampleExpense = parseResult.items.find((i) => i.type === 'expense');
assert(sampleExpense, 'Must have at least one valid expense');
console.log('Sample Expense Item:', {
  date: sampleExpense.transaction_date,
  amount: sampleExpense.amount,
  type: sampleExpense.type,
  category_id: sampleExpense.category_id,
  category_name: sampleExpense.category_name,
  account: sampleExpense.from_account,
  remark: sampleExpense.remark,
});
assert(sampleExpense.category_id, 'Expense category_id should be mapped');
assert(sampleExpense.transaction_date.includes('T'), 'Date should be valid ISO string');

const sampleIncome = parseResult.items.find((i) => i.type === 'income');
assert(sampleIncome, 'Must have at least one valid income');
console.log('Sample Income Item:', {
  date: sampleIncome.transaction_date,
  amount: sampleIncome.amount,
  type: sampleIncome.type,
  category_id: sampleIncome.category_id,
  category_name: sampleIncome.category_name,
  account: sampleIncome.to_account,
  remark: sampleIncome.remark,
});
assert(sampleIncome.category_id, 'Income category_id should be mapped');

console.log('\n--- 3. Testing Category Mapping Distribution ---');
const unmappedCount = parseResult.items.filter((i) => !i.category_id).length;
console.log(`Unmapped categories count: ${unmappedCount} / ${parseResult.items.length}`);
assert.strictEqual(unmappedCount, 0, 'All transactions should have a mapped category');

console.log('\n🎉 ALL XIAOXING LEDGER IMPORT TESTS PASSED SUCCESSFULLY! 🎉');
