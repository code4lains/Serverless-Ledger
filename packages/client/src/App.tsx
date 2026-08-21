import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  PlusCircle,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Moon,
  Sun,
  CheckCircle2,
  Clock,
  Cloud,
  CloudOff,
  Database,
  Smartphone,
  Monitor,
  Globe,
  Layers,
  User as UserIcon,
  LogIn,
  LogOut,
  Calendar,
  Search,
  Filter,
  Inbox,
} from 'lucide-react';
import {
  Transaction,
  Category,
  TransactionType,
  AuthUser,
  formatMoney,
  toCents,
  groupTransactionsByDay,
  calculateTotals,
  formatTime,
  formatDateKey,
  getCategoryMeta,
  getInitialCategoryId,
} from '@ledger/shared';
import { localDb, seedLocalCategories } from './db';
import {
  checkServerHealth,
  getCategories,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  syncPendingTransactions,
  pullAndMergeServerTransactions,
  getStoredUser,
  fetchCurrentUser,
  clearSession,
} from './api/client';
import { AuthModal } from './components/AuthModal';
import { CategoryIcon } from './components/CategoryIcon';
import { CategoryPicker } from './components/CategoryPicker';
import { TransactionDetailModal } from './components/TransactionDetailModal';

export function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getStoredUser());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [selectedTxForDetail, setSelectedTxForDetail] = useState<Transaction | null>(null);

  // 记账表单状态
  const [activeTab, setActiveTab] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState<string>('');
  const [remark, setRemark] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [recordDateType, setRecordDateType] = useState<'today' | 'yesterday' | 'beforeYesterday' | 'custom'>('today');
  const [customDate, setCustomDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // 数据列表与服务端状态
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [serverStatus, setServerStatus] = useState<{ ok: boolean; data?: any }>({ ok: false });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);

  // 筛选状态
  const [filterType, setFilterType] = useState<'all' | 'expense' | 'income'>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // 初始化暗黑主题
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // 从本地 Dexie 加载数据
  const loadLocalData = async () => {
    const list = await localDb.transactions.orderBy('transaction_date').reverse().toArray();
    setTransactions(list);
    const pending = await localDb.transactions.where('sync_status').equals('pending').count();
    setPendingCount(pending);
  };

  // 初始化应用
  useEffect(() => {
    const init = async () => {
      await seedLocalCategories();
      const cats = await getCategories();
      setCategories(cats);
      setSelectedCategory(getInitialCategoryId('expense', cats));
      await loadLocalData();

      // 验证并更新用户信息
      const userRes = await fetchCurrentUser();
      if (userRes.success && userRes.data) {
        setCurrentUser(userRes.data);
      } else if (!userRes.success && getStoredUser()) {
        setCurrentUser(null);
      }


      // 检查后端 CF Workers + D1 连通性
      const health = await checkServerHealth();
      setServerStatus(health);

      // 自动尝试后台拉取最新数据
      if (health.ok) {
        await pullAndMergeServerTransactions();
        await loadLocalData();
      }
    };

    init();
  }, []);

  // 计算记账时间 ISO 字符串
  const getCalculatedTransactionDate = (): string => {
    const now = new Date();
    if (recordDateType === 'today') {
      return now.toISOString();
    } else if (recordDateType === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return yesterday.toISOString();
    } else if (recordDateType === 'beforeYesterday') {
      const beforeYesterday = new Date(now);
      beforeYesterday.setDate(beforeYesterday.getDate() - 2);
      return beforeYesterday.toISOString();
    } else {
      // 自定义日期
      try {
        const custom = new Date(customDate);
        custom.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
        return custom.toISOString();
      } catch {
        return now.toISOString();
      }
    }
  };

  // 提交记账 (3秒快速极简记账)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountStr || parseFloat(amountStr) <= 0) return;

    const amountInCents = toCents(amountStr);
    const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userId = currentUser?.user_id || 'default_user';
    const ledgerId = currentUser?.default_ledger_id || 'default_ledger';
    const txDate = getCalculatedTransactionDate();

    await createTransaction({
      transaction_id: txId,
      user_id: userId,
      ledger_id: ledgerId,
      type: activeTab,
      amount: amountInCents,
      category_id: selectedCategory || null,
      transaction_date: txDate,
      remark: remark.trim() || null,
    });

    // 快速重置并刷新
    setAmountStr('');
    setRemark('');
    await loadLocalData();
  };

  // 手动触发同步
  const handleSync = async () => {
    setIsSyncing(true);
    await syncPendingTransactions();
    const health = await checkServerHealth();
    setServerStatus(health);
    await loadLocalData();
    setIsSyncing(false);
  };

  // 退出登录
  const handleLogout = () => {
    clearSession();
    setCurrentUser(null);
  };

  // 登录/注册成功回调
  const handleAuthSuccess = async (user: AuthUser) => {
    setCurrentUser(user);
    await handleSync();
  };

  // 流水修改回调
  const handleUpdateTransaction = async (updatedTx: Transaction) => {
    await updateTransaction(updatedTx.transaction_id, updatedTx);
    await loadLocalData();
    setSelectedTxForDetail(updatedTx);
  };

  // 流水删除回调
  const handleDeleteTransaction = async (transactionId: string) => {
    await deleteTransaction(transactionId);
    await loadLocalData();
    setSelectedTxForDetail(null);
  };

  // 记账 Tab 切换处理
  const handleTabChange = (type: TransactionType) => {
    setActiveTab(type);
    setSelectedCategory(getInitialCategoryId(type, categories));
  };

  // 过滤后的流水列表

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // 类型筛选
      if (filterType !== 'all' && t.type !== filterType) {
        return false;
      }
      // 搜索关键词 (匹配备注或分类名)
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const catMeta = getCategoryMeta(t.category_id, categories, t.type);
        const matchRemark = t.remark && t.remark.toLowerCase().includes(kw);
        const matchCat = catMeta.fullPath.toLowerCase().includes(kw) || catMeta.name.toLowerCase().includes(kw);
        return matchRemark || matchCat;
      }

      return true;
    });
  }, [transactions, filterType, searchKeyword, categories]);

  // 全量收支与结余统计
  const totals = useMemo(() => {
    return calculateTotals(transactions);
  }, [transactions]);

  // 按天分组的流水明细
  const dayGroups = useMemo(() => {
    return groupTransactionsByDay(filteredTransactions);
  }, [filteredTransactions]);

  return (
    <div className="min-h-screen bg-[#F7F6F2] dark:bg-[#18191A] text-gray-800 dark:text-gray-100 flex flex-col items-center p-3 sm:p-6 font-sans">
      <div className="w-full max-w-md flex flex-col gap-4">
        {/* 顶部导航与状态栏 */}
        <header className="flex justify-between items-center py-2 px-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 flex items-center justify-center font-bold text-sm shadow-sm">
              ￥
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">极简记账</h1>
              <p className="text-[11px] text-gray-400">Serverless Ledger · Phase 1</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentUser ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 text-xs">
                <UserIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="font-medium max-w-[90px] truncate text-gray-700 dark:text-gray-200" title={currentUser.email}>
                  {currentUser.email.split('@')[0]}
                </span>
                <button
                  onClick={handleLogout}
                  title="退出登录"
                  className="p-0.5 hover:bg-gray-100 dark:hover:bg-neutral-700 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-semibold shadow-sm hover:opacity-90 active:scale-95 transition-all"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>登录/注册</span>
              </button>
            )}
            <button
              onClick={handleSync}
              disabled={isSyncing}
              title="双向同步数据至 Cloudflare D1"
              className="p-2 rounded-xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 hover:bg-gray-50 active:scale-95 transition-all text-gray-600 dark:text-gray-300"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-500' : ''}`} />
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 hover:bg-gray-50 active:scale-95 transition-all text-gray-600 dark:text-gray-300"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-600" />}
            </button>
          </div>
        </header>

        {/* 全栈开发管线连通状态面板 */}
        <div className="bg-white dark:bg-neutral-800/80 rounded-2xl p-3.5 shadow-sm border border-gray-100 dark:border-neutral-700/60 backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400 mb-2.5">
            <span className="flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-200">
              <Layers className="w-3.5 h-3.5 text-indigo-500" /> 单账本架构已就绪
            </span>
            <div className="flex items-center gap-1.5">
              <span title="Web PWA"><Globe className="w-3 h-3 text-emerald-500" /></span>
              <span title="Capacitor Mobile"><Smartphone className="w-3 h-3 text-blue-500" /></span>
              <span title="Tauri Desktop"><Monitor className="w-3 h-3 text-purple-500" /></span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-xl bg-gray-50 dark:bg-neutral-900/60 flex items-center justify-between">
              <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                <Database className="w-3.5 h-3.5 text-blue-500" /> 本地 Dexie DB
              </span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">已缓存 ({transactions.length}条)</span>
            </div>
            <div className="p-2 rounded-xl bg-gray-50 dark:bg-neutral-900/60 flex items-center justify-between">
              <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                {serverStatus.ok ? <Cloud className="w-3.5 h-3.5 text-emerald-500" /> : <CloudOff className="w-3.5 h-3.5 text-amber-500" />}
                CF Workers & D1
              </span>
              <span className={`font-medium ${serverStatus.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}`}>
                {serverStatus.ok ? '在线' : '离线模式'}
              </span>
            </div>
          </div>

          {pendingCount > 0 && (
            <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 px-1">
              <Clock className="w-3 h-3" /> 有 {pendingCount} 笔流水暂存本地，联网后将自动上传
            </div>
          )}
        </div>

        {/* 概览卡片 (单账本收支汇总) */}
        <div className="bg-gradient-to-br from-neutral-800 to-neutral-900 text-white rounded-3xl p-5 shadow-md">
          <div className="flex justify-between items-center text-xs text-neutral-400 mb-1">
            <span>默认日常账本 · 结余 (CNY)</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-700 text-neutral-300">单账本模式</span>
          </div>
          <div className="text-2xl font-extrabold tracking-tight mb-4">
            {formatMoney(totals.balance)}
          </div>
          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-neutral-700/60 text-xs">
            <div>
              <div className="text-neutral-400 flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5 text-[#D08770]" /> 总支出
              </div>
              <div className="text-sm font-semibold mt-0.5 text-[#D08770]">{formatMoney(totals.totalExpense)}</div>
            </div>
            <div>
              <div className="text-neutral-400 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-[#A3BE8C]" /> 总收入
              </div>
              <div className="text-sm font-semibold mt-0.5 text-[#A3BE8C]">{formatMoney(totals.totalIncome)}</div>
            </div>
          </div>
        </div>

        {/* 3秒极简记账录入区 */}
        <div className="bg-white dark:bg-neutral-800 rounded-3xl p-4 shadow-sm border border-gray-100 dark:border-neutral-700">
          {/* 类型切换 (支出 / 收入) */}
          <div className="flex bg-gray-100 dark:bg-neutral-900 rounded-2xl p-1 mb-3.5">
            {(['expense', 'income'] as TransactionType[]).map((type) => {
              const labels: Record<string, string> = {
                expense: '支出',
                income: '收入',
              };
              const isActive = activeTab === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTabChange(type)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                    isActive
                      ? 'bg-white dark:bg-neutral-800 text-gray-900 dark:text-white shadow-xs'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                  }`}
                >
                  {labels[type]}
                </button>
              );
            })}
          </div>


          <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
            {/* 金额输入框与快捷填充 */}
            <div className="flex flex-col gap-1.5">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-400">¥</span>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 text-xl font-bold rounded-2xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none transition-all"
                  autoFocus
                />
              </div>

              {/* 快捷金额预设 */}
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar text-[11px]">
                {[10, 20, 50, 100, 200].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => {
                      const current = parseFloat(amountStr) || 0;
                      setAmountStr((current + preset).toString());
                    }}
                    className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-neutral-700/60 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors"
                  >
                    +{preset}
                  </button>
                ))}
                {amountStr && (
                  <button
                    type="button"
                    onClick={() => setAmountStr('')}
                    className="px-2 py-1 rounded-lg text-gray-400 hover:text-red-500 text-[10px]"
                  >
                    清空
                  </button>
                )}
              </div>
            </div>

            {/* 大类 + 小类二级联动分类选择器 */}
            <div className="flex flex-col gap-1">
              <div className="text-[11px] font-medium text-gray-400 px-0.5">分类选择</div>
              <CategoryPicker
                categories={categories}
                type={activeTab}
                selectedCategoryId={selectedCategory}
                onSelectCategory={setSelectedCategory}
              />
            </div>

            {/* 记账日期快捷切换 */}
            <div className="flex flex-col gap-1 pt-1 border-t border-gray-100 dark:border-neutral-700/60">
              <div className="text-[11px] font-medium text-gray-400 px-0.5">记账日期</div>
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
                <button
                  type="button"
                  onClick={() => setRecordDateType('today')}
                  className={`px-3 py-1 rounded-xl font-medium transition-all ${
                    recordDateType === 'today'
                      ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 shadow-xs'
                      : 'bg-gray-100 dark:bg-neutral-700/60 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  今天
                </button>
                <button
                  type="button"
                  onClick={() => setRecordDateType('yesterday')}
                  className={`px-3 py-1 rounded-xl font-medium transition-all ${
                    recordDateType === 'yesterday'
                      ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 shadow-xs'
                      : 'bg-gray-100 dark:bg-neutral-700/60 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  昨天
                </button>
                <button
                  type="button"
                  onClick={() => setRecordDateType('beforeYesterday')}
                  className={`px-3 py-1 rounded-xl font-medium transition-all ${
                    recordDateType === 'beforeYesterday'
                      ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 shadow-xs'
                      : 'bg-gray-100 dark:bg-neutral-700/60 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  前天
                </button>
                <button
                  type="button"
                  onClick={() => setRecordDateType('custom')}
                  className={`flex items-center gap-1 px-3 py-1 rounded-xl font-medium transition-all ${
                    recordDateType === 'custom'
                      ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 shadow-xs'
                      : 'bg-gray-100 dark:bg-neutral-700/60 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  <Calendar className="w-3 h-3" />
                  <span>自定义</span>
                </button>
              </div>

              {recordDateType === 'custom' && (
                <div className="mt-1">
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* 备注与记一笔按钮 */}
            <div className="flex gap-2 pt-1">
              <input
                type="text"
                placeholder="添加备注 (可选)..."
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!amountStr || parseFloat(amountStr) <= 0}
                className="px-5 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-semibold text-xs shadow-sm hover:opacity-90 active:scale-95 disabled:opacity-40 transition-all flex items-center gap-1.5"
              >
                <PlusCircle className="w-4 h-4" /> 记一笔
              </button>
            </div>
          </form>
        </div>

        {/* 账单流水明细列表 */}
        <div className="bg-white dark:bg-neutral-800 rounded-3xl p-4 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3">
          {/* 列表头部与筛选器 */}
          <div className="flex flex-col gap-2.5 pb-2 border-b border-gray-100 dark:border-neutral-700/60">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                流水明细列表
              </h2>
              <span className="text-[11px] text-gray-400">共 {filteredTransactions.length} 笔记录</span>
            </div>

            {/* 筛选切换 (全部 / 支出 / 收入) & 搜索 */}
            <div className="flex items-center gap-2">
              <div className="flex bg-gray-100 dark:bg-neutral-900 rounded-xl p-0.5 text-xs">
                {(['all', 'expense', 'income'] as const).map((t) => {
                  const labels = { all: '全部', expense: '支出', income: '收入' };
                  const isCur = filterType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFilterType(t)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                        isCur
                          ? 'bg-white dark:bg-neutral-800 text-gray-900 dark:text-white shadow-2xs'
                          : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      {labels[t]}
                    </button>
                  );
                })}
              </div>

              {/* 搜索框 */}
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="搜索备注或分类..."
                  value={searchKeyword}
                  onChange={(e) => setSearchKeyword(e.target.value)}
                  className="w-full pl-7 pr-3 py-1 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 按日期分组的时间轴列表 */}
          {dayGroups.length === 0 ? (
            <div className="py-12 text-center text-xs text-gray-400 flex flex-col items-center gap-2">
              <Inbox className="w-8 h-8 text-gray-300 dark:text-neutral-600" />
              <span>{searchKeyword ? '没有找到匹配的记账明细' : '暂无流水记录，快在上方记一笔吧'}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {dayGroups.map((group) => (
                <div key={group.date} className="flex flex-col gap-1.5">
                  {/* 日期分组头部 (含当日收支小计) */}
                  <div className="flex justify-between items-center text-[11px] font-medium text-gray-400 dark:text-gray-500 px-1 pt-1">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">
                      {group.displayDate}
                    </span>
                    <div className="flex items-center gap-2 text-[10px]">
                      {group.totalExpense > 0 && (
                        <span>支: <strong className="text-[#D08770]">{formatMoney(group.totalExpense)}</strong></span>
                      )}
                      {group.totalIncome > 0 && (
                        <span>收: <strong className="text-[#A3BE8C]">{formatMoney(group.totalIncome)}</strong></span>
                      )}
                    </div>
                  </div>

                  {/* 当日流水卡片列表 */}
                  <div className="bg-gray-50/70 dark:bg-neutral-900/50 rounded-2xl p-1.5 flex flex-col divide-y divide-gray-100 dark:divide-neutral-800">
                    {group.transactions.map((tx) => {
                      const isExpense = tx.type === 'expense';
                      const catMeta = getCategoryMeta(tx.category_id, categories, tx.type);

                      return (
                        <div
                          key={tx.transaction_id}
                          onClick={() => setSelectedTxForDetail(tx)}
                          className="py-2.5 px-2 flex items-center justify-between hover:bg-white dark:hover:bg-neutral-800 rounded-xl transition-all cursor-pointer group"
                        >
                          {/* 左侧：分类图标与名称/备注 */}
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105 ${
                                isExpense
                                  ? 'bg-orange-100/70 dark:bg-orange-950/40 text-[#D08770]'
                                  : 'bg-emerald-100/70 dark:bg-emerald-950/40 text-[#A3BE8C]'
                              }`}
                            >
                              <CategoryIcon icon={catMeta.icon} className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                                {catMeta.fullPath}
                              </div>
                              <div className="text-[10px] text-gray-400 flex items-center gap-1.5">
                                <span>{formatTime(tx.transaction_date)}</span>
                                {tx.remark && (
                                  <>
                                    <span>·</span>
                                    <span className="max-w-[140px] truncate">{tx.remark}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* 右侧：金额与同步标记 */}
                          <div className="text-right flex items-center gap-2">
                            <div>
                              <div
                                className={`text-xs font-bold ${
                                  isExpense ? 'text-gray-900 dark:text-white' : 'text-[#A3BE8C]'
                                }`}
                              >
                                {isExpense ? '-' : '+'}
                                {formatMoney(tx.amount)}
                              </div>
                            </div>
                            {tx.sync_status === 'synced' ? (
                              <span title="已同步到 Cloudflare D1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              </span>
                            ) : (
                              <span title="暂存本地 IndexedDB">
                                <Clock className="w-3.5 h-3.5 text-amber-500" />
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 登录/注册 弹窗 */}
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={handleAuthSuccess}
        />

        {/* 流水明细详情、编辑与删除弹窗 */}
        <TransactionDetailModal
          isOpen={!!selectedTxForDetail}
          transaction={selectedTxForDetail}
          categories={categories}
          onClose={() => setSelectedTxForDetail(null)}
          onUpdate={handleUpdateTransaction}
          onDelete={handleDeleteTransaction}
        />
      </div>
    </div>
  );
}

export default App;
