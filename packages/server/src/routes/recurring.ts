import { Hono } from 'hono';
import { Env, AppVariables } from '../types';
import { requireAuth } from '../middleware/auth';
import {
  ApiResponse,
  RecurringRule,
  Transaction,
  ExecuteDueRecurringResult,
  calculateNextRunDate,
  getDueDatesForRule,
  formatDateOnly,
} from '@ledger/shared';
import { getRepositories } from '../repositories';

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
    const repos = getRepositories(c.env.DB);
    const results = await repos.recurringRules.findByUserId(userId);

    const res: ApiResponse<RecurringRule[]> = {
      success: true,
      data: results,
    };
    return c.json(res, 200);
  } catch (err: any) {
    console.error('Error fetching recurring rules:', err);
    return c.json({ success: false, error: '获取周期记账规则列表失败' }, 500);
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
    const repos = getRepositories(c.env.DB);
    // 查找所有活跃且到期的规则
    const dueRules = await repos.recurringRules.getDueRules(userId, asOfDate);

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

      const lastDate = dueDates[dueDates.length - 1];

      for (const dDate of dueDates) {
        const txId = `tx_rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const txDateIso = new Date(`${dDate}T12:00:00.000Z`).toISOString();
        const txRemark = rule.remark ? `${rule.remark} (周期自动)` : `${rule.name} (周期自动)`;

        const createdTx = await repos.transactions.create(userId, {
          transaction_id: txId,
          ledger_id: rule.ledger_id,
          type: rule.type,
          amount: rule.amount,
          category_id: rule.category_id || null,
          from_account: rule.from_account || null,
          to_account: rule.to_account || null,
          transaction_date: txDateIso,
          remark: txRemark,
          sync_status: 'synced',
          created_at: nowIso,
          updated_at: nowIso,
        });

        createdTransactions.push(createdTx);
      }

      // 计算下一个 next_run_date
      const nextNext = calculateNextRunDate(rule, lastDate);
      await repos.recurringRules.updateNextRunDate(rule.rule_id, nextNext, lastDate);

      const refreshed = await repos.recurringRules.findById(rule.rule_id, userId);
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

