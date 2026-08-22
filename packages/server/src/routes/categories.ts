import { Hono } from 'hono';
import { Env, AppVariables } from '../types';
import {
  ApiResponse,
  Category,
  CategoryType,
  CategoryTreeNode,
  getDefaultCategories,
  buildCategoryTree,
} from '@ledger/shared';

const categoriesRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

/**
 * 获取系统默认分类字典 (纯净初始定义)
 */
categoriesRouter.get('/defaults', async (c) => {
  const type = c.req.query('type') as CategoryType | undefined;
  const format = c.req.query('format');

  let list = getDefaultCategories();
  if (type) {
    list = list.filter((item) => item.type === type);
  }

  if (format === 'tree') {
    const tree = buildCategoryTree(list, type);
    const res: ApiResponse<CategoryTreeNode[]> = { success: true, data: tree };
    return c.json(res);
  }

  const res: ApiResponse<Category[]> = { success: true, data: list };
  return c.json(res);
});

/**
 * 获取树形结构分类列表 (快捷方式)
 */
categoriesRouter.get('/tree', async (c) => {
  try {
    const authUser = c.get('user');
    const userId = authUser?.userId || c.req.query('userId') || null;
    const type = c.req.query('type') as CategoryType | undefined;

    let query = 'SELECT * FROM categories WHERE (user_id IS NULL';
    const params: any[] = [];

    if (userId) {
      query += ' OR user_id = ?';
      params.push(userId);
    }
    query += ')';

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY sort_order ASC, created_at ASC';

    const stmt = params.length > 0 ? c.env.DB.prepare(query).bind(...params) : c.env.DB.prepare(query);
    const { results } = await stmt.all<Category>();

    let list = results && results.length > 0 ? results : getDefaultCategories();
    if (type) {
      list = list.filter((item) => item.type === type);
    }

    const tree = buildCategoryTree(list, type);
    const res: ApiResponse<CategoryTreeNode[]> = {
      success: true,
      data: tree,
    };
    return c.json(res);
  } catch (err: any) {
    const fallbackTree = buildCategoryTree(getDefaultCategories());
    const res: ApiResponse<CategoryTreeNode[]> = {
      success: true,
      data: fallbackTree,
    };
    return c.json(res);
  }
});

/**
 * 获取分类列表 (包含系统预置分类以及用户自定义分类，支持 type 过滤与 format=tree)
 */
categoriesRouter.get('/', async (c) => {
  try {
    const authUser = c.get('user');
    const userId = authUser?.userId || c.req.query('userId') || null;
    const type = c.req.query('type') as CategoryType | undefined;
    const format = c.req.query('format');

    let query = 'SELECT * FROM categories WHERE (user_id IS NULL';
    const params: any[] = [];

    if (userId) {
      query += ' OR user_id = ?';
      params.push(userId);
    }
    query += ')';

    if (type) {
      query += ' AND type = ?';
      params.push(type);
    }

    query += ' ORDER BY sort_order ASC, created_at ASC';

    const stmt = params.length > 0 ? c.env.DB.prepare(query).bind(...params) : c.env.DB.prepare(query);
    const { results } = await stmt.all<Category>();

    let list = results && results.length > 0 ? results : getDefaultCategories();
    if (type) {
      list = list.filter((item) => item.type === type);
    }

    if (format === 'tree') {
      const tree = buildCategoryTree(list, type);
      const res: ApiResponse<CategoryTreeNode[]> = {
        success: true,
        data: tree,
      };
      return c.json(res);
    }

    const res: ApiResponse<Category[]> = {
      success: true,
      data: list,
    };
    return c.json(res);
  } catch (err: any) {
    let list = getDefaultCategories();
    const type = c.req.query('type') as CategoryType | undefined;
    if (type) {
      list = list.filter((item) => item.type === type);
    }
    const res: ApiResponse<Category[]> = {
      success: true,
      data: list,
    };
    return c.json(res);
  }
});

export default categoriesRouter;

