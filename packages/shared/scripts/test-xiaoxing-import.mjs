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
const categories = getDefaultCategories();

let fileBuffer;
let isSynthetic = false;

if (fs.existsSync(backupFilePath)) {
  console.log(`Found real backup file at: ${backupFilePath}`);
  fileBuffer = fs.readFileSync(backupFilePath);
} else {
  console.log('Local backup fixture not found in backup/ directory. Generating synthetic multi-sheet Xiaoxing workbook for test...');
  isSynthetic = true;

  // 构造包含支出、收入、转账、借贷、应付款、应收款的多 Sheet 工作簿
  const wb = XLSX.utils.book_new();

  const expenseData = [
    ['支出日期', '支出金额', '支出大类', '支出小类', '支出账户', '商家', '备注', '标签', '退款'],
    ['2026-08-24 12:30:00', 35.5, '餐饮', '午餐', '微信零钱', '美团外卖', '黄焖鸡米饭', '工作餐', 0],
    ['2026-08-24 18:00:00', 5.0, '交通', '地铁', '招商银行', '申通地铁', '下班通勤', '', 0],
    ['2026-08-23 09:00:00', 18.0, '餐饮', '早餐', '微信零钱', '肯德基', '早餐套餐', '', 0],
  ];
  const expenseSheet = XLSX.utils.aoa_to_sheet(expenseData);
  XLSX.utils.book_append_sheet(wb, expenseSheet, '支出');

  const incomeData = [
    ['收入日期', '收入金额', '收入大类', '收入小类', '收入账户', '商家', '备注', '标签'],
    ['2026-08-10 10:00:00', 15000.0, '收入', '基本工资', '招商银行', '公司人事', '8月份薪资', '薪资'],
    ['2026-08-15 14:00:00', 88.88, '收入', '红包', '微信零钱', '好友', '生日红包', ''],
  ];
  const incomeSheet = XLSX.utils.aoa_to_sheet(incomeData);
  XLSX.utils.book_append_sheet(wb, incomeSheet, '收入');

  const transferData = [
    ['转账日期', '转账金额', '转出账户', '转入账户', '备注', '标签'],
    ['2026-08-20 16:00:00', 1000.0, '工商银行', '微信零钱', '零钱充值', ''],
  ];
  const transferSheet = XLSX.utils.aoa_to_sheet(transferData);
  XLSX.utils.book_append_sheet(wb, transferSheet, '转账');

  const loanData = [
    ['借贷日期', '借贷金额', '借贷类别', '借贷对象', '账户', '备注'],
    ['2026-08-21 11:00:00', 500.0, '借出款项', '张三', '招商银行', '借给张三应急'],
  ];
  const loanSheet = XLSX.utils.aoa_to_sheet(loanData);
  XLSX.utils.book_append_sheet(wb, loanSheet, '借贷');

  const payableData = [
    ['支出日期', '支出金额', '支出账户', '商家', '备注'],
    ['2026-08-22 15:00:00', 200.0, '招商银行', '李四', '应付货款'],
  ];
  const payableSheet = XLSX.utils.aoa_to_sheet(payableData);
  XLSX.utils.book_append_sheet(wb, payableSheet, '应付款');

  const receivableData = [
    ['收入日期', '收入金额', '收入账户', '商家', '备注'],
    ['2026-08-22 16:00:00', 300.0, '招商银行', '王五', '应收咨询费'],
  ];
  const receivableSheet = XLSX.utils.aoa_to_sheet(receivableData);
  XLSX.utils.book_append_sheet(wb, receivableSheet, '应收款');

  fileBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xls' });
}

console.log('--- 1. Testing detectAndParseBillFile with Buffer / ArrayBuffer ---');
const parseResult = detectAndParseBillFile(fileBuffer, '小星记账_全部账本_2026-08-24_160524.xls', categories, 'led_test');

console.log('Parse Result Format:', parseResult.format_name);
console.log('Total Rows:', parseResult.total_rows);
console.log('Valid Rows:', parseResult.valid_rows);
console.log('Total Expense (cents):', parseResult.total_expense, 'Yuan:', (parseResult.total_expense / 100).toFixed(2));
console.log('Total Income (cents):', parseResult.total_income, 'Yuan:', (parseResult.total_income / 100).toFixed(2));
console.log('Total Transfer (cents):', parseResult.total_transfer, 'Yuan:', (parseResult.total_transfer / 100).toFixed(2));
console.log('Total Loan (cents):', parseResult.total_loan, 'Yuan:', (parseResult.total_loan / 100).toFixed(2));
console.log('Warnings/Breakdowns:', parseResult.warnings);

assert.strictEqual(parseResult.format_type, 'xiaoxing');

if (isSynthetic) {
  assert.strictEqual(parseResult.valid_rows, 9);
  assert.strictEqual(parseResult.total_expense, 5850, 'Total expense must be 58.50 CNY');
  assert.strictEqual(parseResult.total_income, 1508888, 'Total income must be 15088.88 CNY');
  assert.strictEqual(parseResult.total_transfer, 100000, 'Total transfer must be 1000.00 CNY');
  assert.strictEqual(parseResult.total_loan, 100000, 'Total loan must be 1000.00 CNY (500 + 200 + 300)');
} else {
  assert.strictEqual(parseResult.valid_rows, 2457);
  assert.strictEqual(parseResult.total_expense, 7000434, 'Total expense must be exactly 70004.34 CNY');
  assert.strictEqual(parseResult.total_income, 1068488, 'Total income must be exactly 10684.88 CNY');
}

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
