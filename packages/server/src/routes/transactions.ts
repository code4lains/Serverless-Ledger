import { Hono } from 'hono';
import { Env, AppVariables } from '../types';
import { requireAuth } from '../middleware/auth';
import { ApiResponse, Transaction, SyncBatchRequest, SyncBatchResponse } from '@ledger/shared';
import { resolveUserLedgerId } from '../utils/ledger';

const transactionsRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// 所有流水接口均需通过 JWT 认证
transactionsRouter.use('*', requireAuth);

/**
 * 校验 category_id 是否存在于 categories 表中，若不存在则降级为 null 避免触发外键约束异常
 */
async function resolveValidCategoryId(db: D1Database, categoryId?: string | null): Promise<string | null> {
  if (!categoryId) return null;
  const existing = await db.prepare('SELECT category_id FROM categories WHERE category_id = ?')
    .bind(categoryId)
    .first<{ category_id: string }>();
  return existing ? categoryId : null;
}

/**
 * 获取流水账单列表 (支持按账本、类型、分类、日期区间与关键词搜索)
 * GET /api/transactions
 */
transactionsRouter.get('/', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const ledgerId = c.req.query('ledgerId');
    const type = c.req.query('type');
    const categoryId = c.req.query('categoryId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const search = c.req.query('search');
    const rawLimit = c.req.query('limit');
    const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : 200;
    const limit = isNaN(parsedLimit) || parsedLimit <= 0 ? 200 : Math.min(parsedLimit, 500);

    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    const params: any[] = [userId];

    if (ledgerId) {
      query += ' AND ledger_id = ?';
      params.push(ledgerId);
    }

    if (type && type !== 'all') {
      query += ' AND type = ?';
      params.push(type);
    }

    if (categoryId) {
      query += ' AND category_id = ?';
      params.push(categoryId);
    }

    if (startDate) {
      query += ' AND transaction_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND transaction_date <= ?';
      params.push(endDate);
    }

    if (search && search.trim()) {
      const kw = `%${search.trim()}%`;
      query += ' AND (remark LIKE ? OR from_account LIKE ? OR to_account LIKE ?)';
      params.push(kw, kw, kw);
    }

    query += ' ORDER BY transaction_date DESC, created_at DESC LIMIT ?';
    params.push(limit);

    const { results } = await c.env.DB.prepare(query)
      .bind(...params)
      .all<Transaction>();

    const res: ApiResponse<Transaction[]> = {
      success: true,
      data: results || [],
    };
    return c.json(res);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || 'Failed to fetch transactions',
    };
    return c.json(res, 500);
  }
});

/**
 * 获取单条账单详情
 * GET /api/transactions/:id
 */
transactionsRouter.get('/:id', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const id = c.req.param('id');

    const result = await c.env.DB.prepare(
      'SELECT * FROM transactions WHERE transaction_id = ? AND user_id = ?'
    )
      .bind(id, userId)
      .first<Transaction>();

    if (!result) {
      const res: ApiResponse = {
        success: false,
        error: '账单不存在',
      };
      return c.json(res, 404);
    }

    const res: ApiResponse<Transaction> = {
      success: true,
      data: result,
    };
    return c.json(res);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || 'Failed to get transaction detail',
    };
    return c.json(res, 500);
  }
});

/**
 * 创建单条账单
 * POST /api/transactions
 */
transactionsRouter.post('/', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const body = await c.req.json<Partial<Transaction>>();

    // 严格校验交易类型 (BUG-S11)
    const type = body.type || 'expense';
    if (!['expense', 'income', 'transfer', 'loan'].includes(type)) {
      const res: ApiResponse = {
        success: false,
        error: '无效的交易类型，必须为 expense, income, transfer 或 loan',
      };
      return c.json(res, 400);
    }

    // 严格金额校验：金额必须为大于 0 的正数
    const amount = typeof body.amount === 'number' ? Math.round(body.amount) : 0;
    if (!amount || amount <= 0 || isNaN(amount)) {
      const res: ApiResponse = {
        success: false,
        error: '金额必须为大于 0 的有效数值',
      };
      return c.json(res, 400);
    }

    // 字符串最大长度上限校验 (BUG-S13)
    if (body.remark && body.remark.length > 500) {
      const res: ApiResponse = {
        success: false,
        error: '备注长度不能超过 500 个字符',
      };
      return c.json(res, 400);
    }
    if (body.from_account && body.from_account.length > 100) {
      const res: ApiResponse = {
        success: false,
        error: '账户名称长度不能超过 100 个字符',
      };
      return c.json(res, 400);
    }
    if (body.to_account && body.to_account.length > 100) {
      const res: ApiResponse = {
        success: false,
        error: '账户名称长度不能超过 100 个字符',
      };
      return c.json(res, 400);
    }

    // 校验账本归属权 (BUG-S06)
    const ledgerId = await resolveUserLedgerId(c.env.DB, userId, body.ledger_id);

    // 防跨租户主键碰撞
    let transactionId = body.transaction_id || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const conflict = await c.env.DB.prepare('SELECT user_id FROM transactions WHERE transaction_id = ?')
      .bind(transactionId)
      .first<{ user_id: string }>();
    if (conflict && conflict.user_id !== userId) {
      transactionId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }

    const rawCategoryId = body.category_id || null;
    const categoryId = await resolveValidCategoryId(c.env.DB, rawCategoryId);
    const fromAccount = body.from_account || null;
    const toAccount = body.to_account || null;
    const transactionDate = body.transaction_date || new Date().toISOString();
    const remark = body.remark || null;
    const syncStatus = 'synced';
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO transactions (
        transaction_id, user_id, ledger_id, type, amount, category_id,
        from_account, to_account, transaction_date, remark, sync_status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        transactionId,
        userId,
        ledgerId,
        type,
        amount,
        categoryId,
        fromAccount,
        toAccount,
        transactionDate,
        remark,
        syncStatus,
        now,
        now
      )
      .run();

    const created: Transaction = {
      transaction_id: transactionId,
      user_id: userId,
      ledger_id: ledgerId,
      type,
      amount,
      category_id: categoryId,
      from_account: fromAccount,
      to_account: toAccount,
      transaction_date: transactionDate,
      remark,
      sync_status: syncStatus,
      created_at: now,
      updated_at: now,
    };

    const res: ApiResponse<Transaction> = {
      success: true,
      data: created,
      message: 'Transaction saved to Cloudflare D1 successfully',
    };
    return c.json(res, 201);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || 'Failed to create transaction',
    };
    return c.json(res, 500);
  }
});

/**
 * 更新单条账单
 * PUT /api/transactions/:id
 */
transactionsRouter.put('/:id', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const id = c.req.param('id');
    const body = await c.req.json<Partial<Transaction>>();

    // 检查记录是否存在
    const existing = await c.env.DB.prepare(
      'SELECT * FROM transactions WHERE transaction_id = ? AND user_id = ?'
    )
      .bind(id, userId)
      .first<Transaction>();

    if (!existing) {
      const res: ApiResponse = {
        success: false,
        error: '账单不存在或无权限修改',
      };
      return c.json(res, 404);
    }

    // 校验交易类型 (BUG-S11)
    if (body.type !== undefined && !['expense', 'income', 'transfer', 'loan'].includes(body.type)) {
      const res: ApiResponse = {
        success: false,
        error: '无效的交易类型，必须为 expense, income, transfer 或 loan',
      };
      return c.json(res, 400);
    }

    if (body.amount !== undefined) {
      const amountCheck = typeof body.amount === 'number' ? Math.round(body.amount) : 0;
      if (amountCheck <= 0 || isNaN(amountCheck)) {
        const res: ApiResponse = {
          success: false,
          error: '金额必须为大于 0 的有效数值',
        };
        return c.json(res, 400);
      }
    }

    // 字符串最大长度上限校验 (BUG-S13)
    if (body.remark !== undefined && body.remark !== null && body.remark.length > 500) {
      const res: ApiResponse = {
        success: false,
        error: '备注长度不能超过 500 个字符',
      };
      return c.json(res, 400);
    }
    if (body.from_account !== undefined && body.from_account !== null && body.from_account.length > 100) {
      const res: ApiResponse = {
        success: false,
        error: '账户名称长度不能超过 100 个字符',
      };
      return c.json(res, 400);
    }
    if (body.to_account !== undefined && body.to_account !== null && body.to_account.length > 100) {
      const res: ApiResponse = {
        success: false,
        error: '账户名称长度不能超过 100 个字符',
      };
      return c.json(res, 400);
    }

    // 校验账本归属权 (BUG-S06)
    let ledgerId = existing.ledger_id;
    if (body.ledger_id !== undefined) {
      ledgerId = await resolveUserLedgerId(c.env.DB, userId, body.ledger_id);
    }

    const type = body.type || existing.type;
    const amount = typeof body.amount === 'number' ? Math.round(body.amount) : existing.amount;
    const rawCategoryId = body.category_id !== undefined ? body.category_id : existing.category_id;
    const categoryId = await resolveValidCategoryId(c.env.DB, rawCategoryId);
    const transactionDate = body.transaction_date || existing.transaction_date;
    const remark = body.remark !== undefined ? body.remark : existing.remark;
    const fromAccount = body.from_account !== undefined ? body.from_account : existing.from_account;
    const toAccount = body.to_account !== undefined ? body.to_account : existing.to_account;
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `UPDATE transactions SET
        ledger_id = ?, type = ?, amount = ?, category_id = ?, transaction_date = ?,
        remark = ?, from_account = ?, to_account = ?, sync_status = 'synced', updated_at = ?
      WHERE transaction_id = ? AND user_id = ?`
    )
      .bind(ledgerId, type, amount, categoryId, transactionDate, remark, fromAccount, toAccount, now, id, userId)
      .run();

    const updated: Transaction = {
      ...existing,
      ledger_id: ledgerId,
      type,
      amount,
      category_id: categoryId,
      transaction_date: transactionDate,
      remark,
      from_account: fromAccount,
      to_account: toAccount,
      sync_status: 'synced',
      updated_at: now,
    };

    const res: ApiResponse<Transaction> = {
      success: true,
      data: updated,
      message: 'Transaction updated successfully',
    };
    return c.json(res, 200);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || 'Failed to update transaction',
    };
    return c.json(res, 500);
  }
});

/**
 * 删除单条账单
 * DELETE /api/transactions/:id
 */
transactionsRouter.delete('/:id', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const id = c.req.param('id');

    const result = await c.env.DB.prepare(
      'DELETE FROM transactions WHERE transaction_id = ? AND user_id = ?'
    )
      .bind(id, userId)
      .run();

    const res: ApiResponse = {
      success: true,
      message: 'Transaction deleted successfully',
      data: { transaction_id: id },
    };
    return c.json(res, 200);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || 'Failed to delete transaction',
    };
    return c.json(res, 500);
  }
});

/**
 * 离线数据批量同步 (遵循 Last-Write-Wins 策略)
 * POST /api/transactions/sync
 */
transactionsRouter.post('/sync', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const body = await c.req.json<SyncBatchRequest>();
    const transactions = body.transactions || [];
    const syncedIds: string[] = [];
    const now = new Date().toISOString();

    if (transactions.length > 0) {
      // 1. 获取并验证用户默认账本及所有有效账本 ID (BUG-S02, BUG-S06)
      const defaultLedgerId = await resolveUserLedgerId(c.env.DB, userId);
      const { results: userLedgerRows } = await c.env.DB.prepare(
        'SELECT ledger_id FROM ledgers WHERE user_id = ?'
      )
        .bind(userId)
        .all<{ ledger_id: string }>();
      const validUserLedgerIds = new Set((userLedgerRows || []).map((r) => r.ledger_id));
      validUserLedgerIds.add(defaultLedgerId);

      // 2. 一次性获取所有有效分类 ID 缓存至 Set 中 (O(1) 匹配，避免循环查询)
      const { results: catRows } = await c.env.DB.prepare(
        'SELECT category_id FROM categories WHERE user_id = ? OR user_id IS NULL'
      )
        .bind(userId)
        .all<{ category_id: string }>();
      const validCategoryIds = new Set((catRows || []).map((r) => r.category_id));

      // 3. 准备流水 Upsert 语句并使用 D1 batch 批量写入
      const txStmts = [];
      const validTypes = ['expense', 'income', 'transfer', 'loan'];

      for (const tx of transactions) {
        const amount = typeof tx.amount === 'number' ? Math.round(tx.amount) : 0;
        if (amount <= 0 || isNaN(amount)) {
          continue; // 跳过非法金额记录
        }

        // 校验 ledger_id 是否归属当前用户，若不归属则回退至默认账本 (BUG-S02, BUG-S06)
        const ledgerId = tx.ledger_id && validUserLedgerIds.has(tx.ledger_id)
          ? tx.ledger_id
          : defaultLedgerId;

        const txType = validTypes.includes(tx.type) ? tx.type : 'expense';
        const validCatId = tx.category_id && validCategoryIds.has(tx.category_id) ? tx.category_id : null;
        const txCreatedAt = tx.created_at || now;
        const txUpdatedAt = tx.updated_at || now;
        const txRemark = tx.remark ? tx.remark.slice(0, 500) : null;
        const txFromAccount = tx.from_account ? tx.from_account.slice(0, 100) : null;
        const txToAccount = tx.to_account ? tx.to_account.slice(0, 100) : null;

        // 4. 防跨租户主键碰撞：若该 transaction_id 属于其他租户，为当前租户分配独立 ID (BUG-S02)
        let txId = tx.transaction_id;
        if (!txId) {
          txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        } else {
          const existingTx = await c.env.DB.prepare(
            'SELECT user_id FROM transactions WHERE transaction_id = ?'
          )
            .bind(txId)
            .first<{ user_id: string }>();
          if (existingTx && existingTx.user_id !== userId) {
            txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          }
        }

        const stmt = c.env.DB.prepare(
          `INSERT INTO transactions (
            transaction_id, user_id, ledger_id, type, amount, category_id,
            from_account, to_account, transaction_date, remark, sync_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
          ON CONFLICT(transaction_id) DO UPDATE SET
            ledger_id=excluded.ledger_id,
            type=excluded.type,
            amount=excluded.amount,
            category_id=excluded.category_id,
            from_account=excluded.from_account,
            to_account=excluded.to_account,
            transaction_date=excluded.transaction_date,
            remark=excluded.remark,
            sync_status='synced',
            updated_at=excluded.updated_at
          WHERE excluded.updated_at >= transactions.updated_at AND transactions.user_id = excluded.user_id`
        ).bind(
          txId,
          userId,
          ledgerId,
          txType,
          amount,
          validCatId,
          txFromAccount,
          txToAccount,
          tx.transaction_date,
          txRemark,
          txCreatedAt,
          txUpdatedAt
        );

        txStmts.push(stmt);
        if (tx.transaction_id) {
          syncedIds.push(tx.transaction_id);
        }
      }

      // 按 100 条为一组分批执行 D1 batch
      const BATCH_CHUNK_SIZE = 100;
      for (let i = 0; i < txStmts.length; i += BATCH_CHUNK_SIZE) {
        const chunk = txStmts.slice(i, i + BATCH_CHUNK_SIZE);
        await c.env.DB.batch(chunk);
      }
    }

    // 获取当前用户在服务端的增量更新给客户端
    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    const params: any[] = [userId];
    if (body.last_synced_at) {
      query += ' AND updated_at > ?';
      params.push(body.last_synced_at);
    }
    query += ' ORDER BY updated_at ASC LIMIT 300';

    const stmt = c.env.DB.prepare(query).bind(...params);
    const { results } = await stmt.all<Transaction>();

    const res: ApiResponse<SyncBatchResponse> = {
      success: true,
      data: {
        synced_ids: syncedIds,
        server_transactions: results || [],
        server_time: now,
      },
      message: `Successfully synchronized ${syncedIds.length} transactions`,
    };
    return c.json(res);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || 'Sync failed',
    };
    return c.json(res, 500);
  }
});

export default transactionsRouter;
