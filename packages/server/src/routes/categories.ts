import { Hono } from 'hono';
import { Env, AppVariables } from '../types';
import { requireAuth } from '../middleware/auth';
import {
  ApiResponse,
  Category,
  CategoryType,
  CategoryTreeNode,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  ReorderCategoriesRequest,
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

/**
 * 创建自定义分类
 * POST /api/categories
 */
categoriesRouter.post('/', requireAuth, async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const body = await c.req.json<CreateCategoryRequest>();
    const repos = getRepositories(c.env.DB);

    const created = await repos.categories.create(userId, body);
    const res: ApiResponse<Category> = {
      success: true,
      data: created,
    };
    return c.json(res, 201);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '创建分类失败',
    };
    return c.json(res, 500);
  }
});

/**
 * 批量更新分类排序
 * PUT /api/categories/reorder
 */
categoriesRouter.put('/reorder', requireAuth, async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const body = await c.req.json<ReorderCategoriesRequest>();
    const repos = getRepositories(c.env.DB);

    const updated = await repos.categories.reorder(userId, body.items || []);
    const res: ApiResponse<Category[]> = {
      success: true,
      data: updated,
    };
    return c.json(res);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '分类排序更新失败',
    };
    return c.json(res, 500);
  }
});

/**
 * 更新自定义分类
 * PUT /api/categories/:id
 */
categoriesRouter.put('/:id', requireAuth, async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const categoryId = c.req.param('id');
    const body = await c.req.json<UpdateCategoryRequest>();
    const repos = getRepositories(c.env.DB);

    const updated = await repos.categories.update(categoryId, userId, body);
    if (!updated) {
      const res: ApiResponse = {
        success: false,
        error: '分类不存在或无权修改',
      };
      return c.json(res, 404);
    }

    const res: ApiResponse<Category> = {
      success: true,
      data: updated,
    };
    return c.json(res);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '修改分类失败',
    };
    return c.json(res, 500);
  }
});

/**
 * 删除自定义分类
 * DELETE /api/categories/:id
 */
categoriesRouter.delete('/:id', requireAuth, async (c) => {
  try {
    const authUser = c.get('user')!;
    const userId = authUser.userId;
    const categoryId = c.req.param('id');
    const repos = getRepositories(c.env.DB);

    const success = await repos.categories.delete(categoryId, userId);
    if (!success) {
      const res: ApiResponse = {
        success: false,
        error: '分类不存在或无权删除',
      };
      return c.json(res, 404);
    }

    const res: ApiResponse = {
      success: true,
      message: '分类删除成功',
    };
    return c.json(res);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '删除分类失败',
    };
    return c.json(res, 500);
  }
});

export default categoriesRouter;

