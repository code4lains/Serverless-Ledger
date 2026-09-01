/**
 * 账盾 - 本地端到端加密与安全保险库工具 (Web Crypto API SubtleCrypto)
 * 遵循《白皮书》与《账盾 v2 本地加密规范》
 *
 * 核心特性：
 * 1. PBKDF2 (100,000 次迭代, SHA-256) 密钥派生
 * 2. AES-GCM (256-bit, 12-byte 随机 IV) 强加密与完整性鉴别
 * 3. 16 位高熵密码恢复凭证生成与恢复密钥派生
 * 4. 纯内存会话密钥缓存与即时擦除 (防持久化泄露)
 * 5. 加密备份包 (EncryptedBackupPackage) 导出与还原
 */

import { EncryptedPayload, EncryptedBackupPackage } from '@ledger/shared';

export const DEFAULT_PBKDF2_ITERATIONS = 100_000;
export const SALT_BYTE_LENGTH = 16;
export const AES_GCM_IV_BYTE_LENGTH = 12;
export const AES_KEY_BIT_LENGTH = 256;
export const RECOVERY_CODE_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/**
 * 获取 Web Crypto Subtle 接口 (环境兼容浏览器与 Node.js 测试)
 */
export function getSubtleCrypto(): SubtleCrypto {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.subtle) {
    return globalThis.crypto.subtle;
  }
  throw new Error('Web Crypto API (crypto.subtle) 在当前运行环境中不可用');
}

/**
 * 获取安全随机字节
 */
export function getRandomValues(array: Uint8Array): Uint8Array {
  if (typeof globalThis !== 'undefined' && globalThis.crypto?.getRandomValues) {
    return globalThis.crypto.getRandomValues(array);
  }
  throw new Error('crypto.getRandomValues 在当前运行环境中不可用');
}

/**
 * 生成随机 Salt 字节 (默认 16 字节)
 */
export function generateRandomSalt(length: number = SALT_BYTE_LENGTH): Uint8Array {
  const salt = new Uint8Array(length);
  getRandomValues(salt);
  return salt;
}

/**
 * 生成随机 AES-GCM IV (默认 12 字节)
 */
export function generateRandomIv(length: number = AES_GCM_IV_BYTE_LENGTH): Uint8Array {
  const iv = new Uint8Array(length);
  getRandomValues(iv);
  return iv;
}

/**
 * Uint8Array 转换为 Base64 字符串
 */
export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Base64 字符串转换为 Uint8Array
 */
export function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * UTF-8 字符串转换为 Uint8Array
 */
export function stringToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Uint8Array 转换为 UTF-8 字符串
 */
export function bytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/**
 * 使用 PBKDF2 从主密码与盐值派生 AES-GCM 256 位 CryptoKey
 * @param password 用户主密码
 * @param salt 16 字节盐 (Uint8Array 或 Base64 字符串)
 * @param iterations 迭代次数 (默认 100,000)
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array | string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const subtle = getSubtleCrypto();
  const saltBytes = typeof salt === 'string' ? base64ToBytes(salt) : salt;
  const passwordBytes = stringToBytes(password);

  const baseKey = await subtle.importKey(
    'raw',
    passwordBytes as unknown as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey', 'deriveBits']
  );

  const derivedKey = await subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: AES_KEY_BIT_LENGTH,
    },
    false, // 内存中标记为不可导出，防止被恶意提取
    ['encrypt', 'decrypt']
  );

  return derivedKey;
}

/**
 * 生成 16 位高熵密码恢复码 (格式: XXXX-XXXX-XXXX-XXXX)
 * 采用 32 字符安全字典 (去掉易混淆的 0, O, 1, I)，熵值达到 80 bits
 */
export function generateRecoveryCode(): string {
  const randomBytes = new Uint8Array(16);
  getRandomValues(randomBytes);

  let rawCode = '';
  const charsetLength = RECOVERY_CODE_CHARSET.length;
  for (let i = 0; i < 16; i++) {
    const charIndex = randomBytes[i] % charsetLength;
    rawCode += RECOVERY_CODE_CHARSET[charIndex];
  }

  // 格式化为 4x4 可读分段
  return `${rawCode.slice(0, 4)}-${rawCode.slice(4, 8)}-${rawCode.slice(8, 12)}-${rawCode.slice(12, 16)}`;
}

/**
 * 标准化恢复码 (去除连字符、空格并转换为大写)
 */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[-\s]/g, '').trim().toUpperCase();
}

/**
 * 校验恢复码格式是否合法
 */
export function validateRecoveryCodeFormat(code: string): boolean {
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length !== 16) return false;
  for (let i = 0; i < normalized.length; i++) {
    if (!RECOVERY_CODE_CHARSET.includes(normalized[i])) {
      return false;
    }
  }
  return true;
}

/**
 * 使用 PBKDF2 从 16 位恢复码派生 AES-GCM 恢复密钥
 */
export async function deriveKeyFromRecoveryCode(
  recoveryCode: string,
  salt: Uint8Array | string,
  iterations: number = DEFAULT_PBKDF2_ITERATIONS
): Promise<CryptoKey> {
  const normalized = normalizeRecoveryCode(recoveryCode);
  if (!validateRecoveryCodeFormat(normalized)) {
    throw new Error('无效的密码恢复码格式');
  }
  return deriveKeyFromPassword(normalized, salt, iterations);
}

/**
 * 使用 AES-GCM (12-byte 随机 IV) 加密任意数据 (字符串、字节或 JSON 对象)
 * @param data 明文字符串、Uint8Array 或对象
 * @param key AES-GCM CryptoKey
 * @param salt 可选的关联 Salt (Uint8Array 或 Base64)
 */
export async function encryptData(
  data: string | Uint8Array | object,
  key: CryptoKey,
  salt?: Uint8Array | string
): Promise<EncryptedPayload> {
  const subtle = getSubtleCrypto();
  let plaintextBytes: Uint8Array;

  if (typeof data === 'string') {
    plaintextBytes = stringToBytes(data);
  } else if (data instanceof Uint8Array) {
    plaintextBytes = data;
  } else {
    plaintextBytes = stringToBytes(JSON.stringify(data));
  }

  const iv = generateRandomIv(AES_GCM_IV_BYTE_LENGTH);
  const ciphertextBuffer = await subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
    },
    key,
    plaintextBytes as unknown as BufferSource
  );

  const saltBase64 = salt
    ? typeof salt === 'string'
      ? salt
      : bytesToBase64(salt)
    : '';

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
    iv: bytesToBase64(iv),
    salt: saltBase64,
    version: 1,
    algorithm: 'AES-GCM-256',
  };
}

/**
 * 使用 AES-GCM 解密数据并返回原始字节
 * 具有密码学防篡改校验 (GCM Auth Tag)，密文或 IV 若被修改将抛出异常
 */
export async function decryptData(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<Uint8Array> {
  const subtle = getSubtleCrypto();
  const ciphertextBytes = base64ToBytes(payload.ciphertext);
  const ivBytes = base64ToBytes(payload.iv);

  try {
    const decryptedBuffer = await subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: ivBytes as unknown as BufferSource,
      },
      key,
      ciphertextBytes as unknown as BufferSource
    );
    return new Uint8Array(decryptedBuffer);
  } catch (err: any) {
    throw new Error('解密失败：密文被篡改、IV 错误或密码不匹配 (AES-GCM 认证标签校验未通过)');
  }
}

/**
 * 使用 AES-GCM 解密并返回 UTF-8 字符串
 */
export async function decryptString(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<string> {
  const bytes = await decryptData(payload, key);
  return bytesToString(bytes);
}

/**
 * 使用 AES-GCM 解密并解析为 JSON 对象
 */
export async function decryptObject<T = any>(
  payload: EncryptedPayload,
  key: CryptoKey
): Promise<T> {
  const jsonStr = await decryptString(payload, key);
  try {
    return JSON.parse(jsonStr) as T;
  } catch (err: any) {
    throw new Error(`解密数据反序列化 JSON 失败: ${err?.message || '未知错误'}`);
  }
}

// ======================== 内存密钥会话管理 ========================

interface CachedVaultSession {
  vaultId: string;
  key: CryptoKey;
  unlockedAt: string;
}

/**
 * 内存中缓存的保险库密钥 (仅保留在内存闭包，永不写入磁盘或 LocalStorage)
 */
const memoryKeyCache = new Map<string, CachedVaultSession>();

/**
 * 将解锁后的 CryptoKey 存入内存会话
 */
export function setCachedKey(vaultId: string, key: CryptoKey): void {
  memoryKeyCache.set(vaultId, {
    vaultId,
    key,
    unlockedAt: new Date().toISOString(),
  });
}

/**
 * 获取内存中已缓存的 CryptoKey
 */
export function getCachedKey(vaultId: string = 'default_vault'): CryptoKey | null {
  const session = memoryKeyCache.get(vaultId);
  return session ? session.key : null;
}

/**
 * 获取当前已解锁的保险库会话信息
 */
export function getCachedSession(vaultId: string = 'default_vault'): { vaultId: string; unlockedAt: string } | null {
  const session = memoryKeyCache.get(vaultId);
  if (!session) return null;
  return {
    vaultId: session.vaultId,
    unlockedAt: session.unlockedAt,
  };
}

/**
 * 擦除指定保险库的内存密钥 (锁定保险库)
 */
export function clearCachedKey(vaultId: string = 'default_vault'): void {
  memoryKeyCache.delete(vaultId);
}

/**
 * 擦除所有已解锁保险库的内存密钥 (全局锁定)
 */
export function clearAllCachedKeys(): void {
  memoryKeyCache.clear();
}

/**
 * 检查指定保险库当前是否已在内存中解锁
 */
export function isKeyCached(vaultId: string = 'default_vault'): boolean {
  return memoryKeyCache.has(vaultId);
}

// ======================== 加密备份包导入导出 ========================

/**
 * 构建并导出加密备份包 (EncryptedBackupPackage)
 * @param data 要备份的全量数据
 * @param key AES-GCM 加密密钥
 * @param salt 关联 Salt
 * @param metadata 备份包元数据概览
 */
export async function createEncryptedBackupPackage(
  data: any,
  key: CryptoKey,
  salt?: Uint8Array | string,
  metadata?: {
    transaction_count?: number;
    ledger_count?: number;
    category_count?: number;
  }
): Promise<EncryptedBackupPackage> {
  const payload = await encryptData(data, key, salt);
  return {
    app: 'ServerlessLedger',
    version: 2,
    encrypted: true,
    exported_at: new Date().toISOString(),
    payload,
    metadata,
  };
}

/**
 * 校验并解密还原备份包
 * @param pkg 加密备份包
 * @param key AES-GCM 解密密钥
 */
export async function restoreEncryptedBackupPackage<T = any>(
  pkg: EncryptedBackupPackage,
  key: CryptoKey
): Promise<T> {
  if (!pkg || typeof pkg !== 'object') {
    throw new Error('无效的备份包格式');
  }
  if (pkg.app !== 'ServerlessLedger') {
    throw new Error('非账盾 (ServerlessLedger) 官方备份数据包');
  }
  if (pkg.version !== 2) {
    throw new Error(`不支持的备份版本 (v${pkg.version})，当前应用支持 v2`);
  }
  if (!pkg.encrypted || !pkg.payload) {
    throw new Error('备份包未包含有效的加密数据载荷');
  }

  return await decryptObject<T>(pkg.payload, key);
}

/**
 * 使用独立备份密码导出加密备份包
 */
export async function exportBackupWithPassword(
  data: any,
  password: string,
  metadata?: {
    transaction_count?: number;
    ledger_count?: number;
    category_count?: number;
  }
): Promise<EncryptedBackupPackage> {
  const salt = generateRandomSalt(SALT_BYTE_LENGTH);
  const key = await deriveKeyFromPassword(password, salt);
  return createEncryptedBackupPackage(data, key, salt, metadata);
}

/**
 * 使用独立备份密码解密还原备份包
 */
export async function importBackupWithPassword<T = any>(
  pkg: EncryptedBackupPackage,
  password: string
): Promise<T> {
  if (!pkg?.payload?.salt) {
    throw new Error('备份包缺少加密盐值 (salt)，无法进行密码派生');
  }
  const key = await deriveKeyFromPassword(password, pkg.payload.salt);
  return restoreEncryptedBackupPackage<T>(pkg, key);
}
