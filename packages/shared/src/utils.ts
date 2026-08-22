import { Transaction, TransactionDayGroup, TotalsSummary } from './models.js';

/**
 * 格式化日期为 YYYY-MM-DD
 */
export function formatDateKey(dateInput: string | Date): string {
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
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
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
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
