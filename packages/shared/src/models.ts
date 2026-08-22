/**
 * 账盾 - 数据模型与类型定义
 * 遵循《项目技术白皮书》规范
 */

export type TransactionType = 'expense' | 'income' | 'transfer' | 'loan';
export type BudgetPeriod = 'monthly' | 'yearly';
export type SyncStatus = 'synced' | 'pending' | 'conflict';

export type CategoryType = 'expense' | 'income' | 'transfer' | 'loan';
export type LoanType = 'lend' | 'borrow' | 'repay' | 'collect';

/**
 * 1. 用户表模型
 */
export interface User {
  user_id: string;
  email: string;
  password_hash?: string;
  created_at: string;
  updated_at: string;
}

/**
 * 2. 账本表模型
 */
export interface Ledger {
  ledger_id: string;
  user_id: string;
  name: string;
  currency: string;
  is_default: number; // 1: 是, 0: 否
  created_at: string;
  updated_at: string;
}

export interface CreateLedgerRequest {
  ledger_id?: string;
  name: string;
  currency?: string;
  is_default?: number;
}

export interface UpdateLedgerRequest {
  name?: string;
  currency?: string;
  is_default?: number;
}

export interface LedgerSummary {
  ledger: Ledger;
  transaction_count: number;
  totalExpense: number; // 分
  totalIncome: number; // 分
  balance: number; // 分
}

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: 'CNY', name: '人民币 (CNY)', symbol: '¥' },
  { code: 'USD', name: '美元 (USD)', symbol: '$' },
  { code: 'EUR', name: '欧元 (EUR)', symbol: '€' },
  { code: 'GBP', name: '英镑 (GBP)', symbol: '£' },
  { code: 'JPY', name: '日元 (JPY)', symbol: '¥' },
  { code: 'HKD', name: '港币 (HKD)', symbol: 'HK$' },
];

export interface LedgerTemplate {
  name: string;
  icon: string;
  description: string;
  currency: string;
}

export const LEDGER_TEMPLATES: LedgerTemplate[] = [
  { name: '日常账本', icon: 'BookOpen', description: '日常餐饮、交通与日用消费', currency: 'CNY' },
  { name: '家庭账本', icon: 'Home', description: '家庭共同开销与水电柴米', currency: 'CNY' },
  { name: '旅游账本', icon: 'Plane', description: '旅行出游、机票酒店专账', currency: 'CNY' },
  { name: '装修账本', icon: 'Hammer', description: '新房建材、家电软装预算专账', currency: 'CNY' },
  { name: '生意账本', icon: 'Briefcase', description: '副业进货、店铺周转经营账', currency: 'CNY' },
  { name: '借贷专账', icon: 'Landmark', description: '应收应付、人情借款明细', currency: 'CNY' },
];

/**
 * 3. 分类表模型 (支持大类/小类二级结构)
 */
export interface Category {
  category_id: string;
  user_id?: string | null; // null 表示系统预置分类
  type: CategoryType;
  parent_id?: string | null; // null 为大分类，有值为小分类
  name: string;
  icon?: string;
  color?: string | null; // 分类个性化强调颜色
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface CreateCategoryRequest {
  category_id?: string;
  name: string;
  type: CategoryType;
  parent_id?: string | null;
  icon?: string | null;
  color?: string | null;
  sort_order?: number;
}

export interface UpdateCategoryRequest {
  name?: string;
  icon?: string | null;
  color?: string | null;
  parent_id?: string | null;
  sort_order?: number;
}

export interface ReorderCategoryItem {
  category_id: string;
  sort_order: number;
}

export interface ReorderCategoriesRequest {
  items: ReorderCategoryItem[];
}

/**
 * 4. 账单流水表模型 (核心表)
 * 注意：金额 amount 必须以“分”为单位以整数 Integer 存储，避免浮点数精度丢失
 */
export interface Transaction {
  transaction_id: string;
  user_id: string;
  ledger_id: string;
  type: TransactionType;
  amount: number; // 单位：分 (例如 12.34 元存为 1234)
  category_id?: string | null;
  from_account?: string | null;
  to_account?: string | null;
  transaction_date: string; // ISO 8601 格式或 YYYY-MM-DD
  remark?: string | null;
  sync_status: SyncStatus;
  created_at: string;
  updated_at: string;
}

/**
 * 5. 预算表模型
 */
export interface Budget {
  budget_id: string;
  user_id: string;
  ledger_id: string;
  category_id?: string | null; // null 表示账本总预算，有值表示大分类预算
  period: BudgetPeriod;
  amount: number; // 单位：分
  created_at: string;
  updated_at: string;
}

export interface CreateBudgetRequest {
  budget_id?: string;
  ledger_id: string;
  category_id?: string | null;
  period: BudgetPeriod;
  amount: number;
}

export interface UpdateBudgetRequest {
  amount?: number;
  period?: BudgetPeriod;
}

export interface SetBudgetItem {
  category_id?: string | null; // null 表示账本总预算，有值为大分类 ID
  amount: number; // 单位：分
}

export interface BatchSetBudgetRequest {
  ledger_id: string;
  period: BudgetPeriod;
  budgets: SetBudgetItem[];
}

export type BudgetStatus = 'normal' | 'warning' | 'exceeded';

export interface BudgetProgressItem {
  budget_id?: string;
  category_id: string | null; // null: 账本总预算, string: 大分类 ID
  category_name: string;
  category_icon?: string;
  category_color?: string | null;
  is_total: boolean;
  budget_amount: number; // 预算金额 (分)
  spent_amount: number;  // 已花费金额 (分)
  remaining_amount: number; // 剩余金额 (分, 超支时为负)
  percentage: number; // 百分比 (0 ~ 100+%)
  status: BudgetStatus; // normal: <80%, warning: 80%~100%, exceeded: >100%
}

export interface BudgetOverview {
  totalBudget: BudgetProgressItem | null;
  categoryBudgets: BudgetProgressItem[];
  hasAnyBudget: boolean;
  totalCategoryBudgetSum: number; // 分类预算之和 (分)
  period: BudgetPeriod;
}

/**
 * 标准通用 API 响应
 */
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

/**
 * 离线批量同步请求与响应 Payload
 */
export interface SyncBatchRequest {
  transactions: Transaction[];
  last_synced_at?: string;
}

export interface SyncBatchResponse {
  synced_ids: string[];
  server_transactions: Transaction[];
  server_time: string;
}

/**
 * 认证相关数据结构
 */
export interface AuthUser {
  user_id: string;
  email: string;
  created_at: string;
  default_ledger_id?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name?: string;
  turnstile_token?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
  turnstile_token?: string;
}

export interface AuthResponse {
  user: AuthUser;
  token: string;
  expires_in: number;
}

export interface TransactionFilter {
  ledger_id?: string;
  type?: TransactionType | 'all';
  category_id?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
}

export interface TransactionDayGroup {
  date: string; // YYYY-MM-DD
  displayDate: string; // e.g. "今天 · 8月21日 星期五"
  totalExpense: number; // 分
  totalIncome: number; // 分
  totalTransfer: number; // 分
  transactions: Transaction[];
}

export interface TotalsSummary {
  totalExpense: number; // 分
  totalIncome: number; // 分
  totalTransfer: number; // 分
  totalLoanLent: number; // 借出 (流出)
  totalLoanBorrowed: number; // 借入 (流入)
  totalLoanRepaid: number; // 还款 (流出)
  totalLoanCollected: number; // 收款 (流入)
  balance: number; // 结余 (分)
}
