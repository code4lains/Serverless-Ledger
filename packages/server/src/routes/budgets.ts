import { Hono } from 'hono';
import { Env, AppVariables } from '../types';
import { requireAuth } from '../middleware/auth';
import {
  ApiResponse,
  Budget,
  BudgetPeriod,
  CreateBudgetRequest,
  BatchSetBudgetRequest,
} from '@ledger/shared';
import { resolveUserLedgerId } from '../utils/ledger';

const budgetsRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// 所有预算接口均需通过 JWT 认证
budgetsRouter.use('*', requireAuth);

/**
 * 校验 category_id 是否存在于 categories 表中
 */
async function resolveValidCategoryId(db: D1Database, categoryId?: string | null): Promise<string | null> {
  if (!categoryId) return null;
  const existing = await db
    .prepare('SELECT category_id FROM categories WHERE category_id = ?')
    .bind(categoryId)
    .first<{ category_id: string }>();
  return existing ? categoryId : null;
}

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

    let query = 'SELECT * FROM budgets WHERE user_id = ?';
    const params: any[] = [userId];

    if (ledgerId && ledgerId !== 'all') {
      query += ' AND ledger_id = ?';
      params.push(ledgerId);
    }

    if (period) {
      query += ' AND period = ?';
      params.push(period);
    }

    query += ' ORDER BY (category_id IS NOT NULL) ASC, created_at ASC';

    const { results } = await c.env.DB.prepare(query).bind(...params).all<Budget>();

    const res: ApiResponse<Budget[]> = {
      success: true,
      data: results || [],
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
 * 单条预算创建或更新 (Upsert)
 * POST /api/budgets
 */
budgetsRouter.post('/', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const body = await c.req.json<Partial<CreateBudgetRequest>>();

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
    const ledgerId = await resolveUserLedgerId(c.env.DB, userId, body.ledger_id);

    const rawCategoryId = body.category_id || null;
    const categoryId = await resolveValidCategoryId(c.env.DB, rawCategoryId);
    const amount = typeof body.amount === 'number' ? Math.round(body.amount) : 0;

    if (amount <= 0 || isNaN(amount)) {
      const res: ApiResponse = {
        success: false,
        error: '预算金额必须为大于 0 的有效数值',
      };
      return c.json(res, 400);
    }

    const now = new Date().toISOString();

    // 检查是否已有同账本同周期同分类的预算
    let existingQuery = 'SELECT * FROM budgets WHERE user_id = ? AND ledger_id = ? AND period = ?';
    const existingParams: any[] = [userId, ledgerId, period];

    if (categoryId) {
      existingQuery += ' AND category_id = ?';
      existingParams.push(categoryId);
    } else {
      existingQuery += ' AND category_id IS NULL';
    }

    const existing = await c.env.DB.prepare(existingQuery).bind(...existingParams).first<Budget>();

    if (existing) {
      // 更新现有预算
      await c.env.DB.prepare(
        'UPDATE budgets SET amount = ?, updated_at = ? WHERE budget_id = ?'
      )
        .bind(amount, now, existing.budget_id)
        .run();

      const updated: Budget = {
        ...existing,
        amount,
        updated_at: now,
      };

      const res: ApiResponse<Budget> = {
        success: true,
        data: updated,
        message: '预算更新成功',
      };
      return c.json(res, 200);
    } else {
      // 插入新预算
      const budgetId = body.budget_id || `bud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await c.env.DB.prepare(
        `INSERT INTO budgets (budget_id, user_id, ledger_id, category_id, period, amount, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(budgetId, userId, ledgerId, categoryId, period, amount, now, now)
        .run();

      const created: Budget = {
        budget_id: budgetId,
        user_id: userId,
        ledger_id: ledgerId,
        category_id: categoryId,
        period,
        amount,
        created_at: now,
        updated_at: now,
      };

      const res: ApiResponse<Budget> = {
        success: true,
        data: created,
        message: '预算创建成功',
      };
      return c.json(res, 201);
    }
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '创建预算失败',
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
    const ledgerId = await resolveUserLedgerId(c.env.DB, userId, body.ledger_id);

    const budgetsToSet = Array.isArray(body.budgets) ? body.budgets : [];
    const now = new Date().toISOString();

    // BUG-S12: 将 DELETE 与 INSERT 一并放入 D1 batch 中执行，保证原子性
    const batchStatements: D1PreparedStatement[] = [
      c.env.DB.prepare('DELETE FROM budgets WHERE user_id = ? AND ledger_id = ? AND period = ?')
        .bind(userId, ledgerId, period),
    ];

    const resultBudgets: Budget[] = [];

    for (const item of budgetsToSet) {
      const amount = typeof item.amount === 'number' ? Math.round(item.amount) : 0;
      if (amount <= 0 || isNaN(amount)) continue;

      const categoryId = await resolveValidCategoryId(c.env.DB, item.category_id);
      const budgetId = `bud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      batchStatements.push(
        c.env.DB.prepare(
          `INSERT INTO budgets (budget_id, user_id, ledger_id, category_id, period, amount, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(budgetId, userId, ledgerId, categoryId, period, amount, now, now)
      );

      resultBudgets.push({
        budget_id: budgetId,
        user_id: userId,
        ledger_id: ledgerId,
        category_id: categoryId,
        period,
        amount,
        created_at: now,
        updated_at: now,
      });
    }

    await c.env.DB.batch(batchStatements);

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

/**
 * 删除单条预算
 * DELETE /api/budgets/:id
 */
budgetsRouter.delete('/:id', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const id = c.req.param('id');

    const result = await c.env.DB.prepare(
      'DELETE FROM budgets WHERE budget_id = ? AND user_id = ?'
    )
      .bind(id, userId)
      .run();

    const res: ApiResponse = {
      success: true,
      message: '预算删除成功',
      data: { budget_id: id },
    };
    return c.json(res, 200);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '删除预算失败',
    };
    return c.json(res, 500);
  }
});

export default budgetsRouter;
