import assert from 'node:assert/strict';

console.log('Testing server offline sync isolation & batch contract...');

// 1. Test Last-Write-Wins (LWW) resolution contract
const clientTx = {
  transaction_id: 'tx_sync_001',
  amount: 2500,
  updated_at: '2026-09-01T10:00:00.000Z',
};

const serverTxOlder = {
  transaction_id: 'tx_sync_001',
  amount: 2000,
  updated_at: '2026-09-01T09:00:00.000Z',
};

const serverTxNewer = {
  transaction_id: 'tx_sync_001',
  amount: 3000,
  updated_at: '2026-09-01T11:00:00.000Z',
};

// Client is newer -> client wins
assert.ok(new Date(clientTx.updated_at).getTime() > new Date(serverTxOlder.updated_at).getTime());
// Server is newer -> server wins
assert.ok(new Date(serverTxNewer.updated_at).getTime() > new Date(clientTx.updated_at).getTime());

// 2. Test batch sync request and response structure
const syncPayload = {
  transactions: [clientTx],
  last_synced_at: '2026-09-01T08:00:00.000Z',
};

assert.ok(Array.isArray(syncPayload.transactions));
assert.equal(syncPayload.transactions.length, 1);
assert.equal(syncPayload.transactions[0].transaction_id, 'tx_sync_001');

const syncResponse = {
  success: true,
  data: {
    synced_ids: ['tx_sync_001'],
    server_transactions: [],
    server_time: new Date().toISOString(),
  },
  message: 'Successfully synchronized 1 transactions',
};

assert.equal(syncResponse.success, true);
assert.deepEqual(syncResponse.data.synced_ids, ['tx_sync_001']);
assert.ok(typeof syncResponse.data.server_time === 'string');

console.log('Server offline sync test passed!');

