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
  AuthConfig,
  InviteCode,
  InviteEligibilityInfo,
  ResetPasswordRequest,
  RecurringRule,
  CreateRecurringRuleRequest,
  UpdateRecurringRuleRequest,
  ExecuteDueRecurringResult,
  calculateNextRunDate,
  formatDateOnly,
} from '@ledger/shared';
import { localDb, enqueueSyncAction, removeSyncQueueItem } from '../db';
import { networkMonitor } from './network';

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

export function getAuthHeaders(customHeaders: Record<string, string> = {}): HeadersInit {
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
      signal: AbortSignal.timeout(6000),
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
      signal: AbortSignal.timeout(6000),
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
 * 获取服务端注册模式与认证配置
 */
export async function getAuthConfig(): Promise<ApiResponse<AuthConfig>> {
  try {
    const res = await fetch(`${API_BASE}/auth/config`, {
      signal: AbortSignal.timeout(3000),
    });
    const json = (await res.json()) as ApiResponse<AuthConfig>;
    return json;
  } catch (err: any) {
    return {
      success: true,
      data: { reg_mode: 1 }, // 默认降级为 1 (邀请模式)
    };
  }
}

/**
 * 获取当前登录用户的邀请码信息与获取资格
 */
export async function getInviteCodes(): Promise<ApiResponse<InviteEligibilityInfo>> {
  try {
    const res = await fetch(`${API_BASE}/auth/invite-codes`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(4000),
    });
    const json = (await res.json()) as ApiResponse<InviteEligibilityInfo>;
    return json;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || '获取邀请码信息失败',
    };
  }
}

/**
 * 领取/生成新的邀请码
 */
export async function claimInviteCode(): Promise<ApiResponse<InviteCode>> {
  try {
    const res = await fetch(`${API_BASE}/auth/invite-codes`, {
      method: 'POST',
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(4000),
    });
    const json = (await res.json()) as ApiResponse<InviteCode>;
    return json;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || '生成邀请码失败',
    };
  }
}

/**
 * 找回密码 (凭 8 位密码恢复码重置密码)
 */
export async function resetPassword(req: ResetPasswordRequest): Promise<ApiResponse<void>> {
  try {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(6000),
    });
    const json = (await res.json()) as ApiResponse<void>;
    return json;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || '网络连接异常，重置密码失败',
    };
  }
}

/**
 * 用户注销账户 (彻底清除云端关联的所有记录)
 */
export async function deleteAccount(): Promise<ApiResponse<void>> {
  try {
    const res = await fetch(`${API_BASE}/auth/account`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as ApiResponse<void>;
    if (res.ok && json.success) {
      clearSession();
    }
    return json;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || '网络连接异常，注销账户失败',
    };
  }
}

/**
 * 检查后端 Cloudflare Workers + D1 连通状态
 */
export async function checkServerHealth() {
  return await networkMonitor.checkHealth();
}

/**
 * 获取分类列表 (优先从服务器获取并更新本地，失败则使用本地 IndexedDB)
 */
export async function getCategories(): Promise<Category[]> {
  try {
    const res = await fetch(`${API_BASE}/categories`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Category[]>;
      if (json.success && json.data && json.data.length > 0) {
        // 检查本地待同步队列，保护所有未同步的本地操作 (创建、修改、删除)
        const pendingQueue = await localDb.syncQueue
          .where('entity_type')
          .equals('category')
          .toArray();
        const pendingIds = new Set(pendingQueue.map((d) => d.entity_id));

        for (const cat of json.data) {
          if (!pendingIds.has(cat.category_id)) {
            await localDb.categories.put(cat);
          }
        }
        return await localDb.categories.orderBy('sort_order').toArray();
      }
    }
  } catch {
    // 离线降级
  }
  return await localDb.categories.orderBy('sort_order').toArray();
}

/**
 * 创建自定义分类 (离线优先：0ms 写入本地 Dexie，排队并静默推送)
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

  // 2. 加入离线同步队列
  const queueItem = await enqueueSyncAction({
    user_id: userId,
    entity_type: 'category',
    entity_id: categoryId,
    action: 'create',
    payload: newCat,
  });

  // 3. 异步尝试向服务端推送
  fetch(`${API_BASE}/categories`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(newCat),
    signal: AbortSignal.timeout(3000),
  })
    .then(async (res) => {
      if (res.ok) {
        await removeSyncQueueItem(queueItem.id);
      }
    })
    .catch(() => {
      console.log('离线模式：自定义分类已安全暂存本地并加入待同步队列。');
    });

  return newCat;
}

/**
 * 修改分类 (离线优先：0ms 写入本地 Dexie，排队并静默推送)
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

  // 2. 加入离线同步队列
  const queueItem = await enqueueSyncAction({
    user_id: userId,
    entity_type: 'category',
    entity_id: categoryId,
    action: 'update',
    payload: updates,
  });

  // 3. 异步尝试推送
  fetch(`${API_BASE}/categories/${categoryId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates),
    signal: AbortSignal.timeout(3000),
  })
    .then(async (res) => {
      if (res.ok) {
        await removeSyncQueueItem(queueItem.id);
      }
    })
    .catch(() => {
      console.log('离线模式：分类修改已暂存本地待同步。');
    });

  return updatedCat;
}

/**
 * 删除分类 (离线优先：0ms 写入本地 Dexie，防复活墓碑排队)
 */
export async function deleteCategory(categoryId: string): Promise<boolean> {
  const existing = await localDb.categories.get(categoryId);
  if (!existing) return false;

  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';

  // 1. 如果是大分类，级联删除本地子分类
  if (!existing.parent_id) {
    const children = await localDb.categories.where('parent_id').equals(categoryId).toArray();
    for (const child of children) {
      await localDb.categories.delete(child.category_id);
      await enqueueSyncAction({
        user_id: userId,
        entity_type: 'category',
        entity_id: child.category_id,
        action: 'delete',
      });
    }
  }

  // 2. 本地删除
  await localDb.categories.delete(categoryId);

  // 3. 记录防复活删除墓碑
  const queueItem = await enqueueSyncAction({
    user_id: userId,
    entity_type: 'category',
    entity_id: categoryId,
    action: 'delete',
  });

  // 4. 异步尝试向服务端删除
  fetch(`${API_BASE}/categories/${categoryId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(3000),
  })
    .then(async (res) => {
      if (res.ok) {
        await removeSyncQueueItem(queueItem.id);
      }
    })
    .catch(() => {
      console.log('离线模式：分类删除已记录墓碑，联网后将自动同步至云端。');
    });

  return true;
}

/**
 * 批量更新分类排序 (离线优先)
 */
export async function reorderCategories(items: ReorderCategoryItem[]): Promise<boolean> {
  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';

  // 1. 本地更新
  for (const item of items) {
    await localDb.categories.update(item.category_id, {
      sort_order: item.sort_order,
      updated_at: new Date().toISOString(),
    });
  }

  // 2. 加入离线同步队列
  const queueItem = await enqueueSyncAction({
    user_id: userId,
    entity_type: 'category',
    entity_id: 'batch_reorder',
    action: 'reorder',
    payload: { items },
  });

  // 3. 异步尝试推送
  fetch(`${API_BASE}/categories/reorder`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({ items }),
    signal: AbortSignal.timeout(3000),
  })
    .then(async (res) => {
      if (res.ok) {
        await removeSyncQueueItem(queueItem.id);
      }
    })
    .catch(() => {
      console.log('离线模式：分类排序已暂存本地。');
    });

  return true;
}

/**
 * 获取账本列表 (优先拉取服务端并同步至本地 Dexie，离线时读取本地)
 */
export async function getLedgers(withSummary = false): Promise<Ledger[]> {
  try {
    const url = `${API_BASE}/ledgers${withSummary ? '?withSummary=true' : ''}`;
    const res = await fetch(url, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Ledger[] | LedgerSummary[]>;
      if (json.success && json.data && Array.isArray(json.data) && json.data.length > 0) {
        const rawLedgers: Ledger[] = withSummary
          ? (json.data as LedgerSummary[]).map((s) => s.ledger)
          : (json.data as Ledger[]);

        // 检查待同步队列，保护本地所有待同步操作 (创建、修改、删除)
        const pendingQueue = await localDb.syncQueue
          .where('entity_type')
          .equals('ledger')
          .toArray();
        const pendingIds = new Set(pendingQueue.map((d) => d.entity_id));

        for (const l of rawLedgers) {
          if (!pendingIds.has(l.ledger_id)) {
            await localDb.ledgers.put(l);
          }
        }
        return await localDb.ledgers.orderBy('is_default').reverse().toArray();
      }
    }
  } catch {
    // 离线降级
  }
  return await localDb.ledgers.orderBy('is_default').reverse().toArray();
}

/**
 * 创建新账本 (离线优先：0ms 写入本地 Dexie，排队并静默推送)
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

  // 1. 本地持久化
  await localDb.ledgers.put(newLedger);

  // 2. 加入离线同步队列
  const queueItem = await enqueueSyncAction({
    user_id: userId,
    entity_type: 'ledger',
    entity_id: ledgerId,
    action: 'create',
    payload: newLedger,
  });

  // 3. 异步尝试推送
  fetch(`${API_BASE}/ledgers`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(newLedger),
    signal: AbortSignal.timeout(3000),
  })
    .then(async (res) => {
      if (res.ok) {
        await removeSyncQueueItem(queueItem.id);
      }
    })
    .catch(() => {
      console.log('离线模式：新账本已暂存本地。');
    });

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

  const queueItem = await enqueueSyncAction({
    user_id: userId,
    entity_type: 'ledger',
    entity_id: ledgerId,
    action: 'update',
    payload: updates,
  });

  fetch(`${API_BASE}/ledgers/${ledgerId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates),
    signal: AbortSignal.timeout(3000),
  })
    .then(async (res) => {
      if (res.ok) {
        await removeSyncQueueItem(queueItem.id);
      }
    })
    .catch(() => {
      console.log('离线模式：账本修改已暂存本地。');
    });

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

  const queueItem = await enqueueSyncAction({
    user_id: userId,
    entity_type: 'ledger',
    entity_id: ledgerId,
    action: 'set_default',
  });

  fetch(`${API_BASE}/ledgers/${ledgerId}/default`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(3000),
  })
    .then(async (res) => {
      if (res.ok) {
        await removeSyncQueueItem(queueItem.id);
      }
    })
    .catch(() => {
      console.log('离线模式：默认账本设置已记录。');
    });

  return true;
}

/**
 * 删除账本 (离线优先：0ms 本地级联删除流水，防复活墓碑排队)
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
    await enqueueSyncAction({
      user_id: userId,
      entity_type: 'transaction',
      entity_id: tx.transaction_id,
      action: 'delete',
    });
  }

  // 本地级联删除该账本下的所有预算
  const relatedBudgets = await localDb.budgets.where('ledger_id').equals(ledgerId).toArray();
  for (const b of relatedBudgets) {
    await localDb.budgets.delete(b.budget_id);
    await enqueueSyncAction({
      user_id: userId,
      entity_type: 'budget',
      entity_id: b.budget_id,
      action: 'delete',
    });
  }

  // 本地级联删除该账本下的所有周期记账规则
  const relatedRules = await localDb.recurring_rules.where('ledger_id').equals(ledgerId).toArray();
  for (const r of relatedRules) {
    await localDb.recurring_rules.delete(r.rule_id);
    await enqueueSyncAction({
      user_id: userId,
      entity_type: 'recurring',
      entity_id: r.rule_id,
      action: 'delete',
    });
  }

  // 本地删除账本
  await localDb.ledgers.delete(ledgerId);

  // 记录删除墓碑
  const queueItem = await enqueueSyncAction({
    user_id: userId,
    entity_type: 'ledger',
    entity_id: ledgerId,
    action: 'delete',
  });

  fetch(`${API_BASE}/ledgers/${ledgerId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(3000),
  })
    .then(async (res) => {
      if (res.ok) {
        await removeSyncQueueItem(queueItem.id);
      }
    })
    .catch(() => {
      console.log('离线模式：账本及关联流水已在本地删除。');
    });

  return { success: true };
}

/**
 * 从服务器拉取最新账本并与本地合并 (带防复活墓碑过滤)
 */
export async function pullAndMergeServerLedgers(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/ledgers`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Ledger[]>;
      if (json.success && Array.isArray(json.data)) {
        const serverLedgers = json.data;
        const pendingQueue = await localDb.syncQueue
          .where('entity_type')
          .equals('ledger')
          .toArray();
        const pendingIds = new Set(pendingQueue.map((d) => d.entity_id));

        for (const sLed of serverLedgers) {
          if (!pendingIds.has(sLed.ledger_id)) {
            await localDb.ledgers.put(sLed);
          }
        }
        return serverLedgers.length;
      }
    }
  } catch (err) {
    console.warn('拉取服务端账本数据失败 (可能离线):', err);
  }
  return 0;
}

/**
 * 创建新账单流水 (离线优先策略：0ms 写入本地 IndexedDB，若在线静默推送到 D1)
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

  // 1. 0ms 立即持久化至本地 IndexedDB
  await localDb.transactions.put(fullTx);

  // 2. 异步尝试向 Cloudflare Workers D1 推送
  fetch(`${API_BASE}/transactions`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(fullTx),
    signal: AbortSignal.timeout(3000),
  })
    .then(async (res) => {
      if (res.ok) {
        // BUG-12 修复：竞态条件保护，仅当本地记录未被再次修改时才更新为 synced
        const current = await localDb.transactions.get(fullTx.transaction_id);
        if (current && current.updated_at === fullTx.updated_at) {
          fullTx.sync_status = 'synced';
          await localDb.transactions.update(fullTx.transaction_id, { sync_status: 'synced' });
        }
      }
    })
    .catch(() => {
      console.log('离线模式：账单已安全保存在本地 IndexedDB，待恢复网络后自动同步。');
    });

  return fullTx;
}

/**
 * 更新账单流水 (离线优先：0ms 写入本地 IndexedDB，若在线异步同步到 D1)
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

  // 1. 0ms 立即持久化本地
  await localDb.transactions.put(updatedTx);

  // 2. 异步尝试推送
  fetch(`${API_BASE}/transactions/${transactionId}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(updatedTx),
    signal: AbortSignal.timeout(3000),
  })
    .then(async (res) => {
      if (res.ok) {
        // BUG-12 修复：竞态条件保护，仅当本地记录未被再次修改时才更新为 synced
        const current = await localDb.transactions.get(transactionId);
        if (current && current.updated_at === updatedTx.updated_at) {
          updatedTx.sync_status = 'synced';
          await localDb.transactions.update(transactionId, { sync_status: 'synced' });
        }
      }
    })
    .catch(() => {
      console.log('离线模式：修改已暂存本地，待恢复网络后同步。');
    });

  return updatedTx;
}

/**
 * 删除账单流水 (离线优先：0ms 本地删除，记录防复活墓碑，若在线异步删除)
 */
export async function deleteTransaction(transactionId: string): Promise<boolean> {
  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';

  // 1. 0ms 本地删除
  await localDb.transactions.delete(transactionId);

  // 2. 记录删除墓碑 (防止网络恢复时从服务端拉回复活)
  const queueItem = await enqueueSyncAction({
    user_id: userId,
    entity_type: 'transaction',
    entity_id: transactionId,
    action: 'delete',
  });

  // 3. 异步尝试向服务端发送删除请求
  fetch(`${API_BASE}/transactions/${transactionId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(3000),
  })
    .then(async (res) => {
      if (res.ok || res.status === 404) {
        await removeSyncQueueItem(queueItem.id);
      }
    })
    .catch(() => {
      console.log('离线模式：本地账单已删除并记录墓碑。');
    });

  return true;
}

/**
 * 从服务器拉取最新账单并与本地双向合并 (遵循 Last-Write-Wins 策略与防复活墓碑检查)
 */
export async function pullAndMergeServerTransactions(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/transactions?limit=500`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3500),
    });

    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Transaction[]>;
      if (json.success && Array.isArray(json.data)) {
        const serverList = json.data;

        // 墓碑过滤
        const pendingDeletes = await localDb.syncQueue
          .where('entity_type')
          .equals('transaction')
          .and((q) => q.action === 'delete')
          .toArray();
        const deletedIds = new Set(pendingDeletes.map((d) => d.entity_id));

        for (const serverTx of serverList) {
          // 如果本地已有删除墓碑，禁止复活
          if (deletedIds.has(serverTx.transaction_id)) {
            continue;
          }

          const localTx = await localDb.transactions.get(serverTx.transaction_id);
          if (!localTx) {
            // 本地没有，直接写入
            await localDb.transactions.put({ ...serverTx, sync_status: 'synced' });
          } else {
            // BUG-05 修复：本地已有记录且为 pending 时，跳过覆盖以保留离线修改；仅当本地已同步且服务端更新时间较新时才覆盖
            const localUpdated = new Date(localTx.updated_at).getTime();
            const serverUpdated = new Date(serverTx.updated_at).getTime();
            if (localTx.sync_status !== 'pending' && serverUpdated >= localUpdated) {
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
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Budget[]>;
      if (json.success && Array.isArray(json.data)) {
        const serverBudgets = json.data;
        // BUG-06 修复：保护本地所有待推送的预算变更 (包括单个修改/删除与批量配置)
        const pendingQueue = await localDb.syncQueue
          .where('entity_type')
          .equals('budget')
          .toArray();
        const pendingIds = new Set(pendingQueue.map((d) => d.entity_id));

        for (const b of serverBudgets) {
          if (!pendingIds.has(b.budget_id) && !pendingIds.has(`${b.ledger_id}_${b.period}`)) {
            await localDb.budgets.put(b);
          }
        }
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
 * 批量设置预算 (离线优先：0ms 写入本地 Dexie，排队并静默推送)
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

  // 3. 加入离线同步队列
  const queueItem = await enqueueSyncAction({
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

  // 4. 异步尝试向服务端同步
  fetch(`${API_BASE}/budgets/batch`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      ledger_id: ledgerId,
      period,
      budgets,
    } as BatchSetBudgetRequest),
    signal: AbortSignal.timeout(3000),
  })
    .then(async (res) => {
      if (res.ok) {
        await removeSyncQueueItem(queueItem.id);
      }
    })
    .catch(() => {
      console.log('离线模式：预算配置已保存在本地 IndexedDB。');
    });

  return localList;
}

/**
 * 删除预算
 */
export async function deleteBudget(budgetId: string): Promise<boolean> {
  const user = getStoredUser();
  const userId = user?.user_id || 'default_user';

  await localDb.budgets.delete(budgetId);

  const queueItem = await enqueueSyncAction({
    user_id: userId,
    entity_type: 'budget',
    entity_id: budgetId,
    action: 'delete',
  });

  fetch(`${API_BASE}/budgets/${budgetId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
    signal: AbortSignal.timeout(3000),
  })
    .then(async (res) => {
      if (res.ok) {
        await removeSyncQueueItem(queueItem.id);
      }
    })
    .catch(() => {
      console.log('离线模式：本地预算已删除。');
    });

  return true;
}

/**
 * 从服务器拉取最新预算数据并与本地合并 (带防复活墓碑检查)
 */
export async function pullAndMergeServerBudgets(): Promise<number> {
  try {
    const res = await fetch(`${API_BASE}/budgets`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Budget[]>;
      if (json.success && Array.isArray(json.data)) {
        const serverBudgets = json.data;
        // BUG-06 修复：保护本地所有待推送的预算变更
        const pendingQueue = await localDb.syncQueue
          .where('entity_type')
          .equals('budget')
          .toArray();
        const pendingIds = new Set(pendingQueue.map((d) => d.entity_id));

        for (const b of serverBudgets) {
          if (!pendingIds.has(b.budget_id) && !pendingIds.has(`${b.ledger_id}_${b.period}`)) {
            await localDb.budgets.put(b);
          }
        }
        return serverBudgets.length;
      }
    }
  } catch (err) {
    console.warn('拉取服务端预算数据失败 (可能离线):', err);
  }
  return 0;
}

/**
 * 批量导入账单流水 (离线优先 + 分批推送 D1，遵循白皮书 6.3 Worker CPU 限制规范)
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

  // 1. 本地 IndexedDB 极速批量写入
  const preparedTxs: Transaction[] = transactions.map((t) => ({
    ...t,
    user_id: userId,
    sync_status: (user ? 'pending' : 'synced') as 'pending' | 'synced',
    created_at: t.created_at || now,
    updated_at: t.updated_at || now,
  }));

  await localDb.transactions.bulkPut(preparedTxs);
  if (onProgress) onProgress(40);

  // 2. 如果用户已登录且网络在线，按批次分批推送至 Cloudflare D1
  const token = getStoredToken();
  const net = networkMonitor.getInfo();

  if (user && token && net.isOnline) {
    const CHUNK_SIZE = 100;
    const totalChunks = Math.ceil(preparedTxs.length / CHUNK_SIZE);

    for (let chunkIdx = 0; chunkIdx < totalChunks; chunkIdx++) {
      const chunk = preparedTxs.slice(chunkIdx * CHUNK_SIZE, (chunkIdx + 1) * CHUNK_SIZE);
      try {
        const res = await fetch(`${API_BASE}/transactions/sync`, {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ transactions: chunk }),
          signal: AbortSignal.timeout(15000),
        });

        if (res.ok) {
          const json = (await res.json()) as ApiResponse<SyncBatchResponse>;
          if (json.success && json.data) {
            const syncedIds = new Set(json.data.synced_ids);
            const syncedTxs: Transaction[] = [];
            for (const tx of chunk) {
              if (syncedIds.has(tx.transaction_id)) {
                syncedTxs.push({ ...tx, sync_status: 'synced' });
              }
            }
            if (syncedTxs.length > 0) {
              await localDb.transactions.bulkPut(syncedTxs);
            }
          }
        }
      } catch (err) {
        console.warn('Batch chunk sync notice (will retry in background):', err);
      }

      if (onProgress) {
        const currentPercent = 40 + Math.round(((chunkIdx + 1) / totalChunks) * 60);
        onProgress(Math.min(currentPercent, 100));
      }
    }
  } else {
    if (onProgress) onProgress(100);
  }

  return {
    success: true,
    importedCount: preparedTxs.length,
  };
}

/**
 * ==========================================
 * 周期记账规则 API (离线优先 + 自动云端同步)
 * ==========================================
 */

/**
 * 获取当前用户的周期记账规则列表 (优先读取本地，在线时从云端拉取增量合并)
 */
export async function getRecurringRules(): Promise<RecurringRule[]> {
  const user = getStoredUser();
  const userId = user?.user_id;

  if (userId) {
    const list = await localDb.recurring_rules.where('user_id').equals(userId).toArray();
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } else {
    // 访客/未登录用户本地规则
    const list = await localDb.recurring_rules.toArray();
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }
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
    auto_record: req.auto_record !== undefined ? req.auto_record : 1,
    created_at: now,
    updated_at: now,
  };

  // 1. 本地持久化
  await localDb.recurring_rules.put(newRule);

  // 2. 加入离线同步队列
  if (user) {
    const queueItem = await enqueueSyncAction({
      user_id: userId,
      entity_type: 'recurring',
      entity_id: ruleId,
      action: 'create',
      payload: newRule,
    });

    // 3. 尝试即时异步推送
    fetch(`${API_BASE}/recurring`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(newRule),
      signal: AbortSignal.timeout(3000),
    })
      .then(async (res) => {
        if (res.ok) {
          await removeSyncQueueItem(queueItem.id);
        }
      })
      .catch(() => {
        console.log('离线模式：新周期规则已暂存本地。');
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
  const updated: RecurringRule = {
    ...existing,
    ...updates,
    updated_at: now,
  };

  await localDb.recurring_rules.put(updated);

  const user = getStoredUser();
  if (user) {
    const queueItem = await enqueueSyncAction({
      user_id: user.user_id,
      entity_type: 'recurring',
      entity_id: ruleId,
      action: 'update',
      payload: updates,
    });

    fetch(`${API_BASE}/recurring/${ruleId}`, {
      method: 'PUT',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
      signal: AbortSignal.timeout(3000),
    })
      .then(async (res) => {
        if (res.ok) {
          await removeSyncQueueItem(queueItem.id);
        }
      })
      .catch(() => {});
  }

  return updated;
}

/**
 * 删除周期记账规则 (离线优先)
 */
export async function deleteRecurringRule(ruleId: string): Promise<void> {
  await localDb.recurring_rules.delete(ruleId);

  const user = getStoredUser();
  if (user) {
    const queueItem = await enqueueSyncAction({
      user_id: user.user_id,
      entity_type: 'recurring',
      entity_id: ruleId,
      action: 'delete',
    });

    fetch(`${API_BASE}/recurring/${ruleId}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(3000),
    })
      .then(async (res) => {
        if (res.ok) {
          await removeSyncQueueItem(queueItem.id);
        }
      })
      .catch(() => {});
  }
}

/**
 * 云端拉取周期规则并与本地合并
 */
export async function pullAndMergeServerRecurringRules(userId: string): Promise<RecurringRule[]> {
  try {
    const res = await fetch(`${API_BASE}/recurring`, {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return await getRecurringRules();

    const json = (await res.json()) as ApiResponse<RecurringRule[]>;
    if (json.success && json.data) {
      const serverRules = json.data;

      // 提取本地待同步队列中正在操作的规则 ID
      const pendingQueue = await localDb.syncQueue
        .where('entity_type')
        .equals('recurring')
        .toArray();
      const pendingIds = new Set(pendingQueue.map((q) => q.entity_id));

      for (const sRule of serverRules) {
        if (!pendingIds.has(sRule.rule_id)) {
          await localDb.recurring_rules.put(sRule);
        }
      }

      return await getRecurringRules();
    }
  } catch (err) {
    console.warn('拉取云端周期规则失败，使用本地缓存:', err);
  }

  return await getRecurringRules();
}

/**
 * 触发服务端执行到期周期规则
 */
export async function executeDueRecurringRules(
  asOfDate?: string
): Promise<ApiResponse<ExecuteDueRecurringResult>> {
  try {
    const res = await fetch(`${API_BASE}/recurring/execute-due`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ as_of_date: asOfDate }),
      signal: AbortSignal.timeout(6000),
    });

    return (await res.json()) as ApiResponse<ExecuteDueRecurringResult>;
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || '网络请求错误，无法执行到期周期规则',
    };
  }
}

