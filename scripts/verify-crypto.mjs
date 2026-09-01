import assert from 'node:assert/strict';

// Node 18+ provides global webcrypto (crypto.subtle, crypto.getRandomValues)
console.log('🚀 [Crypto & Vault Test Suite] Starting tests...');

// ======================== Crypto Utilities & Core Tests ========================

const DEFAULT_PBKDF2_ITERATIONS = 100_000;
const SALT_BYTE_LENGTH = 16;
const AES_GCM_IV_BYTE_LENGTH = 12;
const AES_KEY_BIT_LENGTH = 256;
const RECOVERY_CODE_CHARSET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function bytesToBase64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function base64ToBytes(base64) {
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function stringToBytes(str) {
  return new TextEncoder().encode(str);
}

function bytesToString(bytes) {
  return new TextDecoder().decode(bytes);
}

function generateRandomSalt(length = SALT_BYTE_LENGTH) {
  const salt = new Uint8Array(length);
  crypto.getRandomValues(salt);
  return salt;
}

function generateRandomIv(length = AES_GCM_IV_BYTE_LENGTH) {
  const iv = new Uint8Array(length);
  crypto.getRandomValues(iv);
  return iv;
}

async function deriveKeyFromPassword(password, salt, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  const saltBytes = typeof salt === 'string' ? base64ToBytes(salt) : salt;
  const passwordBytes = stringToBytes(password);

  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey', 'deriveBits']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    baseKey,
    {
      name: 'AES-GCM',
      length: AES_KEY_BIT_LENGTH,
    },
    false,
    ['encrypt', 'decrypt']
  );
}

function generateRecoveryCode() {
  const randomBytes = new Uint8Array(16);
  crypto.getRandomValues(randomBytes);
  let raw = '';
  for (let i = 0; i < 16; i++) {
    raw += RECOVERY_CODE_CHARSET[randomBytes[i] % RECOVERY_CODE_CHARSET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

function normalizeRecoveryCode(code) {
  return code.replace(/[-\s]/g, '').trim().toUpperCase();
}

function validateRecoveryCodeFormat(code) {
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length !== 16) return false;
  for (let i = 0; i < normalized.length; i++) {
    if (!RECOVERY_CODE_CHARSET.includes(normalized[i])) return false;
  }
  return true;
}

async function deriveKeyFromRecoveryCode(code, salt, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  const normalized = normalizeRecoveryCode(code);
  if (!validateRecoveryCodeFormat(normalized)) {
    throw new Error('无效的密码恢复码格式');
  }
  return deriveKeyFromPassword(normalized, salt, iterations);
}

async function encryptData(data, key, salt) {
  let plaintextBytes;
  if (typeof data === 'string') {
    plaintextBytes = stringToBytes(data);
  } else if (data instanceof Uint8Array) {
    plaintextBytes = data;
  } else {
    plaintextBytes = stringToBytes(JSON.stringify(data));
  }

  const iv = generateRandomIv(AES_GCM_IV_BYTE_LENGTH);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintextBytes
  );

  const saltBase64 = salt ? (typeof salt === 'string' ? salt : bytesToBase64(salt)) : '';

  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuffer)),
    iv: bytesToBase64(iv),
    salt: saltBase64,
    version: 1,
    algorithm: 'AES-GCM-256',
  };
}

async function decryptData(payload, key) {
  const ciphertextBytes = base64ToBytes(payload.ciphertext);
  const ivBytes = base64ToBytes(payload.iv);

  try {
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      key,
      ciphertextBytes
    );
    return new Uint8Array(decryptedBuffer);
  } catch {
    throw new Error('解密失败：密文被篡改、IV 错误或密码不匹配 (AES-GCM 认证标签校验未通过)');
  }
}

async function decryptString(payload, key) {
  const bytes = await decryptData(payload, key);
  return bytesToString(bytes);
}

async function decryptObject(payload, key) {
  const str = await decryptString(payload, key);
  return JSON.parse(str);
}

// ======================== Run Test Cases ========================

async function runTests() {
  // Test 1: PBKDF2 Key Derivation Consistency
  console.log('Test 1: PBKDF2 Key Derivation Consistency...');
  const salt1 = generateRandomSalt(16);
  const key1a = await deriveKeyFromPassword('MasterSecret@2026', salt1);
  const key1b = await deriveKeyFromPassword('MasterSecret@2026', salt1);

  assert.ok(key1a instanceof CryptoKey, 'Derived key must be a CryptoKey');
  assert.equal(key1a.algorithm.name, 'AES-GCM', 'Algorithm name must be AES-GCM');
  assert.equal(key1a.algorithm.length, 256, 'Key length must be 256 bits');
  assert.equal(key1a.extractable, false, 'Key must be non-extractable in memory');

  // Test 2: Encrypt & Decrypt Round-Trip (String, Object, Binary)
  console.log('Test 2: AES-GCM Encrypt & Decrypt Round-Trip...');
  const secretText = '账盾 Serverless Ledger - 银行级端到端加密 🛡️ 2026';
  const encryptedPayload = await encryptData(secretText, key1a, salt1);

  assert.equal(encryptedPayload.version, 1, 'Version should be 1');
  assert.equal(encryptedPayload.algorithm, 'AES-GCM-256', 'Algorithm must be AES-GCM-256');
  assert.ok(encryptedPayload.ciphertext.length > 0, 'Ciphertext must not be empty');
  assert.ok(encryptedPayload.iv.length > 0, 'IV must not be empty');

  const decryptedText = await decryptString(encryptedPayload, key1b);
  assert.equal(decryptedText, secretText, 'Decrypted text must match original string');

  // JSON Object round trip
  const ledgerData = {
    transactions: [
      { id: 'tx_1', amount: 15800, remark: '商务午餐' },
      { id: 'tx_2', amount: 350000, remark: '服务器年费' },
    ],
    ledger_name: '公司账本',
  };
  const encObj = await encryptData(ledgerData, key1a, salt1);
  const decObj = await decryptObject(encObj, key1b);
  assert.deepEqual(decObj, ledgerData, 'Decrypted JSON object must match original');

  // Test 3: Tamper Resistance (AES-GCM Authentication Tag verification)
  console.log('Test 3: Cryptographic Tamper Resistance...');
  
  // 3a: Modified ciphertext bit
  const tamperedCipherBytes = base64ToBytes(encryptedPayload.ciphertext);
  tamperedCipherBytes[0] ^= 0xff; // flip bits
  const tamperedPayload = {
    ...encryptedPayload,
    ciphertext: bytesToBase64(tamperedCipherBytes),
  };
  await assert.rejects(
    async () => {
      await decryptString(tamperedPayload, key1a);
    },
    /解密失败/,
    'Decryption must reject tampered ciphertext'
  );

  // 3b: Modified IV
  const tamperedIvBytes = base64ToBytes(encryptedPayload.iv);
  tamperedIvBytes[0] ^= 0x01;
  const tamperedIvPayload = {
    ...encryptedPayload,
    iv: bytesToBase64(tamperedIvBytes),
  };
  await assert.rejects(
    async () => {
      await decryptString(tamperedIvPayload, key1a);
    },
    /解密失败/,
    'Decryption must reject modified IV'
  );

  // 3c: Wrong Password
  const wrongKey = await deriveKeyFromPassword('WrongPassword123!', salt1);
  await assert.rejects(
    async () => {
      await decryptString(encryptedPayload, wrongKey);
    },
    /解密失败/,
    'Decryption must reject incorrect password key'
  );

  // Test 4: Recovery Code Generation & Normalization
  console.log('Test 4: Recovery Code Generation & Normalization...');
  const recoveryCode = generateRecoveryCode();
  assert.match(recoveryCode, /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  assert.equal(validateRecoveryCodeFormat(recoveryCode), true, 'Generated code must be valid');

  const normalized = normalizeRecoveryCode('  k9mz-4w7x-2rty-8nql  ');
  assert.equal(normalized, 'K9MZ4W7X2RTY8NQL');
  assert.equal(validateRecoveryCodeFormat(normalized), true);

  // Invalid recovery code format checks
  assert.equal(validateRecoveryCodeFormat('ABC'), false);
  assert.equal(validateRecoveryCodeFormat('K9MZ4W7X2RTY8NQL0'), false); // '0' is invalid
  assert.equal(validateRecoveryCodeFormat('K9MZ4W7X2RTY8NQO'), false); // 'O' is invalid

  // Test 5: Vault Zero-Knowledge Setup, Unlock & Recovery Simulation
  console.log('Test 5: Vault Authentication & Recovery Code Reset Flow...');
  const VAULT_VERIFICATION_TOKEN = 'SERVERLESS_LEDGER_VAULT_AUTH_V1';

  // Step 5a: Setup Vault
  const masterPassword = 'MySecretMasterPassword#99';
  const vaultMasterSalt = generateRandomSalt(16);
  const vaultRecoverySalt = generateRandomSalt(16);
  const vaultRecoveryCode = generateRecoveryCode();

  const vaultMasterKey = await deriveKeyFromPassword(masterPassword, vaultMasterSalt);
  const vaultRecoveryKey = await deriveKeyFromRecoveryCode(vaultRecoveryCode, vaultRecoverySalt);

  const masterVerifyPayload = await encryptData(
    { token: VAULT_VERIFICATION_TOKEN },
    vaultMasterKey,
    vaultMasterSalt
  );
  const recoveryVerifyPayload = await encryptData(
    { token: VAULT_VERIFICATION_TOKEN },
    vaultRecoveryKey,
    vaultRecoverySalt
  );

  const vaultMeta = {
    id: 'default_vault',
    salt: bytesToBase64(vaultMasterSalt),
    verify_hash: JSON.stringify(masterVerifyPayload),
    recovery_salt: bytesToBase64(vaultRecoverySalt),
    recovery_verify_hash: JSON.stringify(recoveryVerifyPayload),
    iterations: DEFAULT_PBKDF2_ITERATIONS,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Step 5b: Unlock with Correct Password
  const attemptKey = await deriveKeyFromPassword(masterPassword, vaultMeta.salt);
  const decryptedVerify = await decryptObject(JSON.parse(vaultMeta.verify_hash), attemptKey);
  assert.equal(decryptedVerify.token, VAULT_VERIFICATION_TOKEN, 'Unlock must succeed with correct password');

  // Step 5c: Unlock with Wrong Password
  const wrongAttemptKey = await deriveKeyFromPassword('BadPassword!', vaultMeta.salt);
  await assert.rejects(
    async () => {
      await decryptObject(JSON.parse(vaultMeta.verify_hash), wrongAttemptKey);
    },
    /解密失败/,
    'Unlock must fail with incorrect password'
  );

  // Step 5d: Recovery with Recovery Code
  const recAttemptKey = await deriveKeyFromRecoveryCode(vaultRecoveryCode, vaultMeta.recovery_salt);
  const decryptedRecVerify = await decryptObject(JSON.parse(vaultMeta.recovery_verify_hash), recAttemptKey);
  assert.equal(decryptedRecVerify.token, VAULT_VERIFICATION_TOKEN, 'Recovery verification must succeed with valid code');

  // Step 5e: Recovery with Wrong Recovery Code
  const badRecoveryCode = generateRecoveryCode();
  const badRecAttemptKey = await deriveKeyFromRecoveryCode(badRecoveryCode, vaultMeta.recovery_salt);
  await assert.rejects(
    async () => {
      await decryptObject(JSON.parse(vaultMeta.recovery_verify_hash), badRecAttemptKey);
    },
    /解密失败/,
    'Recovery verification must fail with wrong code'
  );

  // Test 6: Encrypted Backup Package Structure & Verification
  console.log('Test 6: Encrypted Backup Package Export & Restore...');
  const fullBackupData = {
    transactions: [{ transaction_id: 'tx_101', amount: 8888, type: 'income' }],
    ledgers: [{ ledger_id: 'led_01', name: '主日常账本', is_default: 1 }],
    categories: [{ category_id: 'cat_01', name: '餐饮美食', type: 'expense' }],
    budgets: [{ budget_id: 'bg_01', amount: 500000, period: 'monthly' }],
    recurringRules: [],
  };

  const backupPassword = 'BackupSuperPassword2026!';
  const backupSalt = generateRandomSalt(16);
  const backupKey = await deriveKeyFromPassword(backupPassword, backupSalt);
  const backupPayload = await encryptData(fullBackupData, backupKey, backupSalt);

  const backupPackage = {
    app: 'ServerlessLedger',
    version: 2,
    encrypted: true,
    exported_at: new Date().toISOString(),
    payload: backupPayload,
    metadata: {
      transaction_count: fullBackupData.transactions.length,
      ledger_count: fullBackupData.ledgers.length,
      category_count: fullBackupData.categories.length,
    },
  };

  assert.equal(backupPackage.app, 'ServerlessLedger');
  assert.equal(backupPackage.version, 2);
  assert.equal(backupPackage.encrypted, true);
  assert.equal(backupPackage.metadata.transaction_count, 1);

  // Restore with correct backup password
  const restoredKey = await deriveKeyFromPassword(backupPassword, backupPackage.payload.salt);
  const restoredData = await decryptObject(backupPackage.payload, restoredKey);
  assert.deepEqual(restoredData, fullBackupData, 'Restored data must match exported data');

  console.log('✅ ALL CRYPTO & VAULT UNIT TESTS PASSED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
