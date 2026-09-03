/**
 * 账盾 - 本地端到端保险库认证与会话管理服务 (Local Vault Authentication)
 * 遵循《白皮书 7.3 本地安全保险库》与《端到端零知识架构规范》
 *
 * 核心功能：
 * 1. 本地主密码初始化 / 注册与恢复凭证颁发
 * 2. 本地保险库解锁与零知识密码学验证 (AES-GCM 验签)
 * 3. 主密码变更与验证令牌无缝重加密
 * 4. 16 位高熵恢复码校验与主密码应急重置
 * 5. 保险库状态探测 (isVaultInitialized, isVaultUnlocked, lockVault)
 * 6. 全量端到端加密备份导出与还原
 */

import { VaultMetadata, EncryptedBackupPackage } from '@ledger/shared';
import {
  deriveKeyFromPassword,
  deriveKeyFromRecoveryCode,
  generateRandomSalt,
  generateRecoveryCode,
  normalizeRecoveryCode,
  validateRecoveryCodeFormat,
  encryptData,
  decryptObject,
  setCachedKey,
  getCachedKey,
  getCachedSession,
  clearCachedKey,
  clearAllCachedKeys,
  isKeyCached,
  bytesToBase64,
  DEFAULT_PBKDF2_ITERATIONS,
  SALT_BYTE_LENGTH,
  createEncryptedBackupPackage,
  restoreEncryptedBackupPackage,
  exportBackupWithPassword,
  importBackupWithPassword,
  exportKeyToBase64,
  importKeyFromBase64,
} from '../crypto';
import {
  localDb,
  getVaultMeta,
  saveVaultMeta,
  deleteVaultMeta,
  exportAllLocalData,
  importAllLocalData,
  migrateLocalDataToVault,
} from '../db';

/**
 * 保险库密码正确性鉴别常量令牌 (零知识验证载荷)
 */
export const VAULT_VERIFICATION_TOKEN = 'SERVERLESS_LEDGER_VAULT_AUTH_V1';

export interface SetupVaultResult {
  vaultMeta: VaultMetadata;
  recoveryCode: string;
  key: CryptoKey;
}

export interface ResetVaultPasswordResult {
  success: boolean;
  newRecoveryCode: string;
  key: CryptoKey;
}

export interface VaultSessionInfo {
  vaultId: string;
  unlockedAt: string;
  isUnlocked: boolean;
}

/**
 * 校验主密码复杂度 (至少 6 位)
 */
export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: '密码不能为空' };
  }
  if (password.length < 6) {
    return { valid: false, message: '密码长度不能少于 6 位' };
  }
  return { valid: true };
}

/**
 * 1. 初始化并注册本地安全保险库 (设置主密码并生成 16 位恢复码)
 * @param password 用户设置的主密码
 * @param vaultId 保险库 ID (默认为 'default_vault')
 */
export async function setupMasterPassword(
  password: string,
  vaultId: string = 'default_vault'
): Promise<SetupVaultResult> {
  const check = validatePasswordStrength(password);
  if (!check.valid) {
    throw new Error(check.message || '密码不符合要求');
  }

  // 1. 生成密码盐与恢复码盐 (各 16 字节)
  const masterSalt = generateRandomSalt(SALT_BYTE_LENGTH);
  const recoverySalt = generateRandomSalt(SALT_BYTE_LENGTH);

  // 2. 生成 16 位高熵恢复凭证
  const recoveryCode = generateRecoveryCode();
  const normalizedRecovery = normalizeRecoveryCode(recoveryCode);

  // 3. 派生主密码密钥与恢复密钥
  const masterKey = await deriveKeyFromPassword(password, masterSalt, DEFAULT_PBKDF2_ITERATIONS);
  const recoveryKey = await deriveKeyFromPassword(normalizedRecovery, recoverySalt, DEFAULT_PBKDF2_ITERATIONS);

  // 4. 加密验证令牌
  const masterVerifyPayload = await encryptData(
    { token: VAULT_VERIFICATION_TOKEN, created_at: new Date().toISOString() },
    masterKey,
    masterSalt
  );
  const recoveryVerifyPayload = await encryptData(
    { token: VAULT_VERIFICATION_TOKEN, created_at: new Date().toISOString() },
    recoveryKey,
    recoverySalt
  );

  const now = new Date().toISOString();
  const vaultMeta: VaultMetadata = {
    id: vaultId,
    salt: bytesToBase64(masterSalt),
    verify_hash: JSON.stringify(masterVerifyPayload),
    recovery_salt: bytesToBase64(recoverySalt),
    recovery_verify_hash: JSON.stringify(recoveryVerifyPayload),
    iterations: DEFAULT_PBKDF2_ITERATIONS,
    created_at: now,
    updated_at: now,
  };

  // 5. 持久化保险库元数据至 Dexie IndexedDB
  await saveVaultMeta(vaultMeta);

  // 6. 自动迁移未加密或默认访客数据至该保险库
  await migrateLocalDataToVault(vaultId);

  // 7. 将解密密钥保留在纯内存会话中并持久化解锁状态，清除手动锁定标记
  setCachedKey(vaultId, masterKey);
  await persistVaultSession(vaultId, masterKey);
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(`ledger_vault_locked_${vaultId}`);
  }
  notifyVaultStatusChanged();

  return {
    vaultMeta,
    recoveryCode,
    key: masterKey,
  };
}

/**
 * 2. 解锁本地保险库 (验证主密码正确性并载入内存密钥，记住解锁状态)
 * @param password 用户输入的主密码
 * @param vaultId 保险库 ID (默认 'default_vault')
 */
export async function unlockVault(
  password: string,
  vaultId: string = 'default_vault'
): Promise<boolean> {
  const meta = await getVaultMeta(vaultId);
  if (!meta) {
    throw new Error(`保险库 [${vaultId}] 尚未初始化，请先设置主密码`);
  }

  // 1. 派生主密钥
  const derivedKey = await deriveKeyFromPassword(password, meta.salt, meta.iterations || DEFAULT_PBKDF2_ITERATIONS);

  // 2. 尝试解密验证令牌以验证密码正确性
  try {
    const verifyPayload = JSON.parse(meta.verify_hash);
    const decrypted = await decryptObject<{ token: string }>(verifyPayload, derivedKey);

    if (decrypted.token !== VAULT_VERIFICATION_TOKEN) {
      return false;
    }

    // 3. 验证通过，载入内存会话并记住解锁状态
    setCachedKey(vaultId, derivedKey);
    await persistVaultSession(vaultId, derivedKey);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`ledger_vault_locked_${vaultId}`);
    }
    notifyVaultStatusChanged();
    return true;
  } catch {
    // 密码学解密失败 (AES-GCM Auth Tag 鉴权失败，表明密码错误或数据被篡改)
    return false;
  }
}

/**
 * 3. 变更主密码 (使用旧密码鉴权后，重新派生新密钥并更新验证令牌)
 * @param oldPassword 旧主密码
 * @param newPassword 新主密码
 * @param vaultId 保险库 ID (默认 'default_vault')
 */
export async function changeMasterPassword(
  oldPassword: string,
  newPassword: string,
  vaultId: string = 'default_vault'
): Promise<boolean> {
  const check = validatePasswordStrength(newPassword);
  if (!check.valid) {
    throw new Error(check.message || '新密码不符合要求');
  }

  const meta = await getVaultMeta(vaultId);
  if (!meta) {
    throw new Error('保险库尚未初始化');
  }

  // 1. 验证旧密码
  const unlocked = await unlockVault(oldPassword, vaultId);
  if (!unlocked) {
    throw new Error('当前主密码输入错误，无法变更密码');
  }

  // 2. 为新密码生成新 Salt 并派生新密钥
  const newSalt = generateRandomSalt(SALT_BYTE_LENGTH);
  const newKey = await deriveKeyFromPassword(newPassword, newSalt, meta.iterations || DEFAULT_PBKDF2_ITERATIONS);

  // 3. 使用新密钥加密验证令牌
  const newVerifyPayload = await encryptData(
    { token: VAULT_VERIFICATION_TOKEN, updated_at: new Date().toISOString() },
    newKey,
    newSalt
  );

  // 4. 更新保险库元数据
  meta.salt = bytesToBase64(newSalt);
  meta.verify_hash = JSON.stringify(newVerifyPayload);
  meta.updated_at = new Date().toISOString();

  await saveVaultMeta(meta);

  // 5. 更新内存会话密钥并持久化
  setCachedKey(vaultId, newKey);
  await persistVaultSession(vaultId, newKey);
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(`ledger_vault_locked_${vaultId}`);
  }
  notifyVaultStatusChanged();
  return true;
}

/**
 * 4. 使用 16 位恢复码重置主密码
 * @param recoveryCode 16 位密码恢复码
 * @param newPassword 新主密码
 * @param vaultId 保险库 ID (默认 'default_vault')
 */
export async function resetPasswordWithRecoveryCode(
  recoveryCode: string,
  newPassword: string,
  vaultId: string = 'default_vault'
): Promise<ResetVaultPasswordResult> {
  const check = validatePasswordStrength(newPassword);
  if (!check.valid) {
    throw new Error(check.message || '新密码不符合要求');
  }

  const cleanCode = normalizeRecoveryCode(recoveryCode);
  if (!validateRecoveryCodeFormat(cleanCode)) {
    throw new Error('无效的密码恢复码格式');
  }

  const meta = await getVaultMeta(vaultId);
  if (!meta || !meta.recovery_salt || !meta.recovery_verify_hash) {
    throw new Error('保险库未找到或未配置密码恢复凭证');
  }

  // 1. 使用恢复码派生恢复密钥
  const recoveryKey = await deriveKeyFromRecoveryCode(
    cleanCode,
    meta.recovery_salt,
    meta.iterations || DEFAULT_PBKDF2_ITERATIONS
  );

  // 2. 解密恢复验证令牌
  try {
    const recoveryPayload = JSON.parse(meta.recovery_verify_hash);
    const decrypted = await decryptObject<{ token: string }>(recoveryPayload, recoveryKey);
    if (decrypted.token !== VAULT_VERIFICATION_TOKEN) {
      throw new Error('恢复码鉴权令牌不匹配');
    }
  } catch {
    throw new Error('密码恢复码无效或已失效，请仔细核对');
  }

  // 3. 恢复码验证通过：生成新主密码盐和新恢复凭证
  const newMasterSalt = generateRandomSalt(SALT_BYTE_LENGTH);
  const newRecoverySalt = generateRandomSalt(SALT_BYTE_LENGTH);
  const newRecoveryCode = generateRecoveryCode();
  const normalizedNewRecovery = normalizeRecoveryCode(newRecoveryCode);

  const newMasterKey = await deriveKeyFromPassword(newPassword, newMasterSalt, meta.iterations || DEFAULT_PBKDF2_ITERATIONS);
  const newRecoveryKey = await deriveKeyFromPassword(normalizedNewRecovery, newRecoverySalt, meta.iterations || DEFAULT_PBKDF2_ITERATIONS);

  // 4. 重新加密验证令牌
  const newMasterVerifyPayload = await encryptData(
    { token: VAULT_VERIFICATION_TOKEN, reset_at: new Date().toISOString() },
    newMasterKey,
    newMasterSalt
  );
  const newRecoveryVerifyPayload = await encryptData(
    { token: VAULT_VERIFICATION_TOKEN, reset_at: new Date().toISOString() },
    newRecoveryKey,
    newRecoverySalt
  );

  // 5. 更新元数据
  meta.salt = bytesToBase64(newMasterSalt);
  meta.verify_hash = JSON.stringify(newMasterVerifyPayload);
  meta.recovery_salt = bytesToBase64(newRecoverySalt);
  meta.recovery_verify_hash = JSON.stringify(newRecoveryVerifyPayload);
  meta.updated_at = new Date().toISOString();

  await saveVaultMeta(meta);

  // 6. 更新内存会话密钥并持久化解锁状态
  setCachedKey(vaultId, newMasterKey);
  await persistVaultSession(vaultId, newMasterKey);
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(`ledger_vault_locked_${vaultId}`);
  }
  notifyVaultStatusChanged();

  return {
    success: true,
    newRecoveryCode,
    key: newMasterKey,
  };
}

/**
 * 广播保险库状态变更事件 (通知 App, ProfileView, DataManagementModal 等同步 UI 状态)
 */
export function notifyVaultStatusChanged(): void {
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(new CustomEvent('vault:status_changed'));
    } catch {
      // 容错处理
    }
  }
}

/**
 * 5. 检查本地保险库是否已初始化
 */
export async function isVaultInitialized(vaultId: string = 'default_vault'): Promise<boolean> {
  const meta = await getVaultMeta(vaultId);
  return !!meta && !!meta.salt && !!meta.verify_hash;
}

/**
 * 6. 检查本地保险库是否被用户手动锁定
 */
export function isVaultManuallyLocked(vaultId: string = 'default_vault'): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(`ledger_vault_locked_${vaultId}`) === 'true';
}

/**
 * 检查是否启用了保险库会话持久化 (记住解锁状态)
 * 默认为 true (开启)，保证向后兼容性
 */
export function isVaultRememberSessionEnabled(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const val = localStorage.getItem('ledger_vault_remember_session');
  if (val === null) return true;
  return val === 'true';
}

/**
 * 设置是否启用保险库会话持久化
 */
export function setVaultRememberSessionEnabled(enabled: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('ledger_vault_remember_session', enabled ? 'true' : 'false');
  if (!enabled) {
    clearPersistedVaultSession('default_vault');
  }
}

/**
 * 7. 持久化保存当前解锁的会话密钥 (保存到 sessionStorage，标签页关闭即销毁)
 */
export async function persistVaultSession(vaultId: string, key: CryptoKey): Promise<void> {
  if (typeof sessionStorage === 'undefined') return;
  if (!isVaultRememberSessionEnabled()) return;
  try {
    const base64 = await exportKeyToBase64(key);
    sessionStorage.setItem(`ledger_vault_session_${vaultId}`, base64);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`ledger_vault_locked_${vaultId}`);
    }
  } catch (err) {
    console.warn('[Vault] Failed to persist vault session key:', err);
  }
}

/**
 * 清除已持久化的会话密钥 (用户手动锁定时调用，同时清除 sessionStorage 与可能残留的 localStorage)
 */
export function clearPersistedVaultSession(vaultId: string = 'default_vault'): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(`ledger_vault_session_${vaultId}`);
    }
  } catch {}
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`ledger_vault_session_${vaultId}`);
    }
  } catch {}
}

/**
 * 8. 尝试自动恢复上次未手动锁定的解锁会话状态
 * 优先读取 sessionStorage，并兼容检查 localStorage (若存在则迁移至 sessionStorage 并从 localStorage 中删除)
 */
export async function restoreVaultSession(vaultId: string = 'default_vault'): Promise<boolean> {
  // 1. 如果当前内存中已经持有密钥，直接返回 true
  if (isVaultUnlocked(vaultId)) {
    return true;
  }

  // 2. 如果用户之前手动锁定了，不自动恢复
  if (isVaultManuallyLocked(vaultId)) {
    return false;
  }

  let sessionKeyBase64: string | null = null;
  if (typeof sessionStorage !== 'undefined') {
    sessionKeyBase64 = sessionStorage.getItem(`ledger_vault_session_${vaultId}`);
  }

  // 兼容检查 localStorage (若存在则迁移至 sessionStorage 并从 localStorage 中删除)
  if (!sessionKeyBase64 && typeof localStorage !== 'undefined') {
    const legacyKey = localStorage.getItem(`ledger_vault_session_${vaultId}`);
    if (legacyKey) {
      sessionKeyBase64 = legacyKey;
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.setItem(`ledger_vault_session_${vaultId}`, legacyKey);
      }
      localStorage.removeItem(`ledger_vault_session_${vaultId}`);
    }
  }

  if (!sessionKeyBase64) {
    return false;
  }

  const meta = await getVaultMeta(vaultId);
  if (!meta || !meta.verify_hash) {
    clearPersistedVaultSession(vaultId);
    return false;
  }

  try {
    const restoredKey = await importKeyFromBase64(sessionKeyBase64);
    const verifyPayload = JSON.parse(meta.verify_hash);
    const decrypted = await decryptObject<{ token: string }>(verifyPayload, restoredKey);

    if (decrypted.token !== VAULT_VERIFICATION_TOKEN) {
      clearPersistedVaultSession(vaultId);
      return false;
    }

    setCachedKey(vaultId, restoredKey);
    return true;
  } catch {
    clearPersistedVaultSession(vaultId);
    return false;
  }
}

/**
 * 9. 检查本地保险库当前是否已在内存中解锁 (即内存中持有有效解密密钥)
 */
export function isVaultUnlocked(vaultId: string = 'default_vault'): boolean {
  return isKeyCached(vaultId);
}

/**
 * 10. 获取当前活跃的保险库会话状态
 */
export function getActiveSession(vaultId: string = 'default_vault'): VaultSessionInfo | null {
  const session = getCachedSession(vaultId);
  if (!session) return null;
  return {
    vaultId: session.vaultId,
    unlockedAt: session.unlockedAt,
    isUnlocked: isVaultUnlocked(vaultId),
  };
}

/**
 * 11. 锁定指定保险库 (清除持久化会话、设置手动锁定标记并抹除内存密钥)
 */
export function lockVault(vaultId: string = 'default_vault'): void {
  clearCachedKey(vaultId);
  clearPersistedVaultSession(vaultId);
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(`ledger_vault_locked_${vaultId}`, 'true');
  }
  notifyVaultStatusChanged();
}

/**
 * 12. 全局锁定所有已解锁的保险库
 */
export function lockAllVaults(): void {
  clearAllCachedKeys();
  clearPersistedVaultSession('default_vault');
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('ledger_vault_locked_default_vault', 'true');
  }
  notifyVaultStatusChanged();
}

/**
 * 13. 获取当前内存中的保险库主密钥 (若已锁定则抛出异常)
 */
export function getVaultMasterKey(vaultId: string = 'default_vault'): CryptoKey {
  const key = getCachedKey(vaultId);
  if (!key) {
    throw new Error(`本地安全保险库 [${vaultId}] 处于锁定状态，请先输入主密码解锁`);
  }
  return key;
}

/**
 * 14. 获取保险库元数据对象
 */
export async function getVaultMetadata(vaultId: string = 'default_vault'): Promise<VaultMetadata | undefined> {
  return await getVaultMeta(vaultId);
}

/**
 * 15. 彻底销毁本地保险库
 */
export async function destroyVault(vaultId: string = 'default_vault'): Promise<void> {
  lockVault(vaultId);
  clearPersistedVaultSession(vaultId);
  await deleteVaultMeta(vaultId);
}

// ======================== 保险库全量端到端加密备份 ========================

/**
 * 导出全量保险库加密备份包 (EncryptedBackupPackage)
 * @param vaultId 保险库 ID
 * @param customPassword 可选的独立备份导出密码 (若不提供则使用当前保险库主密钥)
 */
export async function exportVaultEncryptedBackup(
  vaultId: string = 'default_vault',
  customPassword?: string
): Promise<EncryptedBackupPackage> {
  const localData = await exportAllLocalData(vaultId);

  const metadata = {
    transaction_count: localData.transactions.length,
    ledger_count: localData.ledgers.length,
    category_count: localData.categories.length,
  };

  if (customPassword) {
    return await exportBackupWithPassword(localData, customPassword, metadata);
  }

  const masterKey = getVaultMasterKey(vaultId);
  const vaultMeta = await getVaultMeta(vaultId);
  const salt = vaultMeta?.salt || generateRandomSalt(SALT_BYTE_LENGTH);

  return await createEncryptedBackupPackage(localData, masterKey, salt, metadata);
}

/**
 * 从加密备份包还原全量本地数据
 * @param pkg 加密备份包
 * @param passwordOrKey 备份密码或解密 CryptoKey
 * @param targetVaultId 目标保险库 ID
 */
export async function importVaultEncryptedBackup(
  pkg: EncryptedBackupPackage,
  passwordOrKey?: string | CryptoKey,
  targetVaultId: string = 'default_vault'
): Promise<{
  importedTransactions: number;
  importedLedgers: number;
  importedCategories: number;
  importedBudgets: number;
  importedRecurring: number;
}> {
  let decryptedData: any;
  let effectiveKey: CryptoKey | null = null;

  if (typeof passwordOrKey === 'string') {
    if (!pkg?.payload?.salt) {
      throw new Error('备份包缺少加密盐值 (salt)，无法进行密码派生');
    }
    effectiveKey = await deriveKeyFromPassword(passwordOrKey, pkg.payload.salt);
    decryptedData = await restoreEncryptedBackupPackage(pkg, effectiveKey);
  } else if (passwordOrKey instanceof CryptoKey) {
    decryptedData = await restoreEncryptedBackupPackage(pkg, passwordOrKey);
    effectiveKey = passwordOrKey;
  } else {
    // 默认尝试使用当前已解锁的保险库密钥
    const masterKey = getVaultMasterKey(targetVaultId);
    decryptedData = await restoreEncryptedBackupPackage(pkg, masterKey);
    effectiveKey = masterKey;
  }

  const result = await importAllLocalData(decryptedData, {
    overwrite: true,
    targetUserId: targetVaultId,
  });

  // 跨设备导入成功后同步更新当前会话密钥
  if (effectiveKey) {
    setCachedKey(targetVaultId, effectiveKey);
    await persistVaultSession(targetVaultId, effectiveKey);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`ledger_vault_locked_${targetVaultId}`);
    }
    notifyVaultStatusChanged();
  }

  return result;
}

// 别名导出 (保持 API 规范一致性)
export const unlockVaultWithPassword = unlockVault;
export const unlockVaultWithRecoveryCode = resetPasswordWithRecoveryCode;

