import assert from 'node:assert/strict';
import { detectAndParseBillFile, parseExcelDateValue, toCents, formatMoney } from '../dist/index.js';

console.log('Testing CSV and Money utils...');

// BUG-SH01
assert.equal(toCents('1,234.56'), 123456);
assert.equal(toCents('¥99.99'), 9999);
assert.equal(toCents(null), 0);

// BUG-SH07
assert.equal(formatMoney(-1234), '-¥12.34');
assert.equal(formatMoney(1234), '¥12.34');

// BUG-SH02 & Bug 10
const iso = '2026-08-21T12:00:00.000Z';
assert.equal(parseExcelDateValue(iso), iso);
assert.equal(parseExcelDateValue(null), null);
assert.equal(parseExcelDateValue(''), null);
assert.equal(parseExcelDateValue('   '), null);
assert.equal(parseExcelDateValue(undefined), null);
assert.equal(parseExcelDateValue('not-a-date'), null);

// BUG-SH03 & Bug 10: valid and invalid date rows
const alipayCsv = `"支付宝交易记录明细"
------------------------------------------------------------------------------------
交易号,商家订单号,交易时间,交易支付时间,最近修改时间,交易来源地,类型,交易对方,商品名称,金额（元）,收/支,交易状态,服务费（元）,成功退款（元）,备注,资金状态
20260821001,ORD001,2026-08-21 12:00:00,2026-08-21 12:00:00,2026-08-21 12:00:00,其他,即时到账,麦当劳,午餐套餐,38.50,支出,交易成功,0.00,0.00,好吃,已支出
20260821002,ORD002,,,,,即时到账,肯德基,午餐套餐,50.00,支出,交易成功,0.00,0.00,无日期,已支出
`;
const res = detectAndParseBillFile(alipayCsv, 'alipay.csv');
assert.equal(res.format_type, 'alipay');
assert.equal(res.valid_rows, 1);
assert.equal(res.invalid_rows, 1);
assert.equal(res.total_rows, 2);
assert.equal(res.items.length, 1);
assert.equal(res.items[0].amount, 3850);

// BUG N3: parseCsvString preserves whitespace for quoted fields
import { parseCsvString } from '../dist/index.js';
const testCsv = '  unquoted1  ,"  quoted with spaces  ",  unquoted2  \r\n" quoted line 2 ",unquoted3,""\n  hello  ," world "';
const parsed = parseCsvString(testCsv);
assert.deepEqual(parsed, [
  ['unquoted1', '  quoted with spaces  ', 'unquoted2'],
  [' quoted line 2 ', 'unquoted3', ''],
  ['hello', ' world '],
]);

console.log('CSV and Money tests passed!');
