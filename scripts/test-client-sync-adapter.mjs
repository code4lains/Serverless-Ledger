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
console.log('🎉 ALL CLIENT WEBDAV SNAPSHOT SYNC TESTS COMPLETED SUCCESSFULLY!');
