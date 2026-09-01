import { Hono } from 'hono';
import { Env, AppVariables } from '../types';
import { requireAuth } from '../middleware/auth';
import { ApiResponse, Ledger, LedgerSummary } from '@ledger/shared';
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

export default ledgersRouter;

