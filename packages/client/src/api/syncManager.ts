/**
 * 账盾 - 统一离线与云端同步管理器 (Pluggable Local-First Sync Engine)
 * 践行《白皮书 2.0, 6.1, 7.3》规范：
 * - 插件化同步适配器 (ISyncAdapter / CloudflareSyncAdapter)
 * - 当未配置云同步 (provider === 'none') 时保持完全休眠 (Dormant)，不启动任何计时器、心跳或轮询
 * - 当配置云同步时，提供断网自动恢复同步、缓和周期同步、队列重放、批量推送与 Last-Write-Wins 增量合并
 */

import {
  Transaction,
  Category,
  Ledger,
  Budget,
  RecurringRule,
} from '@ledger/shared';
import {
  localDb,
  getPendingSyncQueue,
  removeSyncQueueItem,
  incrementSyncQueueAttempts,
  getLocalStorageStats,
  exportAllLocalData,
  migrateGuestDataToUser,
} from '../db';
import { networkMonitor } from './network';
import { getStoredUser } from './cloudAuth';
import {
  getSyncConfig,
  saveSyncConfig,
  isCloudSyncEnabled,
  getEffectiveSyncAdapter,
  LAST_SYNC_KEY,
} from '../sync/syncAdapter';

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
  private lastAutoSyncTimestamp = 0;

  constructor() {
    if (typeof localStorage !== 'undefined') {
      this.lastSyncedAt = localStorage.getItem(LAST_SYNC_KEY);
    }

    // 监听云同步配置变更事件，动态启动或休眠同步引擎
    if (typeof window !== 'undefined') {
      window.addEventListener('sync:config_changed', (e: any) => {
        const detail = e.detail;
        if (detail?.lastSyncedAt !== undefined) {
          this.lastSyncedAt = detail.lastSyncedAt;
        }
        if (isCloudSyncEnabled()) {
          this.restartTimer();
        } else {
          this.stop();
        }
      });
    }
  }

  /**
   * 启动同步管理器：
   * 1. 仅在已配置云同步且开启 autoSyncEnabled 时激活后台轮询与断网恢复探测
   * 2. 若未配置云同步 (provider === 'none')，保持休眠状态
   */
  public start() {
    if (!isCloudSyncEnabled()) {
      // 保持休眠
      return;
    }

    let wasOffline = !networkMonitor.getInfo().isOnline;

    // 监听网络状态变更：从“离线”跃迁至“在线”时触发断网恢复同步
    networkMonitor.subscribe((info) => {
      const justCameOnline = wasOffline && info.isOnline;
      wasOffline = !info.isOnline;

      if (justCameOnline && info.state !== 'syncing' && !this.isSyncing && isCloudSyncEnabled()) {
        console.log('[SyncManager] 网络已恢复在线，执行平滑自动同步...');
        this.triggerAutoSync({ minIntervalMs: 10000 });
      }
    });

    this.restartTimer();
  }

  private restartTimer() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }

    if (!isCloudSyncEnabled()) {
      return;
    }

    const config = getSyncConfig();
    const intervalMs = (config.syncIntervalSeconds || 60) * 1000;

    this.autoSyncTimer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        const net = networkMonitor.getInfo();
        if (net.isOnline && !this.isSyncing && isCloudSyncEnabled()) {
          this.triggerAutoSync({ minIntervalMs: intervalMs });
        }
      }
    }, intervalMs);
  }

  public stop() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }

  /**
   * 缓和的自动静默同步触发器 (带冷却时间与未同步前置判断)
   */
  private async triggerAutoSync(options?: { minIntervalMs?: number }) {
    if (!isCloudSyncEnabled()) return;

    const minInterval = options?.minIntervalMs ?? 60000;
    const now = Date.now();

    if (now - this.lastAutoSyncTimestamp < minInterval) {
      return;
    }

    const user = getStoredUser();
    if (!user) return;

    try {
      const stats = await getLocalStorageStats();
      if (stats.totalPending === 0 && now - this.lastAutoSyncTimestamp < 120000) {
        return;
      }
    } catch {
      // 容错处理
    }

    this.lastAutoSyncTimestamp = now;
    this.syncAll(true).catch((err) => {
      console.warn('[SyncManager] Auto silent sync notice:', err?.message);
    });
  }

  /**
   * 执行全量双向无感静默同步
   * 1. 使用 ISyncAdapter 重放离线变更队列 (syncQueue)
   * 2. 批量分片推送未同步流水 (pending transactions)
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

    if (!isCloudSyncEnabled()) {
      return { success: true, syncedQueueCount: 0, syncedTransactionsCount: 0 };
    }

    const adapter = getEffectiveSyncAdapter();
    if (!adapter) {
      return { success: true, syncedQueueCount: 0, syncedTransactionsCount: 0 };
    }

    const user = getStoredUser();
    if (!user) {
      return { success: false, syncedQueueCount: 0, syncedTransactionsCount: 0, error: '未登录' };
    }

    this.isSyncing = true;
    networkMonitor.setSyncing(true);
    this.notifyStats();

    let syncedQueueCount = 0;
    let syncedTxCount = 0;
    let syncError: string | undefined;

    try {
      // 0. 前置自动迁移任何未归属的本地离线访客数据至当前登录用户
      await migrateGuestDataToUser(user.user_id);

      // 1. 获取待同步变更队列与待同步流水
      const queueItems = await getPendingSyncQueue(user.user_id);
      const pendingTxs = await localDb.transactions
        .where('user_id')
        .equals(user.user_id)
        .and((t) => t.sync_status === 'pending')
        .toArray();

      // 2. 通过 ISyncAdapter 推送本地变更
      if (queueItems.length > 0 || pendingTxs.length > 0) {
        const pushResult = await adapter.pushChanges({
          transactions: pendingTxs,
          mutations: queueItems.map((q) => ({
            entity_type: q.entity_type,
            entity_id: q.entity_id,
            action: q.action,
            payload: q.payload,
          })),
        });

        // 清理已成功推送的变更队列
        for (const item of queueItems) {
          await removeSyncQueueItem(item.id);
          syncedQueueCount++;
        }

        // 更新已成功推送的流水状态为 synced
        const syncedIds = new Set(pushResult.syncedTransactionIds);
        if (syncedIds.size > 0) {
          await localDb.transaction('rw', localDb.transactions, async () => {
            for (const tx of pendingTxs) {
              if (syncedIds.has(tx.transaction_id)) {
                await localDb.transactions.update(tx.transaction_id, {
                  sync_status: 'synced',
                });
                syncedTxCount++;
              }
            }
          });
        }
      }

      // 3. 通过 ISyncAdapter 双向增量拉取最新数据
      const pullResult = await adapter.pullChanges(this.lastSyncedAt);

      // 4. 增量数据合并 (结合防复活墓碑保护与 Last-Write-Wins 策略)
      await localDb.transaction(
        'rw',
        [
          localDb.categories,
          localDb.ledgers,
          localDb.budgets,
          localDb.transactions,
          localDb.recurring_rules,
          localDb.syncQueue,
        ],
        async () => {
          // 合并分类
          const pendingCatQueue = await localDb.syncQueue
            .where('entity_type')
            .equals('category')
            .toArray();
          const pendingCatIds = new Set(pendingCatQueue.map((q) => q.entity_id));
          for (const cat of pullResult.categories) {
            if (!pendingCatIds.has(cat.category_id)) {
              await localDb.categories.put(cat);
            }
          }

          // 合并账本
          const pendingLedgerQueue = await localDb.syncQueue
            .where('entity_type')
            .equals('ledger')
            .toArray();
          const pendingLedgerIds = new Set(pendingLedgerQueue.map((q) => q.entity_id));
          for (const led of pullResult.ledgers) {
            if (!pendingLedgerIds.has(led.ledger_id)) {
              await localDb.ledgers.put(led);
            }
          }

          // 确保本地所有账本中严格保证只有 1 个默认账本 (is_default === 1)
          const allLocalLeds = await localDb.ledgers.toArray();
          const defaultLeds = allLocalLeds.filter((l) => l.is_default === 1);
          if (defaultLeds.length > 1) {
            defaultLeds.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
            for (let i = 1; i < defaultLeds.length; i++) {
              await localDb.ledgers.update(defaultLeds[i].ledger_id, { is_default: 0 });
            }
          }

          // 合并预算
          const pendingBudgetQueue = await localDb.syncQueue
            .where('entity_type')
            .equals('budget')
            .toArray();
          const pendingBudgetIds = new Set(pendingBudgetQueue.map((q) => q.entity_id));
          for (const b of pullResult.budgets) {
            if (!pendingBudgetIds.has(b.budget_id) && !pendingBudgetIds.has(`${b.ledger_id}_${b.period}`)) {
              await localDb.budgets.put(b);
            }
          }

          // 合并周期规则
          const pendingRuleQueue = await localDb.syncQueue
            .where('entity_type')
            .equals('recurring')
            .toArray();
          const pendingRuleIds = new Set(pendingRuleQueue.map((q) => q.entity_id));
          for (const r of pullResult.recurringRules) {
            if (!pendingRuleIds.has(r.rule_id)) {
              await localDb.recurring_rules.put(r);
            }
          }

          // 合并流水 (LWW + 墓碑过滤)
          const pendingTxDeletes = await localDb.syncQueue
            .where('entity_type')
            .equals('transaction')
            .and((q) => q.action === 'delete')
            .toArray();
          const deletedTxIds = new Set(pendingTxDeletes.map((d) => d.entity_id));

          for (const sTx of pullResult.transactions) {
            if (deletedTxIds.has(sTx.transaction_id)) {
              continue;
            }

            const lTx = await localDb.transactions.get(sTx.transaction_id);
            if (!lTx) {
              await localDb.transactions.put({ ...sTx, sync_status: 'synced' });
            } else if (lTx.sync_status !== 'pending') {
              const localUpdated = new Date(lTx.updated_at).getTime();
              const serverUpdated = new Date(sTx.updated_at).getTime();
              if (serverUpdated >= localUpdated) {
                await localDb.transactions.put({ ...sTx, sync_status: 'synced' });
              }
            }
          }
        }
      );

      const serverTime = pullResult.serverTime || new Date().toISOString();
      this.lastSyncedAt = serverTime;
      this.lastAutoSyncTimestamp = Date.now();
      saveSyncConfig({ lastSyncedAt: serverTime });

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
   * 首次全量同步 (支持 双向初始合并 / 全量推送到云端 / 从云端全量覆盖本地)
   */
  public async fullSync(direction: 'bidirectional' | 'push_local_to_cloud' | 'pull_cloud_to_local' = 'bidirectional'): Promise<{
    success: boolean;
    syncedTransactionsCount: number;
    error?: string;
  }> {
    const adapter = getEffectiveSyncAdapter();
    if (!adapter) {
      return { success: false, syncedTransactionsCount: 0, error: '未启用云端同步适配器' };
    }

    const user = getStoredUser();
    if (!user) {
      return { success: false, syncedTransactionsCount: 0, error: '未登录' };
    }

    this.isSyncing = true;
    networkMonitor.setSyncing(true);
    this.notifyStats();

    try {
      if (direction === 'push_local_to_cloud') {
        await migrateGuestDataToUser(user.user_id);
        const localData = await exportAllLocalData(user.user_id);
        const mutations: Array<{ entity_type: string; entity_id: string; action: string; payload?: any }> = [];

        // 仅推送用户自定义分类，系统默认分类服务端已有预置，无需重复写入
        for (const cat of localData.categories) {
          if (cat.user_id) {
            mutations.push({ entity_type: 'category', entity_id: cat.category_id, action: 'create', payload: cat });
          }
        }
        for (const led of localData.ledgers) {
          mutations.push({ entity_type: 'ledger', entity_id: led.ledger_id, action: 'create', payload: led });
        }
        for (const b of localData.budgets) {
          mutations.push({ entity_type: 'budget', entity_id: b.budget_id, action: 'create', payload: b });
        }
        for (const r of localData.recurringRules) {
          mutations.push({ entity_type: 'recurring', entity_id: r.rule_id, action: 'create', payload: r });
        }

        const pushRes = await adapter.pushChanges({
          transactions: localData.transactions,
          mutations,
        });

        // 标记本地流水全部已同步
        await localDb.transactions.where('user_id').equals(user.user_id).modify({ sync_status: 'synced' });
        await localDb.syncQueue.where('user_id').equals(user.user_id).delete();

        const now = pushRes.serverTime || new Date().toISOString();
        this.lastSyncedAt = now;
        saveSyncConfig({ lastSyncedAt: now });

        return { success: true, syncedTransactionsCount: pushRes.syncedTransactionIds.length };
      }

      if (direction === 'pull_cloud_to_local') {
        const pullRes = await adapter.pullChanges(null);
        await localDb.transaction(
          'rw',
          [localDb.transactions, localDb.categories, localDb.ledgers, localDb.budgets, localDb.recurring_rules],
          async () => {
            if (pullRes.categories.length > 0) {
              await localDb.categories.bulkPut(pullRes.categories);
            }
            if (pullRes.ledgers.length > 0) {
              await localDb.ledgers.bulkPut(pullRes.ledgers);
            }
            if (pullRes.budgets.length > 0) {
              await localDb.budgets.bulkPut(pullRes.budgets);
            }
            if (pullRes.recurringRules.length > 0) {
              await localDb.recurring_rules.bulkPut(pullRes.recurringRules);
            }
            if (pullRes.transactions.length > 0) {
              const normalized = pullRes.transactions.map((t) => ({ ...t, sync_status: 'synced' as const }));
              await localDb.transactions.bulkPut(normalized);
            }
          }
        );

        const now = pullRes.serverTime || new Date().toISOString();
        this.lastSyncedAt = now;
        saveSyncConfig({ lastSyncedAt: now });

        return { success: true, syncedTransactionsCount: pullRes.transactions.length };
      }

      // 默认双向合并
      const res = await this.syncAll();
      return { success: res.success, syncedTransactionsCount: res.syncedTransactionsCount, error: res.error };
    } catch (err: any) {
      return { success: false, syncedTransactionsCount: 0, error: err?.message || '全量同步异常' };
    } finally {
      this.isSyncing = false;
      networkMonitor.setSyncing(false);
      this.notifyStats();
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
