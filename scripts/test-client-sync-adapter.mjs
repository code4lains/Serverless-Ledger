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

// Test 5: Conflict detection contract test
function checkConflict({ remoteModTime, lastKnownRemoteTime, lastSyncIso, forceDirection, transactions }) {
  if (remoteModTime > lastKnownRemoteTime && remoteModTime > 0) {
    const effectiveLastSyncIso = lastSyncIso || '1970-01-01T00:00:00.000Z';
    if (!forceDirection) {
      const hasLocalChanges = transactions.some(
        (tx) =>
          (Boolean(tx.updated_at) && tx.updated_at > effectiveLastSyncIso) ||
          (Boolean(tx.created_at) && tx.created_at > effectiveLastSyncIso)
      );
      if (hasLocalChanges) {
        return {
          success: false,
          action: 'conflict_detected',
          message: '检测到云端与当前设备均有记账数据，存在合并冲突，请选择保留方向或手动导入合并',
        };
      }
    }
  }
  return { success: true, action: 'downloaded' };
}

const lastSyncIso = '2026-09-01T00:00:00.000Z';
const unmodifiedTxs = [{ id: '1', created_at: '2026-08-31T00:00:00.000Z', updated_at: '2026-08-31T00:00:00.000Z' }];
const modifiedTxs = [{ id: '2', created_at: '2026-08-31T00:00:00.000Z', updated_at: '2026-09-02T00:00:00.000Z' }];
const newTxs = [{ id: '3', created_at: '2026-09-02T00:00:00.000Z', updated_at: '2026-09-02T00:00:00.000Z' }];

// Case 1: Remote is newer, local has no modifications -> should download
assert.strictEqual(
  checkConflict({
    remoteModTime: 1000,
    lastKnownRemoteTime: 500,
    lastSyncIso,
    transactions: unmodifiedTxs,
  }).action,
  'downloaded'
);

// Case 2: Remote is newer, local has updated transactions -> conflict_detected
assert.strictEqual(
  checkConflict({
    remoteModTime: 1000,
    lastKnownRemoteTime: 500,
    lastSyncIso,
    transactions: modifiedTxs,
  }).action,
  'conflict_detected'
);

// Case 3: Remote is newer, local has newly created transactions -> conflict_detected
assert.strictEqual(
  checkConflict({
    remoteModTime: 1000,
    lastKnownRemoteTime: 500,
    lastSyncIso,
    transactions: newTxs,
  }).action,
  'conflict_detected'
);

// Case 4: Remote is newer, local has changes, but forceDirection is provided -> not conflict
assert.strictEqual(
  checkConflict({
    remoteModTime: 1000,
    lastKnownRemoteTime: 500,
    lastSyncIso,
    forceDirection: 'pull',
    transactions: modifiedTxs,
  }).action,
  'downloaded'
);

// Case 5: First-sync device (lastSyncIso is null/empty), local has offline transactions, remote is newer -> conflict_detected
assert.strictEqual(
  checkConflict({
    remoteModTime: 1000,
    lastKnownRemoteTime: 0,
    lastSyncIso: undefined,
    transactions: newTxs,
  }).action,
  'conflict_detected'
);

console.log('✅ WebDAV snapshot conflict detection contracts passed!');

// Test 6: SSRF Proxy blocked hosts validation
function isPrivateOrBlockedHost(hostname) {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return true;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host.endsWith('.lan') ||
    host.endsWith('.home.arpa') ||
    host.endsWith('.intranet') ||
    host.endsWith('.corp') ||
    host === 'instance-data' ||
    host === 'metadata' ||
    host === 'metadata.google.internal'
  ) {
    return true;
  }
  if (!host.includes('.') && !host.includes(':')) {
    return true;
  }
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = host.match(ipv4Regex);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1, 5).map(Number);
    if (octets.some((n) => n < 0 || n > 255 || isNaN(n))) return true;
    const [a, b, c] = octets;
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 192 && b === 0 && c === 0) return true;
    if (a === 192 && b === 0 && c === 2) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;
    if (a >= 224) return true;
    return false;
  }
  if (host.includes(':')) {
    if (host === '::1' || host === '::' || host === '0:0:0:0:0:0:0:1' || host === '0:0:0:0:0:0:0:0') return true;
    if (/^fe[89ab]/i.test(host)) return true;
    if (/^f[cd]/i.test(host)) return true;
    if (host.startsWith('::ffff:')) {
      const embeddedIpv4 = host.substring(7);
      if (ipv4Regex.test(embeddedIpv4)) {
        return isPrivateOrBlockedHost(embeddedIpv4);
      }
      return true;
    }
    if (host.startsWith('2001:db8:') || host.startsWith('2001:0db8:') || host.startsWith('100::')) return true;
  }
  return false;
}

assert.strictEqual(isPrivateOrBlockedHost('localhost'), true);
assert.strictEqual(isPrivateOrBlockedHost('127.0.0.1'), true);
assert.strictEqual(isPrivateOrBlockedHost('169.254.169.254'), true);
assert.strictEqual(isPrivateOrBlockedHost('10.0.0.1'), true);
assert.strictEqual(isPrivateOrBlockedHost('172.16.0.1'), true);
assert.strictEqual(isPrivateOrBlockedHost('172.31.255.255'), true);
assert.strictEqual(isPrivateOrBlockedHost('192.168.1.1'), true);
assert.strictEqual(isPrivateOrBlockedHost('service.internal'), true);
assert.strictEqual(isPrivateOrBlockedHost('nas.local'), true);
assert.strictEqual(isPrivateOrBlockedHost('router'), true);
assert.strictEqual(isPrivateOrBlockedHost('::1'), true);
assert.strictEqual(isPrivateOrBlockedHost('fe80::1'), true);
assert.strictEqual(isPrivateOrBlockedHost('dav.jianguoyun.com'), false);
assert.strictEqual(isPrivateOrBlockedHost('webdav.mycustomdomain.com'), false);

console.log('✅ WebDAV proxy SSRF protection rules passed!');

console.log('🎉 ALL CLIENT WEBDAV SNAPSHOT SYNC TESTS COMPLETED SUCCESSFULLY!');
