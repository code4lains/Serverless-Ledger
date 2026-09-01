import { Hono } from 'hono';
import { Env, AppVariables } from '../types';
import { requireAuth } from '../middleware/auth';
import {
  ApiResponse,
  Budget,
  BudgetPeriod,
  BatchSetBudgetRequest,
  SetBudgetItem,
} from '@ledger/shared';
import { getRepositories } from '../repositories';

const budgetsRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// 所有预算接口均需通过 JWT 认证
budgetsRouter.use('*', requireAuth);

/**
 * 获取预算列表
 * GET /api/budgets?ledgerId=xxx&period=monthly
 */
budgetsRouter.get('/', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const ledgerId = c.req.query('ledgerId');
    const rawPeriod = c.req.query('period');

    let period: BudgetPeriod | undefined = undefined;
    if (rawPeriod) {
      if (!['monthly', 'yearly'].includes(rawPeriod)) {
        const res: ApiResponse = {
          success: false,
          error: '无效的预算周期，必须为 monthly 或 yearly',
        };
        return c.json(res, 400);
      }
      period = rawPeriod as BudgetPeriod;
    }

    const repos = getRepositories(c.env.DB);
    const results = await repos.budgets.findByUser(userId, ledgerId, period);

    const res: ApiResponse<Budget[]> = {
      success: true,
      data: results,
    };
    return c.json(res);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '获取预算配置失败',
    };
    return c.json(res, 500);
  }
});

/**
 * 批量设置预算 (原子化替换指定账本和周期的所有预算)
 * PUT /api/budgets/batch
 */
budgetsRouter.put('/batch', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const body = await c.req.json<BatchSetBudgetRequest>();
    const repos = getRepositories(c.env.DB);

    // 严格校验周期枚举 (BUG-S11)
    const period: BudgetPeriod = body.period || 'monthly';
    if (!['monthly', 'yearly'].includes(period)) {
      const res: ApiResponse = {
        success: false,
        error: '无效的预算周期，必须为 monthly 或 yearly',
      };
      return c.json(res, 400);
    }

    // 校验账本归属权 (BUG-S06)
    const ledgerId = await repos.ledgers.resolveUserLedgerId(userId, body.ledger_id);

    const budgetsToSet = Array.isArray(body.budgets) ? body.budgets : [];
    const validBudgets: SetBudgetItem[] = [];

    for (const item of budgetsToSet) {
      const amount = typeof item.amount === 'number' ? Math.round(item.amount) : 0;
      if (amount <= 0 || isNaN(amount)) continue;

      const categoryId = await repos.categories.resolveValidCategoryId(item.category_id);
      validBudgets.push({
        category_id: categoryId,
        amount,
      });
    }

    const resultBudgets = await repos.budgets.batchSet(userId, ledgerId, period, validBudgets);

    const res: ApiResponse<Budget[]> = {
      success: true,
      data: resultBudgets,
      message: `成功配置 ${resultBudgets.length} 项预算`,
    };
    return c.json(res, 200);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '批量设置预算失败',
    };
    return c.json(res, 500);
  }
});

export default budgetsRouter;

