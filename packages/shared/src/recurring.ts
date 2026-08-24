/**
 * 账盾 - 周期记账规则计算与执行引擎
 * 遵循《项目技术白皮书》规范
 */

import { RecurringFrequency, RecurringRule } from './models.js';

/**
 * 格式化为 YYYY-MM-DD 字符串
 */
export function formatDateOnly(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 安全获取某年某月的最大天数（处理闰年与大小月）
 * @param year 年份
 * @param month 月份 (1-12)
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * 计算周期规则从指定基准日期开始的下一个执行日期
 * @param rule 周期规则参数
 * @param fromDate 基准日期（默认为当前日期）
 * @returns YYYY-MM-DD 格式日期字符串
 */
export function calculateNextRunDate(
  rule: {
    frequency: RecurringFrequency;
    interval?: number;
    day_of_month?: number | null;
    day_of_week?: number | null;
    month_of_year?: number | null;
    start_date?: string;
  },
  fromDate?: Date | string
): string {
  const baseDate = fromDate ? (typeof fromDate === 'string' ? new Date(fromDate) : new Date(fromDate)) : new Date();
  const interval = Math.max(1, rule.interval || 1);

  const start = rule.start_date ? new Date(rule.start_date) : baseDate;

  // 如果基准时间早于开始时间，首个执行点以 start_date 为参考点
  let target = new Date(baseDate.getTime());
  if (start.getTime() > target.getTime()) {
    target = new Date(start.getTime());
  }

  const freq = rule.frequency;

  if (freq === 'daily') {
    target.setDate(target.getDate() + interval);
    return formatDateOnly(target);
  }

  if (freq === 'weekly') {
    const desiredDay = rule.day_of_week && rule.day_of_week >= 1 && rule.day_of_week <= 7 ? rule.day_of_week : target.getDay() || 7;
    // target.getDay(): 0 is Sunday, 1 is Monday ... 6 is Saturday
    const currentJsDay = target.getDay();
    const currentIsoDay = currentJsDay === 0 ? 7 : currentJsDay;

    let diff = desiredDay - currentIsoDay;
    if (diff <= 0) {
      diff += 7 * interval;
    }
    target.setDate(target.getDate() + diff);
    return formatDateOnly(target);
  }

  if (freq === 'monthly') {
    const desiredDayOfMonth = rule.day_of_month && rule.day_of_month >= 1 && rule.day_of_month <= 31
      ? rule.day_of_month
      : target.getDate();

    let targetYear = target.getFullYear();
    let targetMonth = target.getMonth() + interval;

    while (targetMonth > 11) {
      targetYear += Math.floor(targetMonth / 12);
      targetMonth = targetMonth % 12;
    }

    const maxDays = getDaysInMonth(targetYear, targetMonth + 1);
    const finalDay = Math.min(desiredDayOfMonth, maxDays);

    const nextDate = new Date(targetYear, targetMonth, finalDay);
    return formatDateOnly(nextDate);
  }

  if (freq === 'yearly') {
    const desiredMonth = rule.month_of_year && rule.month_of_year >= 1 && rule.month_of_year <= 12
      ? rule.month_of_year - 1
      : target.getMonth();
    const desiredDay = rule.day_of_month && rule.day_of_month >= 1 && rule.day_of_month <= 31
      ? rule.day_of_month
      : target.getDate();

    const targetYear = target.getFullYear() + interval;
    const maxDays = getDaysInMonth(targetYear, desiredMonth + 1);
    const finalDay = Math.min(desiredDay, maxDays);

    const nextDate = new Date(targetYear, desiredMonth, finalDay);
    return formatDateOnly(nextDate);
  }

  target.setDate(target.getDate() + interval);
  return formatDateOnly(target);
}

/**
 * 获取某个周期规则在当前日期前所有应执行而未执行的日期列表 (支持漏记补齐)
 */
export function getDueDatesForRule(rule: RecurringRule, upToDate?: Date | string): string[] {
  if (rule.status === 'paused') return [];

  const now = upToDate ? (typeof upToDate === 'string' ? new Date(upToDate) : upToDate) : new Date();
  const todayStr = formatDateOnly(now);

  const dueDates: string[] = [];
  let currentNext = rule.next_run_date ? rule.next_run_date.slice(0, 10) : formatDateOnly(now);

  // 检查是否在有效日期范围内
  const endDateStr = rule.end_date ? rule.end_date.slice(0, 10) : null;
  const startDateStr = rule.start_date ? rule.start_date.slice(0, 10) : null;

  // 防死循环保护：最多单次补齐 60 笔
  let iterations = 0;
  while (currentNext <= todayStr && iterations < 60) {
    if (startDateStr && currentNext < startDateStr) {
      currentNext = calculateNextRunDate(rule, currentNext);
      iterations++;
      continue;
    }

    if (endDateStr && currentNext > endDateStr) {
      break;
    }

    dueDates.push(currentNext);
    currentNext = calculateNextRunDate(rule, currentNext);
    iterations++;
  }

  return dueDates;
}

/**
 * 格式化周期规则描述文字 (如 "每月 10 号", "每周五", "每 2 周", "每年 3月15日")
 */
export function formatFrequencyLabel(rule: {
  frequency: RecurringFrequency;
  interval?: number;
  day_of_month?: number | null;
  day_of_week?: number | null;
  month_of_year?: number | null;
}): string {
  const interval = rule.interval && rule.interval > 1 ? `每 ${rule.interval} ` : '每';
  const weekDays = ['', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];

  switch (rule.frequency) {
    case 'daily':
      return rule.interval && rule.interval > 1 ? `每 ${rule.interval} 天` : '每天';
    case 'weekly':
      if (rule.day_of_week && rule.day_of_week >= 1 && rule.day_of_week <= 7) {
        return `${interval}${weekDays[rule.day_of_week]}`;
      }
      return `${interval}周`;
    case 'monthly':
      if (rule.day_of_month) {
        return `${interval}月 ${rule.day_of_month} 日`;
      }
      return `${interval}月`;
    case 'yearly':
      if (rule.month_of_year && rule.day_of_month) {
        return `${interval}年 ${rule.month_of_year}月${rule.day_of_month}日`;
      }
      return `${interval}年`;
    default:
      return '周期记账';
  }
}

/**
 * 预置常用周期记账模板
 */
export interface RecurringPresetTemplate {
  name: string;
  type: 'expense' | 'income' | 'transfer';
  defaultCategory: string;
  frequency: RecurringFrequency;
  day_of_month?: number;
  day_of_week?: number;
  suggestedAmount: number; // 分
  remark: string;
}

export const PRESET_RECURRING_TEMPLATES: RecurringPresetTemplate[] = [
  {
    name: '每月房租/房贷',
    type: 'expense',
    defaultCategory: 'cat_exp_ho_rent',
    frequency: 'monthly',
    day_of_month: 1,
    suggestedAmount: 300000, // 3000.00
    remark: '月度房租支付',
  },
  {
    name: '每月发薪日 (工资)',
    type: 'income',
    defaultCategory: 'cat_inc_sal_base',
    frequency: 'monthly',
    day_of_month: 10,
    suggestedAmount: 1500000, // 15000.00
    remark: '月度基本工资收入',
  },
  {
    name: '宽带与网络月费',
    type: 'expense',
    defaultCategory: 'cat_exp_ho_telecom',
    frequency: 'monthly',
    day_of_month: 5,
    suggestedAmount: 10000, // 100.00
    remark: '家庭宽带续费',
  },
  {
    name: '数字会员/云服务订阅',
    type: 'expense',
    defaultCategory: 'cat_exp_ent_movie',
    frequency: 'monthly',
    day_of_month: 15,
    suggestedAmount: 2500, // 25.00
    remark: '流媒体/会员自动续费',
  },
  {
    name: '健身房/瑜伽季卡月摊',
    type: 'expense',
    defaultCategory: 'cat_exp_ent_sport',
    frequency: 'monthly',
    day_of_month: 1,
    suggestedAmount: 20000, // 200.00
    remark: '健身运动会籍分摊',
  },
  {
    name: '车辆保险/年审',
    type: 'expense',
    defaultCategory: 'cat_exp_tr_gas',
    frequency: 'yearly',
    day_of_month: 1,
    suggestedAmount: 400000, // 4000.00
    remark: '年度车险保费',
  },
];