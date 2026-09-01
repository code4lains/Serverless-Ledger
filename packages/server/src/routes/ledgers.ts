import { Hono } from 'hono';
import { Env, AppVariables } from '../types';
import { requireAuth } from '../middleware/auth';
import {
  ApiResponse,
  Ledger,
  LedgerSummary,
  CreateLedgerRequest,
  UpdateLedgerRequest,
} from '@ledger/shared';
import { getRepositories } from '../repositories';

const ledgersRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// 所有账本接口均需通过 JWT 认证
ledgersRouter.use('*', requireAuth);

/**
 * 获取用户的账本列表 (支持附带各账本收支汇总)
 * GET /api/ledgers
 */
ledgersRouter.get('/', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const withSummary = c.req.query('withSummary') === 'true';
    const repos = getRepositories(c.env.DB);

    if (withSummary) {
      const summaries = await repos.ledgers.getSummariesByUserId(userId);
      const res: ApiResponse<LedgerSummary[]> = {
        success: true,
        data: summaries,
      };
      return c.json(res);
    }

    const ledgerList = await repos.ledgers.findByUserId(userId);
    const res: ApiResponse<Ledger[]> = {
      success: true,
      data: ledgerList,
    };
    return c.json(res);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || 'Failed to fetch ledgers',
    };
    return c.json(res, 500);
  }
});

/**
 * 创建新账本
 * POST /api/ledgers
 */
ledgersRouter.post('/', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const body = await c.req.json<CreateLedgerRequest>();
    const repos = getRepositories(c.env.DB);

    const created = await repos.ledgers.create(userId, body);
    const res: ApiResponse<Ledger> = {
      success: true,
      data: created,
    };
    return c.json(res, 201);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '创建账本失败',
    };
    return c.json(res, 500);
  }
});

/**
 * 更新账本
 * PUT /api/ledgers/:id
 */
ledgersRouter.put('/:id', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const ledgerId = c.req.param('id');
    const body = await c.req.json<UpdateLedgerRequest>();
    const repos = getRepositories(c.env.DB);

    const updated = await repos.ledgers.update(ledgerId, userId, body);
    if (!updated) {
      const res: ApiResponse = {
        success: false,
        error: '账本不存在或无权修改',
      };
      return c.json(res, 404);
    }

    const res: ApiResponse<Ledger> = {
      success: true,
      data: updated,
    };
    return c.json(res);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '更新账本失败',
    };
    return c.json(res, 500);
  }
});

/**
 * 设为默认账本
 * PUT /api/ledgers/:id/default
 */
ledgersRouter.put('/:id/default', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const ledgerId = c.req.param('id');
    const repos = getRepositories(c.env.DB);

    const updated = await repos.ledgers.setDefault(ledgerId, userId);
    const res: ApiResponse<Ledger> = {
      success: true,
      data: updated,
    };
    return c.json(res);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '设置默认账本失败',
    };
    return c.json(res, 500);
  }
});

/**
 * 删除账本 (级联删除其下的流水、预算和周期规则)
 * DELETE /api/ledgers/:id
 */
ledgersRouter.delete('/:id', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const ledgerId = c.req.param('id');
    const repos = getRepositories(c.env.DB);

    const result = await repos.ledgers.delete(ledgerId, userId);
    if (!result.success) {
      const res: ApiResponse = {
        success: false,
        error: result.error || '删除账本失败',
      };
      return c.json(res, 400);
    }

    const res: ApiResponse = {
      success: true,
      message: '账本删除成功',
    };
    return c.json(res);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '删除账本失败',
    };
    return c.json(res, 500);
  }
});

/**
 * 合并账本 (将源账本数据转移至目标账本)
 * POST /api/ledgers/merge
 */
ledgersRouter.post('/merge', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const body = await c.req.json<{ source_ledger_id: string; target_ledger_id: string; delete_source?: boolean }>();
    const repos = getRepositories(c.env.DB);

    const result = await repos.ledgers.merge(userId, body);
    if (!result.success) {
      const res: ApiResponse = {
        success: false,
        error: result.error || '合并账本失败',
      };
      return c.json(res, 400);
    }

    const res: ApiResponse<{ merged_transaction_count: number; source_deleted: boolean }> = {
      success: true,
      data: {
        merged_transaction_count: result.mergedTransactionCount,
        source_deleted: body.delete_source !== false,
      },
      message: `成功将 ${result.mergedTransactionCount} 笔数据合并至目标账本`,
    };
    return c.json(res, 200);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '合并账本失败',
    };
    return c.json(res, 500);
  }
});

export default ledgersRouter;

