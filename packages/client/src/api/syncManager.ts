/**
 * 账盾 - 统一离线同步管理器 (Unified Offline Sync Engine)
 * 践行《白皮书 2.0, 6.1, 7.3》规范：
 * - 离线变更日志时序重放 (Replay Mutation Queue)
 * - 离线删除防复活墓碑机制 (Tombstone Deletion Protection)
 * - 弱网无阻塞与断网恢复后台静默自动同步 (Auto-Sync on Reconnect)
 * - Last-Write-Wins (最后修改者胜出) 双向增量冲突合并
 */

import {
  ApiResponse,
  Transaction,
  Category,
  Ledger,
  Budget,
  SyncBatchResponse,
} from '@ledger/shared';
import {
  localDb,
  getPendingSyncQueue,
  removeSyncQueueItem,
  incrementSyncQueueAttempts,
  SyncQueueItem,
} from '../db';
import { networkMonitor } from './network';
import {
  getStoredToken,
  getStoredUser,
  pullAndMergeServerTransactions,
  pullAndMergeServerLedgers,
  pullAndMergeServerBudgets,
  getCategories,
} from './client';

const API_BASE = (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, '') : '') + '/api';
const LAST_SYNC_KEY = 'serverless_ledger_last_synced';

export interface SyncStats {
  lastSyncedAt: string | null;
  syncedMutationsCount: number;
  syncedTransactionsCount: number;
  isSyncing: boolean;
  error?: string;
}

class SyncManager {
  private isSyncing = false;
  private autoSyncTimer: any = null;
  private listeners: Set<(stats: SyncStats) => void> = new Set();
  private lastSyncedAt: string | null = null;

  constructor() {
    if (typeof localStorage !== 'undefined') {
      this.lastSyncedAt = localStorage.getItem(LAST_SYNC_KEY);
    }
  }

  /**
   * 启动同步管理器：监听网络状态并在网络恢复时触发自动同步
   */
  public start() {
    // 监听网络感知器变化
    networkMonitor.subscribe((info) => {
      if (info.isOnline && info.state !== 'syncing' && !this.isSyncing) {
        // 网络恢复或保持在线，静默尝试同步离线队列
        this.triggerAutoSync();
      }
    });

    // 启动周期性静默同步轮询 (每 45 秒)
    if (this.autoSyncTimer) clearInterval(this.autoSyncTimer);
    this.autoSyncTimer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        const net = networkMonitor.getInfo();
        if (net.isOnline && !this.isSyncing) {
          this.triggerAutoSync();
        }
      }
    }, 45000);
  }

  public stop() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  private triggerAutoSync() {
    const user = getStoredUser();
    const token = getStoredToken();
    if (user && token) {
      this.syncAll(true).catch((err) => {
        console.warn('[SyncManager] Auto silent sync notice:', err?.message);
      });
    }
  }

  private getAuthHeaders(): HeadersInit {
    const token = getStoredToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * 执行全量双向无感静默同步
   * 1. 时序重放离线变更队列 (syncQueue: 分类/账本/预算/流水增删改)
   * 2. 批量推送未同步流水 (POST /api/transactions/sync)
   * 3. 双向增量拉取服务端变更并以 Last-Write-Wins 规则合并
   */
  public async syncAll(silent = false): Promise<{
    success: boolean;
    syncedQueueCount: number;
    syncedTransactionsCount: number;
    error?: string;
  }> {
    if (this.isSyncing) {
      return { success: false, syncedQueueCount: 0, syncedTransactionsCount: 0, error: '同步已在进行中' };
    }

    const token = getStoredToken();
    const user = getStoredUser();
    if (!token || !user) {
      return { success: false, syncedQueueCount: 0, syncedTransactionsCount: 0, error: '未登录' };
    }

    this.isSyncing = true;
    networkMonitor.setSyncing(true);
    this.notifyStats();

    let syncedQueueCount = 0;
    let syncedTxCount = 0;
    let syncError: string | undefined;

    try {
      // 1. 时序重放离线变更队列 (分类、账本、预算、流水删除等)
      const queueItems = await getPendingSyncQueue(user.user_id);
      for (const item of queueItems) {
        const ok = await this.replayQueueItem(item);
        if (ok) {
          await removeSyncQueueItem(item.id);
          syncedQueueCount++;
        } else {
          await incrementSyncQueueAttempts(item.id, '网络请求失败');
        }
      }

      // 2. 批量推送待同步的账单流水
      const pendingTxs = await localDb.transactions
        .where('user_id')
        .equals(user.user_id)
        .and((t) => t.sync_status === 'pending')
        .toArray();

      if (pendingTxs.length > 0) {
        try {
          const res = await fetch(`${API_BASE}/transactions/sync`, {
            method: 'POST',
            headers: this.getAuthHeaders(),
            body: JSON.stringify({ transactions: pendingTxs }),
            signal: AbortSignal.timeout(6000),
          });

          if (res.ok) {
            const json = (await res.json()) as ApiResponse<SyncBatchResponse>;
            if (json.success && json.data) {
              const syncedIds = new Set(json.data.synced_ids);
              for (const tx of pendingTxs) {
                if (syncedIds.has(tx.transaction_id)) {
                  await localDb.transactions.update(tx.transaction_id, { sync_status: 'synced' });
                  syncedTxCount++;
                }
              }
            }
          }
        } catch (err: any) {
          console.warn('[SyncManager] Push pending transactions failed:', err);
        }
      }

      // 3. 双向增量拉取最新数据并合并 (分类、账本、预算、流水)
      await getCategories();
      await pullAndMergeServerLedgers();
      await pullAndMergeServerBudgets();
      await pullAndMergeServerTransactions();

      const now = new Date().toISOString();
      this.lastSyncedAt = now;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LAST_SYNC_KEY, now);
      }

      return {
        success: true,
        syncedQueueCount,
        syncedTransactionsCount: syncedTxCount,
      };
    } catch (err: any) {
      syncError = err?.message || '同步过程中发生异常';
      return {
        success: false,
        syncedQueueCount,
        syncedTransactionsCount: syncedTxCount,
        error: syncError,
      };
    } finally {
      this.isSyncing = false;
      networkMonitor.setSyncing(false);
      this.notifyStats(syncError);
    }
  }

  /**
   * 单项变更重放
   */
  private async replayQueueItem(item: SyncQueueItem): Promise<boolean> {
    try {
      const headers = this.getAuthHeaders();
      const signal = AbortSignal.timeout(4000);

      switch (item.entity_type) {
        case 'transaction': {
          if (item.action === 'delete') {
            const res = await fetch(`${API_BASE}/transactions/${item.entity_id}`, {
              method: 'DELETE',
              headers,
              signal,
            });
            return res.ok || res.status === 404;
          }
          break;
        }

        case 'category': {
          if (item.action === 'create') {
            const res = await fetch(`${API_BASE}/categories`, {
              method: 'POST',
              headers,
              body: JSON.stringify(item.payload),
              signal,
            });
            return res.ok || res.status === 409;
          } else if (item.action === 'update') {
            const res = await fetch(`${API_BASE}/categories/${item.entity_id}`, {
              method: 'PUT',
              headers,
              body: JSON.stringify(item.payload),
              signal,
            });
            return res.ok;
          } else if (item.action === 'delete') {
            const res = await fetch(`${API_BASE}/categories/${item.entity_id}`, {
              method: 'DELETE',
              headers,
              signal,
            });
            return res.ok || res.status === 404;
          } else if (item.action === 'reorder') {
            const res = await fetch(`${API_BASE}/categories/reorder`, {
              method: 'PUT',
              headers,
              body: JSON.stringify(item.payload),
              signal,
            });
            return res.ok;
          }
          break;
        }

        case 'ledger': {
          if (item.action === 'create') {
            const res = await fetch(`${API_BASE}/ledgers`, {
              method: 'POST',
              headers,
              body: JSON.stringify(item.payload),
              signal,
            });
            return res.ok || res.status === 409;
          } else if (item.action === 'update') {
            const res = await fetch(`${API_BASE}/ledgers/${item.entity_id}`, {
              method: 'PUT',
              headers,
              body: JSON.stringify(item.payload),
              signal,
            });
            return res.ok;
          } else if (item.action === 'set_default') {
            const res = await fetch(`${API_BASE}/ledgers/${item.entity_id}/default`, {
              method: 'PUT',
              headers,
              signal,
            });
            return res.ok;
          } else if (item.action === 'delete') {
            const res = await fetch(`${API_BASE}/ledgers/${item.entity_id}`, {
              method: 'DELETE',
              headers,
              signal,
            });
            return res.ok || res.status === 404;
          }
          break;
        }

        case 'budget': {
          if (item.action === 'create') {
            const res = await fetch(`${API_BASE}/budgets`, {
              method: 'POST',
              headers,
              body: JSON.stringify(item.payload),
              signal,
            });
            return res.ok;
          } else if (item.action === 'batch_set') {
            const res = await fetch(`${API_BASE}/budgets/batch`, {
              method: 'PUT',
              headers,
              body: JSON.stringify(item.payload),
              signal,
            });
            return res.ok;
          } else if (item.action === 'delete') {
            const res = await fetch(`${API_BASE}/budgets/${item.entity_id}`, {
              method: 'DELETE',
              headers,
              signal,
            });
            return res.ok || res.status === 404;
          }
          break;
        }
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  public getStats(): SyncStats {
    return {
      lastSyncedAt: this.lastSyncedAt,
      syncedMutationsCount: 0,
      syncedTransactionsCount: 0,
      isSyncing: this.isSyncing,
    };
  }

  public subscribe(listener: (stats: SyncStats) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStats());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyStats(error?: string) {
    const stats: SyncStats = {
      lastSyncedAt: this.lastSyncedAt,
      syncedMutationsCount: 0,
      syncedTransactionsCount: 0,
      isSyncing: this.isSyncing,
      error,
    };
    for (const listener of this.listeners) {
      try {
        listener(stats);
      } catch (e) {
        console.error('Error in sync listener:', e);
      }
    }
  }
}

export const syncManager = new SyncManager();
