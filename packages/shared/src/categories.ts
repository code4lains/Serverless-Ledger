import { Category, TransactionType } from './models.js';

/**
 * 分类树节点结构 (大类及所包含的子分类)
 */
export interface CategoryTreeNode {
  category: Category;
  children: Category[];
}

/**
 * 分类查找与元信息结构
 */
export interface CategoryMeta {
  category_id: string;
  name: string;
  icon: string;
  type: 'expense' | 'income';
  parent_id?: string | null;
  parentName?: string;
  fullPath: string; // 例如: "餐饮美食 · 早餐" 或 "职业收入"
  isParent: boolean;
}

const STATIC_TIME = '2026-08-21T00:00:00.000Z';

/**
 * 系统默认分类权威字典 (支出 9 大类 29 子类，收入 3 大类 13 子类)
 * 遵循《极简记账 APP 项目技术白皮书》3.2与7.1规范
 */
export const DEFAULT_CATEGORIES: ReadonlyArray<Category> = [
  // ================= 支出 (Expense) =================
  // 1. 餐饮美食
  { category_id: 'cat_exp_food', user_id: null, type: 'expense', parent_id: null, name: '餐饮美食', icon: 'Utensils', sort_order: 10, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_food_bf', user_id: null, type: 'expense', parent_id: 'cat_exp_food', name: '早餐', icon: 'Coffee', sort_order: 11, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_food_lunch', user_id: null, type: 'expense', parent_id: 'cat_exp_food', name: '午餐', icon: 'UtensilsCrossed', sort_order: 12, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_food_dinner', user_id: null, type: 'expense', parent_id: 'cat_exp_food', name: '晚餐', icon: 'Pizza', sort_order: 13, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_food_snack', user_id: null, type: 'expense', parent_id: 'cat_exp_food', name: '饮料零食', icon: 'CupSoda', sort_order: 14, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_food_grocery', user_id: null, type: 'expense', parent_id: 'cat_exp_food', name: '买菜食材', icon: 'Carrot', sort_order: 15, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_food_fruit', user_id: null, type: 'expense', parent_id: 'cat_exp_food', name: '水果生鲜', icon: 'Apple', sort_order: 16, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_food_takeout', user_id: null, type: 'expense', parent_id: 'cat_exp_food', name: '外卖聚餐', icon: 'Utensils', sort_order: 17, created_at: STATIC_TIME, updated_at: STATIC_TIME },

  // 2. 交通出行
  { category_id: 'cat_exp_traffic', user_id: null, type: 'expense', parent_id: null, name: '交通出行', icon: 'Car', sort_order: 20, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_tr_metro', user_id: null, type: 'expense', parent_id: 'cat_exp_traffic', name: '公交地铁', icon: 'Train', sort_order: 21, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_tr_taxi', user_id: null, type: 'expense', parent_id: 'cat_exp_traffic', name: '打车出租', icon: 'Navigation', sort_order: 22, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_tr_gas', user_id: null, type: 'expense', parent_id: 'cat_exp_traffic', name: '加油充电', icon: 'Fuel', sort_order: 23, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_tr_parking', user_id: null, type: 'expense', parent_id: 'cat_exp_traffic', name: '停车过路', icon: 'CircleParking', sort_order: 24, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_tr_bike', user_id: null, type: 'expense', parent_id: 'cat_exp_traffic', name: '单车电车', icon: 'Bike', sort_order: 25, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_tr_flight', user_id: null, type: 'expense', parent_id: 'cat_exp_traffic', name: '火车机票', icon: 'Plane', sort_order: 26, created_at: STATIC_TIME, updated_at: STATIC_TIME },

  // 3. 购物消费
  { category_id: 'cat_exp_shopping', user_id: null, type: 'expense', parent_id: null, name: '购物消费', icon: 'ShoppingBag', sort_order: 30, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_sh_daily', user_id: null, type: 'expense', parent_id: 'cat_exp_shopping', name: '日用百货', icon: 'Package', sort_order: 31, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_sh_cloth', user_id: null, type: 'expense', parent_id: 'cat_exp_shopping', name: '服饰鞋包', icon: 'Shirt', sort_order: 32, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_sh_digital', user_id: null, type: 'expense', parent_id: 'cat_exp_shopping', name: '数码家电', icon: 'Smartphone', sort_order: 33, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_sh_beauty', user_id: null, type: 'expense', parent_id: 'cat_exp_shopping', name: '美妆护肤', icon: 'Sparkles', sort_order: 34, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_sh_express', user_id: null, type: 'expense', parent_id: 'cat_exp_shopping', name: '快递邮寄', icon: 'Truck', sort_order: 35, created_at: STATIC_TIME, updated_at: STATIC_TIME },

  // 4. 休闲娱乐
  { category_id: 'cat_exp_entertain', user_id: null, type: 'expense', parent_id: null, name: '休闲娱乐', icon: 'Film', sort_order: 40, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_ent_game', user_id: null, type: 'expense', parent_id: 'cat_exp_entertain', name: '游戏娱乐', icon: 'Gamepad2', sort_order: 41, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_ent_sport', user_id: null, type: 'expense', parent_id: 'cat_exp_entertain', name: '运动健身', icon: 'Dumbbell', sort_order: 42, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_ent_travel', user_id: null, type: 'expense', parent_id: 'cat_exp_entertain', name: '旅游度假', icon: 'Plane', sort_order: 43, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_ent_movie', user_id: null, type: 'expense', parent_id: 'cat_exp_entertain', name: '电影演出', icon: 'Film', sort_order: 44, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_ent_party', user_id: null, type: 'expense', parent_id: 'cat_exp_entertain', name: '聚会社交', icon: 'PartyPopper', sort_order: 45, created_at: STATIC_TIME, updated_at: STATIC_TIME },

  // 5. 居住生活
  { category_id: 'cat_exp_housing', user_id: null, type: 'expense', parent_id: null, name: '居住生活', icon: 'Home', sort_order: 50, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_ho_rent', user_id: null, type: 'expense', parent_id: 'cat_exp_housing', name: '房租物业', icon: 'Building', sort_order: 51, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_ho_util', user_id: null, type: 'expense', parent_id: 'cat_exp_housing', name: '水电燃气', icon: 'Zap', sort_order: 52, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_ho_telecom', user_id: null, type: 'expense', parent_id: 'cat_exp_housing', name: '宽带话费', icon: 'Wifi', sort_order: 53, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_ho_furn', user_id: null, type: 'expense', parent_id: 'cat_exp_housing', name: '家居家装', icon: 'Sofa', sort_order: 54, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_ho_repair', user_id: null, type: 'expense', parent_id: 'cat_exp_housing', name: '维修保养', icon: 'Wrench', sort_order: 55, created_at: STATIC_TIME, updated_at: STATIC_TIME },

  // 6. 医疗保健
  { category_id: 'cat_exp_medical', user_id: null, type: 'expense', parent_id: null, name: '医疗保健', icon: 'HeartPulse', sort_order: 60, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_med_drug', user_id: null, type: 'expense', parent_id: 'cat_exp_medical', name: '药品购买', icon: 'Pill', sort_order: 61, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_med_treat', user_id: null, type: 'expense', parent_id: 'cat_exp_medical', name: '诊疗挂号', icon: 'Stethoscope', sort_order: 62, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_med_check', user_id: null, type: 'expense', parent_id: 'cat_exp_medical', name: '体检保健', icon: 'Activity', sort_order: 63, created_at: STATIC_TIME, updated_at: STATIC_TIME },

  // 7. 学习进修
  { category_id: 'cat_exp_education', user_id: null, type: 'expense', parent_id: null, name: '学习进修', icon: 'GraduationCap', sort_order: 70, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_edu_book', user_id: null, type: 'expense', parent_id: 'cat_exp_education', name: '书籍教材', icon: 'BookOpen', sort_order: 71, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_edu_course', user_id: null, type: 'expense', parent_id: 'cat_exp_education', name: '培训课程', icon: 'GraduationCap', sort_order: 72, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_edu_office', user_id: null, type: 'expense', parent_id: 'cat_exp_education', name: '文具办公', icon: 'PenTool', sort_order: 73, created_at: STATIC_TIME, updated_at: STATIC_TIME },

  // 8. 人情社交
  { category_id: 'cat_exp_social', user_id: null, type: 'expense', parent_id: null, name: '人情社交', icon: 'Users', sort_order: 80, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_soc_red', user_id: null, type: 'expense', parent_id: 'cat_exp_social', name: '礼金红包', icon: 'Gift', sort_order: 81, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_soc_gift', user_id: null, type: 'expense', parent_id: 'cat_exp_social', name: '请客送礼', icon: 'HeartHandshake', sort_order: 82, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_soc_elder', user_id: null, type: 'expense', parent_id: 'cat_exp_social', name: '孝敬长辈', icon: 'Heart', sort_order: 83, created_at: STATIC_TIME, updated_at: STATIC_TIME },

  // 9. 其他支出
  { category_id: 'cat_exp_other', user_id: null, type: 'expense', parent_id: null, name: '其他支出', icon: 'HelpCircle', sort_order: 90, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_oth_loss', user_id: null, type: 'expense', parent_id: 'cat_exp_other', name: '意外丢失', icon: 'AlertCircle', sort_order: 91, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_exp_oth_misc', user_id: null, type: 'expense', parent_id: 'cat_exp_other', name: '其它消费', icon: 'Tag', sort_order: 92, created_at: STATIC_TIME, updated_at: STATIC_TIME },

  // ================= 收入 (Income) =================
  // 1. 职业收入
  { category_id: 'cat_inc_salary', user_id: null, type: 'income', parent_id: null, name: '职业收入', icon: 'Briefcase', sort_order: 100, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_inc_sal_base', user_id: null, type: 'income', parent_id: 'cat_inc_salary', name: '基本工资', icon: 'Banknote', sort_order: 101, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_inc_sal_bonus', user_id: null, type: 'income', parent_id: 'cat_inc_salary', name: '奖金补贴', icon: 'Coins', sort_order: 102, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_inc_sal_part', user_id: null, type: 'income', parent_id: 'cat_inc_salary', name: '兼职副业', icon: 'Laptop', sort_order: 103, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_inc_sal_annual', user_id: null, type: 'income', parent_id: 'cat_inc_salary', name: '年终分红', icon: 'Award', sort_order: 104, created_at: STATIC_TIME, updated_at: STATIC_TIME },

  // 2. 理财收益
  { category_id: 'cat_inc_invest', user_id: null, type: 'income', parent_id: null, name: '理财收益', icon: 'TrendingUp', sort_order: 110, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_inc_inv_stock', user_id: null, type: 'income', parent_id: 'cat_inc_invest', name: '基金股票', icon: 'LineChart', sort_order: 111, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_inc_inv_interest', user_id: null, type: 'income', parent_id: 'cat_inc_invest', name: '利息分红', icon: 'PiggyBank', sort_order: 112, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_inc_inv_rent', user_id: null, type: 'income', parent_id: 'cat_inc_invest', name: '房租收益', icon: 'Building2', sort_order: 113, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_inc_inv_claim', user_id: null, type: 'income', parent_id: 'cat_inc_invest', name: '保险理赔', icon: 'ShieldCheck', sort_order: 114, created_at: STATIC_TIME, updated_at: STATIC_TIME },

  // 3. 其他收入
  { category_id: 'cat_inc_other', user_id: null, type: 'income', parent_id: null, name: '其他收入', icon: 'Gift', sort_order: 120, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_inc_oth_red', user_id: null, type: 'income', parent_id: 'cat_inc_other', name: '收到红包', icon: 'Gift', sort_order: 121, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_inc_oth_refund', user_id: null, type: 'income', parent_id: 'cat_inc_other', name: '退款返还', icon: 'RotateCcw', sort_order: 122, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_inc_oth_second', user_id: null, type: 'income', parent_id: 'cat_inc_other', name: '闲置二手', icon: 'Store', sort_order: 123, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_inc_oth_windfall', user_id: null, type: 'income', parent_id: 'cat_inc_other', name: '意外所得', icon: 'Sparkles', sort_order: 124, created_at: STATIC_TIME, updated_at: STATIC_TIME },
  { category_id: 'cat_inc_oth_misc', user_id: null, type: 'income', parent_id: 'cat_inc_other', name: '其它入账', icon: 'Tag', sort_order: 125, created_at: STATIC_TIME, updated_at: STATIC_TIME },
];

/**
 * 获取系统默认分类的深拷贝副本
 */
export function getDefaultCategories(): Category[] {
  return JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
}

/**
 * 获取默认支出分类
 */
export function getDefaultExpenseCategories(): Category[] {
  return getDefaultCategories().filter((c) => c.type === 'expense');
}

/**
 * 获取默认收入分类
 */
export function getDefaultIncomeCategories(): Category[] {
  return getDefaultCategories().filter((c) => c.type === 'income');
}

/**
 * 获取指定类型的首选默认分类 ID
 */
export function getInitialCategoryId(type: TransactionType = 'expense', customCategories?: Category[]): string {
  const list = customCategories && customCategories.length > 0 ? customCategories : DEFAULT_CATEGORIES;
  const targetType = type === 'income' ? 'income' : 'expense';
  const match = list.find((c) => c.type === targetType && !c.parent_id);
  return match?.category_id || (targetType === 'expense' ? 'cat_exp_food' : 'cat_inc_salary');
}

/**
 * 将扁平分类数组组织成二级树状结构 (大类 -> 子类数组)
 */
export function buildCategoryTree(categories: Category[], type?: 'expense' | 'income'): CategoryTreeNode[] {
  const filtered = type ? categories.filter((c) => c.type === type) : categories;
  const parentNodes: CategoryTreeNode[] = [];
  const parentMap = new Map<string, CategoryTreeNode>();

  // 1. 提取所有大类
  for (const cat of filtered) {
    if (!cat.parent_id) {
      const node: CategoryTreeNode = { category: cat, children: [] };
      parentNodes.push(node);
      parentMap.set(cat.category_id, node);
    }
  }

  // 2. 挂载所有子类
  for (const cat of filtered) {
    if (cat.parent_id && parentMap.has(cat.parent_id)) {
      parentMap.get(cat.parent_id)!.children.push(cat);
    }
  }

  // 3. 排序 (按 sort_order 升序)
  parentNodes.sort((a, b) => a.category.sort_order - b.category.sort_order);
  for (const node of parentNodes) {
    node.children.sort((a, b) => a.sort_order - b.sort_order);
  }

  return parentNodes;
}

/**
 * 根据 ID 解析分类的完整元数据（包含大类名称、路径、图标等）
 */
export function getCategoryMeta(
  categoryId?: string | null,
  categoriesList?: Category[],
  fallbackType: TransactionType = 'expense'
): CategoryMeta {
  const list = categoriesList && categoriesList.length > 0 ? categoriesList : DEFAULT_CATEGORIES;
  const defaultExpenseName = '日常支出';
  const defaultIncomeName = '日常收入';

  if (!categoryId) {
    const isExp = fallbackType === 'expense';
    return {
      category_id: '',
      name: isExp ? defaultExpenseName : defaultIncomeName,
      icon: 'Tag',
      type: isExp ? 'expense' : 'income',
      fullPath: isExp ? defaultExpenseName : defaultIncomeName,
      isParent: true,
    };
  }

  const current = list.find((c) => c.category_id === categoryId);
  if (!current) {
    return {
      category_id: categoryId,
      name: '分类',
      icon: 'Tag',
      type: fallbackType === 'income' ? 'income' : 'expense',
      fullPath: '分类',
      isParent: false,
    };
  }

  if (current.parent_id) {
    const parent = list.find((c) => c.category_id === current.parent_id);
    const parentName = parent?.name || '分类';
    return {
      category_id: current.category_id,
      name: current.name,
      icon: current.icon || parent?.icon || 'Tag',
      type: current.type,
      parent_id: current.parent_id,
      parentName,
      fullPath: `${parentName} · ${current.name}`,
      isParent: false,
    };
  }

  return {
    category_id: current.category_id,
    name: current.name,
    icon: current.icon || 'Tag',
    type: current.type,
    fullPath: current.name,
    isParent: true,
  };
}
