import Dexie, { type Table } from 'dexie';
import { Transaction, Category, Ledger, Budget, RecurringRule, getDefaultCategories } from '@ledger/shared';

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
 * 账盾 - 本地 IndexedDB 数据库 (基于 Dexie.js)
 * 践行《白皮书 6.1 离线优先 Offline-First》与《7.3 完善离线缓存策略》规范
 */
export class LedgerLocalDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  ledgers!: Table<Ledger, string>;
  budgets!: Table<Budget, string>;
  recurring_rules!: Table<RecurringRule, string>;
  syncQueue!: Table<SyncQueueItem, string>;

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
  const queueCount = await localDb.syncQueue.count();
  const pendingTxCount = await localDb.transactions.where('sync_status').equals('pending').count();

  return {
    transactions: txCount,
    categories: catCount,
    ledgers: ledgerCount,
    budgets: budgetCount,
    queueItems: queueCount,
    pendingTransactions: pendingTxCount,
    totalPending: queueCount + pendingTxCount,
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
    ],
    async () => {
      await localDb.transactions.where('user_id').equals(userId).delete();
      await localDb.categories.where('user_id').equals(userId).delete();
      await localDb.ledgers.where('user_id').equals(userId).delete();
      await localDb.budgets.where('user_id').equals(userId).delete();
      await localDb.recurring_rules.where('user_id').equals(userId).delete();
      await localDb.syncQueue.where('user_id').equals(userId).delete();
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
  await seedLocalCategories();
  await seedLocalLedgers();
}
