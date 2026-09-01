/**
 * 账盾 - 统一云同步适配器 (Unified Cloud Sync Adapter)
 * 遵循《白皮书 2.0 & 6.1 离线优先 Offline-First》规范与 ISyncAdapter 契约
 */

import {
  ISyncAdapter,
  SyncConfig,
  SyncProviderType,
  SyncPullResult,
  SyncPushResult,
  Transaction,
  Category,
  Ledger,
  Budget,
  RecurringRule,
  SyncBatchResponse,
} from '@ledger/shared';
import {
  apiFetch,
  apiUrl,
  safeParseApiResponse,
  getAuthHeaders,
  testApiConnection,
} from '../api/httpClient';

export type { SyncConfig, SyncProviderType };

export const SYNC_CONFIG_KEY = 'serverless_ledger_sync_config';
export const TOKEN_KEY = 'serverless_ledger_jwt';
export const API_URL_STORAGE_KEY = 'serverless_ledger_api_url';
export const LAST_SYNC_KEY = 'serverless_ledger_last_synced';

/**
 * 获取当前持久化的云同步配置
 */
export function getSyncConfig(): SyncConfig {
  if (typeof localStorage === 'undefined') {
    return {
      provider: 'none',
      autoSyncEnabled: true,
      syncIntervalSeconds: 60,
      lastSyncedAt: null,
    };
  }

  const raw = localStorage.getItem(SYNC_CONFIG_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as SyncConfig;
      if (parsed && typeof parsed === 'object') {
        return {
          provider: parsed.provider || 'none',
          serverUrl: parsed.serverUrl !== undefined ? parsed.serverUrl : (localStorage.getItem(API_URL_STORAGE_KEY) || ''),
          authToken: parsed.authToken !== undefined ? parsed.authToken : (localStorage.getItem(TOKEN_KEY) || undefined),
          autoSyncEnabled: parsed.autoSyncEnabled !== undefined ? parsed.autoSyncEnabled : true,
          syncIntervalSeconds: parsed.syncIntervalSeconds || 60,
          lastSyncedAt: parsed.lastSyncedAt || localStorage.getItem(LAST_SYNC_KEY) || null,
        };
      }
    } catch {
      // 容错处理
    }
  }

  // 默认推断：如果已存在 Token，则推断为已启用 Cloudflare D1 同步；否则为 none
  const existingToken = localStorage.getItem(TOKEN_KEY);
  const customUrl = localStorage.getItem(API_URL_STORAGE_KEY) || '';
  const lastSync = localStorage.getItem(LAST_SYNC_KEY) || null;

  return {
    provider: existingToken ? 'cloudflare_d1' : 'none',
    serverUrl: customUrl,
    authToken: existingToken || undefined,
    autoSyncEnabled: true,
    syncIntervalSeconds: 60,
    lastSyncedAt: lastSync,
  };
}

/**
 * 保存或更新云同步配置并通知全局监听器
 */
export function saveSyncConfig(config: Partial<SyncConfig>): SyncConfig {
  const current = getSyncConfig();
  const merged: SyncConfig = {
    ...current,
    ...config,
  };

  if (typeof localStorage !== 'undefined') {
    if (config.serverUrl !== undefined) {
      const cleanUrl = config.serverUrl.trim().replace(/\/+$/, '');
      if (cleanUrl) {
        localStorage.setItem(API_URL_STORAGE_KEY, cleanUrl);
      } else {
        localStorage.removeItem(API_URL_STORAGE_KEY);
      }
    }

    if (config.authToken !== undefined) {
      if (config.authToken) {
        localStorage.setItem(TOKEN_KEY, config.authToken);
      } else if (config.provider === 'none') {
        localStorage.removeItem(TOKEN_KEY);
      }
    }

    if (config.lastSyncedAt !== undefined) {
      if (config.lastSyncedAt) {
        localStorage.setItem(LAST_SYNC_KEY, config.lastSyncedAt);
      } else {
        localStorage.removeItem(LAST_SYNC_KEY);
      }
    }

    localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(merged));
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('sync:config_changed', { detail: merged }));
  }

  return merged;
}

/**
 * 判断当前是否已配置且启用了云端同步
 */
export function isCloudSyncEnabled(): boolean {
  const config = getSyncConfig();
  return config.provider !== 'none' && config.autoSyncEnabled !== false;
}

/**
 * Cloudflare Workers + D1 云端同步适配器
 */
export class CloudflareSyncAdapter implements ISyncAdapter {
  readonly provider: SyncProviderType = 'cloudflare_d1';
  private config?: SyncConfig;

  constructor(config?: SyncConfig) {
    this.config = config;
  }

  private getConfig(): SyncConfig {
    return this.config || getSyncConfig();
  }

  /**
   * 测试连通性与服务端健康状态
   */
  async testConnection(): Promise<{ success: boolean; message: string; latencyMs?: number; data?: any }> {
    const cfg = this.getConfig();
    return await testApiConnection(cfg.serverUrl);
  }

  /**
   * 获取服务端当前时间戳 (ISO 字符串)
   */
  async getServerTime(): Promise<string> {
    return new Date().toISOString();
  }

  /**
   * 推送变更 (批量流水 + 离线变更队列项)
   */
  async pushChanges(changes: {
    transactions?: Transaction[];
    mutations?: Array<{ entity_type: string; entity_id: string; action: string; payload?: any }>;
  }): Promise<SyncPushResult> {
    const headers = getAuthHeaders();
    const syncedTransactionIds: string[] = [];

    // 1. 聚合批量流水删除 (将分散的 transaction:delete 批量打包发往 /api/transactions/batch-delete)
    const txDeleteMutations = changes.mutations?.filter(
      (m) => m.entity_type === 'transaction' && m.action === 'delete'
    ) || [];
    const otherMutations = changes.mutations?.filter(
      (m) => !(m.entity_type === 'transaction' && m.action === 'delete')
    ) || [];

    if (txDeleteMutations.length > 0) {
      const txIdsToDelete = txDeleteMutations.map((m) => m.entity_id);
      const BATCH_DELETE_CHUNK = 100;
      for (let i = 0; i < txIdsToDelete.length; i += BATCH_DELETE_CHUNK) {
        const chunk = txIdsToDelete.slice(i, i + BATCH_DELETE_CHUNK);
        try {
          await apiFetch(apiUrl('/transactions/batch-delete'), {
            method: 'POST',
            headers,
            body: JSON.stringify({ transaction_ids: chunk }),
            signal: AbortSignal.timeout(10000),
          });
        } catch (err) {
          console.warn('[CloudflareSyncAdapter] Batch transaction delete failed:', err);
        }
      }
    }

    // 2. 重放其他实体变更队列 (categories, ledgers, budgets, recurring)
    if (otherMutations.length > 0) {
      for (const item of otherMutations) {
        const signal = AbortSignal.timeout(6000);
        try {
          switch (item.entity_type) {
            case 'category':
              if (item.action === 'create') {
                await apiFetch(apiUrl('/categories'), { method: 'POST', headers, body: JSON.stringify(item.payload), signal });
              } else if (item.action === 'update') {
                await apiFetch(apiUrl(`/categories/${item.entity_id}`), { method: 'PUT', headers, body: JSON.stringify(item.payload), signal });
              } else if (item.action === 'delete') {
                await apiFetch(apiUrl(`/categories/${item.entity_id}`), { method: 'DELETE', headers, signal });
              } else if (item.action === 'reorder') {
                await apiFetch(apiUrl('/categories/reorder'), { method: 'PUT', headers, body: JSON.stringify(item.payload), signal });
              }
              break;

            case 'ledger':
              if (item.action === 'create') {
                await apiFetch(apiUrl('/ledgers'), { method: 'POST', headers, body: JSON.stringify(item.payload), signal });
              } else if (item.action === 'update') {
                await apiFetch(apiUrl(`/ledgers/${item.entity_id}`), { method: 'PUT', headers, body: JSON.stringify(item.payload), signal });
              } else if (item.action === 'set_default') {
                await apiFetch(apiUrl(`/ledgers/${item.entity_id}/default`), { method: 'PUT', headers, signal });
              } else if (item.action === 'delete') {
                await apiFetch(apiUrl(`/ledgers/${item.entity_id}`), { method: 'DELETE', headers, signal });
              }
              break;

            case 'budget':
              if (item.action === 'create') {
                await apiFetch(apiUrl('/budgets'), { method: 'POST', headers, body: JSON.stringify(item.payload), signal });
              } else if (item.action === 'batch_set') {
                await apiFetch(apiUrl('/budgets/batch'), { method: 'PUT', headers, body: JSON.stringify(item.payload), signal });
              } else if (item.action === 'delete') {
                await apiFetch(apiUrl(`/budgets/${item.entity_id}`), { method: 'DELETE', headers, signal });
              }
              break;

            case 'recurring':
              if (item.action === 'create') {
                await apiFetch(apiUrl('/recurring'), { method: 'POST', headers, body: JSON.stringify(item.payload), signal });
              } else if (item.action === 'update') {
                await apiFetch(apiUrl(`/recurring/${item.entity_id}`), { method: 'PUT', headers, body: JSON.stringify(item.payload), signal });
              } else if (item.action === 'delete') {
                await apiFetch(apiUrl(`/recurring/${item.entity_id}`), { method: 'DELETE', headers, signal });
              }
              break;
          }
        } catch (err) {
          console.warn(`[CloudflareSyncAdapter] Mutation push warning for ${item.entity_type}:${item.entity_id}:`, err);
        }
      }
    }

    // 2. 批量分片推送流水 (transactions)
    if (changes.transactions && changes.transactions.length > 0) {
      const CHUNK_SIZE = 100;
      const totalChunks = Math.ceil(changes.transactions.length / CHUNK_SIZE);

      for (let i = 0; i < totalChunks; i++) {
        const chunk = changes.transactions.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        try {
          const res = await apiFetch(apiUrl('/transactions/sync'), {
            method: 'POST',
            headers,
            body: JSON.stringify({ transactions: chunk }),
            signal: AbortSignal.timeout(15000),
          });

          if (res.ok) {
            const parsed = await safeParseApiResponse<SyncBatchResponse>(res);
            if (parsed.success && parsed.data?.synced_ids) {
              syncedTransactionIds.push(...parsed.data.synced_ids);
            }
          }
        } catch (err) {
          console.warn('[CloudflareSyncAdapter] Batch transaction push chunk failed:', err);
        }
      }
    }

    return {
      syncedTransactionIds,
      serverTime: new Date().toISOString(),
    };
  }

  /**
   * 双向增量拉取全量/增量服务端变更
   */
  async pullChanges(lastSyncedAt?: string | null): Promise<SyncPullResult> {
    const headers = getAuthHeaders();
    const signal = AbortSignal.timeout(8000);

    let txs: Transaction[] = [];
    let leds: Ledger[] = [];
    let cats: Category[] = [];
    let bds: Budget[] = [];
    let rrs: RecurringRule[] = [];

    // 1. 获取账本
    try {
      const res = await apiFetch(apiUrl('/ledgers'), { headers, signal });
      if (res.ok) {
        const parsed = await safeParseApiResponse<Ledger[]>(res);
        if (parsed.success && Array.isArray(parsed.data)) {
          leds = parsed.data;
        }
      }
    } catch (err) {
      console.warn('[CloudflareSyncAdapter] Pull ledgers notice:', err);
    }

    // 2. 获取分类
    try {
      const res = await apiFetch(apiUrl('/categories'), { headers, signal });
      if (res.ok) {
        const parsed = await safeParseApiResponse<Category[]>(res);
        if (parsed.success && Array.isArray(parsed.data)) {
          cats = parsed.data;
        }
      }
    } catch (err) {
      console.warn('[CloudflareSyncAdapter] Pull categories notice:', err);
    }

    // 3. 获取预算
    try {
      const res = await apiFetch(apiUrl('/budgets'), { headers, signal });
      if (res.ok) {
        const parsed = await safeParseApiResponse<Budget[]>(res);
        if (parsed.success && Array.isArray(parsed.data)) {
          bds = parsed.data;
        }
      }
    } catch (err) {
      console.warn('[CloudflareSyncAdapter] Pull budgets notice:', err);
    }

    // 4. 获取流水 (拉取最新 500 条)
    try {
      const res = await apiFetch(apiUrl('/transactions?limit=500'), { headers, signal });
      if (res.ok) {
        const parsed = await safeParseApiResponse<Transaction[]>(res);
        if (parsed.success && Array.isArray(parsed.data)) {
          txs = parsed.data;
        }
      }
    } catch (err) {
      console.warn('[CloudflareSyncAdapter] Pull transactions notice:', err);
    }

    // 5. 获取周期记账规则
    try {
      const res = await apiFetch(apiUrl('/recurring'), { headers, signal });
      if (res.ok) {
        const parsed = await safeParseApiResponse<RecurringRule[]>(res);
        if (parsed.success && Array.isArray(parsed.data)) {
          rrs = parsed.data;
        }
      }
    } catch (err) {
      console.warn('[CloudflareSyncAdapter] Pull recurring rules notice:', err);
    }

    return {
      transactions: txs,
      ledgers: leds,
      categories: cats,
      budgets: bds,
      recurringRules: rrs,
      serverTime: new Date().toISOString(),
    };
  }
}

/**
 * 获取当前生效的同步适配器实例 (若未配置或为 none 则返回 null)
 */
export function getEffectiveSyncAdapter(): ISyncAdapter | null {
  const config = getSyncConfig();
  if (config.provider === 'none') {
    return null;
  }
  if (config.provider === 'cloudflare_d1' || config.provider === 'custom') {
    return new CloudflareSyncAdapter(config);
  }
  return null;
}
