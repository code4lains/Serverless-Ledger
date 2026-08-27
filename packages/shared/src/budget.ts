import {
  Budget,
  BudgetPeriod,
  BudgetStatus,
  BudgetProgressItem,
  BudgetOverview,
  Category,
  Transaction,
} from './models.js';
import { parseLocalDate } from './utils.js';

/**
 * 预算预警状态判断 (遵循白皮书 3.4 规范：达到 80% 或超支时触发预警)
 * @param spentAmount 已花费金额 (分)
 * @param budgetAmount 预算总额 (分)
 */
export function getBudgetStatus(spentAmount: number, budgetAmount: number): BudgetStatus {
  if (budgetAmount <= 0) {
    return spentAmount > 0 ? 'exceeded' : 'normal';
  }
  if (spentAmount > budgetAmount) {
    return 'exceeded';
  }
  if (spentAmount / budgetAmount >= 0.8) {
    return 'warning';
  }
  return 'normal';
}

/**
 * 获取预算状态对应的语义化配色与样式标识 (莫兰迪风格)
 */
export function getBudgetStatusMeta(status: BudgetStatus) {
  switch (status) {
    case 'exceeded':
      return {
        label: '已超支',
        badgeBg: 'bg-red-50 dark:bg-red-950/40',
        badgeText: 'text-red-600 dark:text-red-400',
        barColor: '#EF4444', // Red-500
        textColor: 'text-red-600 dark:text-red-400',
        bgColor: 'bg-red-500',
      };
    case 'warning':
      return {
        label: '预警',
        badgeBg: 'bg-amber-50 dark:bg-amber-950/40',
        badgeText: 'text-amber-600 dark:text-amber-400',
        barColor: '#F59E0B', // Amber-500
        textColor: 'text-amber-600 dark:text-amber-400',
        bgColor: 'bg-amber-500',
      };
    case 'normal':
    default:
      return {
        label: '正常',
        badgeBg: 'bg-emerald-50 dark:bg-emerald-950/40',
        badgeText: 'text-emerald-600 dark:text-emerald-400',
        barColor: '#6366F1', // Indigo-500 (莫兰迪极简主色)
        textColor: 'text-indigo-600 dark:text-indigo-400',
        bgColor: 'bg-indigo-600',
      };
  }
}

export interface BudgetCalculateOptions {
  ledgerId?: string;
  period?: BudgetPeriod;
  year?: number;
  month?: number; // 0-indexed (0 为 1月, 11 为 12月)
}

/**
 * 核心预算汇总与进度计算引擎
 * 支持将小分类消费自动归集汇总至对应支出大分类，并计算总预算与大分类预算消耗进度及预警
 */
export function calculateBudgetOverview(
  budgets: Budget[],
  transactions: Transaction[],
  categories: Category[],
  options: BudgetCalculateOptions = {}
): BudgetOverview {
  const period: BudgetPeriod = options.period || 'monthly';
  const now = new Date();
  const targetYear = options.year !== undefined ? options.year : now.getFullYear();
  const targetMonth = options.month !== undefined ? options.month : now.getMonth();

  // 1. 构建分类映射字典与大分类归集映射
  const categoryMap = new Map<string, Category>();
  const childToParentMap = new Map<string, string>(); // category_id -> major_category_id

  for (const cat of categories) {
    categoryMap.set(cat.category_id, cat);
    if (cat.parent_id) {
      childToParentMap.set(cat.category_id, cat.parent_id);
    } else {
      childToParentMap.set(cat.category_id, cat.category_id);
    }
  }

  // 2. 筛选对应周期与账本的支出流水
  const filteredExpenses = transactions.filter((tx) => {
    if (tx.type !== 'expense') return false;

    // 账本过滤
    if (options.ledgerId && options.ledgerId !== 'all' && tx.ledger_id !== options.ledgerId) {
      return false;
    }

    // 周期过滤 (默认按月度)
    if (period === 'monthly') {
      const txDate = parseLocalDate(tx.transaction_date);
      if (isNaN(txDate.getTime())) return false;
      return txDate.getFullYear() === targetYear && txDate.getMonth() === targetMonth;
    } else if (period === 'yearly') {
      const txDate = parseLocalDate(tx.transaction_date);
      if (isNaN(txDate.getTime())) return false;
      return txDate.getFullYear() === targetYear;
    }

    return true;
  });

  // 3. 聚合计算总支出与各大分类支出
  let totalExpenseSpent = 0;
  const majorCategorySpentMap = new Map<string, number>();

  for (const tx of filteredExpenses) {
    const amount = Number(tx.amount) || 0;
    totalExpenseSpent += amount;

    // 确定归属大分类 ID
    const catId = tx.category_id;
    const majorCatId = catId ? childToParentMap.get(catId) || catId : 'cat_exp_other';

    const currentSpent = majorCategorySpentMap.get(majorCatId) || 0;
    majorCategorySpentMap.set(majorCatId, currentSpent + amount);
  }

  // 4. 筛选对应账本和周期的预算项
  const targetBudgets = budgets.filter((b) => {
    if (b.period !== period) return false;
    if (options.ledgerId && options.ledgerId !== 'all' && b.ledger_id !== options.ledgerId) {
      return false;
    }
    return true;
  });

  // 5. 计算总预算进度 (category_id 为 null 或 undefined，支持多账本聚合累加)
  const totalBudgetRecords = targetBudgets.filter((b) => !b.category_id);
  let totalBudgetProgress: BudgetProgressItem | null = null;
  const totalBudgetAmount = totalBudgetRecords.reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  if (totalBudgetRecords.length > 0 && totalBudgetAmount > 0) {
    const budgetAmount = totalBudgetAmount;
    const spentAmount = totalExpenseSpent;
    const remainingAmount = budgetAmount - spentAmount;
    const percentage = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;
    const status = getBudgetStatus(spentAmount, budgetAmount);

    totalBudgetProgress = {
      budget_id: totalBudgetRecords[0].budget_id,
      category_id: null,
      category_name: period === 'monthly' ? '月度总预算' : '年度总预算',
      is_total: true,
      budget_amount: budgetAmount,
      spent_amount: spentAmount,
      remaining_amount: remainingAmount,
      percentage,
      status,
    };
  }

  // 6. 计算各大分类预算进度 (按 category_id 聚合累加，防止多账本重复卡片与限额失真)
  const categoryBudgetMap = new Map<string, { totalAmount: number; sampleBudget: Budget }>();
  for (const b of targetBudgets) {
    if (!b.category_id) continue;
    const catId = b.category_id;
    const amount = Number(b.amount) || 0;
    if (amount <= 0) continue;

    const existing = categoryBudgetMap.get(catId);
    if (existing) {
      existing.totalAmount += amount;
    } else {
      categoryBudgetMap.set(catId, { totalAmount: amount, sampleBudget: b });
    }
  }

  const categoryBudgets: BudgetProgressItem[] = [];
  let totalCategoryBudgetSum = 0;

  for (const [catId, { totalAmount: budgetAmount, sampleBudget }] of categoryBudgetMap.entries()) {
    const cat = categoryMap.get(catId);
    totalCategoryBudgetSum += budgetAmount;
    const spentAmount = majorCategorySpentMap.get(catId) || 0;
    const remainingAmount = budgetAmount - spentAmount;
    const percentage = budgetAmount > 0 ? (spentAmount / budgetAmount) * 100 : 0;
    const status = getBudgetStatus(spentAmount, budgetAmount);

    categoryBudgets.push({
      budget_id: sampleBudget.budget_id,
      category_id: catId,
      category_name: cat ? cat.name : '未知分类',
      category_icon: cat?.icon || 'Tag',
      category_color: cat?.color || null,
      is_total: false,
      budget_amount: budgetAmount,
      spent_amount: spentAmount,
      remaining_amount: remainingAmount,
      percentage,
      status,
    });
  }

  // 按状态严重程度排序：超支 (exceeded) > 预警 (warning) > 正常 (normal)，同状态按百分比降序
  const statusPriority: Record<BudgetStatus, number> = {
    exceeded: 3,
    warning: 2,
    normal: 1,
  };

  categoryBudgets.sort((a, b) => {
    const pDiff = statusPriority[b.status] - statusPriority[a.status];
    if (pDiff !== 0) return pDiff;
    return b.percentage - a.percentage;
  });

  const hasAnyBudget = totalBudgetProgress !== null || categoryBudgets.length > 0;

  return {
    totalBudget: totalBudgetProgress,
    categoryBudgets,
    hasAnyBudget,
    totalCategoryBudgetSum,
    period,
  };
}
