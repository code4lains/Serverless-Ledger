import { Hono } from 'hono';
import { Env, AppVariables } from '../types';
import { requireAuth } from '../middleware/auth';
import { ApiResponse, Ledger, LedgerSummary, CreateLedgerRequest, UpdateLedgerRequest } from '@ledger/shared';

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

    const { results: ledgers } = await c.env.DB.prepare(
      'SELECT * FROM ledgers WHERE user_id = ? ORDER BY is_default DESC, created_at ASC'
    )
      .bind(userId)
      .all<Ledger>();

    const ledgerList = ledgers || [];

    if (!withSummary || ledgerList.length === 0) {
      const res: ApiResponse<Ledger[]> = {
        success: true,
        data: ledgerList,
      };
      return c.json(res);
    }

    // 附带统计数据
    const summaries: LedgerSummary[] = [];
    for (const led of ledgerList) {
      const stats = await c.env.DB.prepare(
        `SELECT
          COUNT(*) as tx_count,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income
        FROM transactions WHERE user_id = ? AND ledger_id = ?`
      )
        .bind(userId, led.ledger_id)
        .first<{ tx_count: number; total_expense: number; total_income: number }>();

      const totalExpense = Number(stats?.total_expense || 0);
      const totalIncome = Number(stats?.total_income || 0);
      const transactionCount = Number(stats?.tx_count || 0);

      summaries.push({
        ledger: led,
        transaction_count: transactionCount,
        totalExpense,
        totalIncome,
        balance: totalIncome - totalExpense,
      });
    }

    const res: ApiResponse<LedgerSummary[]> = {
      success: true,
      data: summaries,
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
 * 获取单个账本详情及统计
 * GET /api/ledgers/:id
 */
ledgersRouter.get('/:id', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const id = c.req.param('id');

    const ledger = await c.env.DB.prepare(
      'SELECT * FROM ledgers WHERE ledger_id = ? AND user_id = ?'
    )
      .bind(id, userId)
      .first<Ledger>();

    if (!ledger) {
      const res: ApiResponse = {
        success: false,
        error: '账本不存在或无权限访问',
      };
      return c.json(res, 404);
    }

    const stats = await c.env.DB.prepare(
      `SELECT
        COUNT(*) as tx_count,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income
      FROM transactions WHERE user_id = ? AND ledger_id = ?`
    )
      .bind(userId, id)
      .first<{ tx_count: number; total_expense: number; total_income: number }>();

    const totalExpense = Number(stats?.total_expense || 0);
    const totalIncome = Number(stats?.total_income || 0);
    const summary: LedgerSummary = {
      ledger,
      transaction_count: Number(stats?.tx_count || 0),
      totalExpense,
      totalIncome,
      balance: totalIncome - totalExpense,
    };

    const res: ApiResponse<LedgerSummary> = {
      success: true,
      data: summary,
    };
    return c.json(res);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || 'Failed to get ledger detail',
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
    if (body.name !== undefined && typeof body.name !== 'string') {
      const res: ApiResponse = {
        success: false,
        error: '账本名称必须为字符串',
      };
      return c.json(res, 400);
    }
    if (body.currency !== undefined && typeof body.currency !== 'string') {
      const res: ApiResponse = {
        success: false,
        error: '币种必须为字符串',
      };
      return c.json(res, 400);
    }
    const name = (typeof body.name === 'string' ? body.name : '新建账本').trim();
    const currency = (typeof body.currency === 'string' ? body.currency : 'CNY').trim().toUpperCase();
    const ledgerId = body.ledger_id || `led_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    if (!name) {
      const res: ApiResponse = {
        success: false,
        error: '账本名称不能为空',
      };
      return c.json(res, 400);
    }

    // 检查该用户是否已有账本
    const existingCountRes = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM ledgers WHERE user_id = ?'
    )
      .bind(userId)
      .first<{ count: number }>();

    const count = existingCountRes?.count || 0;
    // 若用户尚无任何账本，首个账本强制设为默认；否则按请求设定
    const isDefault = count === 0 ? 1 : (body.is_default ? 1 : 0);

    // 若设为默认账本，需先将其他账本置为非默认 (保证唯一默认)
    if (isDefault === 1) {
      await c.env.DB.prepare(
        'UPDATE ledgers SET is_default = 0, updated_at = ? WHERE user_id = ?'
      )
        .bind(now, userId)
        .run();
    }

    await c.env.DB.prepare(
      'INSERT INTO ledgers (ledger_id, user_id, name, currency, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(ledgerId, userId, name, currency, isDefault, now, now)
      .run();

    const created: Ledger = {
      ledger_id: ledgerId,
      user_id: userId,
      name,
      currency,
      is_default: isDefault,
      created_at: now,
      updated_at: now,
    };

    const res: ApiResponse<Ledger> = {
      success: true,
      data: created,
      message: '账本创建成功',
    };
    return c.json(res, 201);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || 'Failed to create ledger',
    };
    return c.json(res, 500);
  }
});

/**
 * 更新账本信息
 * PUT /api/ledgers/:id
 */
ledgersRouter.put('/:id', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const id = c.req.param('id');
    const body = await c.req.json<UpdateLedgerRequest>();

    const existing = await c.env.DB.prepare(
      'SELECT * FROM ledgers WHERE ledger_id = ? AND user_id = ?'
    )
      .bind(id, userId)
      .first<Ledger>();

    if (!existing) {
      const res: ApiResponse = {
        success: false,
        error: '账本不存在或无权限修改',
      };
      return c.json(res, 404);
    }

    if (body.name !== undefined && typeof body.name !== 'string') {
      const res: ApiResponse = {
        success: false,
        error: '账本名称必须为字符串',
      };
      return c.json(res, 400);
    }
    if (body.currency !== undefined && typeof body.currency !== 'string') {
      const res: ApiResponse = {
        success: false,
        error: '币种必须为字符串',
      };
      return c.json(res, 400);
    }

    const name = body.name !== undefined ? body.name.trim() : existing.name;
    const currency = body.currency !== undefined ? body.currency.trim().toUpperCase() : existing.currency;
    const isDefault = body.is_default !== undefined ? (body.is_default ? 1 : 0) : existing.is_default;
    const now = new Date().toISOString();

    if (!name) {
      const res: ApiResponse = {
        success: false,
        error: '账本名称不能为空',
      };
      return c.json(res, 400);
    }

    if (isDefault === 1 && existing.is_default === 0) {
      // 设为默认账本时，将其余账本置0
      await c.env.DB.prepare(
        'UPDATE ledgers SET is_default = 0, updated_at = ? WHERE user_id = ?'
      )
        .bind(now, userId)
        .run();
    }

    await c.env.DB.prepare(
      'UPDATE ledgers SET name = ?, currency = ?, is_default = ?, updated_at = ? WHERE ledger_id = ? AND user_id = ?'
    )
      .bind(name, currency, isDefault, now, id, userId)
      .run();

    const updated: Ledger = {
      ...existing,
      name,
      currency,
      is_default: isDefault,
      updated_at: now,
    };

    const res: ApiResponse<Ledger> = {
      success: true,
      data: updated,
      message: '账本信息已更新',
    };
    return c.json(res, 200);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || 'Failed to update ledger',
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
    const id = c.req.param('id');
    const now = new Date().toISOString();

    const existing = await c.env.DB.prepare(
      'SELECT * FROM ledgers WHERE ledger_id = ? AND user_id = ?'
    )
      .bind(id, userId)
      .first<Ledger>();

    if (!existing) {
      const res: ApiResponse = {
        success: false,
        error: '账本不存在',
      };
      return c.json(res, 404);
    }

    // 将用户所有账本重置为 0
    await c.env.DB.prepare(
      'UPDATE ledgers SET is_default = 0, updated_at = ? WHERE user_id = ?'
    )
      .bind(now, userId)
      .run();

    // 将目标账本设为 1
    await c.env.DB.prepare(
      'UPDATE ledgers SET is_default = 1, updated_at = ? WHERE ledger_id = ? AND user_id = ?'
    )
      .bind(now, id, userId)
      .run();

    const updated: Ledger = {
      ...existing,
      is_default: 1,
      updated_at: now,
    };

    const res: ApiResponse<Ledger> = {
      success: true,
      data: updated,
      message: '已成功设置为默认账本',
    };
    return c.json(res, 200);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || 'Failed to set default ledger',
    };
    return c.json(res, 500);
  }
});

/**
 * 删除账本 (带唯一账本保护与级联删除)
 * DELETE /api/ledgers/:id
 */
ledgersRouter.delete('/:id', async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const id = c.req.param('id');
    const now = new Date().toISOString();

    const existing = await c.env.DB.prepare(
      'SELECT * FROM ledgers WHERE ledger_id = ? AND user_id = ?'
    )
      .bind(id, userId)
      .first<Ledger>();

    if (!existing) {
      const res: ApiResponse = {
        success: false,
        error: '账本不存在或已被删除',
      };
      return c.json(res, 404);
    }

    // 检查账本总数，禁止删除唯一的账本
    const allUserLedgers = await c.env.DB.prepare(
      'SELECT ledger_id, is_default FROM ledgers WHERE user_id = ?'
    )
      .bind(userId)
      .all<{ ledger_id: string; is_default: number }>();

    const userLedgerList = allUserLedgers.results || [];
    if (userLedgerList.length <= 1) {
      const res: ApiResponse = {
        success: false,
        error: '至少需保留一个账本，无法删除唯一账本',
      };
      return c.json(res, 400);
    }

    // 如果删除的是默认账本，自动将余下的另一个账本提升为默认账本
    if (existing.is_default === 1) {
      const anotherLedger = userLedgerList.find((l) => l.ledger_id !== id);
      if (anotherLedger) {
        await c.env.DB.prepare(
          'UPDATE ledgers SET is_default = 1, updated_at = ? WHERE ledger_id = ? AND user_id = ?'
        )
          .bind(now, anotherLedger.ledger_id, userId)
          .run();
      }
    }

    // 级联清理该账本下的账单流水、预算和周期记账规则
    await c.env.DB.prepare('DELETE FROM transactions WHERE ledger_id = ? AND user_id = ?')
      .bind(id, userId)
      .run();

    await c.env.DB.prepare('DELETE FROM budgets WHERE ledger_id = ? AND user_id = ?')
      .bind(id, userId)
      .run();

    await c.env.DB.prepare('DELETE FROM recurring_rules WHERE ledger_id = ? AND user_id = ?')
      .bind(id, userId)
      .run();

    // 删除账本本身
    await c.env.DB.prepare('DELETE FROM ledgers WHERE ledger_id = ? AND user_id = ?')
      .bind(id, userId)
      .run();

    const res: ApiResponse = {
      success: true,
      message: '账本及关联流水已成功删除',
      data: { ledger_id: id },
    };
    return c.json(res, 200);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || 'Failed to delete ledger',
    };
    return c.json(res, 500);
  }
});

export default ledgersRouter;
