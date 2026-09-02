/**
 * 账盾 - WebDAV 同步配置与持久化管理 (Sync Configuration)
 * 遵循《账盾 v3 架构设计》
 */

import { SyncConfig, SyncProviderType } from '@ledger/shared';

export const SYNC_CONFIG_STORAGE_KEY = 'serverless_ledger_sync_config';
export const DEFAULT_REMOTE_PATH = '/ServerlessLedger/ledger-vault.enc.json';

const DEFAULT_CONFIG: SyncConfig = {
  provider: 'none',
  webdavUrl: '',
  webdavUsername: '',
  webdavPassword: '',
  remotePath: DEFAULT_REMOTE_PATH,
  autoSyncEnabled: true,
  syncIntervalSeconds: 300, // 5 分钟
  lastSyncedAt: null,
  lastRemoteModified: null,
  lastRemoteETag: null,
};

/**
 * 获取当前的同步配置
 */
export function getSyncConfig(): SyncConfig {
  if (typeof localStorage === 'undefined') {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = localStorage.getItem(SYNC_CONFIG_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_CONFIG };
    }
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      remotePath: parsed.remotePath || DEFAULT_REMOTE_PATH,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * 保存并更新同步配置，向全应用广播配置变更事件
 */
export function saveSyncConfig(updates: Partial<SyncConfig>): SyncConfig {
  const current = getSyncConfig();
  const merged: SyncConfig = {
    ...current,
    ...updates,
  };

  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SYNC_CONFIG_STORAGE_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error('[SyncConfig] Failed to save to localStorage', e);
    }
  }

  // 广播配置变更事件
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(
        new CustomEvent('sync:config_changed', {
          detail: merged,
        })
      );
    } catch {
      // 容错环境
    }
  }

  return merged;
}

/**
 * 检查当前是否已完整配置 WebDAV 同步服务
 */
export function isWebdavSyncConfigured(): boolean {
  const cfg = getSyncConfig();
  return (
    cfg.provider === 'webdav' &&
    Boolean(cfg.webdavUrl && cfg.webdavUrl.trim())
  );
}

/**
 * 检查是否启用了自动静默同步
 */
export function isAutoSyncEnabled(): boolean {
  const cfg = getSyncConfig();
  return isWebdavSyncConfigured() && cfg.autoSyncEnabled !== false;
}
