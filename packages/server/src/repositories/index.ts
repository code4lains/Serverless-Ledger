import { D1UserRepository } from './D1UserRepository';
import { D1LedgerRepository } from './D1LedgerRepository';
import { D1CategoryRepository } from './D1CategoryRepository';
import { D1TransactionRepository } from './D1TransactionRepository';
import { D1BudgetRepository } from './D1BudgetRepository';
import { D1RecurringRuleRepository } from './D1RecurringRuleRepository';
import { D1InviteCodeRepository } from './D1InviteCodeRepository';
import { IStorageAdapter } from '@ledger/shared';

export * from './D1UserRepository';
export * from './D1LedgerRepository';
export * from './D1CategoryRepository';
export * from './D1TransactionRepository';
export * from './D1BudgetRepository';
export * from './D1RecurringRuleRepository';
export * from './D1InviteCodeRepository';

export interface Repositories extends IStorageAdapter {
  users: D1UserRepository;
  ledgers: D1LedgerRepository;
  categories: D1CategoryRepository;
  transactions: D1TransactionRepository;
  budgets: D1BudgetRepository;
  recurringRules: D1RecurringRuleRepository;
  inviteCodes: D1InviteCodeRepository;
}

export function getRepositories(db: D1Database): Repositories {
  return {
    users: new D1UserRepository(db),
    ledgers: new D1LedgerRepository(db),
    categories: new D1CategoryRepository(db),
    transactions: new D1TransactionRepository(db),
    budgets: new D1BudgetRepository(db),
    recurringRules: new D1RecurringRuleRepository(db),
    inviteCodes: new D1InviteCodeRepository(db),
  };
}
