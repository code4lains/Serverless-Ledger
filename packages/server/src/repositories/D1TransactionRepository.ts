import {
  Transaction,
  TransactionFilter,
  ITransactionRepository,
} from '@ledger/shared';

export class D1TransactionRepository implements ITransactionRepository {
  constructor(protected db: D1Database) {}

  async findById(transactionId: string, userId?: string): Promise<Transaction | null> {
    let query = 'SELECT * FROM transactions WHERE transaction_id = ?';
    const params: any[] = [transactionId];
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    const tx = await this.db.prepare(query).bind(...params).first<Transaction>();
    return tx || null;
  }

  async query(userId: string, filter?: TransactionFilter & { limit?: number }): Promise<Transaction[]> {
    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    const params: any[] = [userId];

    if (filter?.ledger_id && filter.ledger_id !== 'all') {
      query += ' AND ledger_id = ?';
      params.push(filter.ledger_id);
    }

    if (filter?.type && filter.type !== 'all') {
      query += ' AND type = ?';
      params.push(filter.type);
    }

    if (filter?.category_id) {
      query += ' AND category_id = ?';
      params.push(filter.category_id);
    }

    if (filter?.start_date) {
      query += ' AND transaction_date >= ?';
      params.push(filter.start_date);
    }

    if (filter?.end_date) {
      query += ' AND transaction_date <= ?';
      params.push(filter.end_date);
    }

    if (filter?.search && filter.search.trim()) {
      const kw = `%${filter.search.trim()}%`;
      query += ' AND (remark LIKE ? OR from_account LIKE ? OR to_account LIKE ?)';
      params.push(kw, kw, kw);
    }

    query += ' ORDER BY transaction_date DESC, created_at DESC';

    const rawLimit = filter?.limit;
    if (rawLimit !== undefined && rawLimit > 0) {
      const limit = Math.min(rawLimit, 100000);
      query += ' LIMIT ?';
      params.push(limit);
    }

    const { results } = await this.db.prepare(query).bind(...params).all<Transaction>();
    return results || [];
  }

  /**
   * 使用高效 SQL COUNT(*) 统计符合条件的流水总笔数
   */
  async count(userId: string, filter?: TransactionFilter): Promise<number> {
    let query = 'SELECT COUNT(*) as total FROM transactions WHERE user_id = ?';
    const params: any[] = [userId];

    if (filter?.ledger_id && filter.ledger_id !== 'all') {
      query += ' AND ledger_id = ?';
      params.push(filter.ledger_id);
    }

    if (filter?.type && filter.type !== 'all') {
      query += ' AND type = ?';
      params.push(filter.type);
    }

    if (filter?.category_id) {
      query += ' AND category_id = ?';
      params.push(filter.category_id);
    }

    if (filter?.start_date) {
      query += ' AND transaction_date >= ?';
      params.push(filter.start_date);
    }

    if (filter?.end_date) {
      query += ' AND transaction_date <= ?';
      params.push(filter.end_date);
    }

    if (filter?.search && filter.search.trim()) {
      const kw = `%${filter.search.trim()}%`;
      query += ' AND (remark LIKE ? OR from_account LIKE ? OR to_account LIKE ?)';
      params.push(kw, kw, kw);
    }

    const row = await this.db.prepare(query).bind(...params).first<{ total: number }>();
    return Number(row?.total || 0);
  }

  async create(
    userId: string,
    tx: Partial<Transaction> & { transaction_id?: string; ledger_id: string; type: any; amount: number; transaction_date: string }
  ): Promise<Transaction> {
    let transactionId = tx.transaction_id || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    // 防跨租户主键碰撞
    const conflict = await this.db
      .prepare('SELECT user_id FROM transactions WHERE transaction_id = ?')
      .bind(transactionId)
      .first<{ user_id: string }>();
    if (conflict && conflict.user_id !== userId) {
      transactionId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }

    const now = new Date().toISOString();
    const categoryId = tx.category_id || null;
    const fromAccount = tx.from_account || null;
    const toAccount = tx.to_account || null;
    const transactionDate = tx.transaction_date || now;
    const remark = tx.remark || null;
    const syncStatus = tx.sync_status || 'synced';
    const createdAt = tx.created_at || now;
    const updatedAt = tx.updated_at || now;

    await this.db
      .prepare(
        `INSERT INTO transactions (
          transaction_id, user_id, ledger_id, type, amount, category_id,
          from_account, to_account, transaction_date, remark, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        transactionId,
        userId,
        tx.ledger_id,
        tx.type,
        tx.amount,
        categoryId,
        fromAccount,
        toAccount,
        transactionDate,
        remark,
        syncStatus,
        createdAt,
        updatedAt
      )
      .run();

    return {
      transaction_id: transactionId,
      user_id: userId,
      ledger_id: tx.ledger_id,
      type: tx.type,
      amount: tx.amount,
      category_id: categoryId,
      from_account: fromAccount,
      to_account: toAccount,
      transaction_date: transactionDate,
      remark,
      sync_status: syncStatus,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  async update(transactionId: string, userId: string, tx: Partial<Transaction>): Promise<Transaction | null> {
    const existing = await this.findById(transactionId, userId);
    if (!existing) return null;

    const ledgerId = tx.ledger_id || existing.ledger_id;
    const type = tx.type || existing.type;
    const amount = typeof tx.amount === 'number' ? Math.round(tx.amount) : existing.amount;
    const categoryId = tx.category_id !== undefined ? (tx.category_id || null) : existing.category_id;
    const transactionDate = tx.transaction_date || existing.transaction_date;
    const remark = tx.remark !== undefined ? (tx.remark || null) : existing.remark;
    const fromAccount = tx.from_account !== undefined ? (tx.from_account || null) : existing.from_account;
    const toAccount = tx.to_account !== undefined ? (tx.to_account || null) : existing.to_account;
    const syncStatus = tx.sync_status || 'synced';
    const now = new Date().toISOString();

    await this.db
      .prepare(
        `UPDATE transactions SET
          ledger_id = ?, type = ?, amount = ?, category_id = ?, transaction_date = ?,
          remark = ?, from_account = ?, to_account = ?, sync_status = ?, updated_at = ?
        WHERE transaction_id = ? AND user_id = ?`
      )
      .bind(
        ledgerId,
        type,
        amount,
        categoryId,
        transactionDate,
        remark,
        fromAccount,
        toAccount,
        syncStatus,
        now,
        transactionId,
        userId
      )
      .run();

    return {
      ...existing,
      ledger_id: ledgerId,
      type,
      amount,
      category_id: categoryId,
      transaction_date: transactionDate,
      remark,
      from_account: fromAccount,
      to_account: toAccount,
      sync_status: syncStatus,
      updated_at: now,
    };
  }

  async delete(transactionId: string, userId: string): Promise<boolean> {
    const res = await this.db
      .prepare('DELETE FROM transactions WHERE transaction_id = ? AND user_id = ?')
      .bind(transactionId, userId)
      .run();
    return (res.meta.changes || 0) > 0;
  }

  async batchUpsert(userId: string, transactions: Transaction[]): Promise<{ synced_ids: string[]; count: number }> {
    if (!transactions || transactions.length === 0) {
      return { synced_ids: [], count: 0 };
    }

    const syncedIds: string[] = [];
    const now = new Date().toISOString();

    // 1. 获取并验证用户所有有效账本 ID
    const { results: userLedgerRows } = await this.db
      .prepare('SELECT ledger_id FROM ledgers WHERE user_id = ?')
      .bind(userId)
      .all<{ ledger_id: string }>();
    const validUserLedgerIds = new Set((userLedgerRows || []).map((r) => r.ledger_id));

    // 获取默认账本 ID
    const defLedger = await this.db
      .prepare('SELECT ledger_id FROM ledgers WHERE user_id = ? AND is_default = 1 LIMIT 1')
      .bind(userId)
      .first<{ ledger_id: string }>();
    let defaultLedgerId = defLedger?.ledger_id;
    if (!defaultLedgerId) {
      const firstLedger = (userLedgerRows || [])[0];
      if (firstLedger) {
        defaultLedgerId = firstLedger.ledger_id;
      } else {
        defaultLedgerId = `led_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await this.db
          .prepare(
            'INSERT INTO ledgers (ledger_id, user_id, name, currency, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
          )
          .bind(defaultLedgerId, userId, '默认账本', 'CNY', now, now)
          .run();
      }
    }
    validUserLedgerIds.add(defaultLedgerId);

    // 2. 获取所有有效分类 ID
    const { results: catRows } = await this.db
      .prepare('SELECT category_id FROM categories WHERE user_id = ? OR user_id IS NULL')
      .bind(userId)
      .all<{ category_id: string }>();
    const validCategoryIds = new Set((catRows || []).map((r) => r.category_id));

    // 3. 准备 Upsert 语句
    const txStmts: D1PreparedStatement[] = [];
    const validTypes = ['expense', 'income', 'transfer', 'loan'];

    for (const tx of transactions) {
      const amount = typeof tx.amount === 'number' ? Math.round(tx.amount) : 0;
      if (amount <= 0 || isNaN(amount)) {
        continue;
      }

      const ledgerId = tx.ledger_id && validUserLedgerIds.has(tx.ledger_id)
        ? tx.ledger_id
        : defaultLedgerId;

      const txType = validTypes.includes(tx.type) ? tx.type : 'expense';
      const validCatId = tx.category_id && validCategoryIds.has(tx.category_id) ? tx.category_id : null;
      const txCreatedAt = tx.created_at || now;
      const txUpdatedAt = tx.updated_at || now;
      const txRemark = tx.remark ? tx.remark.slice(0, 500) : null;
      const txFromAccount = tx.from_account ? tx.from_account.slice(0, 100) : null;
      const txToAccount = tx.to_account ? tx.to_account.slice(0, 100) : null;

      // 确定主键 ID (若缺失则生成新主键)
      const txId = tx.transaction_id || `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const stmt = this.db.prepare(
        `INSERT INTO transactions (
          transaction_id, user_id, ledger_id, type, amount, category_id,
          from_account, to_account, transaction_date, remark, sync_status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, ?)
        ON CONFLICT(transaction_id) DO UPDATE SET
          ledger_id=excluded.ledger_id,
          type=excluded.type,
          amount=excluded.amount,
          category_id=excluded.category_id,
          from_account=excluded.from_account,
          to_account=excluded.to_account,
          transaction_date=excluded.transaction_date,
          remark=excluded.remark,
          sync_status='synced',
          updated_at=excluded.updated_at
        WHERE excluded.updated_at >= transactions.updated_at AND transactions.user_id = excluded.user_id`
      ).bind(
        txId,
        userId,
        ledgerId,
        txType,
        amount,
        validCatId,
        txFromAccount,
        txToAccount,
        tx.transaction_date,
        txRemark,
        txCreatedAt,
        txUpdatedAt
      );

      txStmts.push(stmt);
      if (tx.transaction_id) {
        syncedIds.push(tx.transaction_id);
      }
    }

    const BATCH_CHUNK_SIZE = 100;
    for (let i = 0; i < txStmts.length; i += BATCH_CHUNK_SIZE) {
      const chunk = txStmts.slice(i, i + BATCH_CHUNK_SIZE);
      await this.db.batch(chunk);
    }

    return {
      synced_ids: syncedIds,
      count: syncedIds.length,
    };
  }

  async batchDelete(transactionIds: string[], userId: string): Promise<number> {
    if (!transactionIds || transactionIds.length === 0) return 0;
    const statements = transactionIds.map((id) =>
      this.db.prepare('DELETE FROM transactions WHERE transaction_id = ? AND user_id = ?').bind(id, userId)
    );
    const results = await this.db.batch(statements);
    let deletedCount = 0;
    for (const r of results) {
      deletedCount += r.meta.changes || 0;
    }
    return deletedCount;
  }

  async getLatestUpdatedTime(userId: string): Promise<string | null> {
    const res = await this.db
      .prepare('SELECT MAX(updated_at) as latest FROM transactions WHERE user_id = ?')
      .bind(userId)
      .first<{ latest: string | null }>();
    return res?.latest || null;
  }

  async getIncrementalUpdated(userId: string, lastSyncedAt?: string, limit: number = 300): Promise<Transaction[]> {
    let query = 'SELECT * FROM transactions WHERE user_id = ?';
    const params: any[] = [userId];
    if (lastSyncedAt) {
      query += ' AND updated_at > ?';
      params.push(lastSyncedAt);
    }
    query += ' ORDER BY updated_at ASC LIMIT ?';
    params.push(limit);

    const stmt = this.db.prepare(query).bind(...params);
    const { results } = await stmt.all<Transaction>();
    return results || [];
  }

  async getFirstTransactionInfo(userId: string): Promise<{ count: number; first_created_at: string | null; first_tx_date: string | null }> {
    const txRow = await this.db
      .prepare(
        'SELECT COUNT(*) as count, MIN(created_at) as first_created_at, MIN(transaction_date) as first_tx_date FROM transactions WHERE user_id = ?'
      )
      .bind(userId)
      .first<{ count: number; first_created_at: string | null; first_tx_date: string | null }>();

    return {
      count: Number(txRow?.count || 0),
      first_created_at: txRow?.first_created_at || null,
      first_tx_date: txRow?.first_tx_date || null,
    };
  }
}
