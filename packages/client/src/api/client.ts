import {
  ApiResponse,
  Category,
  CategoryType,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  ReorderCategoryItem,
  ReorderCategoriesRequest,
  Ledger,
  CreateLedgerRequest,
  UpdateLedgerRequest,
  LedgerSummary,
  Transaction,
  TransactionFilter,
  SyncBatchResponse,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  AuthUser,
  Budget,
  BudgetPeriod,
  SetBudgetItem,
  BatchSetBudgetRequest,
} from '@ledger/shared';
import { localDb } from '../db';

const API_BASE = (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, '') : '') + '/api';
const TOKEN_KEY = 'serverless_ledger_jwt';
const USER_KEY = 'serverless_ledger_user';

/**
 * 本地持久化 Token 与 用户信息管理
 */
export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): AuthUser | null {
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr) as AuthUser;
  } catch {
    return null;
  }
}

export function saveSession(auth: AuthResponse) {
  localStorage.setItem(TOKEN_KEY, auth.token);
  localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function getAuthHeaders(customHeaders: Record<string, string> = {}): HeadersInit {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * 用户注册 API
 */
export async function registerUser(req: RegisterRequest): Promise<ApiResponse<AuthResponse>> {
  try {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const json = (await res.json()) as ApiResponse<AuthResponse>;
    if (res.ok && json.success && json.data) {
      saveSession(json.data);
    }
    return json;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || '网络连接异常，注册失败',
    };
  }
}

/**
 * 用户登录 API
 */
export async function loginUser(req: LoginRequest): Promise<ApiResponse<AuthResponse>> {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    const json = (await res.json()) as ApiResponse<AuthResponse>;
    if (res.ok && json.success && json.data) {
      saveSession(json.data);
    }
    return json;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || '网络连接异常，登录失败',
    };
  }
}

/**
 * 获取当前登录用户信息 (验证 Token 有效性)
 */
export async function fetchCurrentUser(): Promise<ApiResponse<AuthUser>> {
  const token = getStoredToken();
  if (!token) {
    return { success: false, error: '未登录' };
  }

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(4000),
    });
    const json = (await res.json()) as ApiResponse<AuthUser>;
    if (!res.ok || !json.success) {
      clearSession();
    } else if (json.data) {
      localStorage.setItem(USER_KEY, JSON.stringify(json.data));
    }
    return json;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 检查后端 Cloudflare Workers + D1 连通状态
 */
export async function checkServerHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as ApiResponse;
    return { ok: true, data: json.data };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

/**
 * 获取分类列表 (优先从服务器获取并更新本地，失败则使用本地 IndexedDB)
 */
export async function getCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_BASE}/categories`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Category[]>;
      if (json.success && json.data && json.data.length > 0) {
        await localDb.categories.bulkPut(json.data);
        return json.data;
      }
    }
  } catch {
    // 离线环境降级
  }
  return await localDb.categories.orderBy('sort_order').toArray();
}

/**
 * 创建自定义分类 (离线优先：写入本地 Dexie，若在线同步推送到 D1)
 */
export async function createCategory(req: CreateCategoryRequest): Promise<Category> {
  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';
  const categoryId = req.category_id || `cat_cust_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  // 若未指定 sort_order，计算本地同层级分类的最大 sort_order
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

  // 1. 本地持久化
  await localDb.categories.put(newCat);

  // 2. 尝试向服务端推送
  try {
    const res = await fetch(`${API_BASE}/categories`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(newCat),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Category>;
      if (json.success && json.data) {
        await localDb.categories.put(json.data);
        return json.data;
      }
    }
  } catch {
    console.log('离线模式：自定义分类已保存到本地。');
  }

  return newCat;
}

/**
 * 修改分类 (离线优先)
 */
export async function updateCategory(
  categoryId: string,
  updates: UpdateCategoryRequest
): Promise<Category | null> {
  const existing = await localDb.categories.get(categoryId);
  if (!existing) return null;

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

  await localDb.categories.put(updatedCat);

  try {
    const res = await fetch(`${API_BASE}/categories/${categoryId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Category>;
      if (json.success && json.data) {
        await localDb.categories.put(json.data);
        return json.data;
      }
    }
  } catch {
    console.log('离线模式：分类修改已暂存本地。');
  }

  return updatedCat;
}

/**
 * 删除分类 (离线优先)
 */
export async function deleteCategory(categoryId: string): Promise<boolean> {
  const existing = await localDb.categories.get(categoryId);
  if (!existing) return false;

  // 1. 如果是大分类，级联删除本地子分类
  if (!existing.parent_id) {
    const children = await localDb.categories.where('parent_id').equals(categoryId).toArray();
    for (const child of children) {
      await localDb.categories.delete(child.category_id);
    }
  }

  // 2. 本地删除
  await localDb.categories.delete(categoryId);

  // 3. 服务端同步删除
  try {
    const res = await fetch(`${API_BASE}/categories/${categoryId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    console.log('离线模式：分类已在本地删除。');
    return true;
  }
}

/**
 * 批量更新分类排序 (离线优先)
 */
export async function reorderCategories(items: ReorderCategoryItem[]): Promise<boolean> {
  // 1. 本地更新
  for (const item of items) {
    await localDb.categories.update(item.category_id, {
      sort_order: item.sort_order,
      updated_at: new Date().toISOString(),
    });
  }

  // 2. 服务端批量更新
  try {
    const res = await fetch(`${API_BASE}/categories/reorder`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({ items }),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    console.log('离线模式：分类排序已暂存本地。');
    return true;
  }
}

/**
 * 获取账本列表 (优先拉取服务端并同步至本地 Dexie，离线时读取本地)
 */
export async function getLedgers(withSummary = false): Promise<Ledger[]> {
  try {
    const url = `${API_BASE}/ledgers${withSummary ? '?withSummary=true' : ''}`;
    const res = await fetch(url, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Ledger[] | LedgerSummary[]>;
      if (json.success && json.data && Array.isArray(json.data) && json.data.length > 0) {
        const rawLedgers: Ledger[] = withSummary
          ? (json.data as LedgerSummary[]).map((s) => s.ledger)
          : (json.data as Ledger[]);
        await localDb.ledgers.bulkPut(rawLedgers);
        return rawLedgers;
      }
    }
  } catch {
    // 离线降级
  }
  return await localDb.ledgers.orderBy('is_default').reverse().toArray();
}

/**
 * 创建新账本 (离线优先：写入本地 Dexie，若在线同步至 D1)
 */
export async function createLedger(req: CreateLedgerRequest): Promise<Ledger> {
  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';
  const ledgerId = req.ledger_id || `led_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  const count = await localDb.ledgers.count();
  const isDefault = count === 0 ? 1 : (req.is_default ? 1 : 0);

  // 若设为默认账本，重置本地其他账本
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

  try {
    const res = await fetch(`${API_BASE}/ledgers`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(newLedger),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Ledger>;
      if (json.success && json.data) {
        await localDb.ledgers.put(json.data);
        return json.data;
      }
    }
  } catch {
    console.log('离线模式：新账本已保存到本地。');
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

  const now = new Date().toISOString();
  const isDefault = updates.is_default !== undefined ? (updates.is_default ? 1 : 0) : existing.is_default;

  // 若更新为默认账本，重置本地其余账本
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

  try {
    const res = await fetch(`${API_BASE}/ledgers/${ledgerId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Ledger>;
      if (json.success && json.data) {
        await localDb.ledgers.put(json.data);
        return json.data;
      }
    }
  } catch {
    console.log('离线模式：账本修改已暂存本地。');
  }

  return updatedLedger;
}

/**
 * 设为默认账本 (离线优先)
 */
export async function setDefaultLedger(ledgerId: string): Promise<boolean> {
  const existing = await localDb.ledgers.get(ledgerId);
  if (!existing) return false;

  const now = new Date().toISOString();
  const all = await localDb.ledgers.toArray();
  for (const item of all) {
    await localDb.ledgers.update(item.ledger_id, {
      is_default: item.ledger_id === ledgerId ? 1 : 0,
      updated_at: now,
    });
  }

  try {
    const res = await fetch(`${API_BASE}/ledgers/${ledgerId}/default`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    console.log('离线模式：默认账本已在本地更新。');
    return true;
  }
}

/**
 * 删除账本 (离线优先：级联删除本地该账本下的账单流水)
 */
export async function deleteLedger(ledgerId: string): Promise<{ success: boolean; error?: string }> {
  const totalCount = await localDb.ledgers.count();
  if (totalCount <= 1) {
    return { success: false, error: '至少需保留一个账本，无法删除唯一账本' };
  }

  const existing = await localDb.ledgers.get(ledgerId);
  if (!existing) return { success: false, error: '账本不存在' };

  // 若删除默认账本，先提升另一个账本为默认
  if (existing.is_default === 1) {
    const another = await localDb.ledgers.filter((l) => l.ledger_id !== ledgerId).first();
    if (another) {
      await localDb.ledgers.update(another.ledger_id, { is_default: 1, updated_at: new Date().toISOString() });
    }
  }

  // 本地级联删除该账本下的所有流水
  const relatedTxs = await localDb.transactions.where('ledger_id').equals(ledgerId).toArray();
  for (const tx of relatedTxs) {
    await localDb.transactions.delete(tx.transaction_id);
  }

  // 本地删除账本
  await localDb.ledgers.delete(ledgerId);

  // 服务端同步删除
  try {
    const res = await fetch(`${API_BASE}/ledgers/${ledgerId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) {
      const json = (await res.json()) as ApiResponse;
      return { success: false, error: json.error || '删除失败' };
    }
    return { success: true };
  } catch {
    console.log('离线模式：账本及关联流水已在本地删除。');
    return { success: true };
  }
}

/**
 * 从服务器拉取最新账本并与本地合并
 */
export async function pullAndMergeServerLedgers(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/ledgers`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Ledger[]>;
      if (json.success && Array.isArray(json.data)) {
        const serverLedgers = json.data;
        if (serverLedgers.length > 0) {
          for (const sLed of serverLedgers) {
            await localDb.ledgers.put(sLed);
          }
          return serverLedgers.length;
        }
      }
    }
  } catch (err) {
    console.warn('拉取服务端账本数据失败 (可能离线):', err);
  }
  return 0;
}

/**
 * 创建新账单流水 (离线优先策略：先写入本地 IndexedDB，若在线则静默推送到 D1)
 */
export async function createTransaction(
  tx: Omit<Transaction, 'sync_status' | 'created_at' | 'updated_at'> & {
    sync_status?: 'synced' | 'pending';
    created_at?: string;
    updated_at?: string;
  }
): Promise<Transaction> {
  const now = new Date().toISOString();
  const fullTx: Transaction = {
    ...tx,
    sync_status: tx.sync_status || 'pending',
    created_at: tx.created_at || now,
    updated_at: tx.updated_at || now,
  };

  // 1. 立即持久化至本地 IndexedDB
  await localDb.transactions.put(fullTx);

  // 2. 尝试向 Cloudflare Workers D1 推送
  try {
    const res = await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(fullTx),
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      fullTx.sync_status = 'synced';
      await localDb.transactions.update(fullTx.transaction_id, { sync_status: 'synced' });
    }
  } catch {
    console.log('离线模式：账单已安全保存在本地 IndexedDB，将在联网后自动同步。');
  }

  return fullTx;
}

/**
 * 更新账单流水 (离线优先：更新本地 IndexedDB，若在线同步到 D1)
 */
export async function updateTransaction(
  transactionId: string,
  updates: Partial<Omit<Transaction, 'transaction_id' | 'user_id' | 'created_at'>>
): Promise<Transaction | null> {
  const existing = await localDb.transactions.get(transactionId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const updatedTx: Transaction = {
    ...existing,
    ...updates,
    sync_status: 'pending',
    updated_at: now,
  };

  await localDb.transactions.put(updatedTx);

  try {
    const res = await fetch(`${API_BASE}/transactions/${transactionId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updatedTx),
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      updatedTx.sync_status = 'synced';
      await localDb.transactions.update(transactionId, { sync_status: 'synced' });
    }
  } catch {
    console.log('离线模式：修改已暂存本地，待恢复网络后同步。');
  }

  return updatedTx;
}

/**
 * 删除账单流水 (离线优先：从本地 IndexedDB 删除，若在线同步从 D1 删除)
 */
export async function deleteTransaction(transactionId: string): Promise<boolean> {
  // 1. 本地删除
  await localDb.transactions.delete(transactionId);

  // 2. 尝试从服务端删除
  try {
    const res = await fetch(`${API_BASE}/transactions/${transactionId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    console.log('离线模式：本地账单已删除。');
    return true;
  }
}

/**
 * 从服务器拉取最新账单并与本地双向合并 (遵循 Last-Write-Wins 策略)
 */
export async function pullAndMergeServerTransactions(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/transactions?limit=300`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Transaction[]>;
      if (json.success && Array.isArray(json.data)) {
        const serverList = json.data;
        for (const serverTx of serverList) {
          const localTx = await localDb.transactions.get(serverTx.transaction_id);
          if (!localTx) {
            // 本地没有，直接写入
            await localDb.transactions.put({ ...serverTx, sync_status: 'synced' });
          } else {
            // 本地有，比较 updated_at (Last-Write-Wins)
            const localUpdated = new Date(localTx.updated_at).getTime();
            const serverUpdated = new Date(serverTx.updated_at).getTime();
            if (serverUpdated >= localUpdated) {
              await localDb.transactions.put({ ...serverTx, sync_status: 'synced' });
            }
          }
        }
        return serverList.length;
      }
    }
  } catch (err) {
    console.warn('拉取服务端数据失败 (可能离线):', err);
  }
  return 0;
}

/**
 * 触发本地未同步数据的全量静默同步
 */
export async function syncPendingTransactions(): Promise<{ syncedCount: number; success: boolean }> {
  try {
    const pendingList = await localDb.transactions.where('sync_status').equals('pending').toArray();
    if (pendingList.length > 0) {
      const res = await fetch(`${API_BASE}/transactions/sync`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ transactions: pendingList }),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const json = (await res.json()) as ApiResponse<SyncBatchResponse>;
        if (json.success && json.data) {
          const syncedIds = json.data.synced_ids;
          for (const id of syncedIds) {
            await localDb.transactions.update(id, { sync_status: 'synced' });
          }
        }
      }
    }

    // 双向拉取服务端账本、流水与预算增量
    await pullAndMergeServerLedgers();
    await pullAndMergeServerTransactions();
    await pullAndMergeServerBudgets();
    return { syncedCount: pendingList.length, success: true };
  } catch (err) {
    console.warn('Sync failed:', err);
    return { syncedCount: 0, success: false };
  }
}

/**
 * 获取预算配置列表 (优先拉取服务端并同步至本地 Dexie，离线时读取本地)
 */
export async function getBudgets(ledgerId?: string, period: BudgetPeriod = 'monthly'): Promise<Budget[]> {
  try {
    let url = `${API_BASE}/budgets?period=${period}`;
    if (ledgerId && ledgerId !== 'all') {
      url += `&ledgerId=${ledgerId}`;
    }
    const res = await fetch(url, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Budget[]>;
      if (json.success && Array.isArray(json.data)) {
        const serverBudgets = json.data;
        if (serverBudgets.length > 0) {
          await localDb.budgets.bulkPut(serverBudgets);
        }
        return serverBudgets;
      }
    }
  } catch {
    // 离线降级
  }

  // 从本地 Dexie 读取
  const allLocal = await localDb.budgets.toArray();
  return allLocal.filter((b) => {
    if (b.period !== period) return false;
    if (ledgerId && ledgerId !== 'all' && b.ledger_id !== ledgerId) return false;
    return true;
  });
}

/**
 * 批量设置预算 (离线优先：写入本地 Dexie，若在线同步推送到 Cloudflare D1)
 */
export async function saveBatchBudgets(
  ledgerId: string,
  period: BudgetPeriod,
  budgets: SetBudgetItem[]
): Promise<Budget[]> {
  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';
  const now = new Date().toISOString();

  // 1. 本地清空该账本同周期的旧预算
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

  // 3. 尝试向服务端同步
  try {
    const res = await fetch(`${API_BASE}/budgets/batch`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        ledger_id: ledgerId,
        period,
        budgets,
      } as BatchSetBudgetRequest),
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Budget[]>;
      if (json.success && Array.isArray(json.data)) {
        await localDb.budgets.bulkPut(json.data);
        return json.data;
      }
    }
  } catch {
    console.log('离线模式：预算配置已保存在本地 IndexedDB。');
  }

  return localList;
}

/**
 * 删除预算
 */
export async function deleteBudget(budgetId: string): Promise<boolean> {
  await localDb.budgets.delete(budgetId);
  try {
    const res = await fetch(`${API_BASE}/budgets/${budgetId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    console.log('离线模式：本地预算已删除。');
    return true;
  }
}

/**
 * 从服务器拉取最新预算数据并与本地合并
 */
export async function pullAndMergeServerBudgets(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/budgets`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Budget[]>;
      if (json.success && Array.isArray(json.data)) {
        const serverBudgets = json.data;
        if (serverBudgets.length > 0) {
          for (const b of serverBudgets) {
            await localDb.budgets.put(b);
          }
          return serverBudgets.length;
        }
      }
    }
  } catch (err) {
    console.warn('拉取服务端预算数据失败 (可能离线):', err);
  }
  return 0;
}
