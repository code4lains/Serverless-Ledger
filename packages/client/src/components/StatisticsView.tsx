import React, { useState, useMemo } from 'react';
import {
  PieChart,
  TrendingDown,
  TrendingUp,
  ArrowRightLeft,
  HandCoins,
  Calendar,
  Filter,
  BarChart3,
  Coins,
  Sparkles,
} from 'lucide-react';
import {
  Transaction,
  Category,
  Ledger,
  formatMoney,
  getCurrencySymbol,
  calculateTotals,
  formatDateKey,
} from '@ledger/shared';
import { CategoryIcon } from './CategoryIcon';

interface StatisticsViewProps {
  transactions: Transaction[];
  categories: Category[];
  ledgers: Ledger[];
  activeLedgerId: string;
  onSelectLedger: (ledgerId: string) => void;
  onSelectTransaction?: (tx: Transaction) => void;
}

type PeriodFilter = 'all' | 'month' | 'year';

export function StatisticsView({
  transactions,
  categories,
  ledgers,
  activeLedgerId,
  onSelectLedger,
  onSelectTransaction,
}: StatisticsViewProps) {
  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [selectedType, setSelectedType] = useState<'expense' | 'income' | 'loan'>('expense');

  // 构建分类字典
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) {
      map.set(c.category_id, c);
    }
    return map;
  }, [categories]);

  // 获取当前激活账本的币种符号
  const currentLedger = useMemo(() => {
    return ledgers.find((l) => l.ledger_id === activeLedgerId) || null;
  }, [ledgers, activeLedgerId]);

  const currencySymbol = getCurrencySymbol(currentLedger?.currency);

  // 根据账本与时间周期筛选流水 (BUG-C07: 统一采用本地时区日期字符串 YYYY-MM-DD 比对，防止 UTC 时区偏移导致首尾日边界流水丢失)
  const filteredTransactions = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    const currentYearPrefix = `${currentYear}-`;
    const currentMonthPrefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}-`;

    return transactions.filter((tx) => {
      // 账本筛选
      if (activeLedgerId !== 'all' && tx.ledger_id !== activeLedgerId) {
        return false;
      }

      // 时间周期筛选
      if (period === 'all') return true;

      const dateKey = formatDateKey(tx.transaction_date);
      if (!dateKey) return true;

      if (period === 'year') {
        return dateKey.startsWith(currentYearPrefix);
      }

      if (period === 'month') {
        return dateKey.startsWith(currentMonthPrefix);
      }

      return true;
    });
  }, [transactions, activeLedgerId, period]);

  // 基础收支汇总统计
  const totals = useMemo(() => {
    return calculateTotals(filteredTransactions);
  }, [filteredTransactions]);

  // 支出分类统计与排行
  const expenseCategoryStats = useMemo(() => {
    const statsMap = new Map<string, { categoryId: string; totalAmount: number; count: number }>();
    let totalExpense = 0;

    for (const tx of filteredTransactions) {
      if (tx.type === 'expense') {
        const catId = tx.category_id || 'unknown';
        const curr = statsMap.get(catId) || { categoryId: catId, totalAmount: 0, count: 0 };
        curr.totalAmount += tx.amount;
        curr.count += 1;
        statsMap.set(catId, curr);
        totalExpense += tx.amount;
      }
    }

    const list = Array.from(statsMap.values()).map((item) => {
      const category = categoryMap.get(item.categoryId);
      const percentage = totalExpense > 0 ? (item.totalAmount / totalExpense) * 100 : 0;
      return {
        ...item,
        category,
        percentage,
      };
    });

    // 按金额从大到小排序
    list.sort((a, b) => b.totalAmount - a.totalAmount);
    return { list, totalExpense };
  }, [filteredTransactions, categoryMap]);

  // 收入分类统计与排行
  const incomeCategoryStats = useMemo(() => {
    const statsMap = new Map<string, { categoryId: string; totalAmount: number; count: number }>();
    let totalIncome = 0;

    for (const tx of filteredTransactions) {
      if (tx.type === 'income') {
        const catId = tx.category_id || 'unknown';
        const curr = statsMap.get(catId) || { categoryId: catId, totalAmount: 0, count: 0 };
        curr.totalAmount += tx.amount;
        curr.count += 1;
        statsMap.set(catId, curr);
        totalIncome += tx.amount;
      }
    }

    const list = Array.from(statsMap.values()).map((item) => {
      const category = categoryMap.get(item.categoryId);
      const percentage = totalIncome > 0 ? (item.totalAmount / totalIncome) * 100 : 0;
      return {
        ...item,
        category,
        percentage,
      };
    });

    list.sort((a, b) => b.totalAmount - a.totalAmount);
    return { list, totalIncome };
  }, [filteredTransactions, categoryMap]);

  // 借贷细分统计
  const loanStats = useMemo(() => {
    let lend = 0; // 借出
    let borrow = 0; // 借入
    let repaid = 0; // 还款
    let collected = 0; // 收款

    for (const tx of filteredTransactions) {
      if (tx.type === 'loan') {
        if (tx.category_id === 'cat_loan_lend') lend += tx.amount;
        else if (tx.category_id === 'cat_loan_borrow') borrow += tx.amount;
        else if (tx.category_id === 'cat_loan_repay') repaid += tx.amount;
        else if (tx.category_id === 'cat_loan_collect') collected += tx.amount;
      }
    }

    return {
      lend,
      borrow,
      repaid,
      collected,
      netOutflow: lend + repaid - (borrow + collected),
    };
  }, [filteredTransactions]);

  return (
    <div className="flex flex-col gap-4 animate-fadeIn">
      {/* 1. 顶部控制栏 (账本切换与时间周期筛选) */}
      <div className="flex items-center justify-between gap-2">
        {/* 账本下拉选择 */}
        <div className="flex items-center gap-1.5 bg-white dark:bg-neutral-800 border border-gray-100 dark:border-neutral-700/80 px-3 py-1.5 rounded-2xl shadow-2xs text-xs font-medium">
          <Coins className="w-3.5 h-3.5 text-indigo-500" />
          <select
            value={activeLedgerId}
            onChange={(e) => onSelectLedger(e.target.value)}
            className="bg-transparent text-gray-800 dark:text-gray-200 outline-none cursor-pointer font-semibold"
          >
            <option value="all">全部账本透视</option>
            {ledgers.map((l) => (
              <option key={l.ledger_id} value={l.ledger_id}>
                {l.name} ({l.currency})
              </option>
            ))}
          </select>
        </div>

        {/* 周期切换 Pills */}
        <div className="flex bg-gray-100/90 dark:bg-neutral-900/90 p-1 rounded-2xl text-xs font-medium">
          {(['month', 'year', 'all'] as const).map((p) => {
            const labels: Record<string, string> = { month: '本月', year: '本年', all: '全部' };
            const isCur = period === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 rounded-xl transition-all duration-150 active:scale-95 ${
                  isCur
                    ? 'bg-white dark:bg-neutral-800 text-gray-900 dark:text-white shadow-2xs font-semibold'
                    : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
                }`}
              >
                {labels[p]}
              </button>
            );
          })}
        </div>
      </div>

      {/* 桌面端响应式双栏网格 (lg:grid lg:grid-cols-12 lg:gap-6 items-start) */}
      <div className="lg:grid lg:grid-cols-12 lg:gap-6 items-start flex flex-col gap-4">
        {/* 左侧区域 (lg:col-span-5): 核心财务看板卡片 */}
        <div className="lg:col-span-5 w-full flex flex-col gap-4 lg:sticky lg:top-4">
          {/* 2. 核心财务看板大卡片 */}
          <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-2xs border border-gray-100 dark:border-neutral-700/80 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-400">
                {period === 'month' ? '本月结余' : period === 'year' ? '本年结余' : '累计净结余'}
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-semibold">
                {filteredTransactions.length} 笔流水
              </span>
            </div>

            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                {formatMoney(totals.balance, currencySymbol)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-gray-100 dark:border-neutral-700/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-orange-50 dark:bg-orange-950/40 text-[#D08770] flex items-center justify-center">
                  <TrendingDown className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">总支出</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
                    {formatMoney(totals.totalExpense, currencySymbol)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-[#A3BE8C] flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-[10px] text-gray-400">总收入</p>
                  <p className="text-sm font-bold text-gray-800 dark:text-gray-100">
                    {formatMoney(totals.totalIncome, currencySymbol)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右侧区域 (lg:col-span-7): 分类排行榜 Tab 与列表明细 */}
        <div className="lg:col-span-7 w-full flex flex-col gap-3">
          {/* 3. 分类排行榜 Tab 切换 */}
          <div className="flex bg-gray-100/90 dark:bg-neutral-900/90 p-1 rounded-2xl text-xs font-semibold">
        <button
          type="button"
          onClick={() => setSelectedType('expense')}
          className={`flex-1 py-1.5 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-95 ${
            selectedType === 'expense'
              ? 'bg-white dark:bg-neutral-800 text-[#D08770] shadow-2xs font-bold'
              : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
          }`}
        >
          <TrendingDown className="w-3.5 h-3.5" />
          <span>支出排行</span>
        </button>
        <button
          type="button"
          onClick={() => setSelectedType('income')}
          className={`flex-1 py-1.5 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-95 ${
            selectedType === 'income'
              ? 'bg-white dark:bg-neutral-800 text-[#A3BE8C] shadow-2xs font-bold'
              : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>收入排行</span>
        </button>
        <button
          type="button"
          onClick={() => setSelectedType('loan')}
          className={`flex-1 py-1.5 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-95 ${
            selectedType === 'loan'
              ? 'bg-white dark:bg-neutral-800 text-purple-600 dark:text-purple-400 shadow-2xs font-bold'
              : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
          }`}
        >
          <HandCoins className="w-3.5 h-3.5" />
          <span>借贷统计</span>
        </button>
      </div>

      {/* 4. 统计排行榜列表 */}
      <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-2xs border border-gray-100 dark:border-neutral-700/80 flex flex-col gap-4">
        {selectedType === 'expense' ? (
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-neutral-700/60 text-xs font-bold text-gray-700 dark:text-gray-200">
              <span>支出分类占比</span>
              <span className="text-gray-400 font-normal">
                共 {formatMoney(expenseCategoryStats.totalExpense, currencySymbol)}
              </span>
            </div>

            {expenseCategoryStats.list.length === 0 ? (
              <div className="py-10 text-center text-xs text-gray-400">
                当前筛选区间内无支出记录
              </div>
            ) : (
              <div className="flex flex-col gap-3.5 pt-3">
                {expenseCategoryStats.list.map((item, idx) => (
                  <div key={item.categoryId} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-400 w-4">{idx + 1}</span>
                        <CategoryIcon
                          icon={item.category?.icon || 'Tag'}
                          color={item.category?.color || '#D08770'}
                          className="w-4 h-4"
                        />
                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                          {item.category?.name || '未知分类'}
                        </span>
                        <span className="text-[10px] text-gray-400">({item.count}笔)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 dark:text-white">
                          {formatMoney(item.totalAmount, currencySymbol)}
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium w-10 text-right">
                          {item.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    {/* 莫兰迪色进度条 */}
                    <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-neutral-700/80 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${Math.max(item.percentage, 2)}%`,
                          backgroundColor: item.category?.color || '#D08770',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : selectedType === 'income' ? (
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-neutral-700/60 text-xs font-bold text-gray-700 dark:text-gray-200">
              <span>收入分类占比</span>
              <span className="text-gray-400 font-normal">
                共 {formatMoney(incomeCategoryStats.totalIncome, currencySymbol)}
              </span>
            </div>

            {incomeCategoryStats.list.length === 0 ? (
              <div className="py-10 text-center text-xs text-gray-400">
                当前筛选区间内无收入记录
              </div>
            ) : (
              <div className="flex flex-col gap-3.5 pt-3">
                {incomeCategoryStats.list.map((item, idx) => (
                  <div key={item.categoryId} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-gray-400 w-4">{idx + 1}</span>
                        <CategoryIcon
                          icon={item.category?.icon || 'Tag'}
                          color={item.category?.color || '#A3BE8C'}
                          className="w-4 h-4"
                        />
                        <span className="font-semibold text-gray-800 dark:text-gray-200">
                          {item.category?.name || '未知分类'}
                        </span>
                        <span className="text-[10px] text-gray-400">({item.count}笔)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 dark:text-white">
                          {formatMoney(item.totalAmount, currencySymbol)}
                        </span>
                        <span className="text-[10px] text-gray-400 font-medium w-10 text-right">
                          {item.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-neutral-700/80 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${Math.max(item.percentage, 2)}%`,
                          backgroundColor: item.category?.color || '#A3BE8C',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* 借贷流动统计 */
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-bold text-gray-700 dark:text-gray-200 pb-2 border-b border-gray-100 dark:border-neutral-700/60">
              借贷与往来账款统计
            </h4>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40">
                <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                  借出款项 (应收)
                </span>
                <p className="text-base font-bold text-purple-900 dark:text-purple-200 mt-1">
                  {formatMoney(loanStats.lend, currencySymbol)}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
                <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                  借入款项 (应付)
                </span>
                <p className="text-base font-bold text-blue-900 dark:text-blue-200 mt-1">
                  {formatMoney(loanStats.borrow, currencySymbol)}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  收回欠款
                </span>
                <p className="text-base font-bold text-emerald-900 dark:text-emerald-200 mt-1">
                  {formatMoney(loanStats.collected, currencySymbol)}
                </p>
              </div>

              <div className="p-3 rounded-2xl bg-orange-50/60 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/40">
                <span className="text-[11px] text-orange-600 dark:text-orange-400 font-medium">
                  偿还款项
                </span>
                <p className="text-base font-bold text-orange-900 dark:text-orange-200 mt-1">
                  {formatMoney(loanStats.repaid, currencySymbol)}
                </p>
              </div>
            </div>
          </div>
        )}
        </div>
        </div>
      </div>
    </div>
  );
}
