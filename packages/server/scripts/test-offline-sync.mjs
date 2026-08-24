import assert from 'node:assert';
import { execSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:8787';

async function testOfflineSync() {
  try {
    execSync(
      'npx wrangler d1 execute serverless_ledger_db --local --command "INSERT OR REPLACE INTO invite_codes (code, creator_id, status) VALUES (\'INV-SYSTEM1\', \'system_root\', \'unused\'), (\'INV-SYSTEM2\', \'system_root\', \'unused\'), (\'INV-WELCOME\', \'system_root\', \'unused\'), (\'INV-OFFLINE\', \'system_root\', \'unused\');"',
      { stdio: 'ignore' }
    );
  } catch {}

  console.log('====================================================');
  console.log('🧪 TEST: Phase 7.3 Offline Caching & Sync Verification');
  console.log('====================================================');

  console.log('\n--- 1. Testing Auth & Initial State ---');
  const testEmail = `offline_user_${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword, invite_code: 'INV-OFFLINE' }),
  });
  assert.strictEqual(regRes.status, 201);
  const regJson = await regRes.json();
  const token = regJson.data.token;
  const userId = regJson.data.user.user_id;
  const defaultLedgerId = regJson.data.user.default_ledger_id;

  console.log(`User registered: ${testEmail} (ID: ${userId}, Ledger: ${defaultLedgerId})`);

  console.log('\n--- 2. Simulating Initial Server Transactions Creation ---');
  const tx1 = {
    transaction_id: `tx_init_1_${Date.now()}`,
    ledger_id: defaultLedgerId,
    type: 'expense',
    amount: 3500, // 35.00 CNY
    category_id: 'cat_exp_food_lunch',
    transaction_date: new Date().toISOString(),
    remark: 'Server Base Lunch',
  };
  const tx2 = {
    transaction_id: `tx_init_2_${Date.now()}`,
    ledger_id: defaultLedgerId,
    type: 'income',
    amount: 100000, // 1000.00 CNY
    category_id: 'cat_inc_salary',
    transaction_date: new Date().toISOString(),
    remark: 'Server Base Salary',
  };

  const createTx1Res = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(tx1),
  });
  assert.strictEqual(createTx1Res.status, 201);

  const createTx2Res = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(tx2),
  });
  assert.strictEqual(createTx2Res.status, 201);
  console.log('Base server transactions created successfully.');

  console.log('\n--- 3. Simulating Offline Operations (Queue Generation) ---');
  // 模拟在离线状态下发生的客户端行为：
  // 3.1 离线删除 tx1 (生成删除墓碑)
  // 3.2 离线新建 tx3 (pending 待同步)
  // 3.3 离线新建自定义大分类 cat_offline_parent 与子分类 cat_offline_sub
  // 3.4 离线新建账本 led_offline
  // 3.5 离线设置批量预算

  const tx3 = {
    transaction_id: `tx_offline_3_${Date.now()}`,
    ledger_id: defaultLedgerId,
    type: 'expense',
    amount: 8800, // 88.00 CNY
    category_id: 'cat_exp_shopping',
    transaction_date: new Date().toISOString(),
    remark: 'Offline Created Transaction',
    sync_status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const offlineCategory = {
    category_id: `cat_off_${Date.now()}`,
    name: '离线自定义专区',
    type: 'expense',
    icon: 'Sparkles',
    color: '#8B5CF6',
    sort_order: 5,
  };

  const offlineLedger = {
    ledger_id: `led_off_${Date.now()}`,
    name: '离线备用账本',
    currency: 'CNY',
    is_default: 0,
  };

  const offlineBudgets = [
    { category_id: null, amount: 800000 },
    { category_id: 'cat_exp_shopping', amount: 200000 },
  ];

  // 离线操作变更日志队列模拟
  const mockSyncQueue = [
    {
      id: 'sq_1',
      entity_type: 'transaction',
      entity_id: tx1.transaction_id,
      action: 'delete',
    },
    {
      id: 'sq_2',
      entity_type: 'category',
      entity_id: offlineCategory.category_id,
      action: 'create',
      payload: offlineCategory,
    },
    {
      id: 'sq_3',
      entity_type: 'ledger',
      entity_id: offlineLedger.ledger_id,
      action: 'create',
      payload: offlineLedger,
    },
    {
      id: 'sq_4',
      entity_type: 'budget',
      entity_id: `${defaultLedgerId}_monthly`,
      action: 'batch_set',
      payload: {
        ledger_id: defaultLedgerId,
        period: 'monthly',
        budgets: offlineBudgets,
      },
    },
  ];

  console.log(`Generated ${mockSyncQueue.length} offline mutation queue items and 1 pending transaction.`);

  console.log('\n--- 4. Simulating Network Reconnection & Sync Engine Replay ---');
  // 执行时序重放
  for (const item of mockSyncQueue) {
    if (item.entity_type === 'transaction' && item.action === 'delete') {
      const delRes = await fetch(`${BASE}/api/transactions/${item.entity_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.strictEqual(delRes.status, 200);
      console.log(`✓ Replayed offline delete for transaction ${item.entity_id}`);
    } else if (item.entity_type === 'category' && item.action === 'create') {
      const catRes = await fetch(`${BASE}/api/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(item.payload),
      });
      assert.strictEqual(catRes.status, 201);
      console.log(`✓ Replayed offline create for category ${item.entity_id}`);
    } else if (item.entity_type === 'ledger' && item.action === 'create') {
      const ledRes = await fetch(`${BASE}/api/ledgers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(item.payload),
      });
      assert.strictEqual(ledRes.status, 201);
      console.log(`✓ Replayed offline create for ledger ${item.entity_id}`);
    } else if (item.entity_type === 'budget' && item.action === 'batch_set') {
      const budRes = await fetch(`${BASE}/api/budgets/batch`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(item.payload),
      });
      assert.strictEqual(budRes.status, 200);
      console.log(`✓ Replayed offline batch budgets`);
    }
  }

  // 批量推送未同步流水 (POST /api/transactions/sync)
  const batchSyncRes = await fetch(`${BASE}/api/transactions/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ transactions: [tx3] }),
  });
  assert.strictEqual(batchSyncRes.status, 200);
  const batchSyncJson = await batchSyncRes.json();
  console.log(`✓ Batch synchronized ${batchSyncJson.data.synced_ids.length} pending transactions.`);
  assert.strictEqual(batchSyncJson.data.synced_ids[0], tx3.transaction_id);

  console.log('\n--- 5. Verifying Anti-Resurrection & Cloud Consistency ---');
  // 5.1 验证 tx1 确实已被服务端永久删除，未发生“离线删除后复活”
  const checkTx1Res = await fetch(`${BASE}/api/transactions/${tx1.transaction_id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(checkTx1Res.status, 404, 'Deleted transaction tx1 must not exist on server');
  console.log('✓ Anti-resurrection verification passed: tx1 is not resurrected.');

  // 5.2 验证 tx2 与 tx3 正常存在
  const checkAllTxRes = await fetch(`${BASE}/api/transactions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  assert.strictEqual(checkAllTxRes.status, 200);
  const allTxJson = await checkAllTxRes.json();
  const txIds = allTxJson.data.map((t) => t.transaction_id);
  assert(txIds.includes(tx2.transaction_id), 'tx2 must exist');
  assert(txIds.includes(tx3.transaction_id), 'tx3 must exist');
  assert(!txIds.includes(tx1.transaction_id), 'tx1 must NOT exist');
  console.log(`✓ Current server transactions count: ${allTxJson.data.length} items (Consistent).`);

  // 5.3 验证离线分类已在服务端创建
  const checkCatRes = await fetch(`${BASE}/api/categories`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const checkCatJson = await checkCatRes.json();
  assert(checkCatJson.data.some((c) => c.category_id === offlineCategory.category_id));
  console.log('✓ Offline category synchronized to cloud.');

  // 5.4 验证离线账本已在服务端创建
  const checkLedRes = await fetch(`${BASE}/api/ledgers`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const checkLedJson = await checkLedRes.json();
  assert(checkLedJson.data.some((l) => l.ledger_id === offlineLedger.ledger_id));
  console.log('✓ Offline ledger synchronized to cloud.');

  // 5.5 验证离线预算已在服务端更新
  const checkBudRes = await fetch(`${BASE}/api/budgets?ledgerId=${defaultLedgerId}&period=monthly`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const checkBudJson = await checkBudRes.json();
  assert.strictEqual(checkBudJson.data.length, 2);
  const totalBud = checkBudJson.data.find((b) => !b.category_id);
  assert.strictEqual(totalBud.amount, 800000);
  console.log('✓ Offline budgets synchronized to cloud.');

  console.log('\n--- 6. Testing Last-Write-Wins Conflict Resolution ---');
  // 模拟并发更新同一笔交易，验证更晚的 updated_at 胜出
  const futureBase = Date.now() + 60000;
  const olderDate = new Date(futureBase).toISOString();
  const newerDate = new Date(futureBase + 30000).toISOString();

  // 第一次写入较新的数据 (50.00 CNY)
  await fetch(`${BASE}/api/transactions/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      transactions: [
        {
          ...tx3,
          amount: 5000,
          remark: 'Newer Update',
          updated_at: newerDate,
        },
      ],
    }),
  });

  // 尝试用较旧的数据覆盖 (20.00 CNY)
  await fetch(`${BASE}/api/transactions/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      transactions: [
        {
          ...tx3,
          amount: 2000,
          remark: 'Stale Older Update',
          updated_at: olderDate,
        },
      ],
    }),
  });

  // 获取服务端最终结果，应该保持 Newer Update (50.00 CNY)
  const lwwRes = await fetch(`${BASE}/api/transactions/${tx3.transaction_id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const lwwJson = await lwwRes.json();
  assert.strictEqual(lwwJson.data.amount, 5000, 'LWW must keep newer update (5000 cents)');
  assert.strictEqual(lwwJson.data.remark, 'Newer Update');
  console.log('✓ Last-Write-Wins conflict resolution successfully protected newer data!');

  console.log('\n🎉 ALL OFFLINE SYNC, TOMBSTONE DELETION & LWW TESTS PASSED! 🎉');
}

testOfflineSync().catch((err) => {
  console.error('Offline Sync Test Failed:', err);
  process.exit(1);
});
