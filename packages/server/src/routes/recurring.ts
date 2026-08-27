import { Hono } from 'hono';
import { Env, AppVariables } from '../types';
import { requireAuth } from '../middleware/auth';
import {
  ApiResponse,
  RecurringRule,
  CreateRecurringRuleRequest,
  UpdateRecurringRuleRequest,
  Transaction,
  ExecuteDueRecurringResult,
  calculateNextRunDate,
  getDueDatesForRule,
  formatDateOnly,
} from '@ledger/shared';

const recurringRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// 周期记账所有接口均需登录鉴权
recurringRouter.use('*', requireAuth);

/**
 * GET /api/recurring
 * 获取当前用户的所有周期记账规则
 */
recurringRouter.get('/', async (c) => {
  const jwtUser = c.get('user')!;
  const userId = jwtUser.userId;

  try {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM recurring_rules WHERE user_id = ? ORDER BY created_at DESC`
    )
      .bind(userId)
      .all<RecurringRule>();

    const res: ApiResponse<RecurringRule[]> = {
      success: true,
      data: results || [],
    };
    return c.json(res, 200);
  } catch (err: any) {
    console.error('Error fetching recurring rules:', err);
    return c.json({ success: false, error: '获取周期记账规则列表失败' }, 500);
  }
});

/**
 * POST /api/recurring
 * 创建新周期记账规则
 */
recurringRouter.post('/', async (c) => {
  const jwtUser = c.get('user')!;
  const userId = jwtUser.userId;
  const body = await c.req.json<CreateRecurringRuleRequest>();

  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return c.json({ success: false, error: '请输入有效的周期规则名称' }, 400);
  }

  if (!body.amount || typeof body.amount !== 'number' || body.amount < 1) {
    return c.json({ success: false, error: '金额必须为大于 0 的整数分' }, 400);
  }

  if (!body.type || !['expense', 'income', 'transfer', 'loan'].includes(body.type)) {
    return c.json({ success: false, error: '无效的交易类型' }, 400);
  }

  if (!body.frequency || !['daily', 'weekly', 'monthly', 'yearly'].includes(body.frequency)) {
    return c.json({ success: false, error: '无效的周期频率' }, 400);
  }

  const ruleId = body.rule_id || `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  const startDate = body.start_date ? body.start_date.slice(0, 10) : formatDateOnly(new Date());

  // 计算首个 next_run_date
  let nextRunDate = body.next_run_date ? body.next_run_date.slice(0, 10) : '';
  if (!nextRunDate) {
    nextRunDate = calculateNextRunDate(
      {
        frequency: body.frequency,
        interval: body.interval || 1,
        day_of_month: body.day_of_month,
        day_of_week: body.day_of_week,
        month_of_year: body.month_of_year,
        start_date: startDate,
      },
      startDate
    );
  }

  try {
    await c.env.DB.prepare(
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
        body.ledger_id,
        body.name.trim(),
        body.type,
        Math.round(body.amount),
        body.category_id || null,
        body.from_account || null,
        body.to_account || null,
        body.remark || null,
        body.frequency,
        body.interval || 1,
        body.day_of_month || null,
        body.day_of_week || null,
        body.month_of_year || null,
        startDate,
        body.end_date ? body.end_date.slice(0, 10) : null,
        nextRunDate,
        null,
        body.status || 'active',
        body.auto_record !== undefined ? body.auto_record : 1,
        now,
        now
      )
      .run();

    const created = await c.env.DB.prepare(
      `SELECT * FROM recurring_rules WHERE rule_id = ?`
    )
      .bind(ruleId)
      .first<RecurringRule>();

    const res: ApiResponse<RecurringRule> = {
      success: true,
      data: created!,
      message: '周期规则创建成功',
    };
    return c.json(res, 201);
  } catch (err: any) {
    console.error('Error creating recurring rule:', err);
    return c.json({ success: false, error: '创建周期规则失败' }, 500);
  }
});

/**
 * PUT /api/recurring/:id
 * 更新指定周期记账规则
 */
recurringRouter.put('/:id', async (c) => {
  const jwtUser = c.get('user')!;
  const userId = jwtUser.userId;
  const ruleId = c.req.param('id');
  const body = await c.req.json<UpdateRecurringRuleRequest>();

  try {
    const existing = await c.env.DB.prepare(
      `SELECT * FROM recurring_rules WHERE rule_id = ? AND user_id = ?`
    )
      .bind(ruleId, userId)
      .first<RecurringRule>();

    if (!existing) {
      return c.json({ success: false, error: '周期规则不存在或无权操作' }, 404);
    }

    const now = new Date().toISOString();
    if (body.name !== undefined && (typeof body.name !== 'string' || !body.name.trim())) {
      return c.json({ success: false, error: '周期规则名称不能为空且必须为字符串' }, 400);
    }
    const name = body.name !== undefined ? body.name.trim() : existing.name;
    const type = body.type !== undefined ? body.type : existing.type;
    const amount = body.amount !== undefined ? Math.round(body.amount) : existing.amount;
    const ledgerId = body.ledger_id !== undefined ? body.ledger_id : existing.ledger_id;
    const categoryId = body.category_id !== undefined ? body.category_id : existing.category_id;
    const fromAccount = body.from_account !== undefined ? body.from_account : existing.from_account;
    const toAccount = body.to_account !== undefined ? body.to_account : existing.to_account;
    const remark = body.remark !== undefined ? body.remark : existing.remark;
    const frequency = body.frequency !== undefined ? body.frequency : existing.frequency;
    const interval = body.interval !== undefined ? body.interval : existing.interval;
    const dayOfMonth = body.day_of_month !== undefined ? body.day_of_month : existing.day_of_month;
    const dayOfWeek = body.day_of_week !== undefined ? body.day_of_week : existing.day_of_week;
    const monthOfYear = body.month_of_year !== undefined ? body.month_of_year : existing.month_of_year;
    const startDate = body.start_date !== undefined ? body.start_date : existing.start_date;
    const endDate = body.end_date !== undefined ? body.end_date : existing.end_date;
    const status = body.status !== undefined ? body.status : existing.status;
    const autoRecord = body.auto_record !== undefined ? body.auto_record : existing.auto_record;

    let nextRunDate = body.next_run_date !== undefined ? body.next_run_date : existing.next_run_date;

    await c.env.DB.prepare(
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

    const updated = await c.env.DB.prepare(
      `SELECT * FROM recurring_rules WHERE rule_id = ?`
    )
      .bind(ruleId)
      .first<RecurringRule>();

    const res: ApiResponse<RecurringRule> = {
      success: true,
      data: updated!,
      message: '周期规则已更新',
    };
    return c.json(res, 200);
  } catch (err: any) {
    console.error('Error updating recurring rule:', err);
    return c.json({ success: false, error: '更新周期规则失败' }, 500);
  }
});

/**
 * DELETE /api/recurring/:id
 * 删除指定周期记账规则
 */
recurringRouter.delete('/:id', async (c) => {
  const jwtUser = c.get('user')!;
  const userId = jwtUser.userId;
  const ruleId = c.req.param('id');

  try {
    const existing = await c.env.DB.prepare(
      `SELECT * FROM recurring_rules WHERE rule_id = ? AND user_id = ?`
    )
      .bind(ruleId, userId)
      .first<RecurringRule>();

    if (!existing) {
      return c.json({ success: false, error: '周期规则不存在或无权删除' }, 404);
    }

    await c.env.DB.prepare(
      `DELETE FROM recurring_rules WHERE rule_id = ? AND user_id = ?`
    )
      .bind(ruleId, userId)
      .run();

    const res: ApiResponse = {
      success: true,
      message: '周期规则已成功删除',
    };
    return c.json(res, 200);
  } catch (err: any) {
    console.error('Error deleting recurring rule:', err);
    return c.json({ success: false, error: '删除周期规则失败' }, 500);
  }
});

/**
 * POST /api/recurring/execute-due
 * 执行当前用户所有已到期的周期规则，生成对应流水账单
 */
recurringRouter.post('/execute-due', async (c) => {
  const jwtUser = c.get('user')!;
  const userId = jwtUser.userId;
  const body = (await c.req.json().catch(() => ({}))) as { as_of_date?: string };

  const asOfDate = body.as_of_date || formatDateOnly(new Date());

  try {
    // 查找所有活跃且到期的规则
    const { results: dueRules } = await c.env.DB.prepare(
      `SELECT * FROM recurring_rules 
       WHERE user_id = ? 
         AND status = 'active' 
         AND next_run_date <= ? 
         AND (end_date IS NULL OR next_run_date <= end_date)
       ORDER BY next_run_date ASC`
    )
      .bind(userId, asOfDate)
      .all<RecurringRule>();

    if (!dueRules || dueRules.length === 0) {
      const emptyRes: ApiResponse<ExecuteDueRecurringResult> = {
        success: true,
        data: {
          executed_rules_count: 0,
          created_transactions: [],
          updated_rules: [],
        },
        message: '没有需要执行的到期周期规则',
      };
      return c.json(emptyRes, 200);
    }

    const createdTransactions: Transaction[] = [];
    const updatedRules: RecurringRule[] = [];
    const nowIso = new Date().toISOString();

    for (const rule of dueRules) {
      const dueDates = getDueDatesForRule(rule, asOfDate);
      if (dueDates.length === 0) continue;

      let lastDate = dueDates[dueDates.length - 1];

      for (const dDate of dueDates) {
        const txId = `tx_rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const txDateIso = new Date(`${dDate}T12:00:00.000Z`).toISOString();
        const txRemark = rule.remark ? `${rule.remark} (周期自动)` : `${rule.name} (周期自动)`;

        await c.env.DB.prepare(
          `INSERT INTO transactions (
            transaction_id, user_id, ledger_id, type, amount,
            category_id, from_account, to_account, transaction_date,
            remark, sync_status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
          .bind(
            txId,
            userId,
            rule.ledger_id,
            rule.type,
            rule.amount,
            rule.category_id || null,
            rule.from_account || null,
            rule.to_account || null,
            txDateIso,
            txRemark,
            'synced',
            nowIso,
            nowIso
          )
          .run();

        createdTransactions.push({
          transaction_id: txId,
          user_id: userId,
          ledger_id: rule.ledger_id,
          type: rule.type,
          amount: rule.amount,
          category_id: rule.category_id || undefined,
          from_account: rule.from_account || undefined,
          to_account: rule.to_account || undefined,
          transaction_date: txDateIso,
          remark: txRemark,
          sync_status: 'synced',
          created_at: nowIso,
          updated_at: nowIso,
        });
      }

      // 计算下一个 next_run_date
      const nextNext = calculateNextRunDate(rule, lastDate);

      await c.env.DB.prepare(
        `UPDATE recurring_rules SET
          last_run_date = ?,
          next_run_date = ?,
          updated_at = ?
         WHERE rule_id = ?`
      )
        .bind(lastDate, nextNext, nowIso, rule.rule_id)
        .run();

      const refreshed = await c.env.DB.prepare(
        `SELECT * FROM recurring_rules WHERE rule_id = ?`
      )
        .bind(rule.rule_id)
        .first<RecurringRule>();

      if (refreshed) updatedRules.push(refreshed);
    }

    const res: ApiResponse<ExecuteDueRecurringResult> = {
      success: true,
      data: {
        executed_rules_count: updatedRules.length,
        created_transactions: createdTransactions,
        updated_rules: updatedRules,
      },
      message: `成功执行 ${updatedRules.length} 个周期规则，已自动生成 ${createdTransactions.length} 笔流水`,
    };
    return c.json(res, 200);
  } catch (err: any) {
    console.error('Error executing due recurring rules:', err);
    return c.json({ success: false, error: '执行周期规则失败' }, 500);
  }
});

export default recurringRouter;
