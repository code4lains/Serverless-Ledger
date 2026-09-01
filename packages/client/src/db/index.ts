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

export type SyncEntityType = 'transaction' | 'category' | 'ledger' | 'budget' | 'recurring';
export type SyncActionType = 'create' | 'update' | 'delete' | 'reorder' | 'set_default' | 'batch_set';

/**
 * 离线变更队列项模型 (用于离线操作记录与时序重放，防止离线删除复活)
 */
export interface SyncQueueItem {
  id: string; // 唯一 UUID
  user_id?: string;
  entity_type: SyncEntityType;
  entity_id: string;
  action: SyncActionType;
  payload?: any;
  created_at: string;
  attempts: number;
  last_error?: string;
}

/**
 * 账盾 - 本地 IndexedDB 数据库 (基于 Dexie.js v5 架构)
 * 践行《白皮书 6.1 离线优先 Offline-First》与《7.3 本地安全保险库与端到端加密》规范
 */
export class LedgerLocalDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  ledgers!: Table<Ledger, string>;
  budgets!: Table<Budget, string>;
  recurring_rules!: Table<RecurringRule, string>;
  syncQueue!: Table<SyncQueueItem, string>;
  vault_meta!: Table<VaultMetadata, string>;

  constructor() {
    super('ServerlessLedgerDB');
    this.version(1).stores({
      transactions: 'transaction_id, user_id, ledger_id, type, category_id, transaction_date, sync_status, updated_at',
      categories: 'category_id, user_id, type, parent_id, sort_order',
      ledgers: 'ledger_id, user_id, is_default',
      budgets: 'budget_id, user_id, ledger_id, category_id, period',
    });

    this.version(2).stores({
      transactions: 'transaction_id, user_id, ledger_id, type, category_id, transaction_date, sync_status, updated_at',
      categories: 'category_id, user_id, type, parent_id, sort_order, updated_at',
      ledgers: 'ledger_id, user_id, is_default, updated_at',
      budgets: 'budget_id, user_id, ledger_id, category_id, period, updated_at',
      syncQueue: 'id, user_id, entity_type, entity_id, action, created_at, attempts',
    });

    this.version(3).stores({
      transactions: 'transaction_id, user_id, ledger_id, type, category_id, transaction_date, sync_status, updated_at',
      categories: 'category_id, user_id, type, parent_id, sort_order, updated_at',
      ledgers: 'ledger_id, user_id, is_default, updated_at',
      budgets: 'budget_id, user_id, ledger_id, category_id, period, updated_at',
      recurring_rules: 'rule_id, user_id, ledger_id, frequency, status, next_run_date, updated_at',
      syncQueue: 'id, user_id, entity_type, entity_id, action, created_at, attempts',
    });

    this.version(4)
      .stores({
        transactions: 'transaction_id, user_id, ledger_id, type, category_id, transaction_date, sync_status, updated_at, [user_id+transaction_date], [user_id+ledger_id]',
        categories: 'category_id, user_id, type, parent_id, sort_order, updated_at',
        ledgers: 'ledger_id, user_id, is_default, updated_at',
        budgets: 'budget_id, user_id, ledger_id, category_id, period, updated_at, [user_id+ledger_id+period]',
        recurring_rules: 'rule_id, user_id, ledger_id, frequency, status, next_run_date, updated_at',
        syncQueue: 'id, user_id, entity_type, entity_id, action, created_at, attempts',
      })
      .upgrade(async (tx) => {
        // 标准化流水状态与字段类型
        await tx
          .table('transactions')
          .toCollection()
          .modify((t: any) => {
            if (!t.sync_status || (t.sync_status !== 'pending' && t.sync_status !== 'conflict')) {
              t.sync_status = 'synced';
            }
            if (typeof t.amount !== 'number') {
              t.amount = Number(t.amount) || 0;
            }
          });
        // 标准化账本 is_default 标识为 0/1 整型
        await tx
          .table('ledgers')
          .toCollection()
          .modify((l: any) => {
            l.is_default = l.is_default ? 1 : 0;
          });
        // 标准化周期规则 auto_record 为 0/1 整型
        await tx
          .table('recurring_rules')
          .toCollection()
          .modify((r: any) => {
            r.auto_record = r.auto_record !== 0 ? 1 : 0;
          });
      });

    // Dexie Schema Version 5: 升级本地安全保险库与端到端加密元数据表
    this.version(5)
      .stores({
        transactions: 'transaction_id, user_id, ledger_id, type, category_id, transaction_date, sync_status, updated_at, [user_id+transaction_date], [user_id+ledger_id]',
        categories: 'category_id, user_id, type, parent_id, sort_order, updated_at',
        ledgers: 'ledger_id, user_id, is_default, updated_at',
        budgets: 'budget_id, user_id, ledger_id, category_id, period, updated_at, [user_id+ledger_id+period]',
        recurring_rules: 'rule_id, user_id, ledger_id, frequency, status, next_run_date, updated_at',
        syncQueue: 'id, user_id, entity_type, entity_id, action, created_at, attempts',
        vault_meta: 'id, created_at, updated_at',
      })
      .upgrade(async (tx) => {
        // 确保旧版本升级后数据的默认用户归属与一致性
        await tx
          .table('transactions')
          .toCollection()
          .modify((t: any) => {
            if (!t.user_id) {
              t.user_id = 'default_user';
            }
          });
      });
  }
}

export const localDb = new LedgerLocalDatabase();

/**
 * 将离线操作加入同步队列 (包含防重复与操作压缩合并逻辑)
 */
export async function enqueueSyncAction(
  action: Omit<SyncQueueItem, 'id' | 'created_at' | 'attempts'>
): Promise<SyncQueueItem> {
  const now = new Date().toISOString();
  const id = `sq_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // 检查是否已有针对该实体的待处理队列项
  const existingItems = await localDb.syncQueue
    .where('entity_id')
    .equals(action.entity_id)
    .toArray();

  if (existingItems.length > 0) {
    if (action.action === 'delete') {
      // 若是删除操作，先清除之前所有的 create/update 操作
      for (const item of existingItems) {
        await localDb.syncQueue.delete(item.id);
      }
    } else if (action.action === 'update') {
      // 若之前已有 create，则保留 create 并更新 payload
      const prevCreate = existingItems.find((i) => i.action === 'create');
      if (prevCreate) {
        prevCreate.payload = { ...prevCreate.payload, ...action.payload };
        prevCreate.created_at = now;
        await localDb.syncQueue.put(prevCreate);
        return prevCreate;
      }
    }
  }

  const queueItem: SyncQueueItem = {
    id,
    user_id: action.user_id,
    entity_type: action.entity_type,
    entity_id: action.entity_id,
    action: action.action,
    payload: action.payload,
    created_at: now,
    attempts: 0,
  };

  await localDb.syncQueue.put(queueItem);
  return queueItem;
}

/**
 * 获取待同步的离线变更队列列表 (按发生时间升序排列，保证操作时序)
 */
export async function getPendingSyncQueue(userId?: string): Promise<SyncQueueItem[]> {
  let list = await localDb.syncQueue.orderBy('created_at').toArray();
  if (userId) {
    list = list.filter((item) => !item.user_id || item.user_id === userId || item.user_id === 'default_user');
  }
  return list;
}

/**
 * 移除已成功同步的队列项
 */
export async function removeSyncQueueItem(id: string): Promise<void> {
  await localDb.syncQueue.delete(id);
}

/**
 * 更新失败重试次数与错误信息
 */
export async function incrementSyncQueueAttempts(id: string, error?: string): Promise<void> {
  const item = await localDb.syncQueue.get(id);
  if (item) {
    item.attempts += 1;
    item.last_error = error;
    await localDb.syncQueue.put(item);
  }
}

/**
 * 清空队列
 */
export async function clearSyncQueue(userId?: string): Promise<void> {
  if (userId) {
    const items = await localDb.syncQueue.where('user_id').equals(userId).toArray();
    for (const item of items) {
      await localDb.syncQueue.delete(item.id);
    }
  } else {
    await localDb.syncQueue.clear();
  }
}

/**
 * 本地存储统计分析
 */
export async function getLocalStorageStats() {
  const txCount = await localDb.transactions.count();
  const catCount = await localDb.categories.count();
  const ledgerCount = await localDb.ledgers.count();
  const budgetCount = await localDb.budgets.count();
  const recurringCount = await localDb.recurring_rules.count();
  const queueCount = await localDb.syncQueue.count();
  const pendingTxCount = await localDb.transactions.where('sync_status').equals('pending').count();
  const vaultCount = await localDb.vault_meta.count().catch(() => 0);

  return {
    transactions: txCount,
    categories: catCount,
    ledgers: ledgerCount,
    budgets: budgetCount,
    recurringRules: recurringCount,
    queueItems: queueCount,
    pendingTransactions: pendingTxCount,
    totalPending: queueCount + pendingTxCount,
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
    const existingSystemCategories = await localDb.categories
      .filter((c) => c.user_id === null || c.user_id === undefined)
      .toArray();
    const existingIds = new Set(existingSystemCategories.map((c) => c.category_id));

    const missingDefaults = defaultCategories.filter((c) => !existingIds.has(c.category_id));
    if (missingDefaults.length > 0) {
      await localDb.categories.bulkPut(missingDefaults);
    }
  }
}

export const DEFAULT_LOCAL_LEDGER_ID = 'default_ledger';

/**
 * 预置本地默认日常账本 (确保未登录或离线首次冷启动时拥有可用账本)
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
 * 导出全量本地数据 (用于加密备份)
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
    cats = cats.filter((c) => !c.user_id || c.user_id === userId);
    leds = leds.filter((l) => l.user_id === userId || !l.user_id || l.user_id === 'default_user');
    bds = bds.filter((b) => b.user_id === userId);
    rrs = rrs.filter((r) => r.user_id === userId);
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
 * 全量导入/恢复本地数据 (来自解密后的备份数据)
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

  const { transactions = [], categories = [], ledgers = [], budgets = [], recurringRules = [] } = data;
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
    }
  );

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
}> {
  let txCount = 0;
  let ledCount = 0;
  let catCount = 0;

  await localDb.transaction(
    'rw',
    [localDb.transactions, localDb.ledgers, localDb.categories],
    async () => {
      // 迁移未归属或默认访客的流水至目标保险库 ID
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
    }
  );

  return {
    migratedTransactions: txCount,
    migratedLedgers: ledCount,
    migratedCategories: catCount,
  };
}

/**
 * 清除指定用户的本地私有数据，并在需要时重置基础访客数据 (BUG-C04)
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
      localDb.syncQueue,
      localDb.vault_meta,
    ],
    async () => {
      await localDb.transactions.where('user_id').equals(userId).delete();
      await localDb.categories.where('user_id').equals(userId).delete();
      await localDb.ledgers.where('user_id').equals(userId).delete();
      await localDb.budgets.where('user_id').equals(userId).delete();
      await localDb.recurring_rules.where('user_id').equals(userId).delete();
      await localDb.syncQueue.where('user_id').equals(userId).delete();
      await localDb.vault_meta.where('id').equals(userId).delete();
    }
  );

  await seedLocalCategories();
  await seedLocalLedgers();
}

/**
 * 清空本地数据库所有关联数据 (用户注销账户时彻底清除本地缓存并重置为初始状态)
 */
export async function clearLocalDatabase() {
  await localDb.transactions.clear();
  await localDb.categories.clear();
  await localDb.ledgers.clear();
  await localDb.budgets.clear();
  await localDb.recurring_rules.clear();
  await localDb.syncQueue.clear();
  await localDb.vault_meta.clear();
  await seedLocalCategories();
  await seedLocalLedgers();
}
