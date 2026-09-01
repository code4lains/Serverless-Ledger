/**
 * 账盾 - 本地端到端加密与安全保险库类型定义 (Web Crypto Types)
 * 遵循《账盾 v2 加密方案》
 */

export interface EncryptedPayload {
  ciphertext: string; // Base64 编码密文
  iv: string;         // Base64 编码初始化向量 (12 bytes AES-GCM IV)
  salt: string;       // Base64 编码盐值 (16 bytes PBKDF2 Salt)
  version: number;    // 加密算法版本 (当前为 1)
  algorithm?: 'AES-GCM-256';
}

export interface VaultMetadata {
  id: string;                      // 保险库唯一标识 (通常为 'default_vault' 或 userId)
  salt: string;                    // Base64 编码主密码盐 (16 bytes)
  verify_hash: string;             // Base64 编码验证密文/哈希 (用于校验主密码正确性)
  recovery_salt?: string;          // 恢复码盐
  recovery_verify_hash?: string;   // 恢复码校验密文/哈希
  iterations: number;              // PBKDF2 迭代次数 (默认 100,000)
  created_at: string;
  updated_at: string;
}

export interface EncryptedBackupPackage {
  app: 'ServerlessLedger';
  version: 2;
  encrypted: boolean;
  exported_at: string;
  payload: EncryptedPayload;
  metadata?: {
    transaction_count?: number;
    ledger_count?: number;
    category_count?: number;
  };
}
