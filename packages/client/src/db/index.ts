/**
 * 账盾 - 本地 IndexedDB 数据库引擎 (基于 Dexie.js)
 * 遵循《账盾 v3 架构设计》与 Local-First 规范
 */

import Dexie, { type Table } from 'dexie';
import {
  Transaction,
  Category,
  Ledger,
  Budget,
  RecurringRule,
  getDefaultCategories,
  VaultMetadata,
} from '@ledger/shared';

/**
 * 账盾 - 本地权威 IndexedDB 数据库
 */
export class LedgerLocalDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  ledgers!: Table<Ledger, string>;
  budgets!: Table<Budget, string>;
  recurring_rules!: Table<RecurringRule, string>;
  vault_meta!: Table<VaultMetadata, string>;

  constructor() {
    super('ServerlessLedgerDB');

    // 纯净版 v3 Schema: 移除 syncQueue 与 transactions.sync_status 索引
    this.version(6).stores({
      transactions: 'transaction_id, user_id, ledger_id, type, category_id, transaction_date, updated_at, [user_id+transaction_date], [user_id+ledger_id]',
      categories: 'category_id, user_id, type, parent_id, sort_order, updated_at',
      ledgers: 'ledger_id, user_id, is_default, updated_at',
      budgets: 'budget_id, user_id, ledger_id, category_id, period, updated_at, [user_id+ledger_id+period]',
      recurring_rules: 'rule_id, user_id, ledger_id, frequency, status, next_run_date, updated_at',
      vault_meta: 'id, created_at, updated_at',
    });
  }
}

export const localDb = new LedgerLocalDatabase();

/**
 * 本地存储统计分析
 */
export async function getLocalStorageStats() {
  const txCount = await localDb.transactions.count();
  const catCount = await localDb.categories.count();
  const ledgerCount = await localDb.ledgers.count();
  const budgetCount = await localDb.budgets.count();
  const recurringCount = await localDb.recurring_rules.count();
  const vaultCount = await localDb.vault_meta.count().catch(() => 0);

  return {
    transactions: txCount,
    categories: catCount,
    ledgers: ledgerCount,
    budgets: budgetCount,
    recurringRules: recurringCount,
    vaultMetaCount: vaultCount,
  };
}

/**
 * 预置本地基础分类（基于共享字典，确保离线及首次打开即可使用完整大类+小类二级联动）
 */
export async function seedLocalCategories() {
  const defaultCategories = getDefaultCategories();
  const existingCount = await localDb.categories.count();

  if (existingCount === 0) {
    await localDb.categories.bulkPut(defaultCategories);
  } else {
    // 检查并补全系统级默认分类（防止旧版本数据遗漏新增大类/小类）
    const existingCategories = await localDb.categories.toArray();
    const existingIds = new Set(existingCategories.map((c) => c.category_id));

    const missingDefaults = defaultCategories.filter((c) => !existingIds.has(c.category_id));
    if (missingDefaults.length > 0) {
      await localDb.categories.bulkPut(missingDefaults);
    }
  }
}

export const DEFAULT_LOCAL_LEDGER_ID = 'default_ledger';

/**
 * 预置本地默认日常账本 (确保首次冷启动时拥有可用账本)
 */
export async function seedLocalLedgers(userId?: string) {
  const effectiveUserId = userId || 'default_user';
  const existingCount = await localDb.ledgers.count();

  if (existingCount === 0) {
    const now = new Date().toISOString();
    const defaultLedger: Ledger = {
      ledger_id: DEFAULT_LOCAL_LEDGER_ID,
      user_id: effectiveUserId,
      name: '默认日常账本',
      currency: 'CNY',
      is_default: 1,
      created_at: now,
      updated_at: now,
    };
    await localDb.ledgers.put(defaultLedger);
  }
}

// ======================== 保险库元数据辅助操作 ========================

/**
 * 获取指定保险库元数据
 */
export async function getVaultMeta(vaultId: string = 'default_vault'): Promise<VaultMetadata | undefined> {
  return await localDb.vault_meta.get(vaultId);
}

/**
 * 保存或更新保险库元数据
 */
export async function saveVaultMeta(meta: VaultMetadata): Promise<string> {
  return await localDb.vault_meta.put(meta);
}

/**
 * 删除指定保险库元数据
 */
export async function deleteVaultMeta(vaultId: string = 'default_vault'): Promise<void> {
  await localDb.vault_meta.delete(vaultId);
}

/**
 * 导出全量本地数据 (用于快照与加密备份)
 */
export async function exportAllLocalData(userId?: string): Promise<{
  transactions: Transaction[];
  categories: Category[];
  ledgers: Ledger[];
  budgets: Budget[];
  recurringRules: RecurringRule[];
  vaultMeta?: VaultMetadata;
}> {
  let txs = await localDb.transactions.toArray();
  let cats = await localDb.categories.toArray();
  let leds = await localDb.ledgers.toArray();
  let bds = await localDb.budgets.toArray();
  let rrs = await localDb.recurring_rules.toArray();
  let vMeta = await localDb.vault_meta.get(userId || 'default_vault');

  if (userId && userId !== 'all') {
    txs = txs.filter((t) => t.user_id === userId || !t.user_id || t.user_id === 'default_user');
    cats = cats.filter((c) => !c.user_id || c.user_id === userId || c.user_id === 'default_user');
    leds = leds.filter((l) => l.user_id === userId || !l.user_id || l.user_id === 'default_user');
    bds = bds.filter((b) => b.user_id === userId || !b.user_id || b.user_id === 'default_user');
    rrs = rrs.filter((r) => r.user_id === userId || !r.user_id || r.user_id === 'default_user');
  }

  return {
    transactions: txs,
    categories: cats,
    ledgers: leds,
    budgets: bds,
    recurringRules: rrs,
    vaultMeta: vMeta,
  };
}

/**
 * 全量导入/恢复本地数据 (来自解密后的快照备份数据)
 */
export async function importAllLocalData(
  data: any,
  options?: { overwrite?: boolean; targetUserId?: string }
): Promise<{
  importedTransactions: number;
  importedLedgers: number;
  importedCategories: number;
  importedBudgets: number;
  importedRecurring: number;
}> {
  if (!data || typeof data !== 'object') {
    throw new Error('无效的本地数据格式');
  }

  const { transactions = [], categories = [], ledgers = [], budgets = [], recurringRules = [], vaultMeta } = data;
  const targetUser = options?.targetUserId || 'default_user';

  let importedTxCount = 0;
  let importedLedCount = 0;
  let importedCatCount = 0;
  let importedBdCount = 0;
  let importedRrCount = 0;

  await localDb.transaction(
    'rw',
    [
      localDb.transactions,
      localDb.categories,
      localDb.ledgers,
      localDb.budgets,
      localDb.recurring_rules,
      localDb.vault_meta,
    ],
    async () => {
      if (options?.overwrite) {
        if (options.targetUserId) {
          await localDb.transactions.where('user_id').equals(options.targetUserId).delete();
          await localDb.categories.where('user_id').equals(options.targetUserId).delete();
          await localDb.ledgers.where('user_id').equals(options.targetUserId).delete();
          await localDb.budgets.where('user_id').equals(options.targetUserId).delete();
          await localDb.recurring_rules.where('user_id').equals(options.targetUserId).delete();
        } else {
          await localDb.transactions.clear();
          await localDb.categories.clear();
          await localDb.ledgers.clear();
          await localDb.budgets.clear();
          await localDb.recurring_rules.clear();
        }
      }

      if (Array.isArray(categories) && categories.length > 0) {
        await localDb.categories.bulkPut(categories);
        importedCatCount = categories.length;
      }

      if (Array.isArray(ledgers) && ledgers.length > 0) {
        const normalizedLedgers = ledgers.map((l: Ledger) => ({
          ...l,
          user_id: options?.targetUserId ? targetUser : (l.user_id || targetUser),
        }));
        await localDb.ledgers.bulkPut(normalizedLedgers);
        importedLedCount = normalizedLedgers.length;
      }

      if (Array.isArray(budgets) && budgets.length > 0) {
        const normalizedBudgets = budgets.map((b: Budget) => ({
          ...b,
          user_id: options?.targetUserId ? targetUser : (b.user_id || targetUser),
        }));
        await localDb.budgets.bulkPut(normalizedBudgets);
        importedBdCount = normalizedBudgets.length;
      }

      if (Array.isArray(recurringRules) && recurringRules.length > 0) {
        const normalizedRules = recurringRules.map((r: RecurringRule) => ({
          ...r,
          user_id: options?.targetUserId ? targetUser : (r.user_id || targetUser),
        }));
        await localDb.recurring_rules.bulkPut(normalizedRules);
        importedRrCount = normalizedRules.length;
      }

      if (Array.isArray(transactions) && transactions.length > 0) {
        const normalizedTxs = transactions.map((t: Transaction) => ({
          ...t,
          user_id: options?.targetUserId ? targetUser : (t.user_id || targetUser),
        }));
        await localDb.transactions.bulkPut(normalizedTxs);
        importedTxCount = normalizedTxs.length;
      }

      if (vaultMeta && typeof vaultMeta === 'object' && vaultMeta.id) {
        await localDb.vault_meta.put(vaultMeta);
      }
    }
  );

  await seedLocalCategories();
  await seedLocalLedgers();

  return {
    importedTransactions: importedTxCount,
    importedLedgers: importedLedCount,
    importedCategories: importedCatCount,
    importedBudgets: importedBdCount,
    importedRecurring: importedRrCount,
  };
}

/**
 * 当保险库初始化时自动迁移未加密或访客数据
 */
export async function migrateLocalDataToVault(vaultId: string = 'default_vault'): Promise<{
  migratedTransactions: number;
  migratedLedgers: number;
  migratedCategories: number;
  migratedBudgets: number;
  migratedRecurringRules: number;
}> {
  let txCount = 0;
  let ledCount = 0;
  let catCount = 0;
  let bdCount = 0;
  let rrCount = 0;

  await localDb.transaction(
    'rw',
    [
      localDb.transactions,
      localDb.ledgers,
      localDb.categories,
      localDb.budgets,
      localDb.recurring_rules,
    ],
    async () => {
      const txs = await localDb.transactions
        .filter((t) => !t.user_id || t.user_id === 'default_user')
        .toArray();
      for (const t of txs) {
        t.user_id = vaultId;
        await localDb.transactions.put(t);
        txCount++;
      }

      const leds = await localDb.ledgers
        .filter((l) => !l.user_id || l.user_id === 'default_user')
        .toArray();
      for (const l of leds) {
        l.user_id = vaultId;
        await localDb.ledgers.put(l);
        ledCount++;
      }

      const cats = await localDb.categories
        .filter((c) => c.user_id === 'default_user')
        .toArray();
      for (const c of cats) {
        c.user_id = vaultId;
        await localDb.categories.put(c);
        catCount++;
      }

      const bds = await localDb.budgets
        .filter((b) => !b.user_id || b.user_id === 'default_user')
        .toArray();
      for (const b of bds) {
        b.user_id = vaultId;
        await localDb.budgets.put(b);
        bdCount++;
      }

      const rrs = await localDb.recurring_rules
        .filter((r) => !r.user_id || r.user_id === 'default_user')
        .toArray();
      for (const r of rrs) {
        r.user_id = vaultId;
        await localDb.recurring_rules.put(r);
        rrCount++;
      }
    }
  );

  return {
    migratedTransactions: txCount,
    migratedLedgers: ledCount,
    migratedCategories: catCount,
    migratedBudgets: bdCount,
    migratedRecurringRules: rrCount,
  };
}

/**
 * 清除指定用户的本地私有数据
 */
export async function clearUserData(userId?: string): Promise<void> {
  if (!userId || userId === 'all') {
    await clearLocalDatabase();
    return;
  }

  await localDb.transaction(
    'rw',
    [
      localDb.transactions,
      localDb.categories,
      localDb.ledgers,
      localDb.budgets,
      localDb.recurring_rules,
      localDb.vault_meta,
    ],
    async () => {
      await localDb.transactions.where('user_id').equals(userId).delete();
      await localDb.categories.where('user_id').equals(userId).delete();
      await localDb.ledgers.where('user_id').equals(userId).delete();
      await localDb.budgets.where('user_id').equals(userId).delete();
      await localDb.recurring_rules.where('user_id').equals(userId).delete();
      await localDb.vault_meta.where('id').equals(userId).delete();
    }
  );

  await seedLocalCategories();
  await seedLocalLedgers(userId);
}

/**
 * 清空本地数据库所有关联数据并重置为初始状态
 */
export async function clearLocalDatabase() {
  await localDb.transactions.clear();
  await localDb.categories.clear();
  await localDb.ledgers.clear();
  await localDb.budgets.clear();
  await localDb.recurring_rules.clear();
  await localDb.vault_meta.clear();
  await seedLocalCategories();
  await seedLocalLedgers();
}
