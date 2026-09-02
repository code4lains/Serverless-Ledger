/**
 * 账盾 - WebDAV 加密快照同步管理器 (WebDAV Snapshot Sync Manager)
 * 遵循《账盾 v3 架构设计》与 Local-First 规范
 */

import { SnapshotSyncResult } from '@ledger/shared';
import {
  getSyncConfig,
  isWebdavSyncConfigured,
  isAutoSyncEnabled,
} from '../sync/syncConfig';
import { syncWithRemoteWebDAV } from '../sync/snapshotSync';

export interface SyncStats {
  lastSyncedAt: string | null;
  isSyncing: boolean;
  error?: string;
  lastResult?: SnapshotSyncResult;
}

class SyncManager {
  private isSyncing = false;
  private autoSyncTimer: any = null;
  private listeners: Set<(stats: SyncStats) => void> = new Set();
  private lastSyncedAt: string | null = null;
  private lastAutoSyncTimestamp = 0;

  constructor() {
    const cfg = getSyncConfig();
    this.lastSyncedAt = cfg.lastSyncedAt || null;

    if (typeof window !== 'undefined') {
      window.addEventListener('sync:config_changed', (e: any) => {
        const detail = e.detail;
        if (detail?.lastSyncedAt !== undefined) {
          this.lastSyncedAt = detail.lastSyncedAt;
        }
        if (isAutoSyncEnabled()) {
          this.restartTimer();
        } else {
          this.stop();
        }
        this.notifyStats();
      });
    }
  }

  /**
   * 启动同步引擎 (仅在配置了 WebDAV 且启用了 autoSync 时激活后台计时器)
   */
  public start() {
    if (!isAutoSyncEnabled()) {
      return;
    }
    this.restartTimer();
  }

  private restartTimer() {
    if (this.autoSyncTimer) {
      clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }

    if (!isAutoSyncEnabled()) {
      return;
    }

    const config = getSyncConfig();
    const intervalMs = (config.syncIntervalSeconds || 300) * 1000;

    this.autoSyncTimer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        if (!this.isSyncing && isAutoSyncEnabled()) {
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
   * 触发自动静默同步 (带冷却防抖)
   */
  public async triggerAutoSync(options?: { minIntervalMs?: number }): Promise<void> {
    if (!isAutoSyncEnabled()) return;

    const minInterval = options?.minIntervalMs ?? 60000;
    const now = Date.now();

    if (now - this.lastAutoSyncTimestamp < minInterval) {
      return;
    }

    this.lastAutoSyncTimestamp = now;
    await this.sync();
  }

  /**
   * 执行 WebDAV 快照同步 (可指定强制推送或拉取)
   */
  public async sync(
    direction?: 'push' | 'pull'
  ): Promise<SnapshotSyncResult> {
    if (this.isSyncing) {
      return {
        success: false,
        action: 'error',
        message: '同步已在进行中',
        error: 'Sync in progress',
      };
    }

    if (!isWebdavSyncConfigured()) {
      return {
        success: true,
        action: 'up_to_date',
        message: '未配置 WebDAV 同步服务',
      };
    }

    this.isSyncing = true;
    this.notifyStats();

    let result: SnapshotSyncResult = {
      success: false,
      action: 'error',
      message: '未执行同步',
    };
    try {
      result = await syncWithRemoteWebDAV({ forceDirection: direction });
      if (result.success) {
        this.lastSyncedAt = new Date().toISOString();
      }
    } catch (err: any) {
      result = {
        success: false,
        action: 'error',
        message: `同步异常: ${err?.message || '未知错误'}`,
        error: err?.message,
      };
    } finally {
      this.isSyncing = false;
      this.notifyStats(result?.error, result);
    }

    return result;
  }

  public getStats(): SyncStats {
    return {
      lastSyncedAt: this.lastSyncedAt,
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

  private notifyStats(error?: string, lastResult?: SnapshotSyncResult) {
    const stats: SyncStats = {
      lastSyncedAt: this.lastSyncedAt,
      isSyncing: this.isSyncing,
      error,
      lastResult,
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
