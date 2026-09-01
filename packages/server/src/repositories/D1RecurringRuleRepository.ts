import {
  RecurringRule,
  CreateRecurringRuleRequest,
  UpdateRecurringRuleRequest,
  IRecurringRuleRepository,
  calculateNextRunDate,
  formatDateOnly,
  toBoolean,
} from '@ledger/shared';

export class D1RecurringRuleRepository implements IRecurringRuleRepository {
  constructor(protected db: D1Database) {}

  async findById(ruleId: string, userId?: string): Promise<RecurringRule | null> {
    let query = 'SELECT * FROM recurring_rules WHERE rule_id = ?';
    const params: any[] = [ruleId];
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    const rule = await this.db.prepare(query).bind(...params).first<RecurringRule>();
    return rule || null;
  }

  async findByUserId(userId: string): Promise<RecurringRule[]> {
    const { results } = await this.db
      .prepare('SELECT * FROM recurring_rules WHERE user_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all<RecurringRule>();
    return results || [];
  }

  async create(userId: string, req: CreateRecurringRuleRequest): Promise<RecurringRule> {
    const ruleId = req.rule_id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    const startDate = req.start_date ? req.start_date.slice(0, 10) : formatDateOnly(new Date());

    let nextRunDate = req.next_run_date ? req.next_run_date.slice(0, 10) : '';
    if (!nextRunDate) {
      nextRunDate = calculateNextRunDate(
        {
          frequency: req.frequency,
          interval: req.interval || 1,
          day_of_month: req.day_of_month,
          day_of_week: req.day_of_week,
          month_of_year: req.month_of_year,
          start_date: startDate,
        },
        startDate
      );
    }

    const autoRecord = req.auto_record !== undefined ? (toBoolean(req.auto_record) ? 1 : 0) : 1;
    const status = req.status || 'active';

    await this.db
      .prepare(
        `INSERT INTO recurring_rules (
          rule_id, user_id, ledger_id, name, type, amount,
          category_id, from_account, to_account, remark,
          frequency, interval, day_of_month, day_of_week, month_of_year,
          start_date, end_date, next_run_date, last_run_date,
          status, auto_record, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        ruleId,
        userId,
        req.ledger_id,
        req.name.trim(),
        req.type,
        Math.round(req.amount),
        req.category_id || null,
        req.from_account || null,
        req.to_account || null,
        req.remark || null,
        req.frequency,
        req.interval || 1,
        req.day_of_month || null,
        req.day_of_week || null,
        req.month_of_year || null,
        startDate,
        req.end_date ? req.end_date.slice(0, 10) : null,
        nextRunDate,
        null,
        status,
        autoRecord,
        now,
        now
      )
      .run();

    const created = await this.findById(ruleId, userId);
    return created!;
  }

  async update(ruleId: string, userId: string, req: UpdateRecurringRuleRequest): Promise<RecurringRule | null> {
    const existing = await this.findById(ruleId, userId);
    if (!existing) return null;

    const now = new Date().toISOString();
    const ledgerId = req.ledger_id || existing.ledger_id;
    const name = req.name !== undefined ? req.name.trim() : existing.name;
    const type = req.type !== undefined ? req.type : existing.type;
    const amount = req.amount !== undefined ? Math.round(req.amount) : existing.amount;
    const categoryId = req.category_id !== undefined ? req.category_id : existing.category_id;
    const fromAccount = req.from_account !== undefined ? req.from_account : existing.from_account;
    const toAccount = req.to_account !== undefined ? req.to_account : existing.to_account;
    const remark = req.remark !== undefined ? req.remark : existing.remark;
    const frequency = req.frequency !== undefined ? req.frequency : existing.frequency;
    const interval = req.interval !== undefined ? req.interval : existing.interval;
    const dayOfMonth = req.day_of_month !== undefined ? req.day_of_month : existing.day_of_month;
    const dayOfWeek = req.day_of_week !== undefined ? req.day_of_week : existing.day_of_week;
    const monthOfYear = req.month_of_year !== undefined ? req.month_of_year : existing.month_of_year;
    const startDate = req.start_date !== undefined ? req.start_date : existing.start_date;
    const endDate = req.end_date !== undefined ? req.end_date : existing.end_date;
    const status = req.status !== undefined ? req.status : existing.status;
    const autoRecord = req.auto_record !== undefined ? (toBoolean(req.auto_record) ? 1 : 0) : existing.auto_record;
    const nextRunDate = req.next_run_date !== undefined ? req.next_run_date : existing.next_run_date;

    await this.db
      .prepare(
        `UPDATE recurring_rules SET
          ledger_id = ?, name = ?, type = ?, amount = ?,
          category_id = ?, from_account = ?, to_account = ?, remark = ?,
          frequency = ?, interval = ?, day_of_month = ?, day_of_week = ?, month_of_year = ?,
          start_date = ?, end_date = ?, next_run_date = ?, status = ?, auto_record = ?,
          updated_at = ?
        WHERE rule_id = ? AND user_id = ?`
      )
      .bind(
        ledgerId,
        name,
        type,
        amount,
        categoryId,
        fromAccount,
        toAccount,
        remark,
        frequency,
        interval,
        dayOfMonth,
        dayOfWeek,
        monthOfYear,
        startDate,
        endDate,
        nextRunDate,
        status,
        autoRecord,
        now,
        ruleId,
        userId
      )
      .run();

    return await this.findById(ruleId, userId);
  }

  async delete(ruleId: string, userId: string): Promise<boolean> {
    const res = await this.db
      .prepare('DELETE FROM recurring_rules WHERE rule_id = ? AND user_id = ?')
      .bind(ruleId, userId)
      .run();
    return (res.meta.changes || 0) > 0;
  }

  async getDueRules(userId?: string, targetDate?: string): Promise<RecurringRule[]> {
    const asOfDate = targetDate || formatDateOnly(new Date());
    let query: string;
    const params: any[] = [];

    if (userId) {
      query = `SELECT * FROM recurring_rules 
       WHERE user_id = ? 
         AND status = 'active' 
         AND next_run_date <= ? 
         AND (end_date IS NULL OR next_run_date <= end_date)
       ORDER BY next_run_date ASC`;
      params.push(userId, asOfDate);
    } else {
      query = `SELECT * FROM recurring_rules 
       WHERE status = 'active' 
         AND next_run_date <= ? 
         AND (end_date IS NULL OR next_run_date <= end_date)
       ORDER BY next_run_date ASC`;
      params.push(asOfDate);
    }

    const { results } = await this.db.prepare(query).bind(...params).all<RecurringRule>();
    return results || [];
  }

  async updateNextRunDate(ruleId: string, nextRunDate: string, lastRunDate?: string): Promise<boolean> {
    const now = new Date().toISOString();
    const res = await this.db
      .prepare(
        `UPDATE recurring_rules SET
          last_run_date = ?,
          next_run_date = ?,
          updated_at = ?
         WHERE rule_id = ?`
      )
      .bind(lastRunDate || null, nextRunDate, now, ruleId)
      .run();
    return (res.meta.changes || 0) > 0;
  }
}
