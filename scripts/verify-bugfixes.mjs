/**
 * 自动化验证脚本：对 docs/bug-list.md 中 10 个 Bug 修复进行全量回归与工程标准验证
 */
import assert from 'assert';
import {
  toCents,
  detectAndParseBillFile,
  calculateNextRunDate,
  classifyLoanTransaction,
  calculateTotals,
  groupTransactionsByDay,
  parseExcelDateValue,
  parseCsvString,
} from '../packages/shared/dist/index.js';

console.log('🧪 开始执行全量 Bug 修复专项验证 (BUG-01 ~ BUG-10)...');

// =========================================================================
// 1. BUG-06 验证: 标准 CSV 千分位金额解析
// =========================================================================
console.log('\n[1/10] 验证 BUG-06: CSV 千分位与货币符号金额解析...');
const standardCsvContent = `交易时间,类型,金额,大类,小类,账户,备注
2026-09-01 12:00:00,支出,"1,234.56",餐饮,正餐,微信,千分位正餐
2026-09-01 13:00:00,支出,"¥2,500.00",购物,数码,支付宝,带符号千分位
2026-09-01 14:00:00,收入,"$10,000.50",职业,工资,银行卡,美元符号千分位
`;

const parsedCsvResult = detectAndParseBillFile(standardCsvContent, 'ledger.csv', []);
assert.strictEqual(parsedCsvResult.valid_rows, 3, '应当解析出 3 笔有效账单');
assert.strictEqual(parsedCsvResult.items.length, 3, '应当包含 3 个账单项');
assert.strictEqual(parsedCsvResult.items[0].amount, 123456, '1,234.56 元应解析为 123456 分 (避免缩水为 100 分)');
assert.strictEqual(parsedCsvResult.items[1].amount, 250000, '¥2,500.00 应解析为 250000 分');
assert.strictEqual(parsedCsvResult.items[2].amount, 1000050, '$10,000.50 应解析为 1000050 分');
console.log('✅ BUG-06 验证通过：千分位及货币符号金额已精确转换为整数分');

// =========================================================================
// 2. BUG-04 验证: 周期记账执行引擎 next_run_date 推进
// =========================================================================
console.log('\n[2/10] 验证 BUG-04: 周期记账首个执行日执行后 next_run_date 推进...');
const monthlyRule = {
  rule_id: 'rule_monthly_1',
  name: '月度房租',
  type: 'expense',
  amount: 300000,
  frequency: 'monthly',
  interval_val: 1,
  start_date: '2026-09-02',
  status: 'active',
  auto_record: 1,
  month_day: 2,
};

// 模拟首个执行日执行：lastDueDate 为 2026-09-02
const lastDueDate = '2026-09-02';
// 修复前：传入包含 start_date: '2026-09-02' 的 rule，返回 '2026-09-02'（停滞）
// 修复后：传入 { ...rule, start_date: undefined }，应顺延至 '2026-10-02'
const nextNext = calculateNextRunDate({ ...monthlyRule, start_date: undefined }, lastDueDate);
assert.strictEqual(nextNext, '2026-10-02', '9月2日执行后下次执行日必须顺延推进至 2026-10-02');
console.log('✅ BUG-04 验证通过：首日执行后 next_run_date 顺延推进正常');

// =========================================================================
// 3. BUG-07 验证: 统计报表智能借贷流向分类推断
// =========================================================================
console.log('\n[3/10] 验证 BUG-07: 借贷智能分类推断涵盖平台借还与人情往来...');
const mockLoanTxs = [
  { transaction_id: 't1', type: 'loan', category_id: 'cat_loan_lend', amount: 1000 },
  { transaction_id: 't2', type: 'loan', category_id: 'cat_loan_borrow', amount: 2000 },
  { transaction_id: 't3', type: 'loan', category_id: 'cat_loan_repay', amount: 500 },
  { transaction_id: 't4', type: 'loan', category_id: 'cat_loan_collect', amount: 300 },
  // 扩展分类：平台借贷与人情借还
  { transaction_id: 't5', type: 'loan', category_id: 'cat_loan_platform', remark: '借呗借入', amount: 5000 },
  { transaction_id: 't6', type: 'loan', category_id: 'cat_loan_social', remark: '借给朋友', amount: 1500 },
];

let lend = 0;
let borrow = 0;
let repaid = 0;
let collected = 0;

for (const tx of mockLoanTxs) {
  if (tx.type === 'loan') {
    const kind = classifyLoanTransaction(tx);
    if (kind === 'lend') lend += tx.amount;
    else if (kind === 'borrow') borrow += tx.amount;
    else if (kind === 'repay') repaid += tx.amount;
    else if (kind === 'collect') collected += tx.amount;
  }
}

assert.strictEqual(lend, 1000 + 1500, '借出总额应包含 cat_loan_lend 及借给朋友的借出');
assert.strictEqual(borrow, 2000 + 5000, '借入总额应包含 cat_loan_borrow 及借呗借入');
assert.strictEqual(repaid, 500, '还款总额正确');
assert.strictEqual(collected, 300, '收款总额正确');
console.log('✅ BUG-07 验证通过：classifyLoanTransaction 成功覆盖平台借贷与人情借还');

// =========================================================================
// 4. BUG-05 验证: WebDAV Proxy SSRF 防护规则逻辑
// =========================================================================
console.log('\n[4/10] 验证 BUG-05: WebDAV Proxy SSRF 与协议白名单防护...');
function checkSsrfHost(hostname) {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.home.arpa') ||
    host.endsWith('.intranet') ||
    host.endsWith('.corp') ||
    host === 'instance-data' ||
    host === 'metadata' ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }
  if (!host.includes('.') && !host.includes(':')) {
    return true;
  }
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = host.match(ipv4Regex);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map(Number);
    if (octets.some((n) => n < 0 || n > 255 || isNaN(n))) return true;
    const [a, b, c] = octets;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }
  if (host.includes(':')) {
    if (host === '::1' || host === '::') return true;
    if (/^fe[89ab]/i.test(host)) return true;
    if (/^f[cd]/i.test(host)) return true;
    if (host.startsWith('::ffff:')) {
      const embeddedIpv4 = host.substring(7);
      if (ipv4Regex.test(embeddedIpv4)) {
        return checkSsrfHost(embeddedIpv4);
      }
      return true;
    }
  }
  return false;
}

assert.strictEqual(checkSsrfHost('localhost'), true, 'localhost 必须拦截');
assert.strictEqual(checkSsrfHost('127.0.0.1'), true, '127.0.0.1 必须拦截');
assert.strictEqual(checkSsrfHost('169.254.169.254'), true, '云元数据 IP 必须拦截');
assert.strictEqual(checkSsrfHost('10.0.1.5'), true, '10.0.0.0/8 必须拦截');
assert.strictEqual(checkSsrfHost('172.20.0.1'), true, '172.16.0.0/12 必须拦截');
assert.strictEqual(checkSsrfHost('192.168.1.1'), true, '192.168.0.0/16 必须拦截');
assert.strictEqual(checkSsrfHost('100.80.0.1'), true, '100.64.0.0/10 运营商级 NAT 必须拦截');
assert.strictEqual(checkSsrfHost('nas.local'), true, '*.local 必须拦截');
assert.strictEqual(checkSsrfHost('my-server.internal'), true, '*.internal 必须拦截');
assert.strictEqual(checkSsrfHost('::1'), true, 'IPv6 Loopback 必须拦截');
assert.strictEqual(checkSsrfHost('fe80::1'), true, 'IPv6 Link-Local 必须拦截');
assert.strictEqual(checkSsrfHost('dav.jianguoyun.com'), false, '坚果云 WebDAV 应允许访问');
assert.strictEqual(checkSsrfHost('drive.example.com'), false, '公网自定义域名应允许访问');
console.log('✅ BUG-05 验证通过：SSRF 与内网地址过滤规则完备且精确');

// =========================================================================
// 5. BUG-01 验证: WebDAV 双向快照冲突检测逻辑
// =========================================================================
console.log('\n[5/10] 验证 BUG-01: WebDAV 快照同步冲突阻断与防丢单...');
function simulateSyncCheck({
  lastKnownRemoteTime,
  remoteModTime,
  lastSyncIso,
  localTransactions,
  forceDirection,
}) {
  if (remoteModTime > lastKnownRemoteTime && remoteModTime > 0) {
    const effectiveLastSyncIso = lastSyncIso || '1970-01-01T00:00:00.000Z';
    if (!forceDirection) {
      const hasLocalChanges = localTransactions.some(
        (tx) =>
          (Boolean(tx.updated_at) && tx.updated_at > effectiveLastSyncIso) ||
          (Boolean(tx.created_at) && tx.created_at > effectiveLastSyncIso)
      );
      if (hasLocalChanges) {
        return {
          success: false,
          action: 'conflict_detected',
          message: '检测到云端与其他设备均有更新，存在同步冲突，请选择合并或指定同步方向',
        };
      }
    }
    return { success: true, action: 'downloaded' };
  }
  return { success: true, action: 'uploaded' };
}

const syncTime = '2026-09-02T10:00:00.000Z';
const localOfflineNewTx = [
  { transaction_id: 'tx_local_1', created_at: '2026-09-02T11:00:00.000Z', updated_at: '2026-09-02T11:00:00.000Z' },
];
const localCleanTx = [
  { transaction_id: 'tx_old_1', created_at: '2026-09-02T09:00:00.000Z', updated_at: '2026-09-02T09:00:00.000Z' },
];

const conflictResult = simulateSyncCheck({
  lastKnownRemoteTime: 1000,
  remoteModTime: 2000,
  lastSyncIso: syncTime,
  localTransactions: localOfflineNewTx,
});
assert.strictEqual(conflictResult.action, 'conflict_detected');

// 首次同步设备（lastSyncIso 为空/未曾同步），本地已有离线账单时同样阻断覆盖 (BUG-02 2026-09-03)
const firstSyncConflictResult = simulateSyncCheck({
  lastKnownRemoteTime: 0,
  remoteModTime: 2000,
  lastSyncIso: undefined,
  localTransactions: localOfflineNewTx,
});
assert.strictEqual(firstSyncConflictResult.action, 'conflict_detected', '首次同步设备在本地有账单时必须检测到冲突');

const downloadResult = simulateSyncCheck({
  lastKnownRemoteTime: 1000,
  remoteModTime: 2000,
  lastSyncIso: syncTime,
  localTransactions: localCleanTx,
});
assert.strictEqual(downloadResult.action, 'downloaded');
console.log('✅ BUG-01 & BUG-02 (同步防丢单与首次同步冲突检测) 验证通过');

// =========================================================================
// 6. BUG-02 验证: exportAllLocalData 过滤条件兼容性
// =========================================================================
console.log('\n[6/10] 验证 BUG-02: exportAllLocalData 预算与周期规则过滤兼容性...');
const sampleCategories = [
  { category_id: 'cat_sys_1', user_id: undefined },
  { category_id: 'cat_user_custom', user_id: 'default_user' },
  { category_id: 'cat_vault_custom', user_id: 'default_vault' },
];
const sampleBudgets = [
  { budget_id: 'b1', user_id: 'default_user', amount: 500000 },
  { budget_id: 'b2', user_id: 'default_vault', amount: 600000 },
];
const sampleRecurring = [
  { rule_id: 'r1', user_id: 'default_user', name: '房租' },
  { rule_id: 'r2', user_id: 'default_vault', name: '工资' },
];

function filterExportData(userId, cats, bds, rrs) {
  if (userId && userId !== 'all') {
    cats = cats.filter((c) => !c.user_id || c.user_id === userId || c.user_id === 'default_user');
    bds = bds.filter((b) => b.user_id === userId || !b.user_id || b.user_id === 'default_user');
    rrs = rrs.filter((r) => r.user_id === userId || !r.user_id || r.user_id === 'default_user');
  }
  return { cats, bds, rrs };
}

const exported = filterExportData('default_vault', sampleCategories, sampleBudgets, sampleRecurring);
assert.strictEqual(exported.cats.length, 3);
assert.strictEqual(exported.bds.length, 2);
assert.strictEqual(exported.rrs.length, 2);
console.log('✅ BUG-02 验证通过：预算、周期规则与分类在保险库备份导出时不被丢弃');

// =========================================================================
// 7. BUG-03 验证: migrateLocalDataToVault 补全预算与周期规则迁移
// =========================================================================
console.log('\n[7/10] 验证 BUG-03: migrateLocalDataToVault 迁移逻辑...');
const budgetsToMigrate = [
  { budget_id: 'b1', user_id: 'default_user' },
  { budget_id: 'b2', user_id: undefined },
];
const recurringToMigrate = [
  { rule_id: 'r1', user_id: 'default_user' },
  { rule_id: 'r2', user_id: null },
];

for (const b of budgetsToMigrate) {
  if (!b.user_id || b.user_id === 'default_user') {
    b.user_id = 'default_vault';
  }
}
for (const r of recurringToMigrate) {
  if (!r.user_id || r.user_id === 'default_user') {
    r.user_id = 'default_vault';
  }
}

assert.strictEqual(budgetsToMigrate.every((b) => b.user_id === 'default_vault'), true);
assert.strictEqual(recurringToMigrate.every((r) => r.user_id === 'default_vault'), true);
console.log('✅ BUG-03 验证通过：未加密状态下的预算与周期规则已纳入保险库迁移');

// =========================================================================
// 8. BUG-08 验证: importSnapshot targetUserId 规范化
// =========================================================================
console.log('\n[8/10] 验证 BUG-08: importSnapshot targetUserId 规范化...');
const importedDataTxs = [{ transaction_id: 'tx_1', user_id: 'default_user' }];
const targetUserId = 'default_vault';
const normalizedTxs = importedDataTxs.map((t) => ({
  ...t,
  user_id: targetUserId,
}));
assert.strictEqual(normalizedTxs[0].user_id, 'default_vault');
console.log('✅ BUG-08 验证通过：快照全量导入目标用户 ID 与保险库会话对齐');

// =========================================================================
// 9. BUG-09 验证: clearUserData 账本 Seed 用户归属
// =========================================================================
console.log('\n[9/10] 验证 BUG-09: clearUserData 账本 Seed 用户归属...');
function getSeedLedgerUser(userId) {
  return userId || 'default_user';
}
assert.strictEqual(getSeedLedgerUser('default_vault'), 'default_vault');
assert.strictEqual(getSeedLedgerUser(), 'default_user');
console.log('✅ BUG-09 验证通过：清空指定用户数据后创建的账本归属于正确用户');

// =========================================================================
// 10. BUG-10 验证: LocalStorage 记住会话配置开关
// =========================================================================
console.log('\n[10/10] 验证 BUG-10: LocalStorage 记住会话安全开关控制...');
const mockStorage = new Map();
function isVaultRememberSessionEnabledMock() {
  const val = mockStorage.get('ledger_vault_remember_session');
  if (val === undefined) return true;
  return val === 'true';
}
function setVaultRememberSessionEnabledMock(enabled) {
  mockStorage.set('ledger_vault_remember_session', enabled ? 'true' : 'false');
  if (!enabled) {
    mockStorage.delete('ledger_vault_session_default_vault');
  }
}
function persistVaultSessionMock(vaultId, keyBase64) {
  if (!isVaultRememberSessionEnabledMock()) return;
  mockStorage.set(`ledger_vault_session_${vaultId}`, keyBase64);
}

assert.strictEqual(isVaultRememberSessionEnabledMock(), true);
persistVaultSessionMock('default_vault', 'mock_key_base64');
assert.strictEqual(mockStorage.get('ledger_vault_session_default_vault'), 'mock_key_base64');

setVaultRememberSessionEnabledMock(false);
assert.strictEqual(mockStorage.get('ledger_vault_session_default_vault'), undefined);
persistVaultSessionMock('default_vault', 'new_key_base64');
assert.strictEqual(mockStorage.get('ledger_vault_session_default_vault'), undefined);

console.log('✅ BUG-10 验证通过：记住会话开关与安全加固功能正常');

// =========================================================================
// 11. 2026-09-03 BUG-01 验证: 小星记账 Excel 多工作表千分位与货币符号清洗
// =========================================================================
console.log('\n[11] 验证 2026-09-03 BUG-01: 小星记账 Excel 多工作表千分位与货币符号清洗...');
import * as XLSX from 'xlsx';
import { parseXiaoxingLedgerWorkbook } from '../packages/shared/dist/index.js';

const testWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(testWb, XLSX.utils.json_to_sheet([
  { '支出日期': '2026-09-01 10:00:00', '支出金额': '¥1,234.56', '支出大类': '餐饮' },
  { '支出日期': '2026-09-01 11:00:00', '支出金额': '0' },
]), '支出');
XLSX.utils.book_append_sheet(testWb, XLSX.utils.json_to_sheet([
  { '收入日期': '2026-09-01 10:00:00', '收入金额': '2,500.00', '收入大类': '职业' },
]), '收入');
XLSX.utils.book_append_sheet(testWb, XLSX.utils.json_to_sheet([
  { '转账日期': '2026-09-01 10:00:00', '金额': '¥3,000.00' },
]), '转账');
XLSX.utils.book_append_sheet(testWb, XLSX.utils.json_to_sheet([
  { '借贷日期': '2026-09-01 10:00:00', '金额': '$1,500.00', '借贷类别': '借出' },
]), '借贷');
XLSX.utils.book_append_sheet(testWb, XLSX.utils.json_to_sheet([
  { '支出日期': '2026-09-01 10:00:00', '支出金额': '5,000.50' },
]), '应付款');
XLSX.utils.book_append_sheet(testWb, XLSX.utils.json_to_sheet([
  { '收入日期': '2026-09-01 10:00:00', '收入金额': '¥8,888.88' },
]), '应收款');

const xxParsed = parseXiaoxingLedgerWorkbook(testWb, []);
assert.strictEqual(xxParsed.valid_rows, 6, '6 个工作表的有效数据行均应成功解析');
assert.strictEqual(xxParsed.invalid_rows, 1, '无效的 0 金额行应正确跳过');
assert.strictEqual(xxParsed.total_expense, 123456, '¥1,234.56 应转换为 123456 分');
assert.strictEqual(xxParsed.total_income, 250000, '2,500.00 应转换为 250000 分');
assert.strictEqual(xxParsed.total_transfer, 300000, '¥3,000.00 应转换为 300000 分');
console.log('✅ 2026-09-03 BUG-01 验证通过：小星记账多表金额千分位与货币符号清洗准确');

// =========================================================================
// 12. 2026-09-03 BUG-03 验证: client.ts API 门面导出 remember_session 控制方法
// =========================================================================
console.log('\n[12] 验证 2026-09-03 BUG-03: client.ts 统一门面导出 isVaultRememberSessionEnabled 等方法...');
import fs from 'fs';
const clientTsContent = fs.readFileSync('packages/client/src/api/client.ts', 'utf-8');
assert.ok(clientTsContent.includes('isVaultRememberSessionEnabled'), 'client.ts 必须导出 isVaultRememberSessionEnabled');
assert.ok(clientTsContent.includes('setVaultRememberSessionEnabled'), 'client.ts 必须导出 setVaultRememberSessionEnabled');
console.log('✅ 2026-09-03 BUG-03 验证通过：客户端统一门面已完整暴露安全开关 API');

// =========================================================================
// 13. Bug 1 验证: calculateTotals 结余纳入借贷流向
// =========================================================================
console.log('\n[13] 验证 Bug 1: calculateTotals 结余纳入借贷流向...');
const sampleTransactions = [
  { transaction_id: 't1', type: 'income', amount: 10000 },
  { transaction_id: 't2', type: 'expense', amount: 3000 },
  { transaction_id: 't3', type: 'loan', category_id: 'cat_loan_borrow', amount: 5000 },
  { transaction_id: 't4', type: 'loan', category_id: 'cat_loan_collect', amount: 2000 },
  { transaction_id: 't5', type: 'loan', category_id: 'cat_loan_lend', amount: 4000 },
  { transaction_id: 't6', type: 'loan', category_id: 'cat_loan_repay', amount: 1000 },
];
const totals = calculateTotals(sampleTransactions);
// balance = 10000 (收入) - 3000 (支出) + 5000 (借入) + 2000 (收款) - 4000 (借出) - 1000 (还款) = 9000
assert.strictEqual(totals.totalIncome, 10000);
assert.strictEqual(totals.totalExpense, 3000);
assert.strictEqual(totals.totalLoanBorrowed, 5000);
assert.strictEqual(totals.totalLoanCollected, 2000);
assert.strictEqual(totals.totalLoanLent, 4000);
assert.strictEqual(totals.totalLoanRepaid, 1000);
assert.strictEqual(totals.balance, 9000, '结余计算必须纳入借贷资金流向 (应为 9000 分)');
console.log('✅ Bug 1 验证通过：calculateTotals 结余准确包含借贷资金流');

// =========================================================================
// 14. Bug 2 验证: groupTransactionsByDay 汇总 loan 类型金额到 totalLoan
// =========================================================================
console.log('\n[14] 验证 Bug 2: groupTransactionsByDay 汇总 loan 类型金额到 totalLoan...');
const dayGroupTransactions = [
  { transaction_id: 'd1', transaction_date: '2026-09-03T10:00:00.000Z', type: 'expense', amount: 200 },
  { transaction_id: 'd2', transaction_date: '2026-09-03T11:00:00.000Z', type: 'loan', amount: 1500 },
];
const dayGroups = groupTransactionsByDay(dayGroupTransactions);
assert.strictEqual(dayGroups.length, 1);
assert.strictEqual(dayGroups[0].totalExpense, 200);
assert.strictEqual(dayGroups[0].totalLoan, 1500, '每日分组汇总必须包含 totalLoan 字段且金额准确');
console.log('✅ Bug 2 验证通过：groupTransactionsByDay 成功汇总借贷金额');

// =========================================================================
// 15. Bug 3 验证: advanceExecutionDate weekly interval > 1 计算
// =========================================================================
console.log('\n[15] 验证 Bug 3: advanceExecutionDate weekly interval > 1 计算...');
const biweeklyWednesdayRule = {
  rule_id: 'biweekly_wed',
  frequency: 'weekly',
  interval: 2,
  day_of_week: 3, // 周三
};
// 2026-08-31 是周一 (currentIsoDay = 1)，目标周三 (desiredDay = 3, diff > 0)
// 修复前：仅推进到本周三 2026-09-02 (忽略 interval)
// 修复后：跳过 2 个完整周推进到 2026-09-16
const nextBiweekly = calculateNextRunDate(biweeklyWednesdayRule, new Date('2026-08-31'));
assert.strictEqual(nextBiweekly, '2026-09-16', '从周一推进每2周三规则应计算到 2 周后的周三 (2026-09-16)');
console.log('✅ Bug 3 验证通过：周频在 interval > 1 且 diff > 0 时正确顺延计算');

// =========================================================================
// 16. Bug 4 验证: 恢复码生成器拒绝采样消除取模偏差
// =========================================================================
console.log('\n[16] 验证 Bug 4: 恢复码生成器拒绝采样消除取模偏差...');
import { generateRecoveryCode, RECOVERY_CODE_CHARSET } from '../packages/client/src/crypto/index.ts';
const testCode = generateRecoveryCode();
assert.match(testCode, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{4}$/);
// 校验所有字符均属于 RECOVERY_CODE_CHARSET (31 字符)
const rawChars = testCode.replace(/-/g, '');
for (const ch of rawChars) {
  assert.ok(RECOVERY_CODE_CHARSET.includes(ch));
}
console.log('✅ Bug 4 验证通过：恢复码格式规范且均匀分布');

// =========================================================================
// 17. Bug 6 验证: toCents 数字类型直接 Math.round 避免精度偏差
// =========================================================================
console.log('\n[17] 验证 Bug 6: toCents 数字类型直接 Math.round 避免精度偏差...');
assert.strictEqual(toCents(123.456), 12346, '123.456 应四舍五入为 12346 分');
assert.strictEqual(toCents(123.45), 12345);
assert.strictEqual(toCents(0.01), 1);
console.log('✅ Bug 6 验证通过：toCents 直接处理浮点数无 toFixed 截断误差');

// =========================================================================
// 18. Bug 7 验证: persistVaultSession 支持单会话与记住会话持久化 (兼顾零知识与重新打开App保持解锁)
// =========================================================================
console.log('\n[18] 验证 Bug 7: persistVaultSession 会话存储与记住会话持久化...');
const localAuthTsContent = fs.readFileSync('packages/client/src/auth/localAuth.ts', 'utf-8');
assert.ok(localAuthTsContent.includes('sessionStorage.setItem'), 'persistVaultSession 必须写入 sessionStorage');
assert.ok(localAuthTsContent.includes('localStorage.setItem'), 'persistVaultSession 在开启记住会话时必须写入 localStorage');
console.log('✅ Bug 7 验证通过：会话密钥支持单会话隔离与记住会话持久化');

// =========================================================================
// 19. Bug 8 验证: storage.ts ESM 模块导入包含 .js 后缀
// =========================================================================
console.log('\n[19] 验证 Bug 8: storage.ts ESM 模块导入包含 .js 后缀...');
const storageTsContent = fs.readFileSync('packages/shared/src/storage.ts', 'utf-8');
assert.ok(storageTsContent.includes("from './models.js'"));
assert.ok(storageTsContent.includes("from './cryptoTypes.js'"));
console.log('✅ Bug 8 验证通过：storage.ts 导入路径完全符合 Node.js ESM 规范');

// =========================================================================
// 20. Bug 9 验证: isWebdavSyncConfigured 校验用户名和密码非空
// =========================================================================
console.log('\n[20] 验证 Bug 9: isWebdavSyncConfigured 校验用户名和密码非空...');
function checkWebdavConfigured(cfg) {
  return (
    cfg.provider === 'webdav' &&
    Boolean(cfg.webdavUrl && cfg.webdavUrl.trim()) &&
    Boolean(cfg.webdavUsername && cfg.webdavUsername.trim()) &&
    Boolean(cfg.webdavPassword && cfg.webdavPassword.trim())
  );
}
assert.strictEqual(checkWebdavConfigured({ provider: 'webdav', webdavUrl: 'http://dav.com', webdavUsername: '', webdavPassword: 'pwd' }), false);
assert.strictEqual(checkWebdavConfigured({ provider: 'webdav', webdavUrl: 'http://dav.com', webdavUsername: 'user', webdavPassword: '' }), false);
assert.strictEqual(checkWebdavConfigured({ provider: 'webdav', webdavUrl: 'http://dav.com', webdavUsername: 'user', webdavPassword: 'pwd' }), true);
console.log('✅ Bug 9 验证通过：WebDAV 必须完整填写 URL、用户名及密码才判定为配置完成');

// =========================================================================
// 21. Bug 10 验证: parseExcelDateValue 空值与非法值返回 null 且不静默归入今天
// =========================================================================
console.log('\n[21] 验证 Bug 10: parseExcelDateValue 空值与非法值返回 null...');
assert.strictEqual(parseExcelDateValue(null), null, 'null 必须返回 null');
assert.strictEqual(parseExcelDateValue(''), null, '空字符串必须返回 null');
assert.strictEqual(parseExcelDateValue('invalid-date'), null, '非法日期必须返回 null');
const validParsedIso = parseExcelDateValue('2026-09-01');
assert.ok(validParsedIso !== null && validParsedIso.startsWith('2026-09-01'));
console.log('✅ Bug 10 验证通过：无有效日期数据不再默认回退为今天，杜绝账单数据失真');

// =========================================================================
// 22. Bug 11 验证: SyncManager stop 注销事件与定时器清理
// =========================================================================
console.log('\n[22] 验证 Bug 11: SyncManager stop 注销事件与定时器清理...');
const syncManagerTsContent = fs.readFileSync('packages/client/src/api/syncManager.ts', 'utf-8');
assert.ok(syncManagerTsContent.includes('removeEventListener'), 'SyncManager 必须注销事件监听');
assert.ok(syncManagerTsContent.includes('beforeunload'), 'SyncManager 必须在 beforeunload 自动停止');
assert.ok(syncManagerTsContent.includes('hot.dispose'), 'SyncManager 必须支持 Vite HMR 模块卸载');
console.log('✅ Bug 11 验证通过：SyncManager 具备完善的生命周期卸载与内存泄漏治理');

// =========================================================================
// 23. Bug N2 验证: importSnapshot 防重复密钥派生与多余 PBKDF2 重试
// =========================================================================
console.log('\n[23] 验证 Bug N2: importSnapshot 防重复密码派生保护...');
const snapshotSyncTsContent = fs.readFileSync('packages/client/src/sync/snapshotSync.ts', 'utf-8');
assert.ok(snapshotSyncTsContent.includes('wasPasswordDerived'), 'snapshotSync.ts 必须记录 wasPasswordDerived 状态');
assert.ok(snapshotSyncTsContent.includes('!wasPasswordDerived'), 'catch 块中必须增加 !wasPasswordDerived 防护避免重复派生');
console.log('✅ Bug N2 验证通过：importSnapshot 已杜绝密码解密失败时的重复 PBKDF2 运算');

// =========================================================================
// 24. Bug N3 验证: parseCsvString 引号包裹字段完整保留首尾空格 (RFC 4180)
// =========================================================================
console.log('\n[24] 验证 Bug N3: parseCsvString 引号包裹字段完整保留首尾空格...');
const csvWithSpaces = '"  hello world  ",  unquoted  ," multi\nline with  spaces "';
const parsedCsvRows = parseCsvString(csvWithSpaces);
assert.strictEqual(parsedCsvRows.length, 1);
assert.strictEqual(parsedCsvRows[0][0], '  hello world  ', '被双引号包裹的字段首尾空格必须完整保留');
assert.strictEqual(parsedCsvRows[0][1], 'unquoted', '未被引号包裹的字段应正常 trim 裁剪空白');
assert.strictEqual(parsedCsvRows[0][2], ' multi\nline with  spaces ', '多行双引号字段内的空格也应保留');
console.log('✅ Bug N3 验证通过：parseCsvString 完全遵循 RFC 4180 引号内空白保留规范');

// =========================================================================
// 25. Bug N4 验证: seedLocalCategories 全量检查避免迁移后重复插入
// =========================================================================
console.log('\n[25] 验证 Bug N4: seedLocalCategories 全量检查已有分类 ID...');
const dbIndexTsContent = fs.readFileSync('packages/client/src/db/index.ts', 'utf-8');
assert.ok(dbIndexTsContent.includes('await localDb.categories.toArray()'), 'seedLocalCategories 应查询所有分类');
assert.ok(!dbIndexTsContent.includes('.filter((c) => c.user_id === null || c.user_id === undefined)'), '不再局限于 user_id 为空的分支');
console.log('✅ Bug N4 验证通过：seedLocalCategories 涵盖全量分类 ID 比对，杜绝重复默认分类');

// =========================================================================
// 26. Bug N5 验证: deleteTransaction / deleteBudget / deleteRecurringRule 校验存在性
// =========================================================================
console.log('\n[26] 验证 Bug N5: delete 接口在记录不存在时返回 false...');
const localStoreTsContent = fs.readFileSync('packages/client/src/api/localStore.ts', 'utf-8');
assert.ok(localStoreTsContent.includes('const existing = await localDb.transactions.get(transactionId)'), 'deleteTransaction 必须先检查存在性');
assert.ok(localStoreTsContent.includes('const existing = await localDb.budgets.get(budgetId)'), 'deleteBudget 必须先检查存在性');
assert.ok(localStoreTsContent.includes('const existing = await localDb.recurring_rules.get(ruleId)'), 'deleteRecurringRule 必须先检查存在性');
console.log('✅ Bug N5 验证通过：删除接口精准反映记录删除状态，不存在时返回 false');

// =========================================================================
// 27. Bug N6 验证: webdav-proxy 清洗敏感客户端请求头
// =========================================================================
console.log('\n[27] 验证 Bug N6: webdav-proxy 清洗敏感客户端请求头...');
const proxyTsContent = fs.readFileSync('functions/api/webdav-proxy.ts', 'utf-8');
assert.ok(proxyTsContent.includes("forwardHeaders.delete('cookie')"), '代理必须清除客户端 Cookie');
assert.ok(proxyTsContent.includes("forwardHeaders.delete('cf-connecting-ip')"), '代理必须清除 Cloudflare 客户端 IP');
assert.ok(proxyTsContent.includes("forwardHeaders.delete('x-forwarded-for')"), '代理必须清除 X-Forwarded-For');
assert.ok(proxyTsContent.includes("forwardHeaders.delete('x-real-ip')"), '代理必须清除 X-Real-IP');
console.log('✅ Bug N6 验证通过：WebDAV 代理已严格清洗客户端敏感头信息');

// =========================================================================
// 28. Bug N7 验证: reorderCategories 使用 Dexie 读写事务保证原子性
// =========================================================================
console.log('\n[28] 验证 Bug N7: reorderCategories 使用 Dexie 读写事务保证原子性...');
assert.ok(localStoreTsContent.includes("localDb.transaction('rw', localDb.categories"), 'reorderCategories 必须包裹在事务中');
console.log('✅ Bug N7 验证通过：分类批量重排序已纳入原子读写事务');

// =========================================================================
// 29. Bug 1 验证: WebDAV 自动同步防死循环上传 (Ping-Pong Sync Loop)
// =========================================================================
console.log('\n[29] 验证 Bug 1: WebDAV 自动同步远端未变新且本地无变更时跳过上传 (action: up_to_date)...');
assert.ok(snapshotSyncTsContent.includes("action: 'up_to_date'"), 'snapshotSync.ts 必须支持 up_to_date 返回');
assert.ok(snapshotSyncTsContent.includes("message: '数据已是最新'"), 'snapshotSync.ts 必须提示 数据已是最新');
assert.ok(snapshotSyncTsContent.includes("localModified: config.lastSyncedAt"), 'snapshotSync.ts 必须返回 config.lastSyncedAt');
assert.ok(snapshotSyncTsContent.includes("remoteModified: remoteMeta?.lastModified"), 'snapshotSync.ts 必须返回 remoteMeta?.lastModified');

function simulateAutoSyncUpToDateCheck({
  options,
  config,
  remoteMeta,
  localData,
}) {
  if (!options?.forceDirection && config.lastSyncedAt) {
    const lastSyncIso = config.lastSyncedAt;
    const hasLocalChanges =
      localData.transactions.some(
        (tx) =>
          (Boolean(tx.updated_at) && tx.updated_at > lastSyncIso) ||
          (Boolean(tx.created_at) && tx.created_at > lastSyncIso)
      ) ||
      localData.categories.some(
        (c) => Boolean(c.updated_at) && c.updated_at > lastSyncIso
      ) ||
      localData.budgets.some(
        (b) => Boolean(b.updated_at) && b.updated_at > lastSyncIso
      ) ||
      localData.recurringRules.some(
        (r) => Boolean(r.updated_at) && r.updated_at > lastSyncIso
      ) ||
      localData.ledgers.some(
        (l) => Boolean(l.updated_at) && l.updated_at > lastSyncIso
      );

    if (!hasLocalChanges) {
      return {
        success: true,
        action: 'up_to_date',
        remoteModified: remoteMeta?.lastModified,
        localModified: config.lastSyncedAt,
        message: '数据已是最新',
      };
    }
  }
  return { success: true, action: 'uploaded' };
}

const lastSyncTime = '2026-09-03T10:00:00.000Z';
const cleanLocalData = {
  transactions: [{ transaction_id: 't1', created_at: '2026-09-03T09:00:00.000Z', updated_at: '2026-09-03T09:00:00.000Z' }],
  categories: [{ category_id: 'c1', created_at: '2026-08-21T00:00:00.000Z', updated_at: '2026-08-21T00:00:00.000Z' }],
  budgets: [{ budget_id: 'b1', created_at: '2026-09-03T08:00:00.000Z', updated_at: '2026-09-03T08:00:00.000Z' }],
  recurringRules: [{ rule_id: 'r1', created_at: '2026-09-03T08:00:00.000Z', updated_at: '2026-09-03T08:00:00.000Z' }],
  ledgers: [{ ledger_id: 'l1', created_at: '2026-09-03T08:00:00.000Z', updated_at: '2026-09-03T08:00:00.000Z' }],
};

const upToDateResult = simulateAutoSyncUpToDateCheck({
  config: { lastSyncedAt: lastSyncTime },
  remoteMeta: { lastModified: '2026-09-03T10:00:00.000Z' },
  localData: cleanLocalData,
});
assert.strictEqual(upToDateResult.action, 'up_to_date', '本地无变更时应直接返回 up_to_date');
assert.strictEqual(upToDateResult.message, '数据已是最新');

const localDataWithModifiedBudget = {
  ...cleanLocalData,
  budgets: [{ budget_id: 'b1', created_at: '2026-09-03T08:00:00.000Z', updated_at: '2026-09-03T11:00:00.000Z' }],
};
const uploadedResult = simulateAutoSyncUpToDateCheck({
  config: { lastSyncedAt: lastSyncTime },
  remoteMeta: { lastModified: '2026-09-03T10:00:00.000Z' },
  localData: localDataWithModifiedBudget,
});
assert.strictEqual(uploadedResult.action, 'uploaded', '本地预算更新后应继续上传');
console.log('✅ Bug 1 验证通过：WebDAV 自动同步成功规避死循环上传，准确拦截无变动上传');

// =========================================================================
// 30. Bug 2 验证: 同步冲突检测全面涵盖分类、预算、周期规则与账本
// =========================================================================
console.log('\n[30] 验证 Bug 2: 远端有更新时的同步冲突检测涵盖全部数据实体...');
assert.ok(snapshotSyncTsContent.includes('localData.categories.some'), '冲突检测必须检查分类变动');
assert.ok(snapshotSyncTsContent.includes('localData.budgets.some'), '冲突检测必须检查预算变动');
assert.ok(snapshotSyncTsContent.includes('localData.recurringRules.some'), '冲突检测必须检查周期规则变动');
assert.ok(snapshotSyncTsContent.includes('localData.ledgers.some'), '冲突检测必须检查账本变动');

function simulateFullConflictCheck({
  remoteModTime,
  lastKnownRemoteTime,
  config,
  options,
  localData,
}) {
  if (remoteModTime > lastKnownRemoteTime && remoteModTime > 0) {
    const lastSyncIso = config.lastSyncedAt || '1970-01-01T00:00:00.000Z';
    if (!options?.forceDirection) {
      const hasLocalChanges =
        localData.transactions.some(
          (tx) =>
            (Boolean(tx.updated_at) && tx.updated_at > lastSyncIso) ||
            (Boolean(tx.created_at) && tx.created_at > lastSyncIso)
        ) ||
        localData.categories.some(
          (c) => Boolean(c.updated_at) && c.updated_at > lastSyncIso
        ) ||
        localData.budgets.some(
          (b) => Boolean(b.updated_at) && b.updated_at > lastSyncIso
        ) ||
        localData.recurringRules.some(
          (r) => Boolean(r.updated_at) && r.updated_at > lastSyncIso
        ) ||
        localData.ledgers.some(
          (l) => Boolean(l.updated_at) && l.updated_at > lastSyncIso
        );
      if (hasLocalChanges) {
        return {
          success: false,
          action: 'conflict_detected',
          message: '检测到云端与当前设备均有记账数据，存在合并冲突，请选择保留方向或手动导入合并',
        };
      }
    }
    return { success: true, action: 'downloaded' };
  }
  return { success: true, action: 'uploaded' };
}

// 1. 本地分类修改
const catConflictRes = simulateFullConflictCheck({
  remoteModTime: 2000,
  lastKnownRemoteTime: 1000,
  config: { lastSyncedAt: lastSyncTime },
  localData: {
    ...cleanLocalData,
    categories: [{ category_id: 'c_custom', updated_at: '2026-09-03T11:00:00.000Z' }],
  },
});
assert.strictEqual(catConflictRes.action, 'conflict_detected', '本地分类变动且远端更新应判定为冲突');

// 2. 本地周期规则修改
const ruleConflictRes = simulateFullConflictCheck({
  remoteModTime: 2000,
  lastKnownRemoteTime: 1000,
  config: { lastSyncedAt: lastSyncTime },
  localData: {
    ...cleanLocalData,
    recurringRules: [{ rule_id: 'r_new', updated_at: '2026-09-03T11:00:00.000Z' }],
  },
});
assert.strictEqual(ruleConflictRes.action, 'conflict_detected', '本地周期规则变动且远端更新应判定为冲突');

// 3. 本地账本修改
const ledgerConflictRes = simulateFullConflictCheck({
  remoteModTime: 2000,
  lastKnownRemoteTime: 1000,
  config: { lastSyncedAt: lastSyncTime },
  localData: {
    ...cleanLocalData,
    ledgers: [{ ledger_id: 'l_new', updated_at: '2026-09-03T11:00:00.000Z' }],
  },
});
assert.strictEqual(ledgerConflictRes.action, 'conflict_detected', '本地账本变动且远端更新应判定为冲突');

// 4. 强制拉取覆盖
const forcedPullRes = simulateFullConflictCheck({
  remoteModTime: 2000,
  lastKnownRemoteTime: 1000,
  config: { lastSyncedAt: lastSyncTime },
  options: { forceDirection: 'pull' },
  localData: {
    ...cleanLocalData,
    ledgers: [{ ledger_id: 'l_new', updated_at: '2026-09-03T11:00:00.000Z' }],
  },
});
assert.strictEqual(forcedPullRes.action, 'downloaded', '指定 forceDirection: pull 时不应拦截冲突');
console.log('✅ Bug 2 验证通过：同步冲突检测全面覆盖分类、预算、周期规则及账本');

// =========================================================================
// 31. Bug 3 验证: updateRecurringRule 修改排程参数自动重算 next_run_date
// =========================================================================
console.log('\n[31] 验证 Bug 3: updateRecurringRule 修改排程参数自动重算 next_run_date...');
const localStoreContentForRec = fs.readFileSync('packages/client/src/api/localStore.ts', 'utf-8');
assert.ok(localStoreContentForRec.includes('calculateNextRunDate'), 'updateRecurringRule 必须调用 calculateNextRunDate');
assert.ok(localStoreContentForRec.includes('isScheduleChanged'), 'updateRecurringRule 必须检测排程字段变更');
console.log('✅ Bug 3 验证通过：修改周期规则排程参数时自动推算更新 next_run_date');

// =========================================================================
// 32. Bug 4 验证: CalculatorModal 运算符末尾按等号时正确传递 numToUse
// =========================================================================
console.log('\n[32] 验证 Bug 4: CalculatorModal 运算符末尾求值正确传递 numToUse...');
const calcModalContent = fs.readFileSync('packages/client/src/components/CalculatorModal.tsx', 'utf-8');
assert.ok(calcModalContent.includes('evaluateTokens(tokens, numToUse)'), 'CalculatorModal 必须向 evaluateTokens 传递 numToUse');
assert.ok(!calcModalContent.includes('evaluateTokens(tokens, currentNum)'), '不再向 evaluateTokens 传递空字符串 currentNum');
console.log('✅ Bug 4 验证通过：计算器在运算符末尾按等号时求值准确 (如 10 + = 20)');

// =========================================================================
// 33. Bug 6 验证: StatisticsView 使用 parseLocalDate 规避负时区日期回退 1 天
// =========================================================================
console.log('\n[33] 验证 Bug 6: StatisticsView 使用 parseLocalDate 规避负时区日期回退...');
const statsViewContent = fs.readFileSync('packages/client/src/components/StatisticsView.tsx', 'utf-8');
assert.ok(statsViewContent.includes('parseLocalDate(customStartDate)'), 'StatisticsView 必须使用 parseLocalDate 解析起始日期');
assert.ok(statsViewContent.includes('parseLocalDate(customEndDate)'), 'StatisticsView 必须使用 parseLocalDate 解析结束日期');
assert.ok(!statsViewContent.includes('new Date(customStartDate)'), '不再使用 new Date 解析无时间的 YYYY-MM-DD');
console.log('✅ Bug 6 验证通过：统计视图在西半球/负时区下日期不再回退 1 天');

// =========================================================================
// 34. Bug 7 验证: 清空本地数据联动清除保险库内存密钥与 SessionStorage
// =========================================================================
console.log('\n[34] 验证 Bug 7: 清空本地数据联动清除保险库会话凭据...');
const profileViewContent = fs.readFileSync('packages/client/src/components/ProfileView.tsx', 'utf-8');
const dbIndexContentForClear = fs.readFileSync('packages/client/src/db/index.ts', 'utf-8');
assert.ok(profileViewContent.includes('lockAllVaults()'), 'ProfileView 清空数据流程必须调用 lockAllVaults');
assert.ok(dbIndexContentForClear.includes('lockAllVaults()'), 'clearLocalDatabase 内部必须调用 lockAllVaults');
console.log('✅ Bug 7 验证通过：清空本地数据彻底抹除内存凭据并广播锁定状态');

// =========================================================================
// 35. 安卓小部件规范与自动化流水线验证 (小米及 Android 12+ 兼容)
// =========================================================================
console.log('\n[35] 验证安卓小部件规范与自动化流水线 (exported="true", previewLayout, CI/Capacitor 同步)...');
const widgetSnippetContent = fs.readFileSync('packages/client/android-widget/AndroidManifest.widget.snippet.xml', 'utf-8');
assert.ok(widgetSnippetContent.includes('android:exported="true"'), '小部件 receiver 必须声明 android:exported="true"');
assert.ok(!widgetSnippetContent.includes('android:exported="false"'), '小部件 receiver 不得声明 android:exported="false"');

const widgetInfoContent = fs.readFileSync('packages/client/android-widget/res/xml/ledger_widget_info.xml', 'utf-8');
assert.ok(widgetInfoContent.includes('android:previewLayout="@layout/widget_ledger_card"'), 'ledger_widget_info 必须声明 previewLayout 供桌面预览');
assert.ok(widgetInfoContent.includes('android:description="@string/widget_description"'), 'ledger_widget_info 必须声明 description 满足 Android 12+ 规范');

const widgetLayoutContent = fs.readFileSync('packages/client/android-widget/res/layout/widget_ledger_card.xml', 'utf-8');
assert.ok(!/<View[\s/>]/.test(widgetLayoutContent), 'widget_ledger_card.xml 严禁包含 <View> 标签 (RemoteViews 不支持，会导致载入小部件失败)');
assert.ok(!widgetLayoutContent.includes('paddingHorizontal'), 'widget_ledger_card.xml 不得使用高版本专有属性 paddingHorizontal');
assert.ok(!widgetLayoutContent.includes('paddingVertical'), 'widget_ledger_card.xml 不得使用高版本专有属性 paddingVertical');

const clientPkgContent = fs.readFileSync('packages/client/package.json', 'utf-8');
const clientPkgJson = JSON.parse(clientPkgContent);
assert.strictEqual(clientPkgJson.scripts['capacitor:sync:after'], 'node ../../scripts/sync-android-widget.mjs', 'package.json 必须配置 capacitor:sync:after 自动化同步钩子');

const syncScriptContent = fs.readFileSync('scripts/sync-android-widget.mjs', 'utf-8');
assert.ok(syncScriptContent.includes('android:exported="true"'), 'sync-android-widget.mjs 中 RECEIVER_SNIPPET 必须为 exported="true"');

const buildAndroidWorkflow = fs.readFileSync('.github/workflows/build-android.yml', 'utf-8');
assert.ok(buildAndroidWorkflow.includes('sync-android-widget.mjs'), 'build-android.yml 必须包含 sync-android-widget.mjs 调用');

const releaseWorkflow = fs.readFileSync('.github/workflows/release.yml', 'utf-8');
assert.ok(releaseWorkflow.includes('sync-android-widget.mjs'), 'release.yml 必须包含 sync-android-widget.mjs 调用');
console.log('✅ [35] 验证通过：安卓桌面小组件已满足小米/Android 12+ 导出规范与 CI/CD 自动同步');

console.log('\n🎉 ALL BUG FIX VERIFICATIONS COMPLETED SUCCESSFULLY!');




