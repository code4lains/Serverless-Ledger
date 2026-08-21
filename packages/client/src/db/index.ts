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
      transactions: 'transaction_id, user_id, ledger_id, type, category_id, transaction_date, sync_status, updated_at',
      categories: 'category_id, user_id, type, parent_id, sort_order',
      ledgers: 'ledger_id, user_id, is_default',
      budgets: 'budget_id, user_id, ledger_id, category_id, period',
    });
  }
}

export const localDb = new LedgerLocalDatabase();

/**
 * 预置本地基础分类（确保无网首次打开即可使用大类+小类二级联动）
 */
export async function seedLocalCategories() {
  const count = await localDb.categories.count();
  if (count === 0) {
    const now = new Date().toISOString();
    const defaultCategories: Category[] = [
      // 支出大类
      { category_id: 'cat_exp_food', user_id: null, type: 'expense', parent_id: null, name: '餐饮美食', icon: 'Utensils', sort_order: 10, created_at: now, updated_at: now },
      { category_id: 'cat_exp_traffic', user_id: null, type: 'expense', parent_id: null, name: '交通出行', icon: 'Car', sort_order: 20, created_at: now, updated_at: now },
      { category_id: 'cat_exp_shopping', user_id: null, type: 'expense', parent_id: null, name: '购物消费', icon: 'ShoppingBag', sort_order: 30, created_at: now, updated_at: now },
      { category_id: 'cat_exp_entertain', user_id: null, type: 'expense', parent_id: null, name: '休闲娱乐', icon: 'Film', sort_order: 40, created_at: now, updated_at: now },
      { category_id: 'cat_exp_housing', user_id: null, type: 'expense', parent_id: null, name: '居住生活', icon: 'Home', sort_order: 50, created_at: now, updated_at: now },

      // 餐饮子分类
      { category_id: 'cat_exp_food_bf', user_id: null, type: 'expense', parent_id: 'cat_exp_food', name: '早餐', icon: 'Coffee', sort_order: 11, created_at: now, updated_at: now },
      { category_id: 'cat_exp_food_lunch', user_id: null, type: 'expense', parent_id: 'cat_exp_food', name: '午餐', icon: 'UtensilsCrossed', sort_order: 12, created_at: now, updated_at: now },
      { category_id: 'cat_exp_food_dinner', user_id: null, type: 'expense', parent_id: 'cat_exp_food', name: '晚餐', icon: 'Pizza', sort_order: 13, created_at: now, updated_at: now },
      { category_id: 'cat_exp_food_drink', user_id: null, type: 'expense', parent_id: 'cat_exp_food', name: '饮料零食', icon: 'CupSoda', sort_order: 14, created_at: now, updated_at: now },

      // 交通子分类
      { category_id: 'cat_exp_tr_metro', user_id: null, type: 'expense', parent_id: 'cat_exp_traffic', name: '公交地铁', icon: 'Train', sort_order: 21, created_at: now, updated_at: now },
      { category_id: 'cat_exp_tr_taxi', user_id: null, type: 'expense', parent_id: 'cat_exp_traffic', name: '打车出租', icon: 'Navigation', sort_order: 22, created_at: now, updated_at: now },
      { category_id: 'cat_exp_tr_gas', user_id: null, type: 'expense', parent_id: 'cat_exp_traffic', name: '加油充电', icon: 'Fuel', sort_order: 23, created_at: now, updated_at: now },

      // 购物子分类
      { category_id: 'cat_exp_sh_daily', user_id: null, type: 'expense', parent_id: 'cat_exp_shopping', name: '日用百货', icon: 'Package', sort_order: 31, created_at: now, updated_at: now },
      { category_id: 'cat_exp_sh_cloth', user_id: null, type: 'expense', parent_id: 'cat_exp_shopping', name: '服饰鞋包', icon: 'Shirt', sort_order: 32, created_at: now, updated_at: now },
      { category_id: 'cat_exp_sh_digital', user_id: null, type: 'expense', parent_id: 'cat_exp_shopping', name: '数码家电', icon: 'Smartphone', sort_order: 33, created_at: now, updated_at: now },

      // 娱乐子分类
      { category_id: 'cat_exp_ent_game', user_id: null, type: 'expense', parent_id: 'cat_exp_entertain', name: '游戏娱乐', icon: 'Gamepad2', sort_order: 41, created_at: now, updated_at: now },
      { category_id: 'cat_exp_ent_sport', user_id: null, type: 'expense', parent_id: 'cat_exp_entertain', name: '运动健身', icon: 'Dumbbell', sort_order: 42, created_at: now, updated_at: now },
      { category_id: 'cat_exp_ent_travel', user_id: null, type: 'expense', parent_id: 'cat_exp_entertain', name: '旅游度假', icon: 'Plane', sort_order: 43, created_at: now, updated_at: now },

      // 居住子分类
      { category_id: 'cat_exp_ho_rent', user_id: null, type: 'expense', parent_id: 'cat_exp_housing', name: '房租物业', icon: 'Building', sort_order: 51, created_at: now, updated_at: now },
      { category_id: 'cat_exp_ho_util', user_id: null, type: 'expense', parent_id: 'cat_exp_housing', name: '水电燃气', icon: 'Zap', sort_order: 52, created_at: now, updated_at: now },

      // 收入大类
      { category_id: 'cat_inc_salary', user_id: null, type: 'income', parent_id: null, name: '职业收入', icon: 'Briefcase', sort_order: 100, created_at: now, updated_at: now },
      { category_id: 'cat_inc_invest', user_id: null, type: 'income', parent_id: null, name: '理财收益', icon: 'TrendingUp', sort_order: 110, created_at: now, updated_at: now },
      { category_id: 'cat_inc_other', user_id: null, type: 'income', parent_id: null, name: '其他收入', icon: 'Gift', sort_order: 120, created_at: now, updated_at: now },

      // 收入子分类
      { category_id: 'cat_inc_sal_base', user_id: null, type: 'income', parent_id: 'cat_inc_salary', name: '基本工资', icon: 'Banknote', sort_order: 101, created_at: now, updated_at: now },
      { category_id: 'cat_inc_sal_bonus', user_id: null, type: 'income', parent_id: 'cat_inc_salary', name: '奖金补贴', icon: 'Coins', sort_order: 102, created_at: now, updated_at: now },
      { category_id: 'cat_inc_sal_part', user_id: null, type: 'income', parent_id: 'cat_inc_salary', name: '兼职副业', icon: 'Laptop', sort_order: 103, created_at: now, updated_at: now },
      { category_id: 'cat_inc_inv_stock', user_id: null, type: 'income', parent_id: 'cat_inc_invest', name: '基金股票', icon: 'LineChart', sort_order: 111, created_at: now, updated_at: now },
      { category_id: 'cat_inc_inv_interest', user_id: null, type: 'income', parent_id: 'cat_inc_invest', name: '利息分红', icon: 'PiggyBank', sort_order: 112, created_at: now, updated_at: now },
      { category_id: 'cat_inc_oth_red', user_id: null, type: 'income', parent_id: 'cat_inc_other', name: '收到红包', icon: 'Gift', sort_order: 121, created_at: now, updated_at: now },
      { category_id: 'cat_inc_oth_refund', user_id: null, type: 'income', parent_id: 'cat_inc_other', name: '退款返还', icon: 'RotateCcw', sort_order: 122, created_at: now, updated_at: now },
    ];
    await localDb.categories.bulkPut(defaultCategories);
  }
}
