/**
 * 账盾 - 统一 API 门面入口 (Unified API Facade)
 * 遵循《白皮书 2.0 & 6.1 离线优先 Offline-First》规范：
 * - 导出 httpClient: 基础网络通信、安全解析、地址构造、连通性探测
 * - 导出 cloudAuth: 云端用户认证、Token/会话管理、邀请码、重置密码
 * - 导出 localStore: 纯本地 0ms Dexie CRUD 权威操作引擎
 * - 保持完整向下兼容性
 */

import { networkMonitor } from './network';
import { getEffectiveSyncAdapter } from '../sync/syncAdapter';

// 1. HTTP 客户端模块
export {
  getCustomApiUrl,
  setCustomApiUrl,
  getApiBase,
  apiUrl,
  getDisplayApiHost,
  safeParseApiResponse,
  testApiConnection,
  handleUnauthorizedResponse,
  apiFetch,
  getAuthHeaders,
} from './httpClient';

// 2. 云端身份认证模块
export {
  getStoredToken,
  getStoredUser,
  setSession,
  saveSession,
  clearSession,
  registerUser,
  loginUser,
  fetchCurrentUser,
  getAuthConfig,
  getInviteCodes,
  claimInviteCode,
  resetPassword,
  deleteAccount,
  executeDueRecurringRules,
} from './cloudAuth';

// 3. 本地优先存储 CRUD 模块 (纯本地 0ms 操作，严禁网络调用)
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

// 4. 同步配置及状态工具
export {
  getSyncConfig,
  saveSyncConfig,
  isCloudSyncEnabled,
} from '../sync/syncAdapter';

/**
 * 测试当前生效的云同步适配器连通性
 */
export async function testSyncConnection() {
  const adapter = getEffectiveSyncAdapter();
  if (!adapter) {
    return {
      success: false,
      message: '未配置或已禁用云同步',
    };
  }
  return await adapter.testConnection();
}

/**
 * 检查后端服务连通性与健康状态
 */
export async function checkServerHealth() {
  return await networkMonitor.checkHealth();
}
