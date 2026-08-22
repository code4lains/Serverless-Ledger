import { Hono } from 'hono';
import { Env, AppVariables } from '../types';
import { ApiResponse, Transaction, SyncBatchRequest, SyncBatchResponse } from '@ledger/shared';

const transactionsRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

async function ensureUserAndLedger(db: D1Database, userId: string, ledgerId: string) {
  const now = new Date().toISOString();
  await db.prepare(
    'INSERT OR IGNORE INTO users (user_id, email, created_at, updated_at) VALUES (?, ?, ?, ?)'
  )
    .bind(userId, `${userId}@serverless.dev`, now, now)
    .run();

  await db.prepare(
    'INSERT OR IGNORE INTO ledgers (ledger_id, user_id, name, currency, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
    .bind(ledgerId, userId, '日常账本', 'CNY', 1, now, now)
    .run();
}

/**
 * 获取流水账单列表 (支持按账本、类型、分类、日期区间与关键词搜索)
 * GET /api/transactions
 */
transactionsRouter.get('/', async (c) => {
  try {
    const authUser = c.get('user');
    const userId = authUser?.userId || c.req.query('userId') || 'default_user';
    const ledgerId = c.req.query('ledgerId');
    const type = c.req.query('type');
    const categoryId = c.req.query('categoryId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const search = c.req.query('search');
    const limit = Math.min(parseInt(c.req.query('limit') || '200', 10), 500);

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
    const authUser = c.get('user');
    const userId = authUser?.userId || c.req.query('userId') || 'default_user';
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
    const authUser = c.get('user');
    const body = await c.req.json<Partial<Transaction>>();
    const transactionId = body.transaction_id || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userId = authUser?.userId || body.user_id || 'default_user';
    const ledgerId = body.ledger_id || 'default_ledger';
    const type = body.type || 'expense';
    const amount = typeof body.amount === 'number' ? Math.round(body.amount) : 0;

    const categoryId = body.category_id || null;
    const fromAccount = body.from_account || null;
    const toAccount = body.to_account || null;
    const transactionDate = body.transaction_date || new Date().toISOString();
    const remark = body.remark || null;
    const syncStatus = 'synced';
    const now = new Date().toISOString();

    await ensureUserAndLedger(c.env.DB, userId, ledgerId);

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
    const authUser = c.get('user');
    const userId = authUser?.userId || c.req.query('userId') || 'default_user';
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

    const type = body.type || existing.type;
    const amount = typeof body.amount === 'number' ? Math.round(body.amount) : existing.amount;
    const categoryId = body.category_id !== undefined ? body.category_id : existing.category_id;
    const transactionDate = body.transaction_date || existing.transaction_date;
    const remark = body.remark !== undefined ? body.remark : existing.remark;
    const fromAccount = body.from_account !== undefined ? body.from_account : existing.from_account;
    const toAccount = body.to_account !== undefined ? body.to_account : existing.to_account;
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `UPDATE transactions SET
        type = ?, amount = ?, category_id = ?, transaction_date = ?,
        remark = ?, from_account = ?, to_account = ?, sync_status = 'synced', updated_at = ?
      WHERE transaction_id = ? AND user_id = ?`
    )
      .bind(type, amount, categoryId, transactionDate, remark, fromAccount, toAccount, now, id, userId)
      .run();

    const updated: Transaction = {
      ...existing,
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
    const authUser = c.get('user');
    const userId = authUser?.userId || c.req.query('userId') || 'default_user';
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
    const authUser = c.get('user');
    const userId = authUser?.userId;
    const body = await c.req.json<SyncBatchRequest>();
    const transactions = body.transactions || [];
    const syncedIds: string[] = [];
    const now = new Date().toISOString();

    if (transactions.length > 0) {
      for (const tx of transactions) {
        const txUserId = userId || tx.user_id || 'default_user';
        await ensureUserAndLedger(c.env.DB, txUserId, tx.ledger_id);

        await c.env.DB.prepare(
          `INSERT INTO transactions (
            transaction_id, user_id, ledger_id, type, amount, category_id,
            from_account, to_account, transaction_date, remark, sync_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
          ON CONFLICT(transaction_id) DO UPDATE SET
            type=excluded.type,
            amount=excluded.amount,
            category_id=excluded.category_id,
            from_account=excluded.from_account,
            to_account=excluded.to_account,
            transaction_date=excluded.transaction_date,
            remark=excluded.remark,
            sync_status='synced',
            updated_at=excluded.updated_at
          WHERE excluded.updated_at > transactions.updated_at`
        )
          .bind(
            tx.transaction_id,
            txUserId,
            tx.ledger_id,
            tx.type,
            tx.amount,
            tx.category_id || null,
            tx.from_account || null,
            tx.to_account || null,
            tx.transaction_date,
            tx.remark || null,
            tx.created_at || now,
            tx.updated_at || now
          )
          .run();

        syncedIds.push(tx.transaction_id);
      }
    }

    // 获取增量更新给客户端
    let query = 'SELECT * FROM transactions WHERE 1=1';
    const params: any[] = [];
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    if (body.last_synced_at) {
      query += ' AND updated_at > ?';
      params.push(body.last_synced_at);
    }
    query += ' ORDER BY updated_at ASC LIMIT 300';

    const stmt = params.length > 0 ? c.env.DB.prepare(query).bind(...params) : c.env.DB.prepare(query);
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
