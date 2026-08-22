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

  console.log('\n--- 2. Testing User Registration (JWT Auth) ---');
  const testEmail = `user_${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
    }),
  });
  assert.strictEqual(regRes.status, 201, 'Registration should return 201 Created');
  const regJson = await regRes.json();
  console.log('Registration Response:', regJson);
  assert.strictEqual(regJson.success, true);
  assert(regJson.data.token, 'Token must be present in register response');
  assert.strictEqual(regJson.data.user.email, testEmail);
  assert(regJson.data.user.default_ledger_id, 'Default ledger should be automatically created');
  const userToken = regJson.data.token;
  const registeredUserId = regJson.data.user.user_id;

  console.log('\n--- 3. Testing Duplicate Registration Prevention ---');
  const dupRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'AnotherPassword456',
    }),
  });
  assert.strictEqual(dupRes.status, 400, 'Duplicate registration should return 400');
  const dupJson = await dupRes.json();
  console.log('Duplicate Email Error Response:', dupJson);
  assert.strictEqual(dupJson.success, false);

  console.log('\n--- 4. Testing User Login with Wrong Password ---');
  const wrongLoginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'WrongPassword!',
    }),
  });
  assert.strictEqual(wrongLoginRes.status, 401, 'Wrong password should return 401 Unauthorized');
  const wrongLoginJson = await wrongLoginRes.json();
  assert.strictEqual(wrongLoginJson.success, false);

  console.log('\n--- 5. Testing User Login with Valid Password ---');
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
    }),
  });
  assert.strictEqual(loginRes.status, 200, 'Login with correct credentials should return 200');
  const loginJson = await loginRes.json();
  console.log('Login Response:', loginJson);
  assert.strictEqual(loginJson.success, true);
  assert(loginJson.data.token, 'Login response must provide valid JWT token');
  assert.strictEqual(loginJson.data.user.email, testEmail);

  console.log('\n--- 6. Testing Protected /api/auth/me Endpoint ---');
  // 6.1 Without Token -> 401
  const unauthMeRes = await fetch(`${BASE}/api/auth/me`);
  assert.strictEqual(unauthMeRes.status, 401, 'Accessing /api/auth/me without token should return 401');

  // 6.2 With Bearer Token -> 200
  const authMeRes = await fetch(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(authMeRes.status, 200, 'Accessing /api/auth/me with Bearer token should return 200');
  const authMeJson = await authMeRes.json();
  console.log('Auth Me Profile Response:', authMeJson);
  assert.strictEqual(authMeJson.success, true);
  assert.strictEqual(authMeJson.data.user_id, registeredUserId);
  assert.strictEqual(authMeJson.data.email, testEmail);

  console.log('\n--- 7. Testing Categories Endpoints (Defaults, Type Filters & Tree Hierarchy) ---');
  // 7.1 全部系统分类
  const catRes = await fetch(`${BASE}/api/categories`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(catRes.status, 200);
  const catJson = await catRes.json();
  console.log(`Categories returned: ${catJson.data.length} items`);
  assert(catJson.data.length >= 40, 'Should return complete pre-seeded categories');

  // 7.2 支出分类过滤
  const expCatRes = await fetch(`${BASE}/api/categories?type=expense`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(expCatRes.status, 200);
  const expCatJson = await expCatRes.json();
  assert(expCatJson.data.every((c) => c.type === 'expense'));
  console.log(`Expense categories filtered: ${expCatJson.data.length} items`);

  // 7.3 收入分类过滤
  const incCatRes = await fetch(`${BASE}/api/categories?type=income`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(incCatRes.status, 200);
  const incCatJson = await incCatRes.json();
  assert(incCatJson.data.every((c) => c.type === 'income'));
  console.log(`Income categories filtered: ${incCatJson.data.length} items`);

  // 7.4 树形结构接口 /api/categories/tree
  const treeRes = await fetch(`${BASE}/api/categories/tree?type=expense`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(treeRes.status, 200);
  const treeJson = await treeRes.json();
  console.log(`Expense tree root categories: ${treeJson.data.length}`);
  assert.strictEqual(treeJson.data.length, 9, 'Should return 9 expense parent categories');
  assert(treeJson.data[0].children.length > 0, 'Parent category should contain children');

  // 7.5 /api/categories/defaults 接口
  const defaultsRes = await fetch(`${BASE}/api/categories/defaults`);
  assert.strictEqual(defaultsRes.status, 200);
  const defaultsJson = await defaultsRes.json();
  assert(defaultsJson.data.length >= 40, 'Defaults endpoint should return static authoritative categories');

  // 7.6 转账分类过滤
  const trCatRes = await fetch(`${BASE}/api/categories?type=transfer`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(trCatRes.status, 200);
  const trCatJson = await trCatRes.json();
  assert(trCatJson.data.length >= 5, 'Should return transfer categories');
  assert(trCatJson.data.every((c) => c.type === 'transfer'));
  console.log(`Transfer categories filtered: ${trCatJson.data.length} items`);

  // 7.7 借贷分类过滤
  const loanCatRes = await fetch(`${BASE}/api/categories?type=loan`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(loanCatRes.status, 200);
  const loanCatJson = await loanCatRes.json();
  assert(loanCatJson.data.length >= 6, 'Should return loan categories');
  assert(loanCatJson.data.every((c) => c.type === 'loan'));
  console.log(`Loan categories filtered: ${loanCatJson.data.length} items`);

  console.log('\n--- 8. Testing Create Transaction with Authenticated JWT (Expense, Transfer & Loan) ---');
  const newTx = {
    transaction_id: `tx_${Date.now()}`,
    type: 'expense',
    amount: 5200, // 52.00 CNY
    category_id: 'cat_exp_food_dinner',
    transaction_date: new Date().toISOString(),
    remark: 'Authenticated JWT Transaction Verification',
  };

  const createRes = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify(newTx),
  });
  assert.strictEqual(createRes.status, 201);
  const createJson = await createRes.json();
  console.log('Created Authenticated Transaction in D1:', createJson.data);
  assert.strictEqual(createJson.data.amount, 5200);
  assert.strictEqual(createJson.data.user_id, registeredUserId);

  // 8.2 创建转账流水 (Transfer)
  const transferTx = {
    transaction_id: `tx_tr_${Date.now()}`,
    type: 'transfer',
    amount: 100000, // 1000.00 CNY
    from_account: '微信零钱',
    to_account: '招商银行',
    category_id: 'cat_tr_internal',
    transaction_date: new Date().toISOString(),
    remark: '微信提现到招行',
  };
  const createTrRes = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify(transferTx),
  });
  const createTrJson = await createTrRes.json();
  if (createTrRes.status !== 201) {
    console.error('Create Transfer Failed:', createTrJson);
  }
  assert.strictEqual(createTrRes.status, 201);
  console.log('Created Transfer Transaction in D1:', createTrJson.data);
  assert.strictEqual(createTrJson.data.type, 'transfer');
  assert.strictEqual(createTrJson.data.from_account, '微信零钱');
  assert.strictEqual(createTrJson.data.to_account, '招商银行');

  // 8.3 创建借贷流水 (Loan - 借出)
  const loanTx = {
    transaction_id: `tx_loan_${Date.now()}`,
    type: 'loan',
    amount: 50000, // 500.00 CNY
    from_account: '招商银行',
    to_account: '张三',
    category_id: 'cat_loan_lend',
    transaction_date: new Date().toISOString(),
    remark: '借给张三周转',
  };
  const createLoanRes = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify(loanTx),
  });
  assert.strictEqual(createLoanRes.status, 201);
  const createLoanJson = await createLoanRes.json();
  console.log('Created Loan Transaction in D1:', createLoanJson.data);
  assert.strictEqual(createLoanJson.data.type, 'loan');
  assert.strictEqual(createLoanJson.data.from_account, '招商银行');
  assert.strictEqual(createLoanJson.data.to_account, '张三');

  console.log('\n--- 9. Testing List Transactions with Authenticated JWT ---');
  const listRes = await fetch(`${BASE}/api/transactions`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(listRes.status, 200);
  const listJson = await listRes.json();
  console.log(`Transactions found for authenticated user: ${listJson.data.length}`);
  assert(listJson.data.some((t) => t.transaction_id === newTx.transaction_id));
  assert(listJson.data.some((t) => t.transaction_id === transferTx.transaction_id));
  assert(listJson.data.some((t) => t.transaction_id === loanTx.transaction_id));

  console.log('\n--- 10. Testing Filter Transactions by Type (Expense, Transfer, Loan) ---');
  // 10.1 Expense
  const filterExpRes = await fetch(`${BASE}/api/transactions?type=expense`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(filterExpRes.status, 200);
  const filterExpJson = await filterExpRes.json();
  assert(filterExpJson.data.every((t) => t.type === 'expense'));

  // 10.2 Transfer
  const filterTrRes = await fetch(`${BASE}/api/transactions?type=transfer`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(filterTrRes.status, 200);
  const filterTrJson = await filterTrRes.json();
  assert(filterTrJson.data.every((t) => t.type === 'transfer'));
  assert(filterTrJson.data.some((t) => t.transaction_id === transferTx.transaction_id));
  console.log(`Transfer transactions filtered: ${filterTrJson.data.length} items`);

  // 10.3 Loan
  const filterLoanRes = await fetch(`${BASE}/api/transactions?type=loan`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(filterLoanRes.status, 200);
  const filterLoanJson = await filterLoanRes.json();
  assert(filterLoanJson.data.every((t) => t.type === 'loan'));
  assert(filterLoanJson.data.some((t) => t.transaction_id === loanTx.transaction_id));
  console.log(`Loan transactions filtered: ${filterLoanJson.data.length} items`);

  // 10.4 Search by Account Name (e.g. "张三")
  const searchRes = await fetch(`${BASE}/api/transactions?search=张三`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(searchRes.status, 200);
  const searchJson = await searchRes.json();
  assert(searchJson.data.some((t) => t.to_account === '张三'));
  console.log(`Search by account matching: found ${searchJson.data.length} items`);

  console.log('\n--- 11. Testing Get Single Transaction Detail ---');
  const detailRes = await fetch(`${BASE}/api/transactions/${newTx.transaction_id}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(detailRes.status, 200);
  const detailJson = await detailRes.json();
  assert.strictEqual(detailJson.data.transaction_id, newTx.transaction_id);

  console.log('\n--- 12. Testing Update Transaction (PUT) ---');
  const updateRes = await fetch(`${BASE}/api/transactions/${transferTx.transaction_id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      amount: 150000, // modified to 1500.00 CNY
      from_account: '支付宝',
      to_account: '招商银行',
      remark: '支付宝提现到招行',
    }),
  });
  assert.strictEqual(updateRes.status, 200);
  const updateJson = await updateRes.json();
  assert.strictEqual(updateJson.data.amount, 150000);
  assert.strictEqual(updateJson.data.from_account, '支付宝');
  assert.strictEqual(updateJson.data.remark, '支付宝提现到招行');

  console.log('\n--- 13. Testing Offline Batch Sync Endpoint (Including Transfer & Loan) ---');
  const syncBatch = {
    transactions: [
      {
        transaction_id: `tx_sync_${Date.now()}`,
        user_id: registeredUserId,
        ledger_id: regJson.data.user.default_ledger_id,
        type: 'income',
        amount: 120000, // 1200.00 CNY
        category_id: 'cat_inc_salary',
        transaction_date: new Date().toISOString(),
        remark: 'Offline Sync Verification with Auth',
      },
      {
        transaction_id: `tx_sync_tr_${Date.now()}`,
        user_id: registeredUserId,
        ledger_id: regJson.data.user.default_ledger_id,
        type: 'transfer',
        amount: 30000,
        from_account: '工商银行',
        to_account: '微信零钱',
        category_id: 'cat_tr_topup',
        transaction_date: new Date().toISOString(),
        remark: 'Offline Transfer Sync',
      },
    ],
  };

  const syncRes = await fetch(`${BASE}/api/transactions/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify(syncBatch),
  });
  assert.strictEqual(syncRes.status, 200);
  const syncJson = await syncRes.json();
  console.log('Sync Batch Response:', syncJson);
  assert.strictEqual(syncJson.data.synced_ids.length, 2);

  console.log('\n--- 14. Testing Delete Transaction (DELETE) ---');
  const deleteRes = await fetch(`${BASE}/api/transactions/${newTx.transaction_id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(deleteRes.status, 200);
  const deleteJson = await deleteRes.json();
  assert.strictEqual(deleteJson.success, true);

  console.log('\n🎉 ALL PIPELINE & JWT AUTHENTICATION INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉');
}

testPipeline().catch((err) => {
  console.error('Test Pipeline Failed:', err);
  process.exit(1);
});
