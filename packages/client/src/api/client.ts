import { ApiResponse, Category, Ledger, Transaction, SyncBatchResponse } from '@ledger/shared';
import { localDb } from '../db';

const API_BASE = '/api';

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
    const res = await fetch(`${API_BASE}/categories`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const json = (await res.json()) as ApiResponse<Category[]>;
      if (json.success && json.data && json.data.length > 0) {
        // 同步存入本地
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
 * 创建新账单流水 (离线优先策略：先写入本地 IndexedDB，若在线则静默推送到 D1)
 */
export async function createTransaction(tx: Omit<Transaction, 'sync_status' | 'created_at' | 'updated_at'> & { sync_status?: 'synced' | 'pending' }) {
  const now = new Date().toISOString();
  const fullTx: Transaction = {
    ...tx,
    sync_status: tx.sync_status || 'pending',
    created_at: now,
    updated_at: now,
  };

  // 1. 立即持久化至本地 IndexedDB
  await localDb.transactions.put(fullTx);

  // 2. 尝试向 Cloudflare Workers D1 推送
  try {
    const res = await fetch(`${API_BASE}/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fullTx),
      signal: AbortSignal.timeout(3000),
    });

    if (res.ok) {
      fullTx.sync_status = 'synced';
      await localDb.transactions.update(fullTx.transaction_id, { sync_status: 'synced' });
    }
  } catch {
    console.log('网络不可用或处于离线状态，账单已安全保存至本地 IndexedDB，将在联网后自动同步。');
  }

  return fullTx;
}

/**
 * 触发本地未同步数据的全量静默同步
 */
export async function syncPendingTransactions(): Promise<{ syncedCount: number; success: boolean }> {
  try {
    const pendingList = await localDb.transactions.where('sync_status').equals('pending').toArray();
    if (pendingList.length === 0) {
      return { syncedCount: 0, success: true };
    }

    const res = await fetch(`${API_BASE}/transactions/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions: pendingList }),
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) throw new Error('Sync endpoint returned error');

    const json = (await res.json()) as ApiResponse<SyncBatchResponse>;
    if (json.success && json.data) {
      const syncedIds = json.data.synced_ids;
      for (const id of syncedIds) {
        await localDb.transactions.update(id, { sync_status: 'synced' });
      }
      return { syncedCount: syncedIds.length, success: true };
    }
  } catch (err) {
    console.warn('Sync failed:', err);
  }
  return { syncedCount: 0, success: false };
}
