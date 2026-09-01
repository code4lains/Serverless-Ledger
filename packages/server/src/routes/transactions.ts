import { Hono } from 'hono';
import { Env, AppVariables } from '../types';
import { requireAuth } from '../middleware/auth';
import { ApiResponse, Transaction, SyncBatchRequest, SyncBatchResponse, TransactionType } from '@ledger/shared';
import { getRepositories } from '../repositories';

const transactionsRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// 所有流水接口均需通过 JWT 认证
transactionsRouter.use('*', requireAuth);

/**
 * 获取流水账单列表 (支持按账本、类型、分类、日期区间与关键词搜索)
 * GET /api/transactions
 */
transactionsRouter.get('/', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const ledgerId = c.req.query('ledgerId');
    const type = c.req.query('type') as TransactionType | 'all' | undefined;
    const categoryId = c.req.query('categoryId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');
    const search = c.req.query('search');
    const rawLimit = c.req.query('limit');
    const parsedLimit = rawLimit ? parseInt(rawLimit, 10) : 200;
    const limit = isNaN(parsedLimit) || parsedLimit <= 0 ? 200 : Math.min(parsedLimit, 500);

    const repos = getRepositories(c.env.DB);
    const results = await repos.transactions.query(userId, {
      ledger_id: ledgerId,
      type,
      category_id: categoryId,
      start_date: startDate,
      end_date: endDate,
      search,
      limit,
    });

    const res: ApiResponse<Transaction[]> = {
      success: true,
      data: results,
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
 * 离线数据批量同步 (遵循 Last-Write-Wins 策略)
 * POST /api/transactions/sync
 */
transactionsRouter.post('/sync', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const body = await c.req.json<SyncBatchRequest>();
    const transactions = body.transactions || [];
    const now = new Date().toISOString();
    const repos = getRepositories(c.env.DB);

    let syncedIds: string[] = [];
    if (transactions.length > 0) {
      const result = await repos.transactions.batchUpsert(userId, transactions);
      syncedIds = result.synced_ids;
    }

    // 获取当前用户在服务端的增量更新给客户端
    const serverTransactions = await repos.transactions.getIncrementalUpdated(
      userId,
      body.last_synced_at,
      300
    );

    const res: ApiResponse<SyncBatchResponse> = {
      success: true,
      data: {
        synced_ids: syncedIds,
        server_transactions: serverTransactions,
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

/**
 * 删除指定流水 (仅归属当前用户)
 * DELETE /api/transactions/:id
 */
transactionsRouter.delete('/:id', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const transactionId = c.req.param('id');
    const repos = getRepositories(c.env.DB);

    const success = await repos.transactions.delete(transactionId, userId);
    if (!success) {
      const res: ApiResponse = {
        success: false,
        error: '流水记录不存在或无权删除',
      };
      return c.json(res, 404);
    }

    const res: ApiResponse = {
      success: true,
      message: '流水删除成功',
    };
    return c.json(res, 200);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '删除流水失败',
    };
    return c.json(res, 500);
  }
});

/**
 * 批量删除流水 (原子化批量清理)
 * POST /api/transactions/batch-delete
 */
transactionsRouter.post('/batch-delete', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const body = await c.req.json<{ transaction_ids: string[] }>();
    const ids = Array.isArray(body.transaction_ids) ? body.transaction_ids : [];

    const repos = getRepositories(c.env.DB);
    const count = await repos.transactions.batchDelete(ids, userId);

    const res: ApiResponse<{ count: number }> = {
      success: true,
      data: { count },
      message: `成功批量删除 ${count} 笔流水`,
    };
    return c.json(res, 200);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '批量删除流水失败',
    };
    return c.json(res, 500);
  }
});

export default transactionsRouter;

