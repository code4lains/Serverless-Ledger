import Dexie, { type Table } from 'dexie';
import { Transaction, Category, Ledger, Budget } from '@ledger/shared';

/**
 * 极简记账 - 本地 IndexedDB 数据库 (基于 Dexie.js)
 * 践行《白皮书 6.1 离线优先 Offline-First》规范
 */
export class LedgerLocalDatabase extends Dexie {
  transactions!: Table<Transaction, string>;
  categories!: Table<Category, string>;
  ledgers!: Table<Ledger, string>;
  budgets!: Table<Budget, string>;

  constructor() {
    super('ServerlessLedgerDB');
    this.version(1).stores({
      transactions: 'transaction_id, user_id, ledger_id, type, transaction_date, sync_status, updated_at',
      categories: 'category_id, user_id, type, parent_id, sort_order',
      ledgers: 'ledger_id, user_id, is_default',
      budgets: 'budget_id, user_id, ledger_id, category_id, period',
    });
  }
}

export const localDb = new LedgerLocalDatabase();

/**
 * 预置本地基础分类（确保无网首次打开即可使用）
 */
export async function seedLocalCategories() {
  const count = await localDb.categories.count();
  if (count === 0) {
    const now = new Date().toISOString();
    const defaultCategories: Category[] = [
      { category_id: 'cat_exp_food', user_id: null, type: 'expense', parent_id: null, name: '餐饮美食', icon: 'Utensils', sort_order: 10, created_at: now, updated_at: now },
      { category_id: 'cat_exp_traffic', user_id: null, type: 'expense', parent_id: null, name: '交通出行', icon: 'Car', sort_order: 20, created_at: now, updated_at: now },
      { category_id: 'cat_exp_shopping', user_id: null, type: 'expense', parent_id: null, name: '购物消费', icon: 'ShoppingBag', sort_order: 30, created_at: now, updated_at: now },
      { category_id: 'cat_exp_entertain', user_id: null, type: 'expense', parent_id: null, name: '休闲娱乐', icon: 'Film', sort_order: 40, created_at: now, updated_at: now },
      { category_id: 'cat_exp_food_bf', user_id: null, type: 'expense', parent_id: 'cat_exp_food', name: '早餐', icon: 'Coffee', sort_order: 11, created_at: now, updated_at: now },
      { category_id: 'cat_exp_food_lunch', user_id: null, type: 'expense', parent_id: 'cat_exp_food', name: '午餐', icon: 'UtensilsCrossed', sort_order: 12, created_at: now, updated_at: now },
      { category_id: 'cat_inc_salary', user_id: null, type: 'income', parent_id: null, name: '职业收入', icon: 'Briefcase', sort_order: 100, created_at: now, updated_at: now },
    ];
    await localDb.categories.bulkAdd(defaultCategories);
  }
}
