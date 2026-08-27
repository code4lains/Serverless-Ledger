import { Transaction, TransactionDayGroup, TotalsSummary } from './models.js';

/**
 * 安全解析本地日期字符串（避免 YYYY-MM-DD 在负时区被解析为 UTC 导致日期回退一天）
 */
export function parseLocalDate(val?: Date | string | null): Date {
  if (!val) return new Date();
  if (val instanceof Date) return new Date(val.getTime());
  if (typeof val === 'string') {
    const trimmed = val.trim();
    const m = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 12, 0, 0);
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDateKey(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? parseLocalDate(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 格式化时间为 HH:mm
 */
export function formatTime(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? parseLocalDate(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

/**
 * 获取相对日期或友好显示标签 (如 "今天 · 8月21日 星期五")
 */
export function formatRelativeDate(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const todayKey = formatDateKey(now);
  const targetKey = formatDateKey(d);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = formatDateKey(yesterday);

  const beforeYesterday = new Date(now);
  beforeYesterday.setDate(beforeYesterday.getDate() - 2);
  const beforeYesterdayKey = formatDateKey(beforeYesterday);

  const month = d.getMonth() + 1;
  const date = d.getDate();
  const weekday = WEEKDAYS[d.getDay()];

  let prefix = '';
  if (targetKey === todayKey) {
    prefix = '今天 · ';
  } else if (targetKey === yesterdayKey) {
    prefix = '昨天 · ';
  } else if (targetKey === beforeYesterdayKey) {
    prefix = '前天 · ';
  }

  return `${prefix}${month}月${date}日 ${weekday}`;
}

/**
 * 按日期对账单流水进行分组，并计算每组的收支小计
 */
export function groupTransactionsByDay(transactions: Transaction[]): TransactionDayGroup[] {
  const map = new Map<string, Transaction[]>();

  // 确保按日期降序排列
  const sorted = [...transactions].sort((a, b) => {
    return new Date(b.transaction_date).getTime() - new Date(a.transaction_date).getTime();
  });

  for (const tx of sorted) {
    const key = formatDateKey(tx.transaction_date) || 'unknown';
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(tx);
  }

  const groups: TransactionDayGroup[] = [];

  for (const [dateKey, list] of map.entries()) {
    let totalExpense = 0;
    let totalIncome = 0;
    let totalTransfer = 0;

    for (const tx of list) {
      if (tx.type === 'expense') {
        totalExpense += tx.amount;
      } else if (tx.type === 'income') {
        totalIncome += tx.amount;
      } else if (tx.type === 'transfer') {
        totalTransfer += tx.amount;
      }
    }

    groups.push({
      date: dateKey,
      displayDate: list[0] ? formatRelativeDate(list[0].transaction_date) : dateKey,
      totalExpense,
      totalIncome,
      totalTransfer,
      transactions: list,
    });
  }

  return groups;
}

/**
 * 计算账单流水的总支出、总收入、转账、借贷与结余
 */
export function calculateTotals(transactions: Transaction[]): TotalsSummary {
  let totalExpense = 0;
  let totalIncome = 0;
  let totalTransfer = 0;
  let totalLoanLent = 0;
  let totalLoanBorrowed = 0;
  let totalLoanRepaid = 0;
  let totalLoanCollected = 0;

  for (const tx of transactions) {
    if (tx.type === 'expense') {
      totalExpense += tx.amount;
    } else if (tx.type === 'income') {
      totalIncome += tx.amount;
    } else if (tx.type === 'transfer') {
      totalTransfer += tx.amount;
    } else if (tx.type === 'loan') {
      if (tx.category_id === 'cat_loan_borrow') {
        totalLoanBorrowed += tx.amount;
      } else if (tx.category_id === 'cat_loan_repay') {
        totalLoanRepaid += tx.amount;
      } else if (tx.category_id === 'cat_loan_collect') {
        totalLoanCollected += tx.amount;
      } else {
        totalLoanLent += tx.amount;
      }
    }
  }

  return {
    totalExpense,
    totalIncome,
    totalTransfer,
    totalLoanLent,
    totalLoanBorrowed,
    totalLoanRepaid,
    totalLoanCollected,
    balance: totalIncome - totalExpense,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface InviteEligibilityCalculation {
  total_eligible: number; // 0, 1, 2, 3
  claimed_count: number;
  can_generate: boolean;
  max_limit: number; // 3
  has_recorded_transaction: boolean;
  next_unlock_date: string | null;
}

/**
 * 计算旧用户的邀请码获取资格
 * 规则：旧用户注册完成且写入过记账数据后第 3 天，可获取一个邀请码，随后每 30 天可以获取一个邀请码，上限是 3 个。
 */
export function calculateInviteEligibility(
  userCreatedAt: string | Date,
  hasRecordedTransaction: boolean,
  claimedCount: number,
  nowInput?: string | Date | number,
  firstTransactionDate?: string | Date | null
): InviteEligibilityCalculation {
  const maxLimit = 3;
  const regDate = typeof userCreatedAt === 'string' ? parseLocalDate(userCreatedAt) : userCreatedAt;
  const regTime = regDate ? regDate.getTime() : NaN;
  const now = nowInput ? (typeof nowInput === 'number' ? nowInput : new Date(nowInput).getTime()) : Date.now();

  if (isNaN(regTime)) {
    return {
      total_eligible: 0,
      claimed_count: claimedCount,
      can_generate: false,
      max_limit: maxLimit,
      has_recorded_transaction: hasRecordedTransaction,
      next_unlock_date: null,
    };
  }

  let totalEligible = 0;
  let nextUnlockDate: string | null = null;

  if (!hasRecordedTransaction) {
    totalEligible = 0;
    nextUnlockDate = null; // 尚未记账，无法确定解锁时间
  } else {
    // 计时起点：优先以首次记账时间为基准；若未传入则以注册时间为基准
    const firstTxDate = firstTransactionDate
      ? (typeof firstTransactionDate === 'string' ? parseLocalDate(firstTransactionDate) : firstTransactionDate)
      : null;
    const startTime = (firstTxDate && !isNaN(firstTxDate.getTime())) ? firstTxDate.getTime() : regTime;
    const diffMs = Math.max(0, now - startTime);

    if (diffMs < 3 * DAY_MS) {
      totalEligible = 0;
      nextUnlockDate = new Date(startTime + 3 * DAY_MS).toISOString();
    } else if (diffMs < 33 * DAY_MS) {
      totalEligible = 1;
      nextUnlockDate = new Date(startTime + 33 * DAY_MS).toISOString();
    } else if (diffMs < 63 * DAY_MS) {
      totalEligible = 2;
      nextUnlockDate = new Date(startTime + 63 * DAY_MS).toISOString();
    } else {
      totalEligible = 3;
      nextUnlockDate = null;
    }
  }

  const canGenerate = hasRecordedTransaction && claimedCount < totalEligible && claimedCount < maxLimit;

  return {
    total_eligible: Math.min(totalEligible, maxLimit),
    claimed_count: claimedCount,
    can_generate: canGenerate,
    max_limit: maxLimit,
    has_recorded_transaction: hasRecordedTransaction,
    next_unlock_date: totalEligible >= maxLimit ? null : nextUnlockDate,
  };
}
