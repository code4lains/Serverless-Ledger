import { Hono } from 'hono';
import { Env } from '../types';
import { ApiResponse, Transaction, SyncBatchRequest, SyncBatchResponse } from '@ledger/shared';

const transactionsRouter = new Hono<{ Bindings: Env }>();

/**
 * 获取流水账单列表
 */
transactionsRouter.get('/', async (c) => {
  try {
    const userId = c.req.query('userId') || 'default_user';
    const ledgerId = c.req.query('ledgerId');

    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    const params: any[] = [userId];

    if (ledgerId) {
      query += ' AND ledger_id = ?';
      params.push(ledgerId);
    }

    query += ' ORDER BY transaction_date DESC, created_at DESC LIMIT 100';

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
 * 创建单条账单
 */
transactionsRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<Partial<Transaction>>();
    const transactionId = body.transaction_id || `tx_${Date.now()}`;
    const userId = body.user_id || 'default_user';
    const ledgerId = body.ledger_id || 'default_ledger';
    const type = body.type || 'expense';
    const amount = typeof body.amount === 'number' ? body.amount : 0;
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
 * 离线数据批量同步 (遵循 Last-Write-Wins 策略)
 */
transactionsRouter.post('/sync', async (c) => {
  try {
    const body = await c.req.json<SyncBatchRequest>();
    const transactions = body.transactions || [];
    const syncedIds: string[] = [];
    const now = new Date().toISOString();

    if (transactions.length > 0) {
      // 批量 upsert 进 D1
      for (const tx of transactions) {
        await ensureUserAndLedger(c.env.DB, tx.user_id, tx.ledger_id);
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
            tx.user_id,
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
    let query = 'SELECT * FROM transactions WHERE sync_status = "synced"';
    const params: any[] = [];
    if (body.last_synced_at) {
      query += ' AND updated_at > ?';
      params.push(body.last_synced_at);
    }
    query += ' ORDER BY updated_at ASC LIMIT 200';

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
