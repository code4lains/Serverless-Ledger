/**
 * 账盾 - 存储抽象接口与仓库定义 (Storage Repository Interfaces)
 * 遵循《账盾 v2 架构设计》与 Repository 模式规范
 */

import {
  User,
  Ledger,
  CreateLedgerRequest,
  UpdateLedgerRequest,
  Category,
  CreateCategoryRequest,
  UpdateCategoryRequest,
  ReorderCategoryItem,
  Transaction,
  TransactionFilter,
  Budget,
  BudgetPeriod,
  SetBudgetItem,
  RecurringRule,
  CreateRecurringRuleRequest,
  UpdateRecurringRuleRequest,
  InviteCode,
} from './models';

// ======================= 用户仓库接口 =======================
export interface IUserRepository {
  findById(userId: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  create(user: {
    user_id: string;
    email: string;
    password_hash: string;
    invited_by?: string | null;
    recovery_code?: string | null;
    created_at?: string;
    updated_at?: string;
  }): Promise<User>;
  updatePassword(userId: string, passwordHash: string): Promise<boolean>;
  updateRecoveryCode(userId: string, recoveryCode: string | null): Promise<boolean>;
  delete(userId: string): Promise<boolean>;
}

// ======================= 账本仓库接口 =======================
export interface ILedgerRepository {
  findById(ledgerId: string, userId?: string): Promise<Ledger | null>;
  findByUserId(userId: string): Promise<Ledger[]>;
  create(userId: string, req: CreateLedgerRequest): Promise<Ledger>;
  update(ledgerId: string, userId: string, req: UpdateLedgerRequest): Promise<Ledger | null>;
  delete(ledgerId: string, userId: string): Promise<boolean>;
  setDefault(ledgerId: string, userId: string): Promise<boolean>;
  getDefault(userId: string): Promise<Ledger | null>;
  merge(userId: string, req: { source_ledger_id: string; target_ledger_id: string; delete_source?: boolean }): Promise<{ success: boolean; mergedTransactionCount: number; error?: string }>;
}

// ======================= 分类仓库接口 =======================
export interface ICategoryRepository {
  findById(categoryId: string, userId?: string): Promise<Category | null>;
  findByUserId(userId?: string): Promise<Category[]>;
  create(userId: string | null, req: CreateCategoryRequest): Promise<Category>;
  update(categoryId: string, userId: string | null, req: UpdateCategoryRequest): Promise<Category | null>;
  delete(categoryId: string, userId: string | null): Promise<boolean>;
  reorder(userId: string | null, items: ReorderCategoryItem[]): Promise<boolean>;
  batchPut?(categories: Category[]): Promise<void>;
}

// ======================= 账单流水仓库接口 =======================
export interface ITransactionRepository {
  findById(transactionId: string, userId?: string): Promise<Transaction | null>;
  query(userId: string, filter?: TransactionFilter): Promise<Transaction[]>;
  count(userId: string, filter?: TransactionFilter): Promise<number>;
  create(userId: string, tx: Partial<Transaction> & { transaction_id: string; ledger_id: string; type: any; amount: number; transaction_date: string }): Promise<Transaction>;
  update(transactionId: string, userId: string, tx: Partial<Transaction>): Promise<Transaction | null>;
  delete(transactionId: string, userId: string): Promise<boolean>;
  batchUpsert(userId: string, transactions: Transaction[]): Promise<{ synced_ids: string[]; count: number }>;
  batchDelete?(transactionIds: string[], userId: string): Promise<number>;
  getLatestUpdatedTime?(userId: string): Promise<string | null>;
}

// ======================= 预算仓库接口 =======================
export interface IBudgetRepository {
  findById(budgetId: string, userId?: string): Promise<Budget | null>;
  findByLedgerAndPeriod(userId: string, ledgerId: string, period: BudgetPeriod): Promise<Budget[]>;
  findByUser(userId: string): Promise<Budget[]>;
  createOrUpdate(userId: string, ledgerId: string, period: BudgetPeriod, categoryId: string | null, amount: number): Promise<Budget>;
  batchSet(userId: string, ledgerId: string, period: BudgetPeriod, budgets: SetBudgetItem[]): Promise<Budget[]>;
  delete(budgetId: string, userId: string): Promise<boolean>;
  deleteByLedger(ledgerId: string, userId: string): Promise<number>;
}

// ======================= 周期记账规则仓库接口 =======================
export interface IRecurringRuleRepository {
  findById(ruleId: string, userId?: string): Promise<RecurringRule | null>;
  findByUserId(userId: string): Promise<RecurringRule[]>;
  create(userId: string, req: CreateRecurringRuleRequest): Promise<RecurringRule>;
  update(ruleId: string, userId: string, req: UpdateRecurringRuleRequest): Promise<RecurringRule | null>;
  delete(ruleId: string, userId: string): Promise<boolean>;
  getDueRules(userId?: string, targetDate?: string): Promise<RecurringRule[]>;
  updateNextRunDate(ruleId: string, nextRunDate: string, lastRunDate?: string): Promise<boolean>;
}

// ======================= 邀请码仓库接口 =======================
export interface IInviteCodeRepository {
  findByCode(code: string): Promise<InviteCode | null>;
  findByCreator(creatorId: string): Promise<InviteCode[]>;
  create(creatorId: string, code: string): Promise<InviteCode>;
  markUsed(code: string, usedByUserId: string): Promise<boolean>;
  countByCreator(creatorId: string): Promise<number>;
}

// ======================= 聚合存储适配器接口 =======================
export interface IStorageAdapter {
  users: IUserRepository;
  ledgers: ILedgerRepository;
  categories: ICategoryRepository;
  transactions: ITransactionRepository;
  budgets: IBudgetRepository;
  recurringRules: IRecurringRuleRepository;
  inviteCodes: IInviteCodeRepository;
}

// ======================= 同步适配器接口 =======================
export type SyncProviderType = 'none' | 'cloudflare_d1' | 'webdav' | 'custom';

export interface SyncConfig {
  provider: SyncProviderType;
  serverUrl?: string;
  authToken?: string;
  autoSyncEnabled?: boolean;
  syncIntervalSeconds?: number;
  lastSyncedAt?: string | null;
}

export interface SyncPullResult {
  transactions: Transaction[];
  ledgers: Ledger[];
  categories: Category[];
  budgets: Budget[];
  recurringRules: RecurringRule[];
  serverTime: string;
}

export interface SyncPushResult {
  syncedTransactionIds: string[];
  serverTime: string;
}

export interface ISyncAdapter {
  readonly provider: SyncProviderType;
  testConnection(): Promise<{ success: boolean; message: string; latencyMs?: number }>;
  pushChanges(changes: {
    transactions?: Transaction[];
    mutations?: Array<{ entity_type: string; entity_id: string; action: string; payload?: any }>;
  }): Promise<SyncPushResult>;
  pullChanges(lastSyncedAt?: string | null): Promise<SyncPullResult>;
  getServerTime(): Promise<string>;
}
