import {
  Category,
  CategoryType,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  ReorderCategoryItem,
  ICategoryRepository,
} from '@ledger/shared';

export class D1CategoryRepository implements ICategoryRepository {
  constructor(protected db: D1Database) {}

  async findById(categoryId: string, userId?: string): Promise<Category | null> {
    let query = 'SELECT * FROM categories WHERE category_id = ?';
    const params: any[] = [categoryId];
    if (userId) {
      query += ' AND (user_id = ? OR user_id IS NULL)';
      params.push(userId);
    }
    const cat = await this.db.prepare(query).bind(...params).first<Category>();
    return cat || null;
  }

  async findByUserId(userId?: string, type?: CategoryType): Promise<Category[]> {
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

    const stmt = params.length > 0 ? this.db.prepare(query).bind(...params) : this.db.prepare(query);
    const { results } = await stmt.all<Category>();
    return results || [];
  }

  async hasChildren(categoryId: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT category_id FROM categories WHERE parent_id = ? LIMIT 1')
      .bind(categoryId)
      .first<{ category_id: string }>();
    return Boolean(row);
  }

  async create(userId: string | null, req: CreateCategoryRequest): Promise<Category> {
    const categoryId = req.category_id || `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const name = req.name.trim();
    const icon = req.icon || 'Tag';
    const color = req.color || null;
    const parentId = req.parent_id || null;

    let sortOrder = req.sort_order;
    if (sortOrder === undefined || sortOrder === null) {
      if (parentId) {
        const maxSub = await this.db
          .prepare('SELECT MAX(sort_order) as max_sort FROM categories WHERE parent_id = ?')
          .bind(parentId)
          .first<{ max_sort: number | null }>();
        sortOrder = (maxSub?.max_sort || 0) + 1;
      } else {
        const maxParent = await this.db
          .prepare('SELECT MAX(sort_order) as max_sort FROM categories WHERE type = ? AND parent_id IS NULL')
          .bind(req.type)
          .first<{ max_sort: number | null }>();
        sortOrder = (maxParent?.max_sort || 0) + 10;
      }
    }

    const now = new Date().toISOString();
    await this.db
      .prepare(
        `INSERT INTO categories (category_id, user_id, type, parent_id, name, icon, color, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(categoryId, userId, req.type, parentId, name, icon, color, sortOrder, now, now)
      .run();

    return {
      category_id: categoryId,
      user_id: userId,
      type: req.type,
      parent_id: parentId,
      name,
      icon,
      color,
      sort_order: sortOrder,
      created_at: now,
      updated_at: now,
    };
  }

  async update(categoryId: string, userId: string | null, req: UpdateCategoryRequest): Promise<Category | null> {
    const existing = await this.findById(categoryId);
    if (!existing) return null;
    if (!existing.user_id) throw new Error('系统预置公共分类不可修改');
    if (userId && existing.user_id !== userId) throw new Error('无权修改其他用户的自定义分类');

    const name = req.name !== undefined ? req.name.trim() : existing.name;
    const icon = req.icon !== undefined ? req.icon : existing.icon;
    const color = req.color !== undefined ? req.color : existing.color;
    const sortOrder = req.sort_order !== undefined ? req.sort_order : existing.sort_order;
    const parentId = req.parent_id !== undefined ? (req.parent_id || null) : existing.parent_id;
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `UPDATE categories
         SET name = ?, icon = ?, color = ?, sort_order = ?, parent_id = ?, updated_at = ?
         WHERE category_id = ?`
      )
      .bind(name, icon, color, sortOrder, parentId, now, categoryId)
      .run();

    return {
      ...existing,
      name,
      icon: icon || undefined,
      color,
      sort_order: sortOrder,
      parent_id: parentId,
      updated_at: now,
    };
  }

  async delete(categoryId: string, userId: string | null): Promise<boolean> {
    const existing = await this.findById(categoryId);
    if (!existing) return false;
    if (!existing.user_id) throw new Error('系统预置公共分类不可删除');
    if (userId && existing.user_id !== userId) throw new Error('无权删除其他用户的自定义分类');

    // 若是大分类，级联删除其下的子分类
    if (!existing.parent_id) {
      await this.db.prepare('DELETE FROM categories WHERE parent_id = ?').bind(categoryId).run();
    }

    const res = await this.db.prepare('DELETE FROM categories WHERE category_id = ?').bind(categoryId).run();
    return (res.meta.changes || 0) > 0;
  }

  async reorder(userId: string | null, items: ReorderCategoryItem[]): Promise<boolean> {
    if (!items || items.length === 0) return true;

    const statements = items.map((item) => {
      return this.db
        .prepare(
          "UPDATE categories SET sort_order = ?, updated_at = datetime('now') WHERE category_id = ? AND user_id = ?"
        )
        .bind(item.sort_order, item.category_id, userId);
    });

    await this.db.batch(statements);
    return true;
  }

  async batchPut(categories: Category[]): Promise<void> {
    if (!categories || categories.length === 0) return;
    const statements = categories.map((cat) => {
      return this.db
        .prepare(
          `INSERT OR REPLACE INTO categories (
            category_id, user_id, type, parent_id, name, icon, color, sort_order, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          cat.category_id,
          cat.user_id || null,
          cat.type,
          cat.parent_id || null,
          cat.name,
          cat.icon || null,
          cat.color || null,
          cat.sort_order || 0,
          cat.created_at,
          cat.updated_at
        );
    });
    await this.db.batch(statements);
  }

  async findValidIds(userId: string): Promise<Set<string>> {
    const { results } = await this.db
      .prepare('SELECT category_id FROM categories WHERE user_id = ? OR user_id IS NULL')
      .bind(userId)
      .all<{ category_id: string }>();
    return new Set((results || []).map((r) => r.category_id));
  }

  async resolveValidCategoryId(categoryId?: string | null): Promise<string | null> {
    if (!categoryId) return null;
    const existing = await this.db
      .prepare('SELECT category_id FROM categories WHERE category_id = ?')
      .bind(categoryId)
      .first<{ category_id: string }>();
    return existing ? categoryId : null;
  }
}
