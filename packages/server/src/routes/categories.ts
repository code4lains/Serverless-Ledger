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
    const userId = authUser?.userId || null;
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
    const userId = authUser?.userId || null;
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

/**
 * 批量更新分类排序权重 (PUT /api/categories/reorder)
 */
categoriesRouter.put('/reorder', requireAuth, async (c) => {
  try {
    const body = (await c.req.json()) as ReorderCategoriesRequest;
    if (!body || !Array.isArray(body.items) || body.items.length === 0) {
      const res: ApiResponse = {
        success: false,
        error: '参数错误，缺少 items 排序列表',
      };
      return c.json(res, 400);
    }

    const statements = body.items.map((item) => {
      return c.env.DB.prepare(
        'UPDATE categories SET sort_order = ?, updated_at = datetime(\'now\') WHERE category_id = ?'
      ).bind(item.sort_order, item.category_id);
    });

    await c.env.DB.batch(statements);

    const res: ApiResponse = {
      success: true,
      message: `成功更新 ${body.items.length} 个分类的排序`,
    };
    return c.json(res);
  } catch (err: any) {
    console.error('Reorder categories failed:', err);
    const res: ApiResponse = {
      success: false,
      error: err.message || '更新分类排序失败',
    };
    return c.json(res, 500);
  }
});

/**
 * 创建自定义分类 (POST /api/categories)
 * 支持创建大分类 (parent_id 为空) 或子分类 (parent_id 为父大类 ID)
 */
categoriesRouter.post('/', requireAuth, async (c) => {
  try {
    const authUser = c.get('user')!;
    const body = (await c.req.json()) as CreateCategoryRequest;

    if (!body.name || !body.name.trim()) {
      const res: ApiResponse = {
        success: false,
        error: '分类名称不能为空',
      };
      return c.json(res, 400);
    }

    const validTypes: CategoryType[] = ['expense', 'income', 'transfer', 'loan'];
    if (!body.type || !validTypes.includes(body.type)) {
      const res: ApiResponse = {
        success: false,
        error: '分类类型无效，必须是 expense, income, transfer 或 loan',
      };
      return c.json(res, 400);
    }

    const userId = authUser.userId;
    const categoryId = body.category_id || `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const name = body.name.trim();
    const icon = body.icon || 'Tag';
    const color = body.color || null;
    const parentId = body.parent_id || null;

    // 若指定了 parent_id，校验父分类是否存在且不能嵌套超过2级
    if (parentId) {
      const parent = await c.env.DB.prepare(
        'SELECT * FROM categories WHERE category_id = ?'
      ).bind(parentId).first<Category>();

      if (!parent) {
        const res: ApiResponse = {
          success: false,
          error: `指定的父分类 (ID: ${parentId}) 不存在`,
        };
        return c.json(res, 400);
      }

      if (parent.parent_id) {
        const res: ApiResponse = {
          success: false,
          error: '不能在子分类下再创建子分类（仅支持大类+小类二级联动）',
        };
        return c.json(res, 400);
      }

      if (parent.type !== body.type) {
        const res: ApiResponse = {
          success: false,
          error: '子分类类型必须与父大类类型一致',
        };
        return c.json(res, 400);
      }
    }

    // 计算 sort_order
    let sortOrder = body.sort_order;
    if (sortOrder === undefined || sortOrder === null) {
      if (parentId) {
        const maxSub = await c.env.DB.prepare(
          'SELECT MAX(sort_order) as max_sort FROM categories WHERE parent_id = ?'
        ).bind(parentId).first<{ max_sort: number | null }>();
        sortOrder = (maxSub?.max_sort || 0) + 1;
      } else {
        const maxParent = await c.env.DB.prepare(
          'SELECT MAX(sort_order) as max_sort FROM categories WHERE type = ? AND parent_id IS NULL'
        ).bind(body.type).first<{ max_sort: number | null }>();
        sortOrder = (maxParent?.max_sort || 0) + 10;
      }
    }

    const now = new Date().toISOString();
    await c.env.DB.prepare(`
      INSERT INTO categories (category_id, user_id, type, parent_id, name, icon, color, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      categoryId,
      userId,
      body.type,
      parentId,
      name,
      icon,
      color,
      sortOrder,
      now,
      now
    ).run();

    const createdCategory: Category = {
      category_id: categoryId,
      user_id: userId,
      type: body.type,
      parent_id: parentId,
      name,
      icon,
      color,
      sort_order: sortOrder,
      created_at: now,
      updated_at: now,
    };

    const res: ApiResponse<Category> = {
      success: true,
      data: createdCategory,
      message: '分类创建成功',
    };
    return c.json(res, 201);
  } catch (err: any) {
    console.error('Create category failed:', err);
    const res: ApiResponse = {
      success: false,
      error: err.message || '创建分类失败',
    };
    return c.json(res, 500);
  }
});

/**
 * 修改分类 (PUT /api/categories/:id)
 */
categoriesRouter.put('/:id', requireAuth, async (c) => {
  try {
    const authUser = c.get('user')!;
    const categoryId = c.req.param('id');
    const body = (await c.req.json()) as UpdateCategoryRequest;

    const existing = await c.env.DB.prepare(
      'SELECT * FROM categories WHERE category_id = ?'
    ).bind(categoryId).first<Category>();

    if (!existing) {
      const res: ApiResponse = {
        success: false,
        error: '分类不存在',
      };
      return c.json(res, 404);
    }

    // 校验权限 (如果是系统预置分类，允许修改个性化名称/图标/颜色/排序或作为普通更新)
    if (existing.user_id && existing.user_id !== authUser.userId) {
      const res: ApiResponse = {
        success: false,
        error: '无权修改其他用户的自定义分类',
      };
      return c.json(res, 403);
    }

    const name = body.name !== undefined ? body.name.trim() : existing.name;
    const icon = body.icon !== undefined ? body.icon : existing.icon;
    const color = body.color !== undefined ? body.color : existing.color;
    const sortOrder = body.sort_order !== undefined ? body.sort_order : existing.sort_order;
    const parentId = body.parent_id !== undefined ? body.parent_id : existing.parent_id;

    if (parentId && parentId === categoryId) {
      const res: ApiResponse = {
        success: false,
        error: '分类的父分类不能是自己',
      };
      return c.json(res, 400);
    }

    const now = new Date().toISOString();
    await c.env.DB.prepare(`
      UPDATE categories
      SET name = ?, icon = ?, color = ?, sort_order = ?, parent_id = ?, updated_at = ?
      WHERE category_id = ?
    `).bind(
      name,
      icon,
      color,
      sortOrder,
      parentId,
      now,
      categoryId
    ).run();

    const updatedCategory: Category = {
      ...existing,
      name,
      icon: icon || undefined,
      color,
      sort_order: sortOrder,
      parent_id: parentId,
      updated_at: now,
    };

    const res: ApiResponse<Category> = {
      success: true,
      data: updatedCategory,
      message: '分类更新成功',
    };
    return c.json(res);
  } catch (err: any) {
    console.error('Update category failed:', err);
    const res: ApiResponse = {
      success: false,
      error: err.message || '修改分类失败',
    };
    return c.json(res, 500);
  }
});

/**
 * 删除分类 (DELETE /api/categories/:id)
 */
categoriesRouter.delete('/:id', requireAuth, async (c) => {
  try {
    const authUser = c.get('user')!;
    const categoryId = c.req.param('id');

    const existing = await c.env.DB.prepare(
      'SELECT * FROM categories WHERE category_id = ?'
    ).bind(categoryId).first<Category>();

    if (!existing) {
      const res: ApiResponse = {
        success: false,
        error: '分类不存在',
      };
      return c.json(res, 404);
    }

    // 系统预置分类保护
    if (!existing.user_id) {
      const res: ApiResponse = {
        success: false,
        error: '系统预置公共分类不可删除',
      };
      return c.json(res, 400);
    }

    // 校验权限
    if (existing.user_id !== authUser.userId) {
      const res: ApiResponse = {
        success: false,
        error: '无权删除其他用户的自定义分类',
      };
      return c.json(res, 403);
    }

    // 若是大分类，级联删除其下的子分类
    if (!existing.parent_id) {
      await c.env.DB.prepare(
        'DELETE FROM categories WHERE parent_id = ?'
      ).bind(categoryId).run();
    }

    await c.env.DB.prepare(
      'DELETE FROM categories WHERE category_id = ?'
    ).bind(categoryId).run();

    const res: ApiResponse = {
      success: true,
      message: '分类已成功删除',
    };
    return c.json(res);
  } catch (err: any) {
    console.error('Delete category failed:', err);
    const res: ApiResponse = {
      success: false,
      error: err.message || '删除分类失败',
    };
    return c.json(res, 500);
  }
});

export default categoriesRouter;
