import assert from 'node:assert';
import {
  getDefaultCategories,
  parseCsvString,
  generateCsvString,
  exportTransactionsToCsv,
  exportTransactionsToJson,
  generateStandardCsvTemplate,
  detectAndParseBillCsv,
  matchCategoryByContext,
  toCents,
  toYuan,
} from '../dist/index.js';

console.log('=== Running @ledger/shared CSV Import & Export Unit Tests ===');

const categories = getDefaultCategories();
const mockLedgers = [
  { ledger_id: 'led_default', user_id: 'user_1', name: '日常账本', currency: 'CNY', is_default: 1, created_at: '', updated_at: '' },
  { ledger_id: 'led_travel', user_id: 'user_1', name: '旅行账本', currency: 'USD', is_default: 0, created_at: '', updated_at: '' },
];

// 1. 测试 RFC 4180 CSV 解析器 (支持引号、转义、换行与 BOM)
console.log('\n--- 1. Testing RFC 4180 CSV Parser ---');
const rawCsv = `\uFEFF"列1,带逗号","列2""带双引号""","列3
带换行",列4普通
123,456,"789,abc",def`;

const parsedRows = parseCsvString(rawCsv);
console.log('Parsed Rows:', parsedRows);
assert.strictEqual(parsedRows.length, 2, 'Should parse 2 rows');
assert.strictEqual(parsedRows[0][0], '列1,带逗号');
assert.strictEqual(parsedRows[0][1], '列2"带双引号"');
assert.strictEqual(parsedRows[0][2], '列3\n带换行');
assert.strictEqual(parsedRows[0][3], '列4普通');
assert.strictEqual(parsedRows[1][2], '789,abc');

// 2. 测试 generateCsvString 生成与 BOM 头
console.log('\n--- 2. Testing generateCsvString ---');
const generatedCsv = generateCsvString([
  ['标题1', '标题2,逗号', '标题3"引号"'],
  ['数据1', 100.5, '普通数据'],
]);
assert(generatedCsv.startsWith('\uFEFF'), 'CSV must start with UTF-8 BOM');
assert(generatedCsv.includes('"标题2,逗号"'), 'Comma cell must be quoted');
assert(generatedCsv.includes('"标题3""引号"""'), 'Quote cell must be escaped');

// 3. 测试标准模板生成
console.log('\n--- 3. Testing Standard CSV Template Generation ---');
const templateStr = generateStandardCsvTemplate();
assert(templateStr.length > 50, 'Template string should be non-empty');
const templateRows = parseCsvString(templateStr);
assert.strictEqual(templateRows[0][0], '记账时间');
assert(templateRows.length >= 5, 'Template should contain multiple sample rows');

// 4. 测试 账盾标准 CSV 导出与解析还原
console.log('\n--- 4. Testing Standard Export & Round-Trip Parse ---');
const mockTransactions = [
  {
    transaction_id: 'tx_exp_001',
    user_id: 'user_1',
    ledger_id: 'led_default',
    type: 'expense',
    amount: 3550, // 35.50 元
    category_id: 'cat_exp_food_lunch',
    transaction_date: '2026-08-20T12:30:00.000Z',
    remark: '午餐外卖麻辣烫',
    sync_status: 'synced',
    created_at: '2026-08-20T12:30:00.000Z',
    updated_at: '2026-08-20T12:30:00.000Z',
  },
  {
    transaction_id: 'tx_inc_001',
    user_id: 'user_1',
    ledger_id: 'led_default',
    type: 'income',
    amount: 1800000, // 18000.00 元
    category_id: 'cat_inc_sal_regular',
    transaction_date: '2026-08-15T10:00:00.000Z',
    remark: '8月工资到账',
    sync_status: 'synced',
    created_at: '2026-08-15T10:00:00.000Z',
    updated_at: '2026-08-15T10:00:00.000Z',
  },
  {
    transaction_id: 'tx_tr_001',
    user_id: 'user_1',
    ledger_id: 'led_default',
    type: 'transfer',
    amount: 50000, // 500.00 元
    from_account: '微信零钱',
    to_account: '招商银行',
    category_id: 'cat_tr_internal',
    transaction_date: '2026-08-18T15:00:00.000Z',
    remark: '微信零钱转出',
    sync_status: 'synced',
    created_at: '2026-08-18T15:00:00.000Z',
    updated_at: '2026-08-18T15:00:00.000Z',
  },
];

const exportedCsv = exportTransactionsToCsv(mockTransactions, categories, mockLedgers);
assert(exportedCsv.startsWith('\uFEFF'), 'Exported CSV must contain BOM');
assert(exportedCsv.includes('tx_exp_001'), 'Must contain transaction ID');
assert(exportedCsv.includes('35.50'), 'Must contain accurate Yuan amount');
assert(exportedCsv.includes('18000.00'), 'Must contain accurate Yuan amount');

// 反向解析
const standardParseResult = detectAndParseBillCsv(exportedCsv, categories, 'led_default');
console.log('Standard Parse Result:', {
  format: standardParseResult.format_name,
  valid_rows: standardParseResult.valid_rows,
  total_expense: standardParseResult.total_expense,
  total_income: standardParseResult.total_income,
  total_transfer: standardParseResult.total_transfer,
});
assert.strictEqual(standardParseResult.format_type, 'standard');
assert.strictEqual(standardParseResult.valid_rows, 3);
assert.strictEqual(standardParseResult.total_expense, 3550);
assert.strictEqual(standardParseResult.total_income, 1800000);
assert.strictEqual(standardParseResult.total_transfer, 50000);

// 5. 测试 JSON 备份导出
console.log('\n--- 5. Testing JSON Backup Export ---');
const exportedJson = exportTransactionsToJson(mockTransactions, categories, mockLedgers);
const parsedJson = JSON.parse(exportedJson);
assert.strictEqual(parsedJson.generator, 'Serverless-Ledger (账盾)');
assert.strictEqual(parsedJson.summary.total_count, 3);
assert.strictEqual(parsedJson.transactions.length, 3);

// 6. 测试 微信支付账单 CSV 智能识别与分类自动映射
console.log('\n--- 6. Testing WeChat Pay CSV Import & Auto Classification ---');
const wechatBillCsv = `微信支付账单明细,,,,,,,,,,
微信支付账单明细,,,,,,,,,,
生成时间：2026-08-20 18:00:00,,,,,,,,,,
交易时间,交易类型,交易对方,商品,收/支,金额(元),支付方式,当前状态,交易单号,商户单号,备注
2026-08-20 08:15:00,商户消费,肯德基,早餐帕尼尼套餐,支出,¥18.50,微信零钱,支付成功,wx_order_1001,sh_001,/
2026-08-20 12:45:00,商户消费,美团外卖,黄焖鸡米饭,支出,¥28.00,招商银行(1234),支付成功,wx_order_1002,sh_002,/
2026-08-20 18:30:00,扫二维码付款,申通地铁,乘车码扣费,支出,¥5.00,微信零钱,支付成功,wx_order_1003,sh_003,/
2026-08-19 16:00:00,微信红包,张三,微信红包,收入,¥88.88,/,已存入零钱,wx_order_1004,sh_004,恭喜发财
2026-08-18 10:00:00,商户消费,淘宝天猫,购买衣服,支出,¥299.00,零钱通,已全额退款,wx_order_1005,sh_005,/
`;

const wxResult = detectAndParseBillCsv(wechatBillCsv, categories, 'led_default');
console.log('WeChat Parse Result:', {
  format: wxResult.format_name,
  valid_rows: wxResult.valid_rows,
  total_expense: wxResult.total_expense,
  total_income: wxResult.total_income,
  items: wxResult.items.map((i) => ({
    type: i.type,
    amountYuan: toYuan(i.amount),
    cat: i.category_name,
    from: i.from_account,
    remark: i.remark,
  })),
});

assert.strictEqual(wxResult.format_type, 'wechat');
assert.strictEqual(wxResult.valid_rows, 4, 'Should parse 4 valid transactions (5th was fully refunded)');
assert.strictEqual(wxResult.total_expense, 1850 + 2800 + 500); // 51.50 -> 5150
assert.strictEqual(wxResult.total_income, 8888); // 88.88 -> 8888
assert(wxResult.items[0].category_name.includes('餐饮美食'), 'KFC should match food');
assert(wxResult.items[1].category_name.includes('午餐') || wxResult.items[1].category_name.includes('餐饮'), 'Meituan should match lunch or food');
assert(wxResult.items[2].category_name.includes('地铁') || wxResult.items[2].category_name.includes('交通'), 'Subway should match traffic');
assert(wxResult.items[3].category_name.includes('红包') || wxResult.items[3].category_name.includes('收入'), 'Redpacket should match income');

// 7. 测试 支付宝账单 CSV 智能识别与分类自动映射
console.log('\n--- 7. Testing Alipay CSV Import & Auto Classification ---');
const alipayBillCsv = `支付宝交易记录明细,,,,,,,,,,,
------------------------------------------------------------------------------------
交易时间,交易分类,交易对方,对方账号,商品说明,收/支,金额,收/付款方式,交易状态,交易订单号,商家订单号,备注
2026-08-20 07:30:00,交通出行,滴滴出行,,滴滴快车行程,支出,35.20,花呗,交易成功,ali_order_001,sh_ali_001,
2026-08-20 19:30:00,数码电器,Apple Store,,Apple Music 订阅,支出,11.00,招商银行储蓄卡(5678),交易成功,ali_order_002,sh_ali_002,
2026-08-15 09:00:00,收入,公司薪资发放,,8月份月薪,收入,16500.00,余额宝,交易成功,ali_order_003,sh_ali_003,
2026-08-10 14:00:00,其他,,,"",支出,50.00,余额,交易关闭,ali_order_004,sh_ali_004,
`;

const aliResult = detectAndParseBillCsv(alipayBillCsv, categories, 'led_default');
console.log('Alipay Parse Result:', {
  format: aliResult.format_name,
  valid_rows: aliResult.valid_rows,
  total_expense: aliResult.total_expense,
  total_income: aliResult.total_income,
  items: aliResult.items.map((i) => ({
    type: i.type,
    amountYuan: toYuan(i.amount),
    cat: i.category_name,
    from: i.from_account,
  })),
});

assert.strictEqual(aliResult.format_type, 'alipay');
assert.strictEqual(aliResult.valid_rows, 3, 'Should parse 3 valid transactions (4th was closed)');
assert.strictEqual(aliResult.total_expense, 3520 + 1100);
assert.strictEqual(aliResult.total_income, 1650000);
assert(aliResult.items[0].category_name.includes('交通') || aliResult.items[0].category_name.includes('出行'));
assert(aliResult.items[1].category_name.includes('数码') || aliResult.items[1].category_name.includes('购物'));
assert(aliResult.items[2].category_name.includes('工资') || aliResult.items[2].category_name.includes('薪资'));

// 8. 测试 通用第三方记账 CSV (自适应列推断)
console.log('\n--- 8. Testing Generic CSV Auto Adaptation ---');
const genericCsv = `Date,Type,Amount,Category,Remark,Account
2026-08-22,Expense,68.00,星巴克咖啡,和同事喝下午茶,招商银行
2026-08-21,Income,300.00,闲鱼转卖二手,出闲置手办,支付宝
2026-08-20,Transfer,1000.00,内部互转,还信用卡,工商银行
`;

const genResult = detectAndParseBillCsv(genericCsv, categories, 'led_travel');
console.log('Generic Parse Result:', {
  format: genResult.format_name,
  valid_rows: genResult.valid_rows,
  items: genResult.items,
});

assert.strictEqual(genResult.valid_rows, 3);
assert.strictEqual(genResult.total_expense, 6800);
assert.strictEqual(genResult.total_income, 30000);
assert.strictEqual(genResult.total_transfer, 100000);
assert.strictEqual(genResult.items[0].ledger_id, 'led_travel');
assert(genResult.items[0].category_name.includes('饮料') || genResult.items[0].category_name.includes('餐饮'));

console.log('\n🎉 ALL SHARED CSV IMPORT & EXPORT TESTS PASSED SUCCESSFULLY! 🎉\n');
