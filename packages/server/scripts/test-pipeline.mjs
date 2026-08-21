import assert from 'node:assert';

const BASE = 'http://127.0.0.1:8787';

async function testPipeline() {
  console.log('--- 1. Testing Health Endpoint ---');
  const healthRes = await fetch(`${BASE}/api/health`);
  assert.strictEqual(healthRes.status, 200, 'Health endpoint should return 200');
  const healthJson = await healthRes.json();
  console.log('Health Response:', healthJson);
  assert.strictEqual(healthJson.success, true);
  assert.strictEqual(healthJson.data.database.status, 'connected');

  console.log('\n--- 2. Testing Categories Endpoint ---');
  const catRes = await fetch(`${BASE}/api/categories`);
  assert.strictEqual(catRes.status, 200);
  const catJson = await catRes.json();
  console.log(`Categories returned: ${catJson.data.length} items`);
  assert(catJson.data.length >= 10, 'Should return pre-seeded categories');

  console.log('\n--- 3. Testing Create Transaction Endpoint ---');
  const newTx = {
    transaction_id: `tx_${Date.now()}`,
    user_id: 'test_user',
    ledger_id: 'test_ledger',
    type: 'expense',
    amount: 3500, // 35.00 CNY
    category_id: 'cat_exp_food_lunch',
    transaction_date: new Date().toISOString(),
    remark: 'Pipeline Verification Test',
  };

  const createRes = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newTx),
  });
  assert.strictEqual(createRes.status, 201);
  const createJson = await createRes.json();
  console.log('Created Transaction in D1:', createJson.data);
  assert.strictEqual(createJson.data.amount, 3500);

  console.log('\n--- 4. Testing List Transactions Endpoint ---');
  const listRes = await fetch(`${BASE}/api/transactions?userId=test_user`);
  assert.strictEqual(listRes.status, 200);
  const listJson = await listRes.json();
  console.log(`Transactions found for user test_user: ${listJson.data.length}`);
  assert(listJson.data.some((t) => t.transaction_id === newTx.transaction_id));

  console.log('\n--- 5. Testing Offline Batch Sync Endpoint ---');
  const syncBatch = {
    transactions: [
      {
        transaction_id: `tx_sync_${Date.now()}`,
        user_id: 'test_user',
        ledger_id: 'test_ledger',
        type: 'income',
        amount: 88800, // 888.00 CNY
        category_id: 'cat_inc_salary',
        transaction_date: new Date().toISOString(),
        remark: 'Offline Sync Verification',
      },
    ],
  };

  const syncRes = await fetch(`${BASE}/api/transactions/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(syncBatch),
  });
  assert.strictEqual(syncRes.status, 200);
  const syncJson = await syncRes.json();
  console.log('Sync Batch Response:', syncJson);
  assert.strictEqual(syncJson.data.synced_ids.length, 1);

  console.log('\n🎉 ALL PIPELINE INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉');
}

testPipeline().catch((err) => {
  console.error('Test Pipeline Failed:', err);
  process.exit(1);
});
