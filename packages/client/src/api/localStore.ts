/**
 * 账盾 - 本地优先存储与 Dexie 权威数据引擎 (Local Store)
 * 遵循《白皮书 2.0 & 6.1 离线优先 Offline-First》规范：
 * - 纯本地 0ms 极速读写 Dexie.js (IndexedDB)
 * - 变更自动入列待同步队列 (仅在启用云同步时)
 * - 严禁包含任何 HTTP / fetch 网络调用！
 */

import {
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  ReorderCategoryItem,
  Ledger,
  CreateLedgerRequest,
  UpdateLedgerRequest,
  Transaction,
  TransactionFilter,
  Budget,
  BudgetPeriod,
  SetBudgetItem,
  BatchSetBudgetRequest,
  RecurringRule,
  CreateRecurringRuleRequest,
  UpdateRecurringRuleRequest,
  calculateNextRunDate,
  formatDateOnly,
} from '@ledger/shared';
import {
  localDb,
  enqueueSyncAction,
  seedLocalCategories,
  seedLocalLedgers,
} from '../db';
import { isCloudSyncEnabled } from '../sync/syncAdapter';
import { getStoredUser } from './cloudAuth';

// =========================================================================
// 1. 分类管理 (Categories Local CRUD)
// =========================================================================

/**
 * 获取分类列表 (直接读取本地 Dexie 权威数据源，极速 0ms 响应)
 */
export async function getCategories(): Promise<Category[]> {
  const count = await localDb.categories.count();
  if (count === 0) {
    await seedLocalCategories();
  }
  return await localDb.categories.orderBy('sort_order').toArray();
}

/**
 * 创建自定义分类 (离线优先：0ms 写入本地 Dexie，若开启同步则入列)
 */
export async function createCategory(req: CreateCategoryRequest): Promise<Category> {
  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';
  const categoryId = req.category_id || `cat_cust_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  let sortOrder = req.sort_order;
  if (sortOrder === undefined || sortOrder === null) {
    if (req.parent_id) {
      const subCats = await localDb.categories.where('parent_id').equals(req.parent_id).toArray();
      const maxSort = subCats.reduce((max, c) => Math.max(max, c.sort_order), 0);
      sortOrder = maxSort + 1;
    } else {
      const parentCats = await localDb.categories.filter((c) => c.type === req.type && !c.parent_id).toArray();
      const maxSort = parentCats.reduce((max, c) => Math.max(max, c.sort_order), 0);
      sortOrder = maxSort + 10;
    }
  }

  const newCat: Category = {
    category_id: categoryId,
    user_id: userId,
    type: req.type,
    parent_id: req.parent_id || null,
    name: req.name.trim(),
    icon: req.icon || 'Tag',
    color: req.color || null,
    sort_order: sortOrder,
    created_at: now,
    updated_at: now,
  };

  // 1. 立即持久化至本地 IndexedDB
  await localDb.categories.put(newCat);

  // 2. 仅在启用云同步时入列同步队列
  if (isCloudSyncEnabled() && user) {
    await enqueueSyncAction({
      user_id: userId,
      entity_type: 'category',
      entity_id: categoryId,
      action: 'create',
      payload: newCat,
    });
  }

  return newCat;
}

/**
 * 修改分类 (离线优先：0ms 写入本地 Dexie)
 */
export async function updateCategory(
  categoryId: string,
  updates: UpdateCategoryRequest
): Promise<Category | null> {
  const existing = await localDb.categories.get(categoryId);
  if (!existing) return null;

  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';
  const now = new Date().toISOString();
  const updatedCat: Category = {
    ...existing,
    name: updates.name !== undefined ? updates.name.trim() : existing.name,
    icon: updates.icon !== undefined ? (updates.icon || undefined) : existing.icon,
    color: updates.color !== undefined ? updates.color : existing.color,
    parent_id: updates.parent_id !== undefined ? updates.parent_id : existing.parent_id,
    sort_order: updates.sort_order !== undefined ? updates.sort_order : existing.sort_order,
    updated_at: now,
  };

  // 1. 本地更新
  await localDb.categories.put(updatedCat);

  // 2. 仅在启用云同步时入列
  if (isCloudSyncEnabled() && user) {
    await enqueueSyncAction({
      user_id: userId,
      entity_type: 'category',
      entity_id: categoryId,
      action: 'update',
      payload: updates,
    });
  }

  return updatedCat;
}

/**
 * 删除分类 (离线优先：0ms 写入本地 Dexie，级联删除子分类)
 */
export async function deleteCategory(categoryId: string): Promise<boolean> {
  const existing = await localDb.categories.get(categoryId);
  if (!existing) return false;

  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';
  const shouldEnqueue = isCloudSyncEnabled() && !!user;

  await localDb.transaction('rw', [localDb.categories, localDb.syncQueue], async () => {
    if (!existing.parent_id) {
      const children = await localDb.categories.where('parent_id').equals(categoryId).toArray();
      for (const child of children) {
        await localDb.categories.delete(child.category_id);
        if (shouldEnqueue) {
          await enqueueSyncAction({
            user_id: userId,
            entity_type: 'category',
            entity_id: child.category_id,
            action: 'delete',
          });
        }
      }
    }

    await localDb.categories.delete(categoryId);

    if (shouldEnqueue) {
      await enqueueSyncAction({
        user_id: userId,
        entity_type: 'category',
        entity_id: categoryId,
        action: 'delete',
      });
    }
  });

  return true;
}

/**
 * 批量更新分类排序 (离线优先)
 */
export async function reorderCategories(items: ReorderCategoryItem[]): Promise<boolean> {
  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';
  const now = new Date().toISOString();

  for (const item of items) {
    await localDb.categories.update(item.category_id, {
      sort_order: item.sort_order,
      updated_at: now,
    });
  }

  if (isCloudSyncEnabled() && user) {
    await enqueueSyncAction({
      user_id: userId,
      entity_type: 'category',
      entity_id: 'batch_reorder',
      action: 'reorder',
      payload: { items },
    });
  }

  return true;
}

// =========================================================================
// 2. 账本管理 (Ledgers Local CRUD)
// =========================================================================

/**
 * 获取账本列表 (直接读取本地 Dexie 权威数据源，极速 0ms 响应)
 */
export async function getLedgers(withSummary = false): Promise<Ledger[]> {
  const count = await localDb.ledgers.count();
  if (count === 0) {
    const user = getStoredUser();
    await seedLocalLedgers(user?.user_id);
  }
  return await localDb.ledgers.orderBy('is_default').reverse().toArray();
}

/**
 * 创建新账本 (离线优先：0ms 写入本地 Dexie)
 */
export async function createLedger(req: CreateLedgerRequest): Promise<Ledger> {
  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';
  const ledgerId = req.ledger_id || `led_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  const count = await localDb.ledgers.count();
  const isDefault = count === 0 ? 1 : (req.is_default ? 1 : 0);

  if (isDefault === 1) {
    const existing = await localDb.ledgers.toArray();
    for (const item of existing) {
      if (item.is_default === 1) {
        await localDb.ledgers.update(item.ledger_id, { is_default: 0, updated_at: now });
      }
    }
  }

  const newLedger: Ledger = {
    ledger_id: ledgerId,
    user_id: userId,
    name: req.name.trim(),
    currency: (req.currency || 'CNY').trim().toUpperCase(),
    is_default: isDefault,
    created_at: now,
    updated_at: now,
  };

  await localDb.ledgers.put(newLedger);

  if (isCloudSyncEnabled() && user) {
    await enqueueSyncAction({
      user_id: userId,
      entity_type: 'ledger',
      entity_id: ledgerId,
      action: 'create',
      payload: newLedger,
    });
  }

  return newLedger;
}

/**
 * 修改账本 (离线优先)
 */
export async function updateLedger(
  ledgerId: string,
  updates: UpdateLedgerRequest
): Promise<Ledger | null> {
  const existing = await localDb.ledgers.get(ledgerId);
  if (!existing) return null;

  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';
  const now = new Date().toISOString();
  const isDefault = updates.is_default !== undefined ? (updates.is_default ? 1 : 0) : existing.is_default;

  if (isDefault === 1 && existing.is_default === 0) {
    const all = await localDb.ledgers.toArray();
    for (const item of all) {
      if (item.ledger_id !== ledgerId && item.is_default === 1) {
        await localDb.ledgers.update(item.ledger_id, { is_default: 0, updated_at: now });
      }
    }
  }

  const updatedLedger: Ledger = {
    ...existing,
    name: updates.name !== undefined ? updates.name.trim() : existing.name,
    currency: updates.currency !== undefined ? updates.currency.trim().toUpperCase() : existing.currency,
    is_default: isDefault,
    updated_at: now,
  };

  await localDb.ledgers.put(updatedLedger);

  if (isCloudSyncEnabled() && user) {
    await enqueueSyncAction({
      user_id: userId,
      entity_type: 'ledger',
      entity_id: ledgerId,
      action: 'update',
      payload: updates,
    });
  }

  return updatedLedger;
}

/**
 * 设为默认账本 (离线优先)
 */
export async function setDefaultLedger(ledgerId: string): Promise<boolean> {
  const existing = await localDb.ledgers.get(ledgerId);
  if (!existing) return false;

  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';
  const now = new Date().toISOString();

  const all = await localDb.ledgers.toArray();
  for (const item of all) {
    await localDb.ledgers.update(item.ledger_id, {
      is_default: item.ledger_id === ledgerId ? 1 : 0,
      updated_at: now,
    });
  }

  if (isCloudSyncEnabled() && user) {
    await enqueueSyncAction({
      user_id: userId,
      entity_type: 'ledger',
      entity_id: ledgerId,
      action: 'set_default',
    });
  }

  return true;
}

/**
 * 删除账本 (离线优先：0ms 本地级联删除关联数据)
 */
export async function deleteLedger(ledgerId: string): Promise<{ success: boolean; error?: string }> {
  const totalCount = await localDb.ledgers.count();
  if (totalCount <= 1) {
    return { success: false, error: '至少需保留一个账本，无法删除唯一账本' };
  }

  const existing = await localDb.ledgers.get(ledgerId);
  if (!existing) return { success: false, error: '账本不存在' };

  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';
  const shouldEnqueue = isCloudSyncEnabled() && !!user;

  if (existing.is_default === 1) {
    const another = await localDb.ledgers.filter((l) => l.ledger_id !== ledgerId).first();
    if (another) {
      await localDb.ledgers.update(another.ledger_id, { is_default: 1, updated_at: new Date().toISOString() });
    }
  }

  // 本地级联清理该账本下的所有关联流水、预算、周期规则与账本自身
  await localDb.transaction('rw', [
    localDb.transactions,
    localDb.budgets,
    localDb.recurring_rules,
    localDb.ledgers,
    localDb.syncQueue,
  ], async () => {
    // 1. 本地批量删除流水
    await localDb.transactions.where('ledger_id').equals(ledgerId).delete();

    // 2. 本地批量删除预算
    await localDb.budgets.where('ledger_id').equals(ledgerId).delete();

    // 3. 本地批量删除周期规则
    await localDb.recurring_rules.where('ledger_id').equals(ledgerId).delete();

    // 4. 清理该账本已在待同步队列中的未完成项 (避免无效重复推送)
    const queueItems = await localDb.syncQueue.where('user_id').equals(userId).toArray();
    for (const q of queueItems) {
      if (
        (q.entity_type === 'transaction' && q.payload?.ledger_id === ledgerId) ||
        (q.entity_type === 'budget' && q.payload?.ledger_id === ledgerId) ||
        (q.entity_type === 'recurring' && q.payload?.ledger_id === ledgerId)
      ) {
        await localDb.syncQueue.delete(q.id);
      }
    }

    // 5. 本地删除账本自身
    await localDb.ledgers.delete(ledgerId);

    // 6. 服务端删除账本接口已实现全表级联删除，仅需入列 1 个账本删除事件即可！
    if (shouldEnqueue) {
      await enqueueSyncAction({
        user_id: userId,
        entity_type: 'ledger',
        entity_id: ledgerId,
        action: 'delete',
      });
    }
  });

  return { success: true };
}

// =========================================================================
// 3. 交易流水管理 (Transactions Local CRUD & Query)
// =========================================================================

/**
 * 按条件快速查询本地账单流水
 */
export async function queryTransactions(
  filter?: TransactionFilter & { limit?: number }
): Promise<Transaction[]> {
  const user = getStoredUser();
  const userId = user?.user_id;

  let list: Transaction[] = [];
  if (userId) {
    list = await localDb.transactions.where('user_id').equals(userId).sortBy('transaction_date');
  } else {
    list = await localDb.transactions
      .filter((t) => !t.user_id || t.user_id === 'default_user')
      .sortBy('transaction_date');
  }
  list.reverse();

  if (filter) {
    if (filter.ledger_id && filter.ledger_id !== 'all') {
      list = list.filter((t) => t.ledger_id === filter.ledger_id);
    }
    if (filter.type && filter.type !== 'all') {
      list = list.filter((t) => t.type === filter.type);
    }
    if (filter.category_id && filter.category_id !== 'all') {
      list = list.filter((t) => t.category_id === filter.category_id);
    }
    if (filter.start_date) {
      list = list.filter((t) => t.transaction_date >= filter.start_date!);
    }
    if (filter.end_date) {
      list = list.filter((t) => t.transaction_date <= filter.end_date!);
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      list = list.filter((t) =>
        Boolean(t.remark && t.remark.toLowerCase().includes(q))
      );
    }
    if (filter.limit && filter.limit > 0) {
      list = list.slice(0, filter.limit);
    }
  }

  return list;
}

/**
 * 创建新账单流水 (离线优先策略：0ms 写入本地 IndexedDB)
 */
export async function createTransaction(
  tx: Omit<Transaction, 'sync_status' | 'created_at' | 'updated_at'> & {
    sync_status?: 'synced' | 'pending';
    created_at?: string;
    updated_at?: string;
  }
): Promise<Transaction> {
  const user = getStoredUser();
  const now = new Date().toISOString();
  const cloudEnabled = isCloudSyncEnabled() && !!user;

  const fullTx: Transaction = {
    ...tx,
    sync_status: cloudEnabled ? (tx.sync_status || 'pending') : 'synced',
    created_at: tx.created_at || now,
    updated_at: tx.updated_at || now,
  };

  // 1. 0ms 立即持久化至本地 IndexedDB
  await localDb.transactions.put(fullTx);

  return fullTx;
}

/**
 * 更新账单流水 (离线优先：0ms 写入本地 IndexedDB)
 */
export async function updateTransaction(
  transactionId: string,
  updates: Partial<Omit<Transaction, 'transaction_id' | 'user_id' | 'created_at'>>
): Promise<Transaction | null> {
  const existing = await localDb.transactions.get(transactionId);
  if (!existing) return null;

  const user = getStoredUser();
  const now = new Date().toISOString();
  const cloudEnabled = isCloudSyncEnabled() && !!user;

  const updatedTx: Transaction = {
    ...existing,
    ...updates,
    sync_status: cloudEnabled ? 'pending' : 'synced',
    updated_at: now,
  };

  await localDb.transactions.put(updatedTx);
  return updatedTx;
}

/**
 * 删除账单流水 (离线优先：0ms 本地删除，若启用云同步则记录防复活墓碑)
 */
export async function deleteTransaction(transactionId: string): Promise<boolean> {
  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';

  // 1. 0ms 本地删除
  await localDb.transactions.delete(transactionId);

  // 2. 仅在启用云同步时记录删除墓碑
  if (isCloudSyncEnabled() && user) {
    await enqueueSyncAction({
      user_id: userId,
      entity_type: 'transaction',
      entity_id: transactionId,
      action: 'delete',
    });
  }

  return true;
}

/**
 * 批量导入账单流水 (直接分批写入本地 Dexie 权威数据源，0ms 延迟，支持进度反馈)
 */
export async function batchImportTransactions(
  transactions: Transaction[],
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; importedCount: number; error?: string }> {
  if (!transactions || transactions.length === 0) {
    return { success: true, importedCount: 0 };
  }

  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';
  const now = new Date().toISOString();
  const CHUNK_SIZE = 250;
  const cloudEnabled = isCloudSyncEnabled() && !!user;

  const preparedTxs: Transaction[] = transactions.map((t) => ({
    ...t,
    user_id: userId,
    sync_status: (cloudEnabled ? 'pending' : 'synced') as 'pending' | 'synced',
    created_at: t.created_at || now,
    updated_at: t.updated_at || now,
  }));

  const localTotalChunks = Math.ceil(preparedTxs.length / CHUNK_SIZE);
  for (let i = 0; i < localTotalChunks; i++) {
    const chunk = preparedTxs.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    await localDb.transactions.bulkPut(chunk);
    if (onProgress) {
      const localPercent = Math.round(((i + 1) / localTotalChunks) * 100);
      onProgress(localPercent);
    }
  }

  return {
    success: true,
    importedCount: preparedTxs.length,
  };
}

// =========================================================================
// 4. 预算管理 (Budgets Local CRUD)
// =========================================================================

/**
 * 获取预算配置列表 (直接读取本地 Dexie 权威数据源，极速 0ms 响应)
 */
export async function getBudgets(ledgerId?: string, period: BudgetPeriod = 'monthly'): Promise<Budget[]> {
  const allLocal = await localDb.budgets.toArray();
  return allLocal.filter((b) => {
    if (b.period !== period) return false;
    if (ledgerId && ledgerId !== 'all' && b.ledger_id !== ledgerId) return false;
    return true;
  });
}

/**
 * 批量设置预算 (离线优先：0ms 写入本地 Dexie)
 */
export async function saveBatchBudgets(
  ledgerId: string,
  period: BudgetPeriod,
  budgets: SetBudgetItem[]
): Promise<Budget[]> {
  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';
  const now = new Date().toISOString();

  // 1. 本地清空同周期旧预算
  const oldBudgets = await localDb.budgets.toArray();
  for (const ob of oldBudgets) {
    if (ob.ledger_id === ledgerId && ob.period === period) {
      await localDb.budgets.delete(ob.budget_id);
    }
  }

  // 2. 本地写入新预算
  const localList: Budget[] = [];
  for (const item of budgets) {
    const amount = typeof item.amount === 'number' ? Math.round(item.amount) : 0;
    if (amount <= 0 || isNaN(amount)) continue;

    const bId = `bud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newBudget: Budget = {
      budget_id: bId,
      user_id: userId,
      ledger_id: ledgerId,
      category_id: item.category_id || null,
      period,
      amount,
      created_at: now,
      updated_at: now,
    };
    await localDb.budgets.put(newBudget);
    localList.push(newBudget);
  }

  // 3. 仅在启用云同步时入列
  if (isCloudSyncEnabled() && user) {
    await enqueueSyncAction({
      user_id: userId,
      entity_type: 'budget',
      entity_id: `${ledgerId}_${period}`,
      action: 'batch_set',
      payload: {
        ledger_id: ledgerId,
        period,
        budgets,
      } as BatchSetBudgetRequest,
    });
  }

  return localList;
}

/**
 * 删除预算 (离线优先)
 */
export async function deleteBudget(budgetId: string): Promise<boolean> {
  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';

  await localDb.budgets.delete(budgetId);

  if (isCloudSyncEnabled() && user) {
    await enqueueSyncAction({
      user_id: userId,
      entity_type: 'budget',
      entity_id: budgetId,
      action: 'delete',
    });
  }

  return true;
}

// =========================================================================
// 5. 周期记账规则管理 (Recurring Rules Local CRUD)
// =========================================================================

/**
 * 获取当前用户的周期记账规则列表 (直接读取本地 Dexie 权威数据源，极速 0ms 响应)
 */
export async function getRecurringRules(): Promise<RecurringRule[]> {
  const user = getStoredUser();
  const userId = user?.user_id;

  let list: RecurringRule[] = [];
  if (userId) {
    list = await localDb.recurring_rules.where('user_id').equals(userId).toArray();
  } else {
    list = await localDb.recurring_rules.toArray();
  }
  return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/**
 * 创建新周期记账规则 (离线优先)
 */
export async function createRecurringRule(
  req: CreateRecurringRuleRequest
): Promise<RecurringRule> {
  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';
  const ruleId = req.rule_id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const startDate = req.start_date ? req.start_date.slice(0, 10) : formatDateOnly(new Date());

  let nextRunDate = req.next_run_date ? req.next_run_date.slice(0, 10) : '';
  if (!nextRunDate) {
    nextRunDate = calculateNextRunDate(
      {
        frequency: req.frequency,
        interval: req.interval || 1,
        day_of_month: req.day_of_month,
        day_of_week: req.day_of_week,
        month_of_year: req.month_of_year,
        start_date: startDate,
      },
      startDate
    );
  }

  const newRule: RecurringRule = {
    rule_id: ruleId,
    user_id: userId,
    ledger_id: req.ledger_id,
    name: req.name.trim(),
    type: req.type,
    amount: Math.round(req.amount),
    category_id: req.category_id || null,
    from_account: req.from_account || null,
    to_account: req.to_account || null,
    remark: req.remark || null,
    frequency: req.frequency,
    interval: req.interval || 1,
    day_of_month: req.day_of_month || null,
    day_of_week: req.day_of_week || null,
    month_of_year: req.month_of_year || null,
    start_date: startDate,
    end_date: req.end_date ? req.end_date.slice(0, 10) : null,
    next_run_date: nextRunDate,
    last_run_date: null,
    status: req.status || 'active',
    auto_record: req.auto_record !== undefined ? (typeof req.auto_record === 'boolean' ? (req.auto_record ? 1 : 0) : req.auto_record) : 1,
    created_at: now,
    updated_at: now,
  };

  // 1. 本地持久化
  await localDb.recurring_rules.put(newRule);

  // 2. 仅在启用云同步时入列
  if (isCloudSyncEnabled() && user) {
    await enqueueSyncAction({
      user_id: userId,
      entity_type: 'recurring',
      entity_id: ruleId,
      action: 'create',
      payload: newRule,
    });
  }

  return newRule;
}

/**
 * 修改周期记账规则 (离线优先)
 */
export async function updateRecurringRule(
  ruleId: string,
  updates: UpdateRecurringRuleRequest
): Promise<RecurringRule | null> {
  const existing = await localDb.recurring_rules.get(ruleId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const autoRecord = updates.auto_record !== undefined
    ? (typeof updates.auto_record === 'boolean' ? (updates.auto_record ? 1 : 0) : updates.auto_record)
    : existing.auto_record;

  const updated: RecurringRule = {
    ...existing,
    ...updates,
    auto_record: autoRecord,
    updated_at: now,
  };

  await localDb.recurring_rules.put(updated);

  const user = getStoredUser();
  if (isCloudSyncEnabled() && user) {
    await enqueueSyncAction({
      user_id: user.user_id,
      entity_type: 'recurring',
      entity_id: ruleId,
      action: 'update',
      payload: updates,
    });
  }

  return updated;
}

/**
 * 删除周期记账规则 (离线优先)
 */
export async function deleteRecurringRule(ruleId: string): Promise<void> {
  await localDb.recurring_rules.delete(ruleId);

  const user = getStoredUser();
  if (isCloudSyncEnabled() && user) {
    await enqueueSyncAction({
      user_id: user.user_id,
      entity_type: 'recurring',
      entity_id: ruleId,
      action: 'delete',
    });
  }
}
