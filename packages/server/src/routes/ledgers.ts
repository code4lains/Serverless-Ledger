import { Hono } from 'hono';
import { Env } from '../types';
import { ApiResponse, Ledger } from '@ledger/shared';

const ledgersRouter = new Hono<{ Bindings: Env }>();

/**
 * 获取用户的账本列表
 */
ledgersRouter.get('/', async (c) => {
  try {
    const userId = c.req.query('userId') || 'default_user';

    const { results } = await c.env.DB.prepare(
      'SELECT * FROM ledgers WHERE user_id = ? ORDER BY is_default DESC, created_at ASC'
    )
      .bind(userId)
      .all<Ledger>();

    const res: ApiResponse<Ledger[]> = {
      success: true,
      data: results || [],
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
 */
ledgersRouter.post('/', async (c) => {
  try {
    const body = await c.req.json<Partial<Ledger>>();
    const ledgerId = body.ledger_id || `led_${Date.now()}`;
    const userId = body.user_id || 'default_user';
    const name = body.name || '日常账本';
    const currency = body.currency || 'CNY';
    const isDefault = body.is_default ? 1 : 0;
    const now = new Date().toISOString();

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
      message: 'Ledger created successfully',
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

export default ledgersRouter;
