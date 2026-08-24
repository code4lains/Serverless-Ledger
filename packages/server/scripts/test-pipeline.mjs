import assert from 'node:assert';
import { execSync } from 'node:child_process';

const BASE = 'http://127.0.0.1:8787';

async function testPipeline() {
  try {
    execSync(
      'npx wrangler d1 execute serverless_ledger_db --local --command "INSERT OR REPLACE INTO invite_codes (code, creator_id, status) VALUES (\'INV-SYSTEM1\', \'system_root\', \'unused\'), (\'INV-SYSTEM2\', \'system_root\', \'unused\'), (\'INV-WELCOME\', \'system_root\', \'unused\'), (\'INV-OFFLINE\', \'system_root\', \'unused\');"',
      { stdio: 'ignore' }
    );
  } catch {}

  console.log('--- 1. Testing Health Endpoint ---');
  const healthRes = await fetch(`${BASE}/api/health`);
  assert.strictEqual(healthRes.status, 200, 'Health endpoint should return 200');
  const healthJson = await healthRes.json();
  console.log('Health Response:', healthJson);
  assert.strictEqual(healthJson.success, true);
  assert.strictEqual(healthJson.data.database.status, 'connected');

  console.log('\n--- 1.1 Testing Auth Config Endpoint (/api/auth/config) ---');
  const configRes = await fetch(`${BASE}/api/auth/config`);
  assert.strictEqual(configRes.status, 200, 'Auth config endpoint should return 200');
  const configJson = await configRes.json();
  console.log('Auth Config Response:', configJson);
  assert.strictEqual(configJson.success, true);
  assert.strictEqual(configJson.data.reg_mode, 1, 'Default REG_MODE must be 1 (Invite Mode)');

  console.log('\n--- 2. Testing User Registration (Invite Mode & JWT Auth) ---');
  const testEmail = `user_${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  // 2.1 拒绝无邀请码注册 (REG_MODE=1)
  const noInviteRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
    }),
  });
  assert.strictEqual(noInviteRes.status, 400, 'Registration without invite code must return 400 when REG_MODE=1');
  const noInviteJson = await noInviteRes.json();
  console.log('No Invite Code Error Response:', noInviteJson);
  assert.strictEqual(noInviteJson.success, false);

  // 2.2 拒绝无效邀请码注册
  const badInviteRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      invite_code: 'INV-INVALID999',
    }),
  });
  assert.strictEqual(badInviteRes.status, 400, 'Registration with invalid invite code must return 400');
  const badInviteJson = await badInviteRes.json();
  console.log('Invalid Invite Code Error Response:', badInviteJson);
  assert.strictEqual(badInviteJson.success, false);

  // 2.3 使用有效预置邀请码注册
  const regRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: testPassword,
      invite_code: 'INV-SYSTEM1',
    }),
  });
  assert.strictEqual(regRes.status, 201, 'Registration with valid invite code should return 201 Created');
  const regJson = await regRes.json();
  console.log('Registration Response:', regJson);
  assert.strictEqual(regJson.success, true);
  assert(regJson.data.token, 'Token must be present in register response');
  assert.strictEqual(regJson.data.user.email, testEmail);
  assert(regJson.data.user.default_ledger_id, 'Default ledger should be automatically created');
  assert(regJson.data.new_recovery_code, 'New recovery code must be returned upon registration');
  assert.strictEqual(regJson.data.new_recovery_code.length, 8, 'Recovery code must be exactly 8 characters');
  const userToken = regJson.data.token;
  const registeredUserId = regJson.data.user.user_id;
  const registeredRecoveryCode = regJson.data.new_recovery_code;

  // 2.4 拒绝已被使用的邀请码二次注册 (防一码多用)
  const reuseInviteRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `another_${Date.now()}@example.com`,
      password: testPassword,
      invite_code: 'INV-SYSTEM1',
    }),
  });
  assert.strictEqual(reuseInviteRes.status, 400, 'Reusing consumed invite code must return 400');
  const reuseInviteJson = await reuseInviteRes.json();
  console.log('Consumed Invite Code Error Response:', reuseInviteJson);
  assert.strictEqual(reuseInviteJson.success, false);

  console.log('\n--- 2.5 Testing Invite Codes Endpoint Before Transactions (/api/auth/invite-codes) ---');
  const initialInviteRes = await fetch(`${BASE}/api/auth/invite-codes`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(initialInviteRes.status, 200);
  const initialInviteJson = await initialInviteRes.json();
  console.log('Initial User Invite Info (No transactions yet):', initialInviteJson.data);
  assert.strictEqual(initialInviteJson.data.has_recorded_transaction, false);
  assert.strictEqual(initialInviteJson.data.total_eligible, 0);
  assert.strictEqual(initialInviteJson.data.can_generate, false);

  // 尝试未满足记账条件时非法生成邀请码 -> 400
  const illegalClaimRes = await fetch(`${BASE}/api/auth/invite-codes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(illegalClaimRes.status, 400, 'Claiming invite code before conditions met must return 400');

  console.log('\n--- 3. Testing Duplicate Registration Prevention ---');
  const dupRes = await fetch(`${BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'AnotherPassword456',
      invite_code: 'INV-SYSTEM2',
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
  let currentPassword = testPassword;
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: currentPassword,
    }),
  });
  assert.strictEqual(loginRes.status, 200, 'Login with correct credentials should return 200');
  const loginJson = await loginRes.json();
  console.log('Login Response:', loginJson);
  assert.strictEqual(loginJson.success, true);
  assert(loginJson.data.token, 'Login response must provide valid JWT token');
  assert.strictEqual(loginJson.data.user.email, testEmail);
  assert.strictEqual(loginJson.data.user.recovery_code, registeredRecoveryCode, 'Login user must have bound recovery code');

  console.log('\n--- 5.5 Testing Password Reset via Recovery Code (/api/auth/reset-password) ---');
  // 5.5.1 错误恢复码重置密码拒绝 -> 400
  const wrongResetRes = await fetch(`${BASE}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      recovery_code: 'BADCODE8',
      new_password: 'NewPassword789!',
    }),
  });
  assert.strictEqual(wrongResetRes.status, 400, 'Reset with invalid recovery code must return 400');
  const wrongResetJson = await wrongResetRes.json();
  console.log('Invalid Recovery Code Error Response:', wrongResetJson);
  assert.strictEqual(wrongResetJson.success, false);

  // 5.5.2 正确恢复码 (测试小写输入以验证大小写不敏感) 重置密码成功 -> 200
  const correctResetRes = await fetch(`${BASE}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      recovery_code: registeredRecoveryCode.toLowerCase(), // 小写输入测试
      new_password: 'NewPassword789!',
    }),
  });
  assert.strictEqual(correctResetRes.status, 200, 'Reset with valid recovery code should return 200');
  const correctResetJson = await correctResetRes.json();
  console.log('Password Reset Success Response:', correctResetJson);
  assert.strictEqual(correctResetJson.success, true);

  // 5.5.3 旧密码登录被拒 -> 401
  const oldLoginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  assert.strictEqual(oldLoginRes.status, 401, 'Login with old password after reset must return 401');

  // 5.5.4 新密码登录成功 -> 200
  currentPassword = 'NewPassword789!';
  const newLoginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: currentPassword }),
  });
  assert.strictEqual(newLoginRes.status, 200, 'Login with new password must return 200');
  const newLoginJson = await newLoginRes.json();
  assert.strictEqual(newLoginJson.success, true);

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

  // 7.8 测试自定义分类创建 (大分类与小分类)、修改、排序与删除 (白皮书 7.2 规范)
  console.log('\n--- 7.8 Testing Custom Categories CRUD & Reordering ---');
  // 1. 创建自定义大分类
  const customParentRes = await fetch(`${BASE}/api/categories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      name: '数码极客',
      type: 'expense',
      icon: 'Laptop',
      color: '#3B82F6',
      sort_order: 1, // 排在大类最前
    }),
  });
  assert.strictEqual(customParentRes.status, 201, 'Create custom parent category should return 201');
  const customParentJson = await customParentRes.json();
  console.log('Created Custom Parent Category:', customParentJson.data);
  assert.strictEqual(customParentJson.data.name, '数码极客');
  assert.strictEqual(customParentJson.data.color, '#3B82F6');
  const customParentId = customParentJson.data.category_id;

  // 2. 创建自定义子分类
  const customSubRes = await fetch(`${BASE}/api/categories`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      name: 'Switch游戏',
      type: 'expense',
      parent_id: customParentId,
      icon: 'Gamepad2',
      color: '#EC4899',
      sort_order: 1,
    }),
  });
  assert.strictEqual(customSubRes.status, 201, 'Create custom subcategory should return 201');
  const customSubJson = await customSubRes.json();
  console.log('Created Custom Subcategory:', customSubJson.data);
  assert.strictEqual(customSubJson.data.name, 'Switch游戏');
  assert.strictEqual(customSubJson.data.parent_id, customParentId);
  const customSubId = customSubJson.data.category_id;

  // 3. 修改自定义分类 (PUT)
  const updateCatRes = await fetch(`${BASE}/api/categories/${customSubId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      name: '任天堂Switch游戏',
      color: '#F43F5E',
    }),
  });
  assert.strictEqual(updateCatRes.status, 200, 'Update category should return 200');
  const updateCatJson = await updateCatRes.json();
  console.log('Updated Custom Category:', updateCatJson.data);
  assert.strictEqual(updateCatJson.data.name, '任天堂Switch游戏');
  assert.strictEqual(updateCatJson.data.color, '#F43F5E');

  // 4. 批量更新分类排序 (PUT /reorder)
  const reorderRes = await fetch(`${BASE}/api/categories/reorder`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      items: [
        { category_id: customParentId, sort_order: 999 },
        { category_id: customSubId, sort_order: 10 },
      ],
    }),
  });
  assert.strictEqual(reorderRes.status, 200, 'Reorder categories should return 200');
  const reorderJson = await reorderRes.json();
  console.log('Reorder Response:', reorderJson);

  // 5. 验证树结构中的排序反映
  const customTreeRes = await fetch(`${BASE}/api/categories/tree?type=expense`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const customTreeJson = await customTreeRes.json();
  const foundParentInTree = customTreeJson.data.find((n) => n.category.category_id === customParentId);
  assert(foundParentInTree, 'Custom parent category must appear in tree');
  assert.strictEqual(foundParentInTree.category.sort_order, 999, 'Sort order should reflect 999');
  assert(foundParentInTree.children.some((c) => c.category_id === customSubId), 'Custom subcategory must be under custom parent in tree');

  // 6. 系统预置分类删除保护
  const delSysRes = await fetch(`${BASE}/api/categories/cat_exp_food`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(delSysRes.status, 400, 'Deleting system category should return 400');

  // 7. 删除自定义小分类
  const delSubRes = await fetch(`${BASE}/api/categories/${customSubId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(delSubRes.status, 200, 'Delete custom subcategory should return 200');

  // 8. 删除自定义大分类 (级联删除)
  const delParentRes = await fetch(`${BASE}/api/categories/${customParentId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(delParentRes.status, 200, 'Delete custom parent category should return 200');
  console.log('Custom Category CRUD & Reorder Verified Successfully!');

  console.log('\n--- 7.9 Testing Multi-Ledger System (Whitepaper 7.2 & 3.3) ---');
  // 1. 获取初始账本列表 (注册时已创建默认账本)
  const initialLedgersRes = await fetch(`${BASE}/api/ledgers`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(initialLedgersRes.status, 200);
  const initialLedgersJson = await initialLedgersRes.json();
  console.log('Initial User Ledgers:', initialLedgersJson.data);
  assert.strictEqual(initialLedgersJson.data.length, 1);
  assert.strictEqual(initialLedgersJson.data[0].is_default, 1);
  const defaultLedgerId = initialLedgersJson.data[0].ledger_id;

  // 2. 创建多个新账本 (例如：旅游账本 USD、装修账本 CNY)
  const travelLedgerRes = await fetch(`${BASE}/api/ledgers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      name: '旅游账本',
      currency: 'USD',
      is_default: 0,
    }),
  });
  assert.strictEqual(travelLedgerRes.status, 201);
  const travelLedgerJson = await travelLedgerRes.json();
  console.log('Created Travel Ledger (USD):', travelLedgerJson.data);
  assert.strictEqual(travelLedgerJson.data.name, '旅游账本');
  assert.strictEqual(travelLedgerJson.data.currency, 'USD');
  assert.strictEqual(travelLedgerJson.data.is_default, 0);
  const travelLedgerId = travelLedgerJson.data.ledger_id;

  const renoLedgerRes = await fetch(`${BASE}/api/ledgers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      name: '新房装修账本',
      currency: 'CNY',
      is_default: 0,
    }),
  });
  assert.strictEqual(renoLedgerRes.status, 201);
  const renoLedgerJson = await renoLedgerRes.json();
  const renoLedgerId = renoLedgerJson.data.ledger_id;

  // 3. 验证多账本列表与统计汇总 /api/ledgers?withSummary=true
  const multiLedgersRes = await fetch(`${BASE}/api/ledgers?withSummary=true`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(multiLedgersRes.status, 200);
  const multiLedgersJson = await multiLedgersRes.json();
  console.log('Multi-Ledgers with Summary:', multiLedgersJson.data);
  assert.strictEqual(multiLedgersJson.data.length, 3, 'Should have 3 ledgers now');

  // 4. 修改账本 (PUT /api/ledgers/:id)
  const updateLedgerRes = await fetch(`${BASE}/api/ledgers/${renoLedgerId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      name: '别墅装修奢华账本',
      currency: 'CNY',
    }),
  });
  assert.strictEqual(updateLedgerRes.status, 200);
  const updateLedgerJson = await updateLedgerRes.json();
  assert.strictEqual(updateLedgerJson.data.name, '别墅装修奢华账本');

  // 5. 设置默认账本及互斥性测试 (PUT /api/ledgers/:id/default)
  const setDefaultRes = await fetch(`${BASE}/api/ledgers/${travelLedgerId}/default`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(setDefaultRes.status, 200);

  // 重新获取账本列表并验证 travelLedger 为 1，其余为 0
  const afterDefaultRes = await fetch(`${BASE}/api/ledgers`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const afterDefaultJson = await afterDefaultRes.json();
  const defaultItems = afterDefaultJson.data.filter((l) => l.is_default === 1);
  assert.strictEqual(defaultItems.length, 1, 'Only one ledger can be default');
  assert.strictEqual(defaultItems[0].ledger_id, travelLedgerId);

  // 切回原默认日常账本
  await fetch(`${BASE}/api/ledgers/${defaultLedgerId}/default`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${userToken}` },
  });

  // 6. 测试向特定账本记账与数据隔离
  const travelTx = {
    transaction_id: `tx_travel_${Date.now()}`,
    ledger_id: travelLedgerId,
    type: 'expense',
    amount: 15000, // $150.00
    category_id: 'cat_exp_ent_travel',
    transaction_date: new Date().toISOString(),
    remark: '夏威夷度假机票',
  };
  const createTravelTxRes = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify(travelTx),
  });
  assert.strictEqual(createTravelTxRes.status, 201);

  // 过滤旅游账本的流水
  const listTravelTxRes = await fetch(`${BASE}/api/transactions?ledgerId=${travelLedgerId}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const listTravelTxJson = await listTravelTxRes.json();
  assert.strictEqual(listTravelTxJson.data.length, 1);
  assert.strictEqual(listTravelTxJson.data[0].transaction_id, travelTx.transaction_id);

  // 7. 测试删除账本及级联清理 (DELETE /api/ledgers/:id)
  const delTravelLedgerRes = await fetch(`${BASE}/api/ledgers/${travelLedgerId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(delTravelLedgerRes.status, 200);

  // 验证旅游账本关联的流水也已被清理
  const checkTravelTxRes = await fetch(`${BASE}/api/transactions/${travelTx.transaction_id}`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(checkTravelTxRes.status, 404);

  // 8. 测试保护机制：删除装修账本后，只剩唯一默认账本时，禁止删除唯一账本
  await fetch(`${BASE}/api/ledgers/${renoLedgerId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const delOnlyLedgerRes = await fetch(`${BASE}/api/ledgers/${defaultLedgerId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(delOnlyLedgerRes.status, 400, 'Deleting only remaining ledger should be blocked');
  console.log('Multi-Ledger System Verified Successfully!');

  console.log('\n--- 8. Testing Protected Endpoint Rejection (requireAuth) & Negative Amount Rejection ---');
  // 8.1 Unauthenticated access to /api/transactions
  const unauthTxRes = await fetch(`${BASE}/api/transactions`);
  assert.strictEqual(unauthTxRes.status, 401, 'Accessing /api/transactions without token must return 401');

  // 8.2 Unauthenticated access to /api/ledgers
  const unauthLedRes = await fetch(`${BASE}/api/ledgers`);
  assert.strictEqual(unauthLedRes.status, 401, 'Accessing /api/ledgers without token must return 401');

  // 8.3 Reject negative amount (-5.00 CNY -> -500 cents)
  const negTxRes = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      type: 'expense',
      amount: -500,
      category_id: 'cat_exp_food_dinner',
      transaction_date: new Date().toISOString(),
    }),
  });
  assert.strictEqual(negTxRes.status, 400, 'Creating transaction with negative amount must return 400');
  console.log('Negative amount rejection verified: 400 Bad Request');

  // 8.4 Reject zero amount
  const zeroTxRes = await fetch(`${BASE}/api/transactions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      type: 'expense',
      amount: 0,
      category_id: 'cat_exp_food_dinner',
      transaction_date: new Date().toISOString(),
    }),
  });
  assert.strictEqual(zeroTxRes.status, 400, 'Creating transaction with zero amount must return 400');
  console.log('Zero amount rejection verified: 400 Bad Request');

  console.log('\n--- 8.5 Testing Create Transaction with Authenticated JWT (Expense, Transfer & Loan) ---');
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

  // 8.1.1 验证记账后用户激活了邀请资格 (has_recorded_transaction = true)
  const afterTxInviteRes = await fetch(`${BASE}/api/auth/invite-codes`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(afterTxInviteRes.status, 200);
  const afterTxInviteJson = await afterTxInviteRes.json();
  console.log('Invite Info after Recording 1st Transaction:', afterTxInviteJson.data);
  assert.strictEqual(afterTxInviteJson.data.has_recorded_transaction, true, 'User should now have recorded transactions');
  assert.strictEqual(afterTxInviteJson.data.total_eligible, 0, 'Should have 0 eligible codes because registration is < 3 days');
  assert(afterTxInviteJson.data.next_unlock_date, 'Should indicate unlock date at Day 3');

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

  console.log('\n--- 15. Testing Budget Endpoints (Whitepaper 3.4 & 7.2 Monthly & Category Budgets) ---');
  // 15.1 未认证拦截
  const unauthBudgetRes = await fetch(`${BASE}/api/budgets`);
  assert.strictEqual(unauthBudgetRes.status, 401, 'Accessing /api/budgets without token must return 401');

  // 15.2 非法金额拦截
  const negBudgetRes = await fetch(`${BASE}/api/budgets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      ledger_id: defaultLedgerId,
      period: 'monthly',
      amount: -1000,
    }),
  });
  assert.strictEqual(negBudgetRes.status, 400, 'Negative budget amount should return 400');

  // 15.3 创建单个总预算 (5000 元 -> 500000 分)
  const createTotalBudgetRes = await fetch(`${BASE}/api/budgets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      ledger_id: defaultLedgerId,
      period: 'monthly',
      category_id: null,
      amount: 500000,
    }),
  });
  assert.strictEqual(createTotalBudgetRes.status, 201, 'Create total budget should return 201');
  const createTotalBudgetJson = await createTotalBudgetRes.json();
  console.log('Created Total Budget in D1:', createTotalBudgetJson.data);
  assert.strictEqual(createTotalBudgetJson.data.amount, 500000);
  assert.strictEqual(createTotalBudgetJson.data.category_id, null);
  const createdBudgetId = createTotalBudgetJson.data.budget_id;

  // 15.4 批量设置月度总预算与大分类预算 (PUT /api/budgets/batch)
  const batchBudgetsPayload = {
    ledger_id: defaultLedgerId,
    period: 'monthly',
    budgets: [
      { category_id: null, amount: 600000 }, // 修改总预算为 6000元
      { category_id: 'cat_exp_food', amount: 200000 }, // 餐饮美食大类 2000元
      { category_id: 'cat_exp_traffic', amount: 50000 }, // 交通出行大类 500元
      { category_id: 'cat_exp_shopping', amount: 150000 }, // 购物消费大类 1500元
    ],
  };

  const batchBudgetRes = await fetch(`${BASE}/api/budgets/batch`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify(batchBudgetsPayload),
  });
  assert.strictEqual(batchBudgetRes.status, 200, 'Batch budget update should return 200');
  const batchBudgetJson = await batchBudgetRes.json();
  console.log('Batch Budget Save Response:', batchBudgetJson.data);
  assert.strictEqual(batchBudgetJson.data.length, 4, 'Should have saved 4 budget records');

  // 15.5 查询当前账本月度预算列表 (GET /api/budgets?ledgerId=...&period=monthly)
  const getBudgetsRes = await fetch(`${BASE}/api/budgets?ledgerId=${defaultLedgerId}&period=monthly`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(getBudgetsRes.status, 200);
  const getBudgetsJson = await getBudgetsRes.json();
  console.log(`Fetched budgets for default ledger: ${getBudgetsJson.data.length} items`);
  assert.strictEqual(getBudgetsJson.data.length, 4);
  const fetchedTotal = getBudgetsJson.data.find((b) => !b.category_id);
  assert(fetchedTotal);
  assert.strictEqual(fetchedTotal.amount, 600000);

  const fetchedFood = getBudgetsJson.data.find((b) => b.category_id === 'cat_exp_food');
  assert(fetchedFood);
  assert.strictEqual(fetchedFood.amount, 200000);

  // 15.6 删除单项预算 (DELETE /api/budgets/:id)
  const delBudgetRes = await fetch(`${BASE}/api/budgets/${fetchedFood.budget_id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(delBudgetRes.status, 200);

  // 验证删除后数量为 3
  const afterDelBudgetsRes = await fetch(`${BASE}/api/budgets?ledgerId=${defaultLedgerId}&period=monthly`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const afterDelBudgetsJson = await afterDelBudgetsRes.json();
  assert.strictEqual(afterDelBudgetsJson.data.length, 3);
  console.log('Budget Module Verification Passed Successfully!');

  console.log('\n--- 16. Testing CSV Batch Import Transactions Ingestion (Whitepaper 7.3) ---');
  // 模拟批量从 CSV 导入 5 笔流水 (包含支出、收入、转账、借贷)
  const csvImportBatch = {
    transactions: [
      {
        transaction_id: `tx_csv_wx_${Date.now()}_1`,
        ledger_id: defaultLedgerId,
        type: 'expense',
        amount: 2500, // 25.00 CNY
        category_id: 'cat_exp_food_lunch',
        from_account: '微信零钱',
        transaction_date: '2026-08-20T12:00:00.000Z',
        remark: '美团外卖 - 午餐便当 (微信导入)',
      },
      {
        transaction_id: `tx_csv_ali_${Date.now()}_2`,
        ledger_id: defaultLedgerId,
        type: 'expense',
        amount: 500, // 5.00 CNY
        category_id: 'cat_exp_tr_metro',
        from_account: '花呗',
        transaction_date: '2026-08-20T18:00:00.000Z',
        remark: '申通地铁 - 乘车码 (支付宝导入)',
      },
      {
        transaction_id: `tx_csv_sal_${Date.now()}_3`,
        ledger_id: defaultLedgerId,
        type: 'income',
        amount: 1500000, // 15000.00 CNY
        category_id: 'cat_inc_sal_base',
        to_account: '招商银行',
        transaction_date: '2026-08-15T09:00:00.000Z',
        remark: '公司薪资发放 (标准CSV导入)',
      },
      {
        transaction_id: `tx_csv_tr_${Date.now()}_4`,
        ledger_id: defaultLedgerId,
        type: 'transfer',
        amount: 20000, // 200.00 CNY
        category_id: 'cat_tr_internal',
        from_account: '微信零钱',
        to_account: '招商银行',
        transaction_date: '2026-08-19T14:00:00.000Z',
        remark: '零钱提现 (导入)',
      },
      {
        transaction_id: `tx_csv_loan_${Date.now()}_5`,
        ledger_id: defaultLedgerId,
        type: 'loan',
        amount: 100000, // 1000.00 CNY
        category_id: 'cat_loan_lend',
        from_account: '招商银行',
        to_account: '张三',
        transaction_date: '2026-08-18T16:00:00.000Z',
        remark: '借给张三 (借贷导入)',
      },
    ],
  };

  const csvImportRes = await fetch(`${BASE}/api/transactions/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify(csvImportBatch),
  });
  assert.strictEqual(csvImportRes.status, 200, 'Batch CSV import push should return 200');
  const csvImportJson = await csvImportRes.json();
  console.log('CSV Batch Import Response:', csvImportJson.data);
  assert.strictEqual(csvImportJson.data.synced_ids.length, 5);

  // 查询确认入库
  const verifyCsvRes = await fetch(`${BASE}/api/transactions?search=导入`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const verifyCsvJson = await verifyCsvRes.json();
  assert.strictEqual(verifyCsvJson.data.length, 5, 'All 5 imported CSV transactions must exist in D1');
  console.log('CSV Batch Import Verified Successfully in Cloudflare D1!');

  console.log('\n--- 17. Testing Recurring Rules (周期记账 CRUD, 自动到期执行, 状态暂停, 补齐流水) ---');
  // 17.1 创建月度房租周期规则 (设 next_run_date 为过去日期以测试到期自动记账)
  const createRec1Res = await fetch(`${BASE}/api/recurring`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      ledger_id: defaultLedgerId,
      name: '月度房租',
      type: 'expense',
      amount: 320000, // 3200.00 CNY
      category_id: 'cat_exp_ho_rent',
      from_account: '招商银行',
      frequency: 'monthly',
      interval: 1,
      day_of_month: 1,
      start_date: '2026-07-01',
      next_run_date: '2026-07-01', // 过去日期，应补齐 7月1日、8月1日 两期
      remark: '房东张阿姨',
      status: 'active',
      auto_record: 1,
    }),
  });
  assert.strictEqual(createRec1Res.status, 201, 'Create recurring rule should return 201');
  const createRec1Json = await createRec1Res.json();
  console.log('Created Recurring Rule 1 (Rent):', createRec1Json.data);
  assert.strictEqual(createRec1Json.data.name, '月度房租');
  assert.strictEqual(createRec1Json.data.amount, 320000);
  const rec1Id = createRec1Json.data.rule_id;

  // 17.2 创建每周咖啡周期规则
  const createRec2Res = await fetch(`${BASE}/api/recurring`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      ledger_id: defaultLedgerId,
      name: '每周精品咖啡',
      type: 'expense',
      amount: 3500, // 35.00 CNY
      category_id: 'cat_exp_food_bf',
      from_account: '微信零钱',
      frequency: 'weekly',
      interval: 1,
      day_of_week: 1, // 每周一
      start_date: '2026-08-24',
      next_run_date: '2026-08-24',
      status: 'active',
      auto_record: 1,
    }),
  });
  assert.strictEqual(createRec2Res.status, 201, 'Create recurring rule 2 should return 201');
  const createRec2Json = await createRec2Res.json();
  const rec2Id = createRec2Json.data.rule_id;

  // 17.3 获取用户周期规则列表 (GET /api/recurring)
  const getRecListRes = await fetch(`${BASE}/api/recurring`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(getRecListRes.status, 200, 'Fetch recurring rules should return 200');
  const getRecListJson = await getRecListRes.json();
  console.log('Fetched Recurring Rules Count:', getRecListJson.data.length);
  assert.strictEqual(getRecListJson.data.length, 2, 'Should have 2 recurring rules');

  // 17.4 修改周期规则 (PUT /api/recurring/:id)
  const updateRecRes = await fetch(`${BASE}/api/recurring/${rec1Id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({
      name: '月度精装房租 (含物业)',
      amount: 350000,
    }),
  });
  assert.strictEqual(updateRecRes.status, 200, 'Update recurring rule should return 200');
  const updateRecJson = await updateRecRes.json();
  assert.strictEqual(updateRecJson.data.name, '月度精装房租 (含物业)');
  assert.strictEqual(updateRecJson.data.amount, 350000);

  // 17.5 执行到期周期规则 (POST /api/recurring/execute-due) 截至 2026-08-24
  const execDueRes = await fetch(`${BASE}/api/recurring/execute-due`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({ as_of_date: '2026-08-24' }),
  });
  assert.strictEqual(execDueRes.status, 200, 'Execute due recurring rules should return 200');
  const execDueJson = await execDueRes.json();
  console.log('Execute Due Result:', execDueJson.data);
  assert.strictEqual(execDueJson.data.executed_rules_count, 2, '2 rules should be executed');
  // 规则1生成 2026-07-01 和 2026-08-01 (共2笔)；规则2生成 2026-08-24 (1笔)，共3笔
  assert.strictEqual(execDueJson.data.created_transactions.length, 3, 'Should create 3 auto transactions in total');

  // 17.6 验证生成的自动记账流水已在 transactions 表中可查
  const searchAutoTxRes = await fetch(`${BASE}/api/transactions?search=周期自动`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const searchAutoTxJson = await searchAutoTxRes.json();
  assert.strictEqual(searchAutoTxJson.data.length, 3, 'All 3 recurring auto transactions should exist in D1');
  console.log('Recurring Auto Transactions Verified in D1:', searchAutoTxJson.data.map((t) => ({ amount: t.amount, remark: t.remark, date: t.transaction_date })));

  // 17.7 暂停规则 2 (status: 'paused') 并再次调用 execute-due
  await fetch(`${BASE}/api/recurring/${rec2Id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({ status: 'paused' }),
  });

  const execDueAgainRes = await fetch(`${BASE}/api/recurring/execute-due`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
    body: JSON.stringify({ as_of_date: '2026-08-24' }),
  });
  const execDueAgainJson = await execDueAgainRes.json();
  assert.strictEqual(execDueAgainJson.data.executed_rules_count, 0, 'No more due rules should execute');

  // 17.8 删除规则 2 (DELETE /api/recurring/:id)
  const delRecRes = await fetch(`${BASE}/api/recurring/${rec2Id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(delRecRes.status, 200, 'Delete recurring rule should return 200');

  const afterDelListRes = await fetch(`${BASE}/api/recurring`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  const afterDelListJson = await afterDelListRes.json();
  assert.strictEqual(afterDelListJson.data.length, 1, 'Only 1 recurring rule should remain');
  console.log('Recurring Rules CRUD & Auto Execution Verified Successfully!');

  console.log('\n--- 18. Testing Account Deletion (Deregistration) & Data Cascade Cleanup ---');
  // 18.1 未携带 Token 调用注销接口 -> 401
  const unauthDelAcc = await fetch(`${BASE}/api/auth/account`, { method: 'DELETE' });
  assert.strictEqual(unauthDelAcc.status, 401, 'Deleting account without token must return 401');

  // 18.2 携带有效 Token 调用注销接口 -> 200
  const delAccRes = await fetch(`${BASE}/api/auth/account`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(delAccRes.status, 200, 'Account deletion should return 200 OK');
  const delAccJson = await delAccRes.json();
  console.log('Account Deletion Response:', delAccJson);
  assert.strictEqual(delAccJson.success, true);

  // 18.3 注销后使用原账号密码登录 -> 401
  const loginAfterDel = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, password: currentPassword }),
  });
  assert.strictEqual(loginAfterDel.status, 401, 'Login with deleted account must fail with 401');
  console.log('Login after account deletion rejected as expected: 401 Unauthorized');

  // 18.4 注销后使用原 Token 访问受保护接口 -> 404 (用户不存在或已注销)
  const meAfterDel = await fetch(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${userToken}` },
  });
  assert.strictEqual(meAfterDel.status, 404, 'Accessing /api/auth/me with token of deleted user must return 404');
  console.log('Account Deletion & Data Cascade Cleanup Verified Successfully!');

  console.log('\n🎉 ALL PIPELINE, RECURRING RULES, RECOVERY CODES, PASSWORD RESET, ACCOUNT DELETION & CSV TESTS PASSED! 🎉');

}

testPipeline().catch((err) => {
  console.error('Test Pipeline Failed:', err);
  process.exit(1);
});
