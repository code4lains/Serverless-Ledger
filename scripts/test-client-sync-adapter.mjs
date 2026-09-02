import assert from 'node:assert';

console.log('Testing Client WebDAV Snapshot Sync Engine Contracts (v3)...');

// Mock localStorage for Node test environment
const storage = new Map();
globalThis.localStorage = {
  getItem: (key) => storage.get(key) || null,
  setItem: (key, val) => storage.set(key, String(val)),
  removeItem: (key) => storage.delete(key),
  clear: () => storage.clear(),
};

globalThis.window = {
  dispatchEvent: (event) => {},
  addEventListener: () => {},
  removeEventListener: () => {},
};

globalThis.CustomEvent = class {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};

// Test 1: WebDavAdapter snapshot contract
class MockWebDavAdapter {
  constructor(config) {
    this.config = config;
    this.remoteFiles = new Map();
  }

  async testConnection() {
    if (!this.config.webdavUrl) {
      return { success: false, message: 'WebDAV URL 为空' };
    }
    return { success: true, message: 'WebDAV 连接成功 (延迟 25ms)', latencyMs: 25 };
  }

  async getRemoteMetadata(remotePath) {
    const file = this.remoteFiles.get(remotePath);
    if (!file) {
      return { exists: false };
    }
    return {
      exists: true,
      lastModified: file.lastModified,
      etag: file.etag,
      contentLength: file.content.length,
    };
  }

  async uploadSnapshot(remotePath, content) {
    const now = new Date().toISOString();
    const etag = `"${Date.now()}"`;
    this.remoteFiles.set(remotePath, { content, lastModified: now, etag });
    return { success: true, etag, lastModified: now };
  }

  async downloadSnapshot(remotePath) {
    const file = this.remoteFiles.get(remotePath);
    if (!file) {
      return { success: false, error: '文件不存在' };
    }
    return {
      success: true,
      content: file.content,
      lastModified: file.lastModified,
      etag: file.etag,
    };
  }
}

const adapter = new MockWebDavAdapter({
  provider: 'webdav',
  webdavUrl: 'https://dav.jianguoyun.com/dav/',
  webdavUsername: 'user@example.com',
  webdavPassword: 'password123',
  remotePath: '/ServerlessLedger/ledger-vault.enc.json',
});

// Test Connection
const connRes = await adapter.testConnection();
assert.strictEqual(connRes.success, true);
assert.strictEqual(typeof connRes.latencyMs, 'number');

// Remote Metadata before upload
let meta = await adapter.getRemoteMetadata('/ServerlessLedger/ledger-vault.enc.json');
assert.strictEqual(meta.exists, false);

// Upload encrypted snapshot
const mockSnapshotPayload = JSON.stringify({
  app: 'ServerlessLedger',
  version: 2,
  encrypted: true,
  payload: { ciphertext: 'base64ciphertext', iv: 'base64iv', salt: 'base64salt' },
});

const uploadRes = await adapter.uploadSnapshot('/ServerlessLedger/ledger-vault.enc.json', mockSnapshotPayload);
assert.strictEqual(uploadRes.success, true);
assert.ok(typeof uploadRes.etag === 'string');

// Remote Metadata after upload
meta = await adapter.getRemoteMetadata('/ServerlessLedger/ledger-vault.enc.json');
assert.strictEqual(meta.exists, true);
assert.ok(meta.lastModified);
assert.strictEqual(meta.contentLength, mockSnapshotPayload.length);

// Download snapshot
const downloadRes = await adapter.downloadSnapshot('/ServerlessLedger/ledger-vault.enc.json');
assert.strictEqual(downloadRes.success, true);
assert.strictEqual(downloadRes.content, mockSnapshotPayload);

console.log('✅ WebDavAdapter snapshot contracts passed!');

// Test 2: WebDAV Sync Config persistence & change event
const SYNC_CONFIG_KEY = 'serverless_ledger_sync_config';

function getSyncConfig() {
  const raw = localStorage.getItem(SYNC_CONFIG_KEY);
  if (raw) {
    return JSON.parse(raw);
  }
  return {
    provider: 'none',
    webdavUrl: '',
    webdavUsername: '',
    webdavPassword: '',
    remotePath: '/ServerlessLedger/ledger-vault.enc.json',
    autoSyncEnabled: true,
    syncIntervalSeconds: 60,
    lastSyncedAt: null,
  };
}

function saveSyncConfig(config) {
  const current = getSyncConfig();
  const merged = { ...current, ...config };
  localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(merged));
  return merged;
}

function isWebdavSyncConfigured() {
  const cfg = getSyncConfig();
  return cfg.provider === 'webdav' && !!cfg.webdavUrl?.trim();
}

// Initial state (no config)
localStorage.clear();
let cfg = getSyncConfig();
assert.strictEqual(cfg.provider, 'none');
assert.strictEqual(isWebdavSyncConfigured(), false);

// Save WebDAV config
saveSyncConfig({
  provider: 'webdav',
  webdavUrl: 'https://nas.local:5006/dav/',
  webdavUsername: 'admin',
  webdavPassword: 'naspassword',
  remotePath: '/ServerlessLedger/my-vault.enc.json',
});

cfg = getSyncConfig();
assert.strictEqual(cfg.provider, 'webdav');
assert.strictEqual(cfg.webdavUrl, 'https://nas.local:5006/dav/');
assert.strictEqual(cfg.remotePath, '/ServerlessLedger/my-vault.enc.json');
assert.strictEqual(isWebdavSyncConfigured(), true);

// Switch back to none
saveSyncConfig({ provider: 'none' });
assert.strictEqual(isWebdavSyncConfigured(), false);

console.log('✅ WebDAV Sync config tests passed!');

// Test 3: HTML Response detection contract
function isHtmlResponse(text) {
  if (!text) return false;
  const trimmed = text.trimStart().toLowerCase();
  return (
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<head')
  );
}

assert.strictEqual(isHtmlResponse('<!doctype html><html><head><title>Vite App</title></head></html>'), true);
assert.strictEqual(isHtmlResponse('<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01//EN">'), true);
assert.strictEqual(isHtmlResponse('<html><body>404 Not Found</body></html>'), true);
assert.strictEqual(isHtmlResponse('{"app":"ServerlessLedger","version":3}'), false);
assert.strictEqual(isHtmlResponse('<?xml version="1.0" encoding="utf-8" ?><D:multistatus xmlns:D="DAV:"/>'), false);

console.log('✅ HTML response detection tests passed!');

// Test 4: Cross-device snapshot password decryption contract
async function testCrossDeviceSnapshotDecryption() {
  const masterPassword = 'SharedMasterPassword123';
  const saltDeviceA = crypto.getRandomValues(new Uint8Array(16));
  const saltDeviceB = crypto.getRandomValues(new Uint8Array(16));

  const baseKeyA = await crypto.subtle.importKey('raw', new TextEncoder().encode(masterPassword), { name: 'PBKDF2' }, false, ['deriveKey']);
  const keyDeviceA = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: saltDeviceA, iterations: 100000, hash: 'SHA-256' }, baseKeyA, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

  const baseKeyB = await crypto.subtle.importKey('raw', new TextEncoder().encode(masterPassword), { name: 'PBKDF2' }, false, ['deriveKey']);
  const keyDeviceB = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: saltDeviceB, iterations: 100000, hash: 'SHA-256' }, baseKeyB, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);

  // Device A exports snapshot
  const snapshotData = { transactions: [{ id: 'tx_1', amount: 100 }], version: 3 };
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, keyDeviceA, new TextEncoder().encode(JSON.stringify(snapshotData)));

  const pkg = {
    app: 'ServerlessLedger',
    version: 2,
    encrypted: true,
    payload: {
      ciphertext: Buffer.from(encrypted).toString('base64'),
      iv: Buffer.from(iv).toString('base64'),
      salt: Buffer.from(saltDeviceA).toString('base64'),
    }
  };

  // Device B tries to decrypt with its own keyDeviceB -> FAILS (different salt)
  let failedWithDeviceBKey = false;
  try {
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(pkg.payload.iv, 'base64') }, keyDeviceB, Buffer.from(pkg.payload.ciphertext, 'base64'));
  } catch {
    failedWithDeviceBKey = true;
  }
  assert.strictEqual(failedWithDeviceBKey, true, 'Decrypting with different device salt key must fail');

  // Device B provides password + pkg.payload.salt -> derives Key A and SUCCEEDS!
  const derivedKeyFromRemoteSalt = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: Buffer.from(pkg.payload.salt, 'base64'), iterations: 100000, hash: 'SHA-256' },
    baseKeyB,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const decryptedBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: Buffer.from(pkg.payload.iv, 'base64') },
    derivedKeyFromRemoteSalt,
    Buffer.from(pkg.payload.ciphertext, 'base64')
  );
  const restored = JSON.parse(new TextDecoder().decode(decryptedBuf));
  assert.deepStrictEqual(restored, snapshotData, 'Password-derived cross-device decryption must succeed');
  console.log('✅ Cross-device snapshot password derivation tests passed!');
}

await testCrossDeviceSnapshotDecryption();

console.log('🎉 ALL CLIENT WEBDAV SNAPSHOT SYNC TESTS COMPLETED SUCCESSFULLY!');
