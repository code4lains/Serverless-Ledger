/**
 * 账盾 - 端到端加密快照同步核心引擎 (Snapshot Sync Engine)
 * 遵循《账盾 v3 架构设计》与 Local-First 全量快照同步规范
 */

import {
  EncryptedBackupPackage,
  SnapshotData,
  SnapshotSyncResult,
} from '@ledger/shared';
import { exportAllLocalData, importAllLocalData } from '../db';
import {
  getCachedKey,
  createEncryptedBackupPackage,
  restoreEncryptedBackupPackage,
  generateRandomSalt,
} from '../crypto';
import { getWebDavAdapter } from './webdavAdapter';
import { getSyncConfig, saveSyncConfig, isWebdavSyncConfigured } from './syncConfig';

/**
 * 导出本地全量数据并进行端到端加密，生成 EncryptedBackupPackage 快照
 */
export async function exportSnapshot(
  vaultKey?: CryptoKey
): Promise<EncryptedBackupPackage> {
  const key = vaultKey || getCachedKey();
  if (!key) {
    throw new Error('未检测到已解锁的本地保险库密钥，无法生成加密快照');
  }

  const localData = await exportAllLocalData();
  const snapshotData: SnapshotData = {
    transactions: localData.transactions,
    categories: localData.categories,
    ledgers: localData.ledgers,
    budgets: localData.budgets,
    recurringRules: localData.recurringRules,
    vaultMeta: localData.vaultMeta,
    exportedAt: new Date().toISOString(),
    version: 3,
  };

  const salt = generateRandomSalt(16);
  const encryptedPackage = await createEncryptedBackupPackage(
    snapshotData,
    key,
    salt,
    {
      transaction_count: snapshotData.transactions.length,
      ledger_count: snapshotData.ledgers.length,
      category_count: snapshotData.categories.length,
    }
  );

  return encryptedPackage;
}

/**
 * 校验、解密并原子全量导入远端快照数据至本地 Dexie 数据库
 */
export async function importSnapshot(
  encryptedPackage: EncryptedBackupPackage,
  vaultKey?: CryptoKey,
  options: { overwrite?: boolean } = { overwrite: true }
): Promise<{
  importedTransactions: number;
  importedLedgers: number;
  importedCategories: number;
  importedBudgets: number;
  importedRecurring: number;
}> {
  const key = vaultKey || getCachedKey();
  if (!key) {
    throw new Error('未检测到已解锁的本地保险库密钥，无法解密快照');
  }

  const decryptedData = await restoreEncryptedBackupPackage<SnapshotData>(
    encryptedPackage,
    key
  );

  if (!decryptedData || typeof decryptedData !== 'object') {
    throw new Error('解密快照内容损坏或格式非法');
  }

  const result = await importAllLocalData(decryptedData, {
    overwrite: options.overwrite !== false,
  });

  return result;
}

/**
 * 执行完整的 WebDAV 快照同步流转 (支持智能比对、强制推送与强制拉取)
 */
export async function syncWithRemoteWebDAV(options?: {
  forceDirection?: 'push' | 'pull';
  remotePath?: string;
  vaultKey?: CryptoKey;
}): Promise<SnapshotSyncResult> {
  if (!isWebdavSyncConfigured()) {
    return {
      success: false,
      action: 'error',
      message: '未完整配置 WebDAV 服务（需提供有效的服务器地址、用户名及密码）',
      error: 'WebDAV not configured',
    };
  }

  const key = options?.vaultKey || getCachedKey();
  if (!key) {
    return {
      success: false,
      action: 'error',
      message: '本地保险库未解锁，无法执行加密快照同步',
      error: 'Vault locked',
    };
  }

  const config = getSyncConfig();
  const adapter = getWebDavAdapter(config);
  const targetPath = options?.remotePath || config.remotePath || '/ServerlessLedger/ledger-vault.enc.json';

  try {
    // 1. 强制推送 (Push Local to Remote)
    if (options?.forceDirection === 'push') {
      const snapshotPkg = await exportSnapshot(key);
      const uploadRes = await adapter.uploadSnapshot(snapshotPkg, targetPath);

      const now = new Date().toISOString();
      saveSyncConfig({
        lastSyncedAt: now,
        lastRemoteModified: uploadRes.lastModified,
        lastRemoteETag: uploadRes.etag || null,
      });

      return {
        success: true,
        action: 'uploaded',
        remoteModified: uploadRes.lastModified,
        localModified: now,
        message: '本地加密快照已成功上传至 WebDAV 服务端',
      };
    }

    // 2. 强制拉取 (Pull Remote to Local)
    if (options?.forceDirection === 'pull') {
      const downloadRes = await adapter.downloadSnapshot(targetPath);
      const pkg =
        typeof downloadRes.data === 'string'
          ? JSON.parse(downloadRes.data)
          : downloadRes.data;

      const importStats = await importSnapshot(pkg, key, { overwrite: true });

      const now = new Date().toISOString();
      saveSyncConfig({
        lastSyncedAt: now,
        lastRemoteModified: downloadRes.lastModified || null,
        lastRemoteETag: downloadRes.etag || null,
      });

      return {
        success: true,
        action: 'downloaded',
        remoteModified: downloadRes.lastModified,
        localModified: now,
        message: `已成功从 WebDAV 恢复快照 (包含 ${importStats.importedTransactions} 笔账单)`,
      };
    }

    // 3. 智能双向比对同步 (Smart Auto Sync)
    const remoteMeta = await adapter.getRemoteMetadata(targetPath);

    // 远端文件尚不存在 -> 直接初始上传
    if (!remoteMeta.exists) {
      const snapshotPkg = await exportSnapshot(key);
      const uploadRes = await adapter.uploadSnapshot(snapshotPkg, targetPath);

      const now = new Date().toISOString();
      saveSyncConfig({
        lastSyncedAt: now,
        lastRemoteModified: uploadRes.lastModified,
        lastRemoteETag: uploadRes.etag || null,
      });

      return {
        success: true,
        action: 'uploaded',
        remoteModified: uploadRes.lastModified,
        localModified: now,
        message: '远端无快照，已完成首次全量快照初始化上传',
      };
    }

    // 远端存在，比对修改时间
    const remoteModTime = remoteMeta.lastModified
      ? new Date(remoteMeta.lastModified).getTime()
      : 0;
    const lastKnownRemoteTime = config.lastRemoteModified
      ? new Date(config.lastRemoteModified).getTime()
      : 0;

    // 若远端时间较新且与上次记录的不一致 -> 下载远端新快照
    if (remoteModTime > lastKnownRemoteTime && remoteModTime > 0) {
      const downloadRes = await adapter.downloadSnapshot(targetPath);
      const pkg =
        typeof downloadRes.data === 'string'
          ? JSON.parse(downloadRes.data)
          : downloadRes.data;

      const importStats = await importSnapshot(pkg, key, { overwrite: true });

      const now = new Date().toISOString();
      saveSyncConfig({
        lastSyncedAt: now,
        lastRemoteModified: remoteMeta.lastModified || downloadRes.lastModified || null,
        lastRemoteETag: remoteMeta.etag || null,
      });

      return {
        success: true,
        action: 'downloaded',
        remoteModified: remoteMeta.lastModified,
        localModified: now,
        message: `检测到远端有更新，已自动拉取并合并 (${importStats.importedTransactions} 笔账单)`,
      };
    }

    // 本地有更新或时间一致 -> 上传最新本地快照
    const snapshotPkg = await exportSnapshot(key);
    const uploadRes = await adapter.uploadSnapshot(snapshotPkg, targetPath);

    const now = new Date().toISOString();
    saveSyncConfig({
      lastSyncedAt: now,
      lastRemoteModified: uploadRes.lastModified,
      lastRemoteETag: uploadRes.etag || null,
    });

    return {
      success: true,
      action: 'uploaded',
      remoteModified: uploadRes.lastModified,
      localModified: now,
      message: '全量加密快照已同步至 WebDAV',
    };
  } catch (err: any) {
    return {
      success: false,
      action: 'error',
      message: `WebDAV 快照同步失败: ${err?.message || '未知错误'}`,
      error: err?.message,
    };
  }
}
