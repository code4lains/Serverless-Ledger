import React, { useState, useMemo } from 'react';
import {
  TrendingDown,
  TrendingUp,
  HandCoins,
  Coins,
  Calendar,
  ChevronLeft,
  ChevronRight,
  BookOpen,
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

export type PeriodFilter = 'month' | 'year' | 'custom' | 'all';

// 调色盘：高颜值柔和莫兰迪配色
const PALETTE = [
  '#F87171', // 珊瑚红 / 橙粉
  '#FBBF24', // 暖黄
  '#FB923C', // 橙色
  '#38BDF8', // 浅蓝
  '#818CF8', // 靛青
  '#A78BFA', // 薰衣草紫
  '#34D399', // 薄荷绿
  '#F472B6', // 玫瑰粉
  '#94A3B8', // 石板灰
  '#4ADE80', // 翠绿
];

export function StatisticsView({
  transactions,
  categories,
  ledgers,
  activeLedgerId,
  onSelectLedger,
}: StatisticsViewProps) {
  const now = new Date();
  const [period, setPeriod] = useState<PeriodFilter>('month');
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth() + 1); // 1-12

  // 自定义日期范围 (默认为近30天)
  const defaultStartDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    return formatDateKey(d);
  }, []);
  const defaultEndDate = useMemo(() => formatDateKey(now), []);

  const [customStartDate, setCustomStartDate] = useState<string>(defaultStartDate);
  const [customEndDate, setCustomEndDate] = useState<string>(defaultEndDate);
  const [showCustomPicker, setShowCustomPicker] = useState<boolean>(false);

  // 分类与维度 Tab
  const [selectedType, setSelectedType] = useState<'expense' | 'income' | 'ledger' | 'loan'>('expense');
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);
  const [hoveredTrendPoint, setHoveredTrendPoint] = useState<{ label: string; amount: number; date: string } | null>(null);

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

  // 切换上一周期 (上个月 / 上一年)
  const handlePrevPeriod = () => {
    if (period === 'month') {
      if (selectedMonth === 1) {
        setSelectedYear((y) => y - 1);
        setSelectedMonth(12);
      } else {
        setSelectedMonth((m) => m - 1);
      }
    } else if (period === 'year') {
      setSelectedYear((y) => y - 1);
    }
  };

  // 切换下一周期 (下个月 / 下一年)
  const handleNextPeriod = () => {
    if (period === 'month') {
      if (selectedMonth === 12) {
        setSelectedYear((y) => y + 1);
        setSelectedMonth(1);
      } else {
        setSelectedMonth((m) => m + 1);
      }
    } else if (period === 'year') {
      setSelectedYear((y) => y + 1);
    }
  };

  // 快捷预设设置自定义日期区间
  const setCustomPreset = (preset: '7d' | '30d' | 'this_month' | 'last_month' | 'this_year') => {
    const today = new Date();
    const todayStr = formatDateKey(today);

    if (preset === '7d') {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      setCustomStartDate(formatDateKey(d));
      setCustomEndDate(todayStr);
    } else if (preset === '30d') {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      setCustomStartDate(formatDateKey(d));
      setCustomEndDate(todayStr);
    } else if (preset === 'this_month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setCustomStartDate(formatDateKey(start));
      setCustomEndDate(formatDateKey(end));
    } else if (preset === 'last_month') {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      setCustomStartDate(formatDateKey(start));
      setCustomEndDate(formatDateKey(end));
    } else if (preset === 'this_year') {
      const start = new Date(today.getFullYear(), 0, 1);
      const end = new Date(today.getFullYear(), 11, 31);
      setCustomStartDate(formatDateKey(start));
      setCustomEndDate(formatDateKey(end));
    }
  };

  // 根据账本与时间周期精准筛选流水
  const filteredTransactions = useMemo(() => {
    const monthPrefix = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-`;
    const yearPrefix = `${selectedYear}-`;

    return transactions.filter((tx) => {
      // 账本筛选
      if (activeLedgerId !== 'all' && tx.ledger_id !== activeLedgerId) {
        return false;
      }

      if (period === 'all') return true;

      const dateKey = formatDateKey(tx.transaction_date);
      if (!dateKey) return true;

      if (period === 'month') {
        return dateKey.startsWith(monthPrefix);
      }

      if (period === 'year') {
        return dateKey.startsWith(yearPrefix);
      }

      if (period === 'custom') {
        if (customStartDate && dateKey < customStartDate) return false;
        if (customEndDate && dateKey > customEndDate) return false;
        return true;
      }

      return true;
    });
  }, [transactions, activeLedgerId, period, selectedYear, selectedMonth, customStartDate, customEndDate]);

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

    const list = Array.from(statsMap.values()).map((item, idx) => {
      const category = categoryMap.get(item.categoryId);
      const percentage = totalExpense > 0 ? (item.totalAmount / totalExpense) * 100 : 0;
      const color = category?.color || PALETTE[idx % PALETTE.length];
      return {
        ...item,
        category,
        percentage,
        color,
      };
    });

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

    const list = Array.from(statsMap.values()).map((item, idx) => {
      const category = categoryMap.get(item.categoryId);
      const percentage = totalIncome > 0 ? (item.totalAmount / totalIncome) * 100 : 0;
      const color = category?.color || PALETTE[(idx + 4) % PALETTE.length];
      return {
        ...item,
        category,
        percentage,
        color,
      };
    });

    list.sort((a, b) => b.totalAmount - a.totalAmount);
    return { list, totalIncome };
  }, [filteredTransactions, categoryMap]);

  // 多账本收支分布统计
  const ledgerBreakdownStats = useMemo(() => {
    const map = new Map<string, { ledgerId: string; name: string; currency: string; expense: number; income: number; count: number }>();
    for (const l of ledgers) {
      map.set(l.ledger_id, {
        ledgerId: l.ledger_id,
        name: l.name,
        currency: l.currency,
        expense: 0,
        income: 0,
        count: 0,
      });
    }

    for (const tx of filteredTransactions) {
      const lid = tx.ledger_id || 'default';
      const item = map.get(lid) || {
        ledgerId: lid,
        name: '默认账本',
        currency: 'CNY',
        expense: 0,
        income: 0,
        count: 0,
      };
      if (tx.type === 'expense') item.expense += tx.amount;
      if (tx.type === 'income') item.income += tx.amount;
      item.count += 1;
      map.set(lid, item);
    }

    return Array.from(map.values()).filter((item) => item.count > 0 || activeLedgerId === item.ledgerId);
  }, [filteredTransactions, ledgers, activeLedgerId]);

  // 借贷统计
  const loanStats = useMemo(() => {
    let lend = 0;
    let borrow = 0;
    let repaid = 0;
    let collected = 0;

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

  // 计算趋势走势数据 (按日或按月统计)
  const trendAnalysis = useMemo(() => {
    const isDaily =
      period === 'month' ||
      (period === 'custom' &&
        customStartDate &&
        customEndDate &&
        new Date(customEndDate).getTime() - new Date(customStartDate).getTime() <= 35 * 24 * 3600 * 1000);

    const points: { label: string; date: string; expense: number; income: number }[] = [];

    if (isDaily) {
      // 每日走势
      let startDate: Date;
      let daysCount = 30;

      if (period === 'month') {
        startDate = new Date(selectedYear, selectedMonth - 1, 1);
        daysCount = new Date(selectedYear, selectedMonth, 0).getDate();
      } else {
        startDate = new Date(customStartDate || defaultStartDate);
        const endDate = new Date(customEndDate || defaultEndDate);
        daysCount = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / (24 * 3600 * 1000)) + 1);
      }

      const dailyMap = new Map<string, { expense: number; income: number }>();
      for (const tx of filteredTransactions) {
        const dKey = formatDateKey(tx.transaction_date);
        if (!dailyMap.has(dKey)) dailyMap.set(dKey, { expense: 0, income: 0 });
        const entry = dailyMap.get(dKey)!;
        if (tx.type === 'expense') entry.expense += tx.amount;
        if (tx.type === 'income') entry.income += tx.amount;
      }

      for (let i = 0; i < daysCount; i++) {
        const curD = new Date(startDate);
        curD.setDate(startDate.getDate() + i);
        const dKey = formatDateKey(curD);
        const entry = dailyMap.get(dKey) || { expense: 0, income: 0 };
        const dayNum = curD.getDate();
        points.push({
          label: `${dayNum}日`,
          date: dKey,
          expense: entry.expense,
          income: entry.income,
        });
      }
    } else {
      // 逐月走势 (按 12 个月或最近几个月)
      const targetYear = selectedYear;
      const monthMap = new Map<string, { expense: number; income: number }>();

      for (const tx of filteredTransactions) {
        const dKey = formatDateKey(tx.transaction_date);
        if (!dKey) continue;
        const mKey = dKey.slice(0, 7); // YYYY-MM
        if (!monthMap.has(mKey)) monthMap.set(mKey, { expense: 0, income: 0 });
        const entry = monthMap.get(mKey)!;
        if (tx.type === 'expense') entry.expense += tx.amount;
        if (tx.type === 'income') entry.income += tx.amount;
      }

      if (period === 'year') {
        for (let m = 1; m <= 12; m++) {
          const mKey = `${targetYear}-${String(m).padStart(2, '0')}`;
          const entry = monthMap.get(mKey) || { expense: 0, income: 0 };
          points.push({
            label: `${m}月`,
            date: mKey,
            expense: entry.expense,
            income: entry.income,
          });
        }
      } else {
        // all 或跨多月自定义：获取最近 6 个有记录或完整的月度
        const curDate = new Date();
        for (let i = 5; i >= 0; i--) {
          const d = new Date(curDate.getFullYear(), curDate.getMonth() - i, 1);
          const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const entry = monthMap.get(mKey) || { expense: 0, income: 0 };
          points.push({
            label: `${d.getMonth() + 1}月`,
            date: mKey,
            expense: entry.expense,
            income: entry.income,
          });
        }
      }
    }

    // 智能分析小结
    const totalExp = totals.totalExpense;
    const totalInc = totals.totalIncome;
    const days = Math.max(points.length, 1);
    const dailyAvgExpense = totalExp / days;
    const topExpenseCategories = expenseCategoryStats.list.slice(0, 3).map((item) => item.category?.name || '其他');
    const topIncomeCategories = incomeCategoryStats.list.slice(0, 2).map((item) => item.category?.name || '其他');

    const summaryText =
      selectedType === 'expense'
        ? totalExp > 0
          ? `支出 ${formatMoney(totalExp, currencySymbol)}，日均 ${formatMoney(dailyAvgExpense, currencySymbol)}，主要去向是 ${topExpenseCategories.join('、')}`
          : '当前时间段内暂无支出明细'
        : totalInc > 0
        ? `总收入 ${formatMoney(totalInc, currencySymbol)}，主要来源于 ${topIncomeCategories.join('、')}`
        : '当前时间段内暂无收入明细';

    return {
      isDaily,
      points,
      summaryText,
    };
  }, [
    period,
    selectedYear,
    selectedMonth,
    customStartDate,
    customEndDate,
    defaultStartDate,
    defaultEndDate,
    filteredTransactions,
    totals,
    expenseCategoryStats,
    incomeCategoryStats,
    selectedType,
    currencySymbol,
  ]);

  // 当前时间周期显示标题
  const periodDisplayTitle = useMemo(() => {
    if (period === 'month') {
      return `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    }
    if (period === 'year') {
      return `${selectedYear} 年`;
    }
    if (period === 'custom') {
      return `${customStartDate || '开始'} ~ ${customEndDate || '结束'}`;
    }
    return '全部历史数据';
  }, [period, selectedYear, selectedMonth, customStartDate, customEndDate]);

  // 当前激活的数据列表 (支出 vs 收入)
  const currentActiveStats = selectedType === 'income' ? incomeCategoryStats : expenseCategoryStats;
  const currentActiveTotal = selectedType === 'income' ? totals.totalIncome : totals.totalExpense;
  const currentActiveLabel = selectedType === 'income' ? '总收入' : '总支出';

  return (
    <div className="flex flex-col gap-4 animate-fade-in pb-12">
      {/* 1. 顶部控制栏 (账本切换与时间周期 Pills) */}
      <div className="flex items-center justify-between gap-2">
        {/* 账本下拉选择 */}
        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-3 py-1.5 rounded-2xl shadow-sm text-xs font-medium">
          <Coins className="w-3.5 h-3.5 text-indigo-500" />
          <select
            value={activeLedgerId}
            onChange={(e) => onSelectLedger(e.target.value)}
            className="bg-transparent text-slate-800 dark:text-slate-200 outline-none cursor-pointer font-semibold text-xs"
          >
            <option value="all">全部账本</option>
            {ledgers.map((l) => (
              <option key={l.ledger_id} value={l.ledger_id}>
                {l.name} ({l.currency})
              </option>
            ))}
          </select>
        </div>

        {/* 周期切换 Pills (本月 / 本年 / 自定义 / 全部) */}
        <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl text-xs font-medium">
          {(
            [
              { id: 'month', label: '本月' },
              { id: 'year', label: '本年' },
              { id: 'custom', label: '自定义' },
              { id: 'all', label: '全部' },
            ] as const
          ).map(({ id, label }) => {
            const isCur = period === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setPeriod(id);
                  if (id === 'custom') setShowCustomPicker(true);
                }}
                className={`px-3 py-1 rounded-xl transition-all duration-150 active:scale-95 text-xs ${
                  isCur
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm font-bold'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. 周期快捷前后切换导航条 (参考图顶部：< 2026-09 >) */}
      <div className="flex items-center justify-between px-3 py-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
        <button
          type="button"
          disabled={period === 'all'}
          onClick={handlePrevPeriod}
          className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div
          onClick={() => {
            if (period === 'custom') setShowCustomPicker(!showCustomPicker);
          }}
          className={`flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 ${
            period === 'custom' ? 'cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400' : ''
          }`}
        >
          <Calendar className="w-3.5 h-3.5 text-indigo-500" />
          <span>{periodDisplayTitle}</span>
          {period === 'custom' && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-normal">
              调整
            </span>
          )}
        </div>

        <button
          type="button"
          disabled={period === 'all'}
          onClick={handleNextPeriod}
          className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 3. 自定义日期范围快捷筛选面板 (当 period === 'custom' 时展开) */}
      {period === 'custom' && (
        <div className="p-4 rounded-3xl bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/40 shadow-sm space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              <span>选择自定义时间范围</span>
            </span>
            <div className="flex items-center gap-1">
              {(
                [
                  { id: '7d', label: '近7天' },
                  { id: '30d', label: '近30天' },
                  { id: 'this_month', label: '本月' },
                  { id: 'last_month', label: '上月' },
                  { id: 'this_year', label: '本年' },
                ] as const
              ).map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setCustomPreset(id)}
                  className="px-2 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950/50 dark:hover:text-indigo-300 text-slate-600 dark:text-slate-300 transition"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">起始日期</label>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-slate-500 dark:text-slate-400">结束日期</label>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* 4. 统计核心卡片与图表区 */}
      <div className="flex flex-col gap-4">
        {/* 4.1 核心概览看板 */}
        <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              {period === 'month' ? '当月净结余' : period === 'year' ? '年度净结余' : '期内净结余'}
            </span>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold">
              {filteredTransactions.length} 笔明细
            </span>
          </div>

          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white font-mono">
              {formatMoney(totals.balance, currencySymbol)}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800/80">
            <div
              onClick={() => setSelectedType('expense')}
              className={`p-2.5 rounded-2xl transition cursor-pointer flex items-center gap-2.5 ${
                selectedType === 'expense' ? 'bg-rose-50/70 dark:bg-rose-950/30 ring-1 ring-rose-200 dark:ring-rose-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="w-8 h-8 rounded-xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <TrendingDown className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400">总支出</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono">
                  {formatMoney(totals.totalExpense, currencySymbol)}
                </p>
              </div>
            </div>

            <div
              onClick={() => setSelectedType('income')}
              className={`p-2.5 rounded-2xl transition cursor-pointer flex items-center gap-2.5 ${
                selectedType === 'income' ? 'bg-emerald-50/70 dark:bg-emerald-950/30 ring-1 ring-emerald-200 dark:ring-emerald-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <p className="text-[10px] text-slate-400">总收入</p>
                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono">
                  {formatMoney(totals.totalIncome, currencySymbol)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* 4.2 维度 Tab 切换 (支出 / 收入 / 账户分布 / 借贷) */}
        <div className="flex bg-slate-100 dark:bg-slate-800/80 p-1 rounded-2xl text-xs font-semibold">
          <button
            type="button"
            onClick={() => setSelectedType('expense')}
            className={`flex-1 py-1.5 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-95 ${
              selectedType === 'expense'
                ? 'bg-white dark:bg-slate-700 text-rose-600 dark:text-rose-400 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            <span>支出分析</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('income')}
            className={`flex-1 py-1.5 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-95 ${
              selectedType === 'income'
                ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>收入分析</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('ledger')}
            className={`flex-1 py-1.5 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-95 ${
              selectedType === 'ledger'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>账户分布</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedType('loan')}
            className={`flex-1 py-1.5 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-95 ${
              selectedType === 'loan'
                ? 'bg-white dark:bg-slate-700 text-purple-600 dark:text-purple-400 shadow-sm font-bold'
                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
            }`}
          >
            <HandCoins className="w-3.5 h-3.5" />
            <span>借贷往来</span>
          </button>
        </div>

        {/* 4.3 核心图表卡片 1：SVG 环形占比图 (Donut Chart) + 右侧 Top 排行 (参考截图) */}
        {(selectedType === 'expense' || selectedType === 'income') && (
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {selectedType === 'expense' ? '支出分类构成' : '收入分类构成'}
              </span>
              <span className="text-[11px] text-slate-400">
                共 {currentActiveStats.list.length} 个分类
              </span>
            </div>

            {currentActiveTotal <= 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                暂无{selectedType === 'expense' ? '支出' : '收入'}数据
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-around gap-6 py-2">
                {/* SVG 环形图 */}
                <div className="relative flex items-center justify-center shrink-0">
                  <DonutChartSvg
                    items={currentActiveStats.list}
                    total={currentActiveTotal}
                    hoveredId={hoveredCategory}
                    onHover={setHoveredCategory}
                  />
                  {/* 环形中央信息 */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
                    <span className="text-[11px] font-medium text-slate-400">
                      {currentActiveLabel}
                    </span>
                    <span className="text-base font-extrabold text-slate-900 dark:text-white font-mono leading-tight mt-0.5">
                      {formatMoney(currentActiveTotal, '').replace('¥', '')}
                    </span>
                  </div>
                </div>

                {/* 右侧 Top 4 分类列表 (参考截图) */}
                <div className="flex-1 w-full max-w-xs space-y-2.5">
                  {currentActiveStats.list.slice(0, 5).map((item) => {
                    const isHovered = hoveredCategory === item.categoryId;
                    return (
                      <div
                        key={item.categoryId}
                        onMouseEnter={() => setHoveredCategory(item.categoryId)}
                        onMouseLeave={() => setHoveredCategory(null)}
                        className={`flex items-center justify-between text-xs py-1 px-2 rounded-xl transition ${
                          isHovered ? 'bg-slate-100 dark:bg-slate-800/60 font-bold' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-slate-700 dark:text-slate-200 truncate">
                            {item.category?.name || '未知分类'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-semibold text-slate-900 dark:text-white font-mono">
                            {formatMoney(item.totalAmount, '').replace('¥', '')}
                          </span>
                          <span className="text-[10px] text-slate-400 w-8 text-right">
                            {item.percentage.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 4.4 核心图表卡片 2：SVG 平滑渐变曲线走势图 (参考截图) */}
        {(selectedType === 'expense' || selectedType === 'income') && (
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                {trendAnalysis.isDaily
                  ? selectedType === 'expense'
                    ? '每日支出趋势'
                    : '每日收入趋势'
                  : selectedType === 'expense'
                  ? '逐月支出'
                  : '逐月收入'}
              </h4>
              {hoveredTrendPoint && (
                <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 animate-fade-in">
                  {hoveredTrendPoint.date}: {formatMoney(hoveredTrendPoint.amount, currencySymbol)}
                </span>
              )}
            </div>

            {/* 平滑走势曲线图 */}
            <div className="w-full h-44 pt-2">
              <SmoothAreaTrendChartSvg
                data={trendAnalysis.points}
                type={selectedType}
                currencySymbol={currencySymbol}
                onHoverPoint={setHoveredTrendPoint}
              />
            </div>

            {/* 智能小结文字 (参考截图底部) */}
            <div className="flex items-start gap-2 pt-2 border-t border-slate-100 dark:border-slate-800/80 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0 mt-1.5" />
              <span>{trendAnalysis.summaryText}</span>
            </div>
          </div>
        )}

        {/* 4.5 详细分类进度条列表 (分类排行榜) */}
        {(selectedType === 'expense' || selectedType === 'income') && (
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200">
              <span>{selectedType === 'expense' ? '全部支出明细占比' : '全部收入明细占比'}</span>
              <span className="text-slate-400 font-normal">
                共 {formatMoney(currentActiveTotal, currencySymbol)}
              </span>
            </div>

            {currentActiveStats.list.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                当前筛选区间内无{selectedType === 'expense' ? '支出' : '收入'}记录
              </div>
            ) : (
              <div className="flex flex-col gap-3.5 pt-1">
                {currentActiveStats.list.map((item, idx) => (
                  <div
                    key={item.categoryId}
                    onMouseEnter={() => setHoveredCategory(item.categoryId)}
                    onMouseLeave={() => setHoveredCategory(null)}
                    className="flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold text-slate-400 w-4">{idx + 1}</span>
                        <CategoryIcon
                          icon={item.category?.icon || 'Tag'}
                          color={item.color}
                          className="w-4 h-4"
                        />
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                          {item.category?.name || '未知分类'}
                        </span>
                        <span className="text-[10px] text-slate-400">({item.count}笔)</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-bold text-slate-900 dark:text-white font-mono">
                          {formatMoney(item.totalAmount, currencySymbol)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium w-10 text-right">
                          {item.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    {/* 莫兰迪色柔和进度条 */}
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{
                          width: `${Math.max(item.percentage, 2)}%`,
                          backgroundColor: item.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 4.6 账户/账本分布维度面板 */}
        {selectedType === 'ledger' && (
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 pb-2 border-b border-slate-100 dark:border-slate-800">
              各账本收支核算分布
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {ledgerBreakdownStats.map((item) => {
                const sym = getCurrencySymbol(item.currency);
                return (
                  <div
                    key={item.ledgerId}
                    className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                          {item.name.slice(0, 1)}
                        </div>
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {item.name}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400">{item.count} 笔</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                      <div>
                        <span className="text-[10px] text-slate-400">支出</span>
                        <p className="font-bold text-rose-600 dark:text-rose-400 font-mono">
                          {formatMoney(item.expense, sym)}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400">收入</span>
                        <p className="font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                          {formatMoney(item.income, sym)}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 4.7 借贷流动统计 */}
        {selectedType === 'loan' && (
          <div className="p-5 rounded-3xl bg-white dark:bg-slate-900 shadow-sm border border-slate-100 dark:border-slate-800 space-y-4">
            <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200 pb-2 border-b border-slate-100 dark:border-slate-800">
              借贷与往来账款统计
            </h4>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="p-3.5 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40">
                <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">
                  借出款项 (应收)
                </span>
                <p className="text-base font-bold text-purple-900 dark:text-purple-200 mt-1 font-mono">
                  {formatMoney(loanStats.lend, currencySymbol)}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/40">
                <span className="text-[11px] text-blue-600 dark:text-blue-400 font-medium">
                  借入款项 (应付)
                </span>
                <p className="text-base font-bold text-blue-900 dark:text-blue-200 mt-1 font-mono">
                  {formatMoney(loanStats.borrow, currencySymbol)}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  收回欠款
                </span>
                <p className="text-base font-bold text-emerald-900 dark:text-emerald-200 mt-1 font-mono">
                  {formatMoney(loanStats.collected, currencySymbol)}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-orange-50/60 dark:bg-orange-950/30 border border-orange-100 dark:border-orange-900/40">
                <span className="text-[11px] text-orange-600 dark:text-orange-400 font-medium">
                  偿还款项
                </span>
                <p className="text-base font-bold text-orange-900 dark:text-orange-200 mt-1 font-mono">
                  {formatMoney(loanStats.repaid, currencySymbol)}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================
// 辅助子组件 1: SVG 环形图 (Donut Chart)
// ==========================================
interface DonutSliceItem {
  categoryId: string;
  totalAmount: number;
  percentage: number;
  color: string;
}

function DonutChartSvg({
  items,
  total,
  hoveredId,
  onHover,
}: {
  items: DonutSliceItem[];
  total: number;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
}) {
  const radius = 50;
  const strokeWidth = 14;
  const circumference = 2 * Math.PI * radius; // ≈ 314.159

  let accumulatedLength = 0;

  return (
    <svg width="140" height="140" viewBox="0 0 140 140" className="rotate-[-90deg]">
      {/* 灰色底环 */}
      <circle
        cx="70"
        cy="70"
        r={radius}
        fill="transparent"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-slate-100 dark:text-slate-800"
      />

      {/* 各分类圆弧片段 */}
      {items.map((item) => {
        const sliceLength = total > 0 ? (item.totalAmount / total) * circumference : 0;
        const offset = -accumulatedLength;
        accumulatedLength += sliceLength;
        const isHovered = hoveredId === item.categoryId;

        return (
          <circle
            key={item.categoryId}
            cx="70"
            cy="70"
            r={radius}
            fill="transparent"
            stroke={item.color}
            strokeWidth={isHovered ? strokeWidth + 3 : strokeWidth}
            strokeDasharray={`${sliceLength} ${circumference}`}
            strokeDashoffset={offset}
            strokeLinecap="round"
            onMouseEnter={() => onHover(item.categoryId)}
            onMouseLeave={() => onHover(null)}
            className="transition-all duration-300 cursor-pointer"
          />
        );
      })}
    </svg>
  );
}

// ==========================================
// 辅助子组件 2: SVG 平滑渐变曲线走势图 (Smooth Area Chart)
// ==========================================
interface TrendDataPoint {
  label: string;
  date: string;
  expense: number;
  income: number;
}

function SmoothAreaTrendChartSvg({
  data,
  type,
  currencySymbol,
  onHoverPoint,
}: {
  data: TrendDataPoint[];
  type: 'expense' | 'income' | 'ledger' | 'loan';
  currencySymbol: string;
  onHoverPoint: (pt: { label: string; amount: number; date: string } | null) => void;
}) {
  const width = 500;
  const height = 140;
  const paddingBottom = 26;
  const paddingTop = 20;
  const chartHeight = height - paddingBottom - paddingTop;

  if (data.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center text-xs text-slate-400">
        暂无趋势数据
      </div>
    );
  }

  const values = data.map((d) => (type === 'income' ? d.income : d.expense));
  const maxVal = Math.max(...values, 100);

  const points = data.map((d, i) => {
    const val = type === 'income' ? d.income : d.expense;
    const x = data.length > 1 ? (i / (data.length - 1)) * (width - 40) + 20 : width / 2;
    const y = paddingTop + chartHeight - (val / maxVal) * chartHeight;
    return { x, y, val, label: d.label, date: d.date };
  });

  // 三次贝塞尔曲线控制点计算
  const getSmoothPath = (pts: typeof points) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i === 0 ? 0 : i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 >= pts.length ? i + 1 : i + 2];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return d;
  };

  const linePath = getSmoothPath(points);
  const areaPath = `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;

  const isExpense = type !== 'income';
  const strokeColor = isExpense ? '#F43F5E' : '#10B981'; // 玫红 vs 翠绿
  const gradientId = isExpense ? 'expense-area-gradient' : 'income-area-gradient';

  // 找最后一个非 0 点或末端点，展示参考图上的小气泡
  const latestPoint = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.25" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* 渐变面积填充 */}
      <path d={areaPath} fill={`url(#${gradientId})`} />

      {/* 平滑走势折线 */}
      <path
        d={linePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* 数据节点圆点与悬浮互动 */}
      {points.map((p, i) => (
        <g key={i}>
          {p.val > 0 && (
            <circle
              cx={p.x}
              cy={p.y}
              r="3"
              fill="white"
              stroke={strokeColor}
              strokeWidth="2"
              className="transition-all"
            />
          )}
          {/* 隐形大热区便于鼠标触控悬浮 */}
          <circle
            cx={p.x}
            cy={p.y}
            r="12"
            fill="transparent"
            onMouseEnter={() => onHoverPoint({ label: p.label, amount: p.val, date: p.date })}
            onMouseLeave={() => onHoverPoint(null)}
            className="cursor-pointer"
          />
        </g>
      ))}

      {/* 最新/末端数值气泡 (参考图中的 283.00) */}
      {latestPoint && latestPoint.val > 0 && (
        <g transform={`translate(${latestPoint.x - 20}, ${latestPoint.y - 12})`}>
          <text
            x="0"
            y="0"
            fontSize="10"
            fontWeight="bold"
            fill={strokeColor}
            className="font-mono"
          >
            {formatMoney(latestPoint.val, '').replace('¥', '')}
          </text>
        </g>
      )}

      {/* X 轴刻度标签 */}
      {points.map((p, i) => {
        // 如果点太多（例如 30 天），每隔 5 天显示一个标签
        const shouldShowLabel =
          points.length <= 12 ||
          i === 0 ||
          i === points.length - 1 ||
          i % Math.ceil(points.length / 6) === 0;

        if (!shouldShowLabel) return null;

        return (
          <text
            key={i}
            x={p.x}
            y={height - 6}
            textAnchor="middle"
            fontSize="10"
            className="fill-slate-400 font-sans"
          >
            {p.label}
          </text>
        );
      })}
    </svg>
  );
}
