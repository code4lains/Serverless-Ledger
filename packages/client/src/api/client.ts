/**
 * 账盾 - 统一客户端 API 门面入口 (Unified API Facade)
 * 遵循《账盾 v3 架构设计》与 Local-First 规范：
 * - 导出 localStore: 纯本地 0ms Dexie CRUD 权威操作引擎
 * - 导出 syncConfig: WebDAV 配置管理与存储
 * - 导出 webdavAdapter: WebDAV 协议层适配器与连通性测试
 * - 导出 snapshotSync: 全量端到端加密快照导出、导入与同步流转
 * - 导出 localAuth: 本地零知识安全保险库主密码与恢复码认证
 */

// 1. 本地优先存储 CRUD 模块 (纯本地 0ms 操作，严禁网络调用)
export {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  getLedgers,
  createLedger,
  updateLedger,
  setDefaultLedger,
  deleteLedger,
  mergeLedgers,
  queryTransactions,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  batchImportTransactions,
  getBudgets,
  saveBatchBudgets,
  deleteBudget,
  getRecurringRules,
  createRecurringRule,
  updateRecurringRule,
  deleteRecurringRule,
} from './localStore';

// 2. WebDAV 同步配置与协议适配器
export {
  getSyncConfig,
  saveSyncConfig,
  isWebdavSyncConfigured,
  isAutoSyncEnabled,
  DEFAULT_REMOTE_PATH,
  SYNC_CONFIG_STORAGE_KEY,
} from '../sync/syncConfig';

export {
  WebDavAdapter,
  getWebDavAdapter,
} from '../sync/webdavAdapter';

// 3. 端到端加密快照同步引擎
export {
  exportSnapshot,
  importSnapshot,
  syncWithRemoteWebDAV,
} from '../sync/snapshotSync';

// 4. 同步管理器单例
export {
  syncManager,
  type SyncStats,
} from './syncManager';

// 5. 本地零知识安全保险库
export {
  setupMasterPassword,
  unlockVaultWithPassword,
  unlockVaultWithRecoveryCode,
  changeMasterPassword,
  lockVault,
  isVaultInitialized,
  isVaultUnlocked,
  getVaultMetadata,
} from '../auth/localAuth';

/**
 * 测试 WebDAV 连通性
 */
export async function testWebDavConnection() {
  const { getWebDavAdapter } = await import('../sync/webdavAdapter');
  const adapter = getWebDavAdapter();
  return await adapter.testConnection();
}
