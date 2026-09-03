/**
 * 账盾 - 存储抽象接口与 WebDAV 快照同步契约 (Storage & Sync Snapshot Interfaces)
 * 遵循《账盾 v3 架构设计》与 Local-First 快照规范
 */

import {
  Ledger,
  Category,
  Transaction,
  Budget,
  RecurringRule,
} from './models.js';
import { VaultMetadata, EncryptedBackupPackage } from './cryptoTypes.js';

// ======================= 同步适配器接口与类型 =======================
export type SyncProviderType = 'none' | 'webdav' | 'local_folder';

export interface SyncConfig {
  provider: SyncProviderType;
  webdavUrl?: string;
  webdavUsername?: string;
  webdavPassword?: string;
  remotePath?: string; // e.g. "/ServerlessLedger/ledger-vault.enc.json"
  corsProxyUrl?: string; // 自定义 CORS 代理中继地址 (例如: /api/webdav-proxy 或 https://proxy.example.com)
  useCorsProxy?: boolean; // 是否启用 CORS 跨域中继
  autoSyncEnabled?: boolean;
  syncIntervalSeconds?: number;
  lastSyncedAt?: string | null;
  lastRemoteModified?: string | null;
  lastRemoteETag?: string | null;
}

export interface RemoteSnapshotMetadata {
  exists: boolean;
  remotePath: string;
  lastModified?: string | null;
  etag?: string | null;
  contentLength?: number;
}

export interface SnapshotData {
  transactions: Transaction[];
  categories: Category[];
  ledgers: Ledger[];
  budgets: Budget[];
  recurringRules: RecurringRule[];
  vaultMeta?: VaultMetadata;
  exportedAt: string;
  version: number;
}

export interface SnapshotSyncResult {
  success: boolean;
  action: 'uploaded' | 'downloaded' | 'up_to_date' | 'conflict_detected' | 'error';
  remoteModified?: string | null;
  localModified?: string | null;
  message: string;
  error?: string;
}

export interface ISyncAdapter {
  readonly provider: SyncProviderType;
  testConnection(): Promise<{ success: boolean; message: string; latencyMs?: number }>;
  getRemoteMetadata(remotePath?: string): Promise<RemoteSnapshotMetadata>;
  uploadSnapshot(encryptedPackage: EncryptedBackupPackage | string, remotePath?: string): Promise<{ success: boolean; lastModified: string; etag?: string }>;
  downloadSnapshot(remotePath?: string): Promise<{ success: boolean; data: EncryptedBackupPackage | string; lastModified?: string; etag?: string }>;
}
