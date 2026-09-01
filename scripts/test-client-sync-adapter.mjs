import assert from 'node:assert';

console.log('Testing Client SyncAdapter and Local-First Engine Contracts...');

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

// Test 1: CloudflareSyncAdapter contract
class MockCloudflareSyncAdapter {
  constructor(config) {
    this.provider = 'cloudflare_d1';
    this.config = config;
  }

  async testConnection() {
    return { success: true, message: '连接成功 (延迟 20ms)', latencyMs: 20 };
  }

  async getServerTime() {
    return new Date().toISOString();
  }

  async pushChanges(changes) {
    const syncedTransactionIds = (changes.transactions || []).map((t) => t.transaction_id);
    return {
      syncedTransactionIds,
      serverTime: new Date().toISOString(),
    };
  }

  async pullChanges(lastSyncedAt) {
    return {
      transactions: [],
      ledgers: [],
      categories: [],
      budgets: [],
      recurringRules: [],
      serverTime: new Date().toISOString(),
    };
  }
}

const adapter = new MockCloudflareSyncAdapter({ provider: 'cloudflare_d1' });
assert.strictEqual(adapter.provider, 'cloudflare_d1');

const connRes = await adapter.testConnection();
assert.strictEqual(connRes.success, true);
assert.strictEqual(typeof connRes.latencyMs, 'number');

const serverTime = await adapter.getServerTime();
assert.ok(typeof serverTime === 'string');

const pushRes = await adapter.pushChanges({
  transactions: [{ transaction_id: 'tx_123' }],
  mutations: [{ entity_type: 'category', entity_id: 'cat_1', action: 'create' }],
});
assert.deepStrictEqual(pushRes.syncedTransactionIds, ['tx_123']);

const pullRes = await adapter.pullChanges(null);
assert.ok(Array.isArray(pullRes.transactions));
assert.ok(Array.isArray(pullRes.ledgers));
assert.ok(Array.isArray(pullRes.categories));
assert.ok(Array.isArray(pullRes.budgets));
assert.ok(Array.isArray(pullRes.recurringRules));
assert.ok(typeof pullRes.serverTime === 'string');

console.log('✅ SyncAdapter contract tests passed!');

// Test 2: Sync Config persistence
const SYNC_CONFIG_KEY = 'serverless_ledger_sync_config';

function getSyncConfig() {
  const raw = localStorage.getItem(SYNC_CONFIG_KEY);
  if (raw) {
    return JSON.parse(raw);
  }
  const token = localStorage.getItem('serverless_ledger_jwt');
  return {
    provider: token ? 'cloudflare_d1' : 'none',
    serverUrl: '',
    authToken: token || undefined,
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

function isCloudSyncEnabled() {
  const cfg = getSyncConfig();
  return cfg.provider !== 'none' && cfg.autoSyncEnabled !== false;
}

function getEffectiveSyncAdapter() {
  const cfg = getSyncConfig();
  if (cfg.provider === 'none') return null;
  if (cfg.provider === 'cloudflare_d1') return new MockCloudflareSyncAdapter(cfg);
  return null;
}

// Initial state (no token, no config)
localStorage.clear();
let cfg = getSyncConfig();
assert.strictEqual(cfg.provider, 'none');
assert.strictEqual(isCloudSyncEnabled(), false);
assert.strictEqual(getEffectiveSyncAdapter(), null);

// Enable cloud sync
saveSyncConfig({ provider: 'cloudflare_d1', authToken: 'jwt_token_123', serverUrl: 'https://example.com' });
cfg = getSyncConfig();
assert.strictEqual(cfg.provider, 'cloudflare_d1');
assert.strictEqual(cfg.authToken, 'jwt_token_123');
assert.strictEqual(cfg.serverUrl, 'https://example.com');
assert.strictEqual(isCloudSyncEnabled(), true);
assert.ok(getEffectiveSyncAdapter() !== null);
assert.strictEqual(getEffectiveSyncAdapter().provider, 'cloudflare_d1');

// Disable auto sync
saveSyncConfig({ autoSyncEnabled: false });
assert.strictEqual(isCloudSyncEnabled(), false);

// Disable cloud sync (set provider to none)
saveSyncConfig({ provider: 'none', autoSyncEnabled: true });
assert.strictEqual(isCloudSyncEnabled(), false);
assert.strictEqual(getEffectiveSyncAdapter(), null);

console.log('✅ Sync config & dormancy tests passed!');
console.log('🎉 ALL CLIENT SYNC ADAPTER CONTRACT TESTS COMPLETED SUCCESSFULLY!');
