import {
  Budget,
  BudgetPeriod,
  SetBudgetItem,
  IBudgetRepository,
} from '@ledger/shared';

export class D1BudgetRepository implements IBudgetRepository {
  constructor(protected db: D1Database) {}

  async findById(budgetId: string, userId?: string): Promise<Budget | null> {
    let query = 'SELECT * FROM budgets WHERE budget_id = ?';
    const params: any[] = [budgetId];
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    const budget = await this.db.prepare(query).bind(...params).first<Budget>();
    return budget || null;
  }

  async findByLedgerAndPeriod(userId: string, ledgerId: string, period: BudgetPeriod): Promise<Budget[]> {
    const { results } = await this.db
      .prepare(
        'SELECT * FROM budgets WHERE user_id = ? AND ledger_id = ? AND period = ? ORDER BY (category_id IS NOT NULL) ASC, created_at ASC'
      )
      .bind(userId, ledgerId, period)
      .all<Budget>();
    return results || [];
  }

  async findByUser(userId: string, ledgerId?: string, period?: BudgetPeriod): Promise<Budget[]> {
    let query = 'SELECT * FROM budgets WHERE user_id = ?';
    const params: any[] = [userId];

    if (ledgerId && ledgerId !== 'all') {
      query += ' AND ledger_id = ?';
      params.push(ledgerId);
    }

    if (period) {
      query += ' AND period = ?';
      params.push(period);
    }

    query += ' ORDER BY (category_id IS NOT NULL) ASC, created_at ASC';

    const { results } = await this.db.prepare(query).bind(...params).all<Budget>();
    return results || [];
  }

  async createOrUpdate(
    userId: string,
    ledgerId: string,
    period: BudgetPeriod,
    categoryId: string | null,
    amount: number,
    budgetId?: string
  ): Promise<Budget> {
    const now = new Date().toISOString();

    let existingQuery = 'SELECT * FROM budgets WHERE user_id = ? AND ledger_id = ? AND period = ?';
    const existingParams: any[] = [userId, ledgerId, period];

    if (categoryId) {
      existingQuery += ' AND category_id = ?';
      existingParams.push(categoryId);
    } else {
      existingQuery += ' AND category_id IS NULL';
    }

    const existing = await this.db.prepare(existingQuery).bind(...existingParams).first<Budget>();

    if (existing) {
      await this.db
        .prepare('UPDATE budgets SET amount = ?, updated_at = ? WHERE budget_id = ?')
        .bind(amount, now, existing.budget_id)
        .run();

      return {
        ...existing,
        amount,
        updated_at: now,
      };
    } else {
      const id = budgetId || `bud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await this.db
        .prepare(
          `INSERT INTO budgets (budget_id, user_id, ledger_id, category_id, period, amount, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(id, userId, ledgerId, categoryId, period, amount, now, now)
        .run();

      return {
        budget_id: id,
        user_id: userId,
        ledger_id: ledgerId,
        category_id: categoryId,
        period,
        amount,
        created_at: now,
        updated_at: now,
      };
    }
  }

  /**
   * 批量原子重置预算 (BUG-S12)
   */
  async batchSet(
    userId: string,
    ledgerId: string,
    period: BudgetPeriod,
    budgets: SetBudgetItem[]
  ): Promise<Budget[]> {
    const now = new Date().toISOString();
    const batchStatements: D1PreparedStatement[] = [
      this.db
        .prepare('DELETE FROM budgets WHERE user_id = ? AND ledger_id = ? AND period = ?')
        .bind(userId, ledgerId, period),
    ];

    const resultBudgets: Budget[] = [];

    for (const item of budgets) {
      const amount = typeof item.amount === 'number' ? Math.round(item.amount) : 0;
      if (amount <= 0 || isNaN(amount)) continue;

      const categoryId = item.category_id || null;
      const budgetId = `bud_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      batchStatements.push(
        this.db.prepare(
          `INSERT INTO budgets (budget_id, user_id, ledger_id, category_id, period, amount, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(budgetId, userId, ledgerId, categoryId, period, amount, now, now)
      );

      resultBudgets.push({
        budget_id: budgetId,
        user_id: userId,
        ledger_id: ledgerId,
        category_id: categoryId,
        period,
        amount,
        created_at: now,
        updated_at: now,
      });
    }

    await this.db.batch(batchStatements);
    return resultBudgets;
  }

  async delete(budgetId: string, userId: string): Promise<boolean> {
    const res = await this.db
      .prepare('DELETE FROM budgets WHERE budget_id = ? AND user_id = ?')
      .bind(budgetId, userId)
      .run();
    return (res.meta.changes || 0) > 0;
  }

  async deleteByLedger(ledgerId: string, userId: string): Promise<number> {
    const res = await this.db
      .prepare('DELETE FROM budgets WHERE ledger_id = ? AND user_id = ?')
      .bind(ledgerId, userId)
      .run();
    return Number(res.meta.changes || 0);
  }
}
