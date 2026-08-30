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
