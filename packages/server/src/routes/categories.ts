import { Hono } from 'hono';
import { Env } from '../types';
import { ApiResponse, Category } from '@ledger/shared';

const categoriesRouter = new Hono<{ Bindings: Env }>();

/**
 * 获取分类列表 (包含系统预置分类以及用户自定义分类)
 */
categoriesRouter.get('/', async (c) => {
  try {
    const userId = c.req.query('userId') || null;

    let query = 'SELECT * FROM categories WHERE user_id IS NULL';
    const params: any[] = [];

    if (userId) {
      query += ' OR user_id = ?';
      params.push(userId);
    }

    query += ' ORDER BY sort_order ASC, created_at ASC';

    const stmt = params.length > 0 ? c.env.DB.prepare(query).bind(...params) : c.env.DB.prepare(query);
    const { results } = await stmt.all<Category>();

    const res: ApiResponse<Category[]> = {
      success: true,
      data: results || [],
    };
    return c.json(res);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || 'Failed to fetch categories',
    };
    return c.json(res, 500);
  }
});

export default categoriesRouter;
