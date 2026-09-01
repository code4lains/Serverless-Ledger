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
import { getRepositories } from '../repositories';

const categoriesRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

const handleDefaults = async (c: any) => {
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
};

/**
 * 获取系统默认分类字典 (纯净初始定义)
 * GET /api/categories/default
 * GET /api/categories/defaults
 */
categoriesRouter.get('/default', handleDefaults);
categoriesRouter.get('/defaults', handleDefaults);

/**
 * 获取树形结构分类列表 (快捷方式)
 * GET /api/categories/tree
 */
categoriesRouter.get('/tree', async (c) => {
  try {
    const authUser = c.get('user');
    const userId = authUser?.userId || undefined;
    const type = c.req.query('type') as CategoryType | undefined;
    const repos = getRepositories(c.env.DB);

    const results = await repos.categories.findByUserId(userId, type);
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
 * GET /api/categories
 */
categoriesRouter.get('/', async (c) => {
  try {
    const authUser = c.get('user');
    const userId = authUser?.userId || undefined;
    const type = c.req.query('type') as CategoryType | undefined;
    const format = c.req.query('format');
    const repos = getRepositories(c.env.DB);

    const results = await repos.categories.findByUserId(userId, type);
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

