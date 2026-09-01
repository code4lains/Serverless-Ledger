import {
  Ledger,
  CreateLedgerRequest,
  UpdateLedgerRequest,
  LedgerSummary,
  ILedgerRepository,
  toBoolean,
} from '@ledger/shared';

export class D1LedgerRepository implements ILedgerRepository {
  constructor(protected db: D1Database) {}

  async findById(ledgerId: string, userId?: string): Promise<Ledger | null> {
    let query = 'SELECT * FROM ledgers WHERE ledger_id = ?';
    const params: any[] = [ledgerId];
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    const ledger = await this.db.prepare(query).bind(...params).first<Ledger>();
    return ledger || null;
  }

  async findByUserId(userId: string): Promise<Ledger[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM ledgers WHERE user_id = ? ORDER BY is_default DESC, created_at ASC')
      .bind(userId)
      .all<Ledger>();
    return results || [];
  }

  async countByUserId(userId: string): Promise<number> {
    const res = await this.db
      .prepare('SELECT COUNT(*) as count FROM ledgers WHERE user_id = ?')
      .bind(userId)
      .first<{ count: number }>();
    return Number(res?.count || 0);
  }

  async create(userId: string, req: CreateLedgerRequest): Promise<Ledger> {
    const name = (typeof req.name === 'string' ? req.name : '新建账本').trim();
    const currency = (typeof req.currency === 'string' ? req.currency : 'CNY').trim().toUpperCase();
    const ledgerId = req.ledger_id || `led_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();

    const existingCount = await this.countByUserId(userId);
    const isDefault = existingCount === 0 ? 1 : (req.is_default !== undefined && toBoolean(req.is_default) ? 1 : 0);

    if (isDefault === 1 && existingCount > 0) {
      await this.db
        .prepare('UPDATE ledgers SET is_default = 0, updated_at = ? WHERE user_id = ?')
        .bind(now, userId)
        .run();
    }

    await this.db
      .prepare(
        'INSERT INTO ledgers (ledger_id, user_id, name, currency, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(ledgerId, userId, name, currency, isDefault, now, now)
      .run();

    return {
      ledger_id: ledgerId,
      user_id: userId,
      name,
      currency,
      is_default: isDefault,
      created_at: now,
      updated_at: now,
    };
  }

  async update(ledgerId: string, userId: string, req: UpdateLedgerRequest): Promise<Ledger | null> {
    const existing = await this.findById(ledgerId, userId);
    if (!existing) return null;

    const name = req.name !== undefined ? req.name.trim() : existing.name;
    const currency = req.currency !== undefined ? req.currency.trim().toUpperCase() : existing.currency;
    const isDefault = req.is_default !== undefined ? (toBoolean(req.is_default) ? 1 : 0) : existing.is_default;
    const now = new Date().toISOString();

    if (isDefault === 1 && existing.is_default === 0) {
      await this.db
        .prepare('UPDATE ledgers SET is_default = 0, updated_at = ? WHERE user_id = ?')
        .bind(now, userId)
        .run();
    }

    await this.db
      .prepare(
        'UPDATE ledgers SET name = ?, currency = ?, is_default = ?, updated_at = ? WHERE ledger_id = ? AND user_id = ?'
      )
      .bind(name, currency, isDefault, now, ledgerId, userId)
      .run();

    return {
      ...existing,
      name,
      currency,
      is_default: isDefault,
      updated_at: now,
    };
  }

  async delete(ledgerId: string, userId: string): Promise<boolean> {
    const existing = await this.findById(ledgerId, userId);
    if (!existing) return false;

    const allUserLedgers = await this.findByUserId(userId);
    if (allUserLedgers.length <= 1) {
      throw new Error('至少需保留一个账本，无法删除唯一账本');
    }

    const now = new Date().toISOString();

    // 如果删除的是默认账本，自动将余下的另一个账本提升为默认账本
    if (existing.is_default === 1) {
      const anotherLedger = allUserLedgers.find((l) => l.ledger_id !== ledgerId);
      if (anotherLedger) {
        await this.db
          .prepare('UPDATE ledgers SET is_default = 1, updated_at = ? WHERE ledger_id = ? AND user_id = ?')
          .bind(now, anotherLedger.ledger_id, userId)
          .run();
      }
    }

    // 级联清理该账本下的账单流水、预算和周期记账规则以及账本本身
    const batchStatements: D1PreparedStatement[] = [
      this.db.prepare('DELETE FROM transactions WHERE ledger_id = ? AND user_id = ?').bind(ledgerId, userId),
      this.db.prepare('DELETE FROM budgets WHERE ledger_id = ? AND user_id = ?').bind(ledgerId, userId),
      this.db.prepare('DELETE FROM recurring_rules WHERE ledger_id = ? AND user_id = ?').bind(ledgerId, userId),
      this.db.prepare('DELETE FROM ledgers WHERE ledger_id = ? AND user_id = ?').bind(ledgerId, userId),
    ];
    await this.db.batch(batchStatements);
    return true;
  }

  async setDefault(ledgerId: string, userId: string): Promise<boolean> {
    const existing = await this.findById(ledgerId, userId);
    if (!existing) return false;

    const now = new Date().toISOString();
    await this.db
      .prepare('UPDATE ledgers SET is_default = 0, updated_at = ? WHERE user_id = ?')
      .bind(now, userId)
      .run();

    await this.db
      .prepare('UPDATE ledgers SET is_default = 1, updated_at = ? WHERE ledger_id = ? AND user_id = ?')
      .bind(now, ledgerId, userId)
      .run();

    return true;
  }

  async getDefault(userId: string): Promise<Ledger | null> {
    const ledger = await this.db
      .prepare('SELECT * FROM ledgers WHERE user_id = ? AND is_default = 1 LIMIT 1')
      .bind(userId)
      .first<Ledger>();

    if (ledger) return ledger;

    const fallback = await this.db
      .prepare('SELECT * FROM ledgers WHERE user_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 1')
      .bind(userId)
      .first<Ledger>();

    return fallback || null;
  }

  async getSummary(ledgerId: string, userId: string): Promise<LedgerSummary | null> {
    const ledger = await this.findById(ledgerId, userId);
    if (!ledger) return null;

    const stats = await this.db
      .prepare(
        `SELECT
          COUNT(*) as tx_count,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income
        FROM transactions WHERE user_id = ? AND ledger_id = ?`
      )
      .bind(userId, ledgerId)
      .first<{ tx_count: number; total_expense: number; total_income: number }>();

    const totalExpense = Number(stats?.total_expense || 0);
    const totalIncome = Number(stats?.total_income || 0);

    return {
      ledger,
      transaction_count: Number(stats?.tx_count || 0),
      totalExpense,
      totalIncome,
      balance: totalIncome - totalExpense,
    };
  }

  async getSummariesByUserId(userId: string): Promise<LedgerSummary[]> {
    const ledgers = await this.findByUserId(userId);
    if (ledgers.length === 0) return [];

    // 单条 SQL 原生 GROUP BY 分组汇总，零循环秒级返回准确数据
    const { results } = await this.db
      .prepare(
        `SELECT
          ledger_id,
          COUNT(*) as tx_count,
          COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as total_expense,
          COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as total_income
        FROM transactions WHERE user_id = ?
        GROUP BY ledger_id`
      )
      .bind(userId)
      .all<{ ledger_id: string; tx_count: number; total_expense: number; total_income: number }>();

    const statsMap = new Map<string, { tx_count: number; total_expense: number; total_income: number }>();
    if (results) {
      for (const r of results) {
        statsMap.set(r.ledger_id, {
          tx_count: Number(r.tx_count || 0),
          total_expense: Number(r.total_expense || 0),
          total_income: Number(r.total_income || 0),
        });
      }
    }

    return ledgers.map((led) => {
      const s = statsMap.get(led.ledger_id) || { tx_count: 0, total_expense: 0, total_income: 0 };
      return {
        ledger: led,
        transaction_count: s.tx_count,
        totalExpense: s.total_expense,
        totalIncome: s.total_income,
        balance: s.total_income - s.total_expense,
      };
    });
  }

  async resolveUserLedgerId(userId: string, ledgerId?: string | null): Promise<string> {
    if (ledgerId) {
      const existing = await this.findById(ledgerId, userId);
      if (existing) return existing.ledger_id;
    }

    const def = await this.getDefault(userId);
    if (def) return def.ledger_id;

    const created = await this.create(userId, { name: '默认账本', currency: 'CNY', is_default: 1 });
    return created.ledger_id;
  }

  /**
   * 账本数据合并 (将源账本的所有流水、预算及周期规则原子转移至目标账本)
   */
  async merge(
    userId: string,
    req: { source_ledger_id: string; target_ledger_id: string; delete_source?: boolean }
  ): Promise<{ success: boolean; mergedTransactionCount: number; error?: string }> {
    const { source_ledger_id, target_ledger_id, delete_source = true } = req;

    if (!source_ledger_id || !target_ledger_id) {
      return { success: false, mergedTransactionCount: 0, error: '源账本与目标账本均不能为空' };
    }

    if (source_ledger_id === target_ledger_id) {
      return { success: false, mergedTransactionCount: 0, error: '源账本与目标账本不能相同' };
    }

    const sourceLedger = await this.findById(source_ledger_id, userId);
    if (!sourceLedger) {
      return { success: false, mergedTransactionCount: 0, error: '源账本不存在或无权访问' };
    }

    const targetLedger = await this.findById(target_ledger_id, userId);
    if (!targetLedger) {
      return { success: false, mergedTransactionCount: 0, error: '目标账本不存在或无权访问' };
    }

    // 统计转移流水数量
    const countRow = await this.db
      .prepare('SELECT COUNT(*) as count FROM transactions WHERE ledger_id = ? AND user_id = ?')
      .bind(source_ledger_id, userId)
      .first<{ count: number }>();
    const txCount = Number(countRow?.count || 0);

    const now = new Date().toISOString();

    const batchStatements: D1PreparedStatement[] = [
      // 1. 转移所有账单流水
      this.db
        .prepare('UPDATE transactions SET ledger_id = ?, updated_at = ? WHERE ledger_id = ? AND user_id = ?')
        .bind(target_ledger_id, now, source_ledger_id, userId),

      // 2. 转移所有预算
      this.db
        .prepare('UPDATE budgets SET ledger_id = ?, updated_at = ? WHERE ledger_id = ? AND user_id = ?')
        .bind(target_ledger_id, now, source_ledger_id, userId),

      // 3. 转移所有周期记账规则
      this.db
        .prepare('UPDATE recurring_rules SET ledger_id = ?, updated_at = ? WHERE ledger_id = ? AND user_id = ?')
        .bind(target_ledger_id, now, source_ledger_id, userId),
    ];

    // 若源账本为默认账本，将目标账本设为默认账本
    if (sourceLedger.is_default === 1 && targetLedger.is_default !== 1) {
      batchStatements.push(
        this.db
          .prepare('UPDATE ledgers SET is_default = 1, updated_at = ? WHERE ledger_id = ? AND user_id = ?')
          .bind(now, target_ledger_id, userId)
      );
    }

    // 若勾选了删除源账本
    if (delete_source) {
      batchStatements.push(
        this.db
          .prepare('DELETE FROM ledgers WHERE ledger_id = ? AND user_id = ?')
          .bind(source_ledger_id, userId)
      );
    }

    await this.db.batch(batchStatements);

    return {
      success: true,
      mergedTransactionCount: txCount,
    };
  }
}
