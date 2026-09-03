import assert from 'node:assert/strict';
import { detectAndParseBillFile } from '../dist/index.js';

console.log('Testing Bill Import Parsing...');
const wechatCsv = `微信支付账单明细
------------------------------------------------------------------------------------
交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注
2026-08-21 12:00:00,商户消费,星巴克,拿铁,支出,¥32.00,零钱,支付成功,4200000000000001,10000001,/
`;
const res = detectAndParseBillFile(wechatCsv, 'wechat.csv');
assert.equal(res.format_type, 'wechat');
assert.equal(res.valid_rows, 1);
assert.equal(res.items.length, 1);
assert.equal(res.items[0].amount, 3200);

console.log('Wechat Bill Import tests passed!');

console.log('Testing Xiaoxing Ledger Workbook parsing with thousand separators and currency symbols...');
import * as XLSX from 'xlsx';
import { parseXiaoxingLedgerWorkbook } from '../dist/index.js';

const wb = XLSX.utils.book_new();

// 1. 支出 sheet
const expData = [
  { '支出日期': '2026-09-01 10:00:00', '支出金额': '¥1,234.56', '支出大类': '餐饮', '支出小类': '午餐', '支出账户': '微信' },
  { '支出日期': '2026-09-01 11:00:00', '支出金额': '0', '支出大类': '餐饮', '支出小类': '午餐' }, // should be skipped
  { '支出日期': '2026-09-01 12:00:00', '支出金额': '-100', '支出大类': '餐饮', '支出小类': '午餐' }, // should be skipped
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expData), '支出');

// 2. 收入 sheet
const incData = [
  { '收入日期': '2026-09-01 10:00:00', '收入金额': '2,500.00', '收入大类': '职业', '收入小类': '工资', '收入账户': '招行' },
  { '收入日期': '2026-09-01 11:00:00', '收入金额': '¥0.00', '收入大类': '职业', '收入小类': '工资' }, // should be skipped
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(incData), '收入');

// 3. 转账 sheet
const trData = [
  { '转账日期': '2026-09-01 10:00:00', '金额': '¥3,000.00', '转出账户': '工行', '转入账户': '微信' },
  { '转账日期': '2026-09-01 11:00:00', '金额': '0', '转出账户': '工行', '转入账户': '微信' }, // should be skipped
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trData), '转账');

// 4. 借贷 sheet
const loanData = [
  { '借贷日期': '2026-09-01 10:00:00', '金额': '$1,500.00', '借贷类别': '借出', '借贷对象': '张三', '账户': '支付宝' },
  { '借贷日期': '2026-09-01 11:00:00', '金额': '-500', '借贷类别': '借出', '借贷对象': '张三' }, // should be skipped
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(loanData), '借贷');

// 5. 应付款 sheet
const payData = [
  { '支出日期': '2026-09-01 10:00:00', '支出金额': '5,000.50', '商家': '房东', '支出账户': '建行' },
  { '支出日期': '2026-09-01 11:00:00', '支出金额': '0.00', '商家': '房东' }, // should be skipped
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(payData), '应付款');

// 6. 应收款 sheet
const recData = [
  { '收入日期': '2026-09-01 10:00:00', '收入金额': '¥8,888.88', '商家': '李四', '收入账户': '微信' },
  { '收入日期': '2026-09-01 11:00:00', '收入金额': '', '商家': '李四' }, // should be skipped
];
XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recData), '应收款');

const parsedResult = parseXiaoxingLedgerWorkbook(wb, []);
assert.equal(parsedResult.valid_rows, 6, 'Should have 6 valid rows parsed');
assert.equal(parsedResult.invalid_rows, 7, 'Should have 7 invalid rows skipped');
assert.equal(parsedResult.total_expense, 123456, 'Expense amount should be 123456');
assert.equal(parsedResult.total_income, 250000, 'Income amount should be 250000');
assert.equal(parsedResult.total_transfer, 300000, 'Transfer amount should be 300000');
assert.equal(parsedResult.total_loan, 150000 + 500050 + 888888, 'Loan total should sum up correctly');

console.log('✅ Xiaoxing Ledger Workbook parsing tests passed successfully!');
