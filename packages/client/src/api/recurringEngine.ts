/**
 * 账盾 - 本地周期记账自动执行引擎 (Recurring Transaction Local Engine)
 * 遵循《白皮书 6.1 离线优先 Offline-First》规范：
 * - 在应用启动、用户登录、离线同步或进入记账视图时自动判定到期规则
 * - 智能防重与跨期漏记批量补齐
 * - 本地即时入库并自动加入待同步队列
 */

import {
  Transaction,
  RecurringRule,
  getDueDatesForRule,
  calculateNextRunDate,
  formatMoney,
  formatDateOnly,
} from '@ledger/shared';
import { localDb, enqueueSyncAction } from '../db';
import { getStoredUser } from './client';
import { syncManager } from './syncManager';

export interface ProcessDueResult {
  executedRulesCount: number;
  createdTransactions: Transaction[];
  summaryText: string | null;
}

class RecurringEngine {
  private isExecuting = false;
  private isProcessing = false;
  private lastProcessedTimestamp = 0;

  /**
   * 扫描并执行所有到期的周期记账规则 (BUG-C02: 支持内存互斥锁与幂等防重键)
   * @param force 是否强制执行（忽略 5 秒防抖）
   */
  public async processDueRules(force = false): Promise<ProcessDueResult> {
    const nowTs = Date.now();
    if (this.isExecuting || this.isProcessing) {
      return { executedRulesCount: 0, createdTransactions: [], summaryText: null };
    }

    if (!force && nowTs - this.lastProcessedTimestamp < 5000) {
      return { executedRulesCount: 0, createdTransactions: [], summaryText: null };
    }

    this.isExecuting = true;
    this.isProcessing = true;
    this.lastProcessedTimestamp = nowTs;

    try {
      const user = getStoredUser();
      const userId = user?.user_id || 'default_user';

      // 1. 读取本地所有周期规则
      let allRules: RecurringRule[] = [];
      if (user) {
        allRules = await localDb.recurring_rules
          .where('user_id')
          .equals(userId)
          .toArray();
      } else {
        allRules = await localDb.recurring_rules.toArray();
      }

      // 2. 筛选生效中的规则
      const activeRules = allRules.filter((r) => r.status === 'active' && r.auto_record === 1);
      if (activeRules.length === 0) {
        return { executedRulesCount: 0, createdTransactions: [], summaryText: null };
      }

      const todayStr = formatDateOnly(new Date());
      const createdTransactions: Transaction[] = [];
      const executedRuleNames: string[] = [];
      const nowIso = new Date().toISOString();

      for (const rule of activeRules) {
        const dueDates = getDueDatesForRule(rule, todayStr);
        if (dueDates.length === 0) continue;

        const lastDueDate = dueDates[dueDates.length - 1];
        let ruleExecuted = false;

        for (const dDate of dueDates) {
          const occurrenceTimestamp = new Date(`${dDate}T12:00:00.000Z`).getTime();
          // BUG-C02 修复：基于规则 ID 与执行日期的幂等唯一键，杜绝切换 Tab 或重连时并发生成重复流水
          const txId = `tx_rec_${rule.rule_id}_${occurrenceTimestamp}`;

          // 幂等防重检查：若本地或队列已存在同规则同周期的流水，则跳过生成
          const existingTx = await localDb.transactions.get(txId);
          if (existingTx) {
            continue;
          }

          const txDateIso = new Date(`${dDate}T12:00:00.000Z`).toISOString();
          const txRemark = rule.remark ? `${rule.remark} (周期自动)` : `${rule.name} (周期自动)`;

          const newTx: Transaction = {
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
            sync_status: user ? 'pending' : 'synced',
            created_at: nowIso,
            updated_at: nowIso,
          };

          // 写入本地数据库
          await localDb.transactions.put(newTx);
          createdTransactions.push(newTx);
          ruleExecuted = true;

          // 加入离线同步队列
          if (user) {
            await enqueueSyncAction({
              user_id: userId,
              entity_type: 'transaction',
              entity_id: txId,
              action: 'create',
              payload: newTx,
            });
          }
        }

        if (ruleExecuted && !executedRuleNames.includes(rule.name)) {
          executedRuleNames.push(rule.name);
        }

        // 计算更新后的 next_run_date
        const nextNext = calculateNextRunDate(rule, lastDueDate);
        const updatedRule: RecurringRule = {
          ...rule,
          last_run_date: lastDueDate,
          next_run_date: nextNext,
          updated_at: nowIso,
        };

        await localDb.recurring_rules.put(updatedRule);

        if (user) {
          await enqueueSyncAction({
            user_id: userId,
            entity_type: 'recurring',
            entity_id: rule.rule_id,
            action: 'update',
            payload: updatedRule,
          });
        }
      }

      if (createdTransactions.length > 0) {
        console.log(`[RecurringEngine] 成功自动记录 ${createdTransactions.length} 笔到期周期账单:`, executedRuleNames);

        // 如果用户已登录，触发后台静默同步
        if (user) {
          syncManager.syncAll(true).catch(() => {});
        }

        let summaryText = '';
        if (createdTransactions.length === 1) {
          const first = createdTransactions[0];
          summaryText = `已自动记录 1 笔周期账单：${executedRuleNames[0]} ${formatMoney(first.amount)}`;
        } else {
          summaryText = `已自动记录 ${createdTransactions.length} 笔周期账单 (${executedRuleNames.slice(0, 2).join('、')}${executedRuleNames.length > 2 ? ' 等' : ''})`;
        }

        return {
          executedRulesCount: executedRuleNames.length,
          createdTransactions,
          summaryText,
        };
      }

      return { executedRulesCount: 0, createdTransactions: [], summaryText: null };
    } catch (err) {
      console.error('[RecurringEngine] 周期规则处理发生错误:', err);
      return { executedRulesCount: 0, createdTransactions: [], summaryText: null };
    } finally {
      this.isExecuting = false;
      this.isProcessing = false;
    }
  }
}

export const recurringEngine = new RecurringEngine();
