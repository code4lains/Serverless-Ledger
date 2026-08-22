import Dexie, { type Table } from 'dexie';
import { Transaction, Category, Ledger, Budget, getDefaultCategories } from '@ledger/shared';

/**
 * 账盾 - 本地 IndexedDB 数据库 (基于 Dexie.js)
 * 践行《白皮书 6.1 离线优先 Offline-First》规范
 */
export class LedgerLocalDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  ledgers!: Table<Ledger, string>;
  budgets!: Table<Budget, string>;

  constructor() {
    super('ServerlessLedgerDB');
    this.version(1).stores({
      transactions: 'transaction_id, user_id, ledger_id, type, category_id, transaction_date, sync_status, updated_at',
      categories: 'category_id, user_id, type, parent_id, sort_order',
      ledgers: 'ledger_id, user_id, is_default',
      budgets: 'budget_id, user_id, ledger_id, category_id, period',
    });
  }
}

export const localDb = new LedgerLocalDatabase();

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

