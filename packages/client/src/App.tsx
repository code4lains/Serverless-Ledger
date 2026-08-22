import React, { useState, useEffect, useMemo } from 'react';
import {
  Wallet,
  PlusCircle,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  Landmark,
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
  Send,
  HandCoins,
  RotateCcw,
  BadgeDollarSign,
  BookOpen,
  Receipt,
  Tag,
  Settings,
  Plus,
  PieChart,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import {
  Transaction,
  Category,
  Ledger,
  TransactionType,
  LoanType,
  AuthUser,
  formatMoney,
  toCents,
  groupTransactionsByDay,
  calculateTotals,
  formatTime,
  formatDateKey,
  getCategoryMeta,
  getInitialCategoryId,
  getCurrencySymbol,
  Budget,
  calculateBudgetOverview,
} from '@ledger/shared';
import { localDb, seedLocalCategories, seedLocalLedgers, DEFAULT_LOCAL_LEDGER_ID } from './db';
import {
  checkServerHealth,
  getCategories,
  getLedgers,
  getBudgets,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  syncPendingTransactions,
  pullAndMergeServerTransactions,
  pullAndMergeServerLedgers,
  pullAndMergeServerBudgets,
  getStoredUser,
  fetchCurrentUser,
  clearSession,
} from './api/client';
import { AuthModal } from './components/AuthModal';
import { CategoryIcon } from './components/CategoryIcon';
import { CategoryPicker } from './components/CategoryPicker';
import { AccountPicker } from './components/AccountPicker';
import { TransactionDetailModal } from './components/TransactionDetailModal';
import { CategoryManagementModal } from './components/CategoryManagementModal';
import { LedgerManagementModal } from './components/LedgerManagementModal';
import { BudgetManagementModal } from './components/BudgetManagementModal';
import { BudgetProgressCard } from './components/BudgetProgressCard';
import { StatisticsView } from './components/StatisticsView';
import { CategoriesView } from './components/CategoriesView';
import { ProfileView } from './components/ProfileView';

export type NavigationTab = 'detail' | 'stats' | 'record' | 'category' | 'profile';

export function App() {
  const [navTab, setNavTab] = useState<NavigationTab>('record');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getStoredUser());
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState<boolean>(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState<boolean>(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const [selectedTxForDetail, setSelectedTxForDetail] = useState<Transaction | null>(null);

  // 账本状态 (多账本体系)
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [activeLedgerId, setActiveLedgerId] = useState<string>('all'); // 'all' or specific ledger_id
  const [selectedLedgerForRecord, setSelectedLedgerForRecord] = useState<string>(DEFAULT_LOCAL_LEDGER_ID);

  // 记账表单状态
  const [activeTab, setActiveTab] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState<string>('');
  const [remark, setRemark] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [fromAccount, setFromAccount] = useState<string>('微信零钱');
  const [toAccount, setToAccount] = useState<string>('招商银行');
  const [loanType, setLoanType] = useState<LoanType>('lend');
  const [recordDateType, setRecordDateType] = useState<'today' | 'yesterday' | 'beforeYesterday' | 'custom'>('today');
  const [customDate, setCustomDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  // 数据列表与服务端状态
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [serverStatus, setServerStatus] = useState<{ ok: boolean; data?: any }>({ ok: false });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);

  // 筛选状态
  const [filterType, setFilterType] = useState<'all' | TransactionType>('all');
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  // 初始化暗黑主题
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // 从本地 Dexie 加载流水与待同步状态
  const loadLocalData = async (user?: AuthUser | null) => {
    const effectiveUser = user !== undefined ? user : currentUser;
    if (!effectiveUser) {
      setTransactions([]);
      setPendingCount(0);
      return;
    }
    const list = await localDb.transactions.where('user_id').equals(effectiveUser.user_id).sortBy('transaction_date');
    list.reverse();
    setTransactions(list);
    const pending = await localDb.transactions
      .where('user_id')
      .equals(effectiveUser.user_id)
      .and((t) => t.sync_status === 'pending')
      .count();
    setPendingCount(pending);
  };

  // 刷新账本列表
  const refreshLedgers = async () => {
    const leds = await getLedgers();
    setLedgers(leds);

    // 确保 selectedLedgerForRecord 指向有效账本
    const defaultLed = leds.find((l) => l.is_default === 1) || leds[0];
    if (defaultLed && !leds.some((l) => l.ledger_id === selectedLedgerForRecord)) {
      setSelectedLedgerForRecord(defaultLed.ledger_id);
    }
    if (activeLedgerId !== 'all' && !leds.some((l) => l.ledger_id === activeLedgerId)) {
      setActiveLedgerId(defaultLed ? defaultLed.ledger_id : 'all');
    }
  };

  // 刷新分类列表
  const refreshCategories = async () => {
    const cats = await getCategories();
    setCategories(cats);
    if (!cats.some((c) => c.category_id === selectedCategory)) {
      setSelectedCategory(getInitialCategoryId(activeTab, cats));
    }
  };

  // 刷新预算列表
  const refreshBudgets = async () => {
    const bList = await getBudgets();
    setBudgets(bList);
  };

  // 载入访客默认数据 (免登录浏览模式)
  const loadGuestData = async () => {
    await seedLocalCategories();
    await seedLocalLedgers();

    const cats = await getCategories();
    setCategories(cats);
    setSelectedCategory((prev) => (prev && cats.some((c) => c.category_id === prev) ? prev : getInitialCategoryId(activeTab, cats)));

    const leds = await getLedgers();
    setLedgers(leds);
    const defaultLed = leds.find((l) => l.is_default === 1) || leds[0];
    if (defaultLed) {
      setActiveLedgerId((prev) => (prev === 'all' ? 'all' : leds.some((l) => l.ledger_id === prev) ? prev : defaultLed.ledger_id));
      setSelectedLedgerForRecord((prev) => (leds.some((l) => l.ledger_id === prev) ? prev : defaultLed.ledger_id));
    }

    await refreshBudgets();
    await loadLocalData(null);

    const health = await checkServerHealth();
    setServerStatus(health);
  };

  // 载入并同步当前用户数据
  const loadUserData = async (user: AuthUser) => {
    await seedLocalCategories();
    await seedLocalLedgers(user.user_id);

    const cats = await getCategories();
    setCategories(cats);
    setSelectedCategory((prev) => (prev && cats.some((c) => c.category_id === prev) ? prev : getInitialCategoryId(activeTab, cats)));

    const leds = await getLedgers();
    setLedgers(leds);
    const defaultLed = leds.find((l) => l.is_default === 1) || leds[0];
    if (defaultLed) {
      setActiveLedgerId((prev) => (prev === 'all' ? 'all' : leds.some((l) => l.ledger_id === prev) ? prev : defaultLed.ledger_id));
      setSelectedLedgerForRecord((prev) => (leds.some((l) => l.ledger_id === prev) ? prev : defaultLed.ledger_id));
    }

    await refreshBudgets();
    await loadLocalData(user);

    const health = await checkServerHealth();
    setServerStatus(health);

    if (health.ok) {
      await pullAndMergeServerLedgers();
      await pullAndMergeServerTransactions();
      await pullAndMergeServerBudgets();
      await refreshLedgers();
      await refreshBudgets();
      await loadLocalData(user);
    }
  };

  // 初始化应用 (免登录自由浏览体验)
  useEffect(() => {
    const init = async () => {
      // 验证当前 Token
      const stored = getStoredUser();
      if (!stored) {
        setCurrentUser(null);
        await loadGuestData();
        return;
      }

      const userRes = await fetchCurrentUser();
      if (userRes.success && userRes.data) {
        setCurrentUser(userRes.data);
        await loadUserData(userRes.data);
      } else {
        clearSession();
        setCurrentUser(null);
        await loadGuestData();
      }
    };

    init();
  }, []);

  // 计算当前处于激活状态的账本对象
  const activeLedger = useMemo(() => {
    if (activeLedgerId === 'all') return null;
    return ledgers.find((l) => l.ledger_id === activeLedgerId) || null;
  }, [ledgers, activeLedgerId]);

  // 账本映射字典
  const ledgerMap = useMemo(() => {
    const map = new Map<string, Ledger>();
    for (const l of ledgers) {
      map.set(l.ledger_id, l);
    }
    return map;
  }, [ledgers]);

  // 当前视图对应的币种符号
  const currentCurrencySymbol = useMemo(() => {
    return getCurrencySymbol(activeLedger?.currency);
  }, [activeLedger]);

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

  // 切换借贷子模式
  const handleLoanTypeChange = (lt: LoanType) => {
    setLoanType(lt);
    const categoryMap: Record<LoanType, string> = {
      lend: 'cat_loan_lend',
      borrow: 'cat_loan_borrow',
      repay: 'cat_loan_repay',
      collect: 'cat_loan_collect',
    };
    setSelectedCategory(categoryMap[lt] || 'cat_loan_lend');
    if (lt === 'lend') {
      setFromAccount('微信零钱');
      setToAccount('张三');
    } else if (lt === 'borrow') {
      setFromAccount('李四');
      setToAccount('招商银行');
    } else if (lt === 'repay') {
      setFromAccount('支付宝');
      setToAccount('李四');
    } else if (lt === 'collect') {
      setFromAccount('张三');
      setToAccount('微信零钱');
    }
  };

  // 提交记账 (3秒快速极简记账)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }

    const parsedAmount = parseFloat(amountStr);
    if (!amountStr || isNaN(parsedAmount) || parsedAmount <= 0) return;

    const amountInCents = toCents(amountStr);
    if (amountInCents <= 0) return;

    const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userId = currentUser.user_id;

    // 确定目标账本
    let targetLedgerId = selectedLedgerForRecord;
    if (!targetLedgerId || targetLedgerId === 'all') {
      const defaultLed = ledgers.find((l) => l.is_default === 1) || ledgers[0];
      targetLedgerId = defaultLed?.ledger_id || DEFAULT_LOCAL_LEDGER_ID;
    }

    const txDate = getCalculatedTransactionDate();

    const txData: any = {
      transaction_id: txId,
      user_id: userId,
      ledger_id: targetLedgerId,
      type: activeTab,
      amount: amountInCents,
      category_id: selectedCategory || null,
      transaction_date: txDate,
      remark: remark.trim() || null,
    };

    if (activeTab === 'transfer' || activeTab === 'loan') {
      txData.from_account = fromAccount.trim() || null;
      txData.to_account = toAccount.trim() || null;
    }

    await createTransaction(txData);

    // 快速重置并刷新
    setAmountStr('');
    setRemark('');
    await loadLocalData();
  };

  // 手动触发同步
  const handleSync = async () => {
    if (!currentUser) {
      setIsAuthModalOpen(true);
      return;
    }
    setIsSyncing(true);
    await syncPendingTransactions();
    const health = await checkServerHealth();
    setServerStatus(health);
    await refreshLedgers();
    await refreshBudgets();
    await loadLocalData();
    setIsSyncing(false);
  };

  // 触发退出登录请求 (前置检查未同步数据)
  const handleRequestLogout = () => {
    setShowLogoutConfirm(true);
  };

  // 确认退出登录
  const handleConfirmLogout = async () => {
    setShowLogoutConfirm(false);
    clearSession();
    setCurrentUser(null);
    await loadGuestData();
  };

  // 登录/注册成功回调
  const handleAuthSuccess = async (user: AuthUser) => {
    setCurrentUser(user);
    setIsAuthModalOpen(false);
    await loadUserData(user);
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

  // 记账 Tab 切换处理 (支出 / 收入 / 转账 / 借贷)
  const handleTabChange = (type: TransactionType) => {
    setActiveTab(type);
    if (type === 'transfer') {
      setSelectedCategory('cat_tr_internal');
      if (!fromAccount) setFromAccount('微信零钱');
      if (!toAccount) setToAccount('招商银行');
    } else if (type === 'loan') {
      handleLoanTypeChange(loanType);
    } else {
      setSelectedCategory(getInitialCategoryId(type, categories));
    }
  };

  // 账本隔离流水列表 (针对当前选择的账本或全部账本)
  const activeLedgerTransactions = useMemo(() => {
    if (activeLedgerId === 'all') {
      return transactions;
    }
    return transactions.filter((t) => t.ledger_id === activeLedgerId);
  }, [transactions, activeLedgerId]);

  // 过滤后的流水列表 (类型筛选 + 搜索关键词)
  const filteredTransactions = useMemo(() => {
    return activeLedgerTransactions.filter((t) => {
      // 类型筛选
      if (filterType !== 'all' && t.type !== filterType) {
        return false;
      }
      // 搜索关键词 (匹配备注、分类名或账户名)
      if (searchKeyword.trim()) {
        const kw = searchKeyword.trim().toLowerCase();
        const catMeta = getCategoryMeta(t.category_id, categories, t.type);
        const matchRemark = t.remark && t.remark.toLowerCase().includes(kw);
        const matchCat = catMeta.fullPath.toLowerCase().includes(kw) || catMeta.name.toLowerCase().includes(kw);
        const matchFrom = t.from_account && t.from_account.toLowerCase().includes(kw);
        const matchTo = t.to_account && t.to_account.toLowerCase().includes(kw);
        return matchRemark || matchCat || matchFrom || matchTo;
      }

      return true;
    });
  }, [activeLedgerTransactions, filterType, searchKeyword, categories]);

  // 独立账本核算：收支与结余统计
  const totals = useMemo(() => {
    return calculateTotals(activeLedgerTransactions);
  }, [activeLedgerTransactions]);

  // 独立账本月度总预算与各大分类预算消耗进度计算 (支持小分类消费归集与 80% 预警)
  const budgetOverview = useMemo(() => {
    return calculateBudgetOverview(budgets, activeLedgerTransactions, categories, {
      ledgerId: activeLedgerId,
      period: 'monthly',
    });
  }, [budgets, activeLedgerTransactions, categories, activeLedgerId]);

  // 按天分组的流水明细
  const dayGroups = useMemo(() => {
    return groupTransactionsByDay(filteredTransactions);
  }, [filteredTransactions]);

  // 切换账本
  const handleSwitchLedger = (ledgerId: string) => {
    setActiveLedgerId(ledgerId);
    if (ledgerId !== 'all') {
      setSelectedLedgerForRecord(ledgerId);
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6F2] dark:bg-[#18191A] text-gray-800 dark:text-gray-100 flex flex-col items-center p-3 sm:p-6 pb-32 sm:pb-36 font-sans">
      <div className="w-full max-w-md flex flex-col gap-4">
        {/* 顶部导航与状态栏 */}
        <header className="flex justify-between items-center py-2 px-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center font-bold text-sm shadow-sm shadow-indigo-500/20">
              <ShieldCheck className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">账盾</h1>
              <p className="text-[11px] text-gray-400">Serverless Ledger</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentUser ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 text-xs">
                <UserIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="font-medium max-w-[90px] truncate text-gray-700 dark:text-gray-200" title={currentUser.email}>
                  {currentUser.email.split('@')[0]}
                </span>
                <button
                  onClick={handleRequestLogout}
                  title="退出登录"
                  className="p-0.5 hover:bg-gray-100 dark:hover:bg-neutral-700 rounded-lg text-gray-400 hover:text-red-500 transition-colors"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAuthModalOpen(true)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs hover:shadow-indigo-500/20 active:scale-95 transition-all"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>登录/注册</span>
              </button>
            )}
            <button
              onClick={handleSync}
              disabled={isSyncing}
              title={
                isSyncing
                  ? '正在双向同步中...'
                  : pendingCount > 0
                  ? `存在 ${pendingCount} 笔未同步记录，点击立即同步`
                  : '数据已完全同步至云端'
              }
              className="p-2 rounded-xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 hover:bg-gray-50 active:scale-95 transition-all text-gray-600 dark:text-gray-300 relative"
            >
              <RefreshCw
                className={`w-4 h-4 transition-colors ${
                  isSyncing
                    ? 'animate-spin text-indigo-500'
                    : pendingCount > 0
                    ? 'text-amber-500 dark:text-amber-400'
                    : 'text-emerald-500 dark:text-emerald-400'
                }`}
              />
              {pendingCount > 0 && !isSyncing && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 hover:bg-gray-50 active:scale-95 transition-all text-gray-600 dark:text-gray-300"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-600" />}
            </button>
          </div>
        </header>

        {/* 1. 【明细】板块 (结余汇总与流水时间轴列表) */}
        {navTab === 'detail' && (
          <div className="flex flex-col gap-4">
            {/* 快捷多账本切换胶囊栏 */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-0.5">
              {/* 全部账本透视 */}
              <button
                type="button"
                onClick={() => handleSwitchLedger('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  activeLedgerId === 'all'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white dark:bg-neutral-800/90 text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-neutral-700/60 hover:bg-gray-50'
                }`}
              >
                <span>全部账本</span>
                <span className={`text-[10px] px-1 py-0.2 rounded-full ${
                  activeLedgerId === 'all' ? 'bg-indigo-700 text-indigo-100' : 'bg-gray-100 dark:bg-neutral-700 text-gray-400'
                }`}>
                  {transactions.length}
                </span>
              </button>

              {/* 各独立账本 */}
              {ledgers.map((led) => {
                const isCur = activeLedgerId === led.ledger_id;
                return (
                  <button
                    key={led.ledger_id}
                    type="button"
                    onClick={() => handleSwitchLedger(led.ledger_id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                      isCur
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-white dark:bg-neutral-800/90 text-gray-600 dark:text-gray-300 border border-gray-100 dark:border-neutral-700/60 hover:bg-gray-50'
                    }`}
                  >
                    <span>{led.name}</span>
                    {led.is_default === 1 && (
                      <span className="text-[10px] text-amber-400" title="默认日常账本">★</span>
                    )}
                    <span className={`text-[10px] font-normal ${
                      isCur ? 'text-indigo-200' : 'text-gray-400'
                    }`}>
                      {led.currency}
                    </span>
                  </button>
                );
              })}

              {/* 新建/管理账本快捷入口 */}
              <button
                type="button"
                onClick={() => setIsLedgerModalOpen(true)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/60 hover:bg-emerald-100 transition-colors flex items-center gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>管理/新建</span>
              </button>
            </div>

            {/* 概览卡片 (独立账本核算与结余汇总) */}
            <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-800 text-white rounded-3xl p-5 shadow-lg shadow-indigo-600/15 dark:from-neutral-800 dark:via-neutral-850 dark:to-neutral-900 dark:shadow-none">
              <div className="flex justify-between items-center text-xs text-indigo-100 dark:text-neutral-400 mb-1">
                <span className="flex items-center gap-1 font-medium">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-200 dark:text-indigo-400" />
                  {activeLedger ? `${activeLedger.name} · 结余 (${activeLedger.currency})` : '全部账本 · 汇总结余 (CNY)'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/20 dark:bg-neutral-700 text-white dark:text-neutral-300 font-medium backdrop-blur-xs">
                  {activeLedger ? (activeLedger.is_default === 1 ? '★ 默认账本' : '独立核算') : '全局汇总透视'}
                </span>
              </div>
              <div className="text-2xl font-extrabold tracking-tight mb-3 text-white">
                {formatMoney(totals.balance, currentCurrencySymbol)}
              </div>

              {/* 收支统计 */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/15 dark:border-neutral-700/60 text-xs">
                <div>
                  <div className="text-indigo-100 dark:text-neutral-400 flex items-center gap-1">
                    <ArrowDownLeft className="w-3.5 h-3.5 text-orange-300 dark:text-[#D08770]" /> 总支出
                  </div>
                  <div className="text-sm font-semibold mt-0.5 text-orange-200 dark:text-[#D08770]">
                    {formatMoney(totals.totalExpense, currentCurrencySymbol)}
                  </div>
                </div>
                <div>
                  <div className="text-indigo-100 dark:text-neutral-400 flex items-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-300 dark:text-[#A3BE8C]" /> 总收入
                  </div>
                  <div className="text-sm font-semibold mt-0.5 text-emerald-200 dark:text-[#A3BE8C]">
                    {formatMoney(totals.totalIncome, currentCurrencySymbol)}
                  </div>
                </div>
              </div>

              {/* 转账与借贷辅助汇总 */}
              {(totals.totalTransfer > 0 || (totals.totalLoanLent + totals.totalLoanBorrowed + totals.totalLoanRepaid + totals.totalLoanCollected) > 0) && (
                <div className="grid grid-cols-2 gap-3 pt-2.5 mt-2.5 border-t border-white/15 dark:border-neutral-700/40 text-[11px]">
                  <div>
                    <div className="text-indigo-100 dark:text-neutral-400 flex items-center gap-1">
                      <ArrowRightLeft className="w-3 h-3 text-blue-300 dark:text-blue-400" /> 内部转账
                    </div>
                    <div className="font-medium mt-0.5 text-blue-100 dark:text-blue-300">
                      {formatMoney(totals.totalTransfer, currentCurrencySymbol)}
                    </div>
                  </div>
                  <div>
                    <div className="text-indigo-100 dark:text-neutral-400 flex items-center gap-1">
                      <Landmark className="w-3 h-3 text-purple-300 dark:text-purple-400" /> 借贷流动
                    </div>
                    <div className="font-medium mt-0.5 text-purple-100 dark:text-purple-300 flex items-center gap-1.5">
                      <span>出: {formatMoney(totals.totalLoanLent + totals.totalLoanRepaid, currentCurrencySymbol)}</span>
                      <span>·</span>
                      <span>入: {formatMoney(totals.totalLoanBorrowed + totals.totalLoanCollected, currentCurrencySymbol)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 月度总预算及大分类预算进度条看板 */}
            <BudgetProgressCard
              overview={budgetOverview}
              currencySymbol={currentCurrencySymbol}
              onOpenBudgetModal={() => setIsBudgetModalOpen(true)}
              ledgerName={activeLedger ? activeLedger.name : '全部账本'}
            />

            {/* 账单流水明细列表 */}
            <div className="bg-white dark:bg-neutral-800 rounded-3xl p-4 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3">
              {/* 列表头部与筛选器 */}
              <div className="flex flex-col gap-2.5 pb-2 border-b border-gray-100 dark:border-neutral-700/60">
                <div className="flex justify-between items-center">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {activeLedger ? `【${activeLedger.name}】流水明细` : '全账本流水明细'}
                  </h2>
                  <span className="text-[11px] text-gray-400">共 {filteredTransactions.length} 笔记录</span>
                </div>

                {/* 筛选切换 (全部 / 支出 / 收入 / 转账 / 借贷) & 搜索 */}
                <div className="flex items-center gap-2">
                  <div className="flex bg-gray-100 dark:bg-neutral-900 rounded-xl p-0.5 text-xs overflow-x-auto no-scrollbar">
                    {(['all', 'expense', 'income', 'transfer', 'loan'] as const).map((t) => {
                      const labels: Record<string, string> = {
                        all: '全部',
                        expense: '支出',
                        income: '收入',
                        transfer: '转账',
                        loan: '借贷',
                      };
                      const isCur = filterType === t;
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setFilterType(t)}
                          className={`px-2 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
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
                      placeholder="搜索备注、分类或账户..."
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
                  <span>{searchKeyword ? '没有找到匹配的记账明细' : '当前账本暂无流水记录，快去记一笔吧'}</span>
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
                            <span>支: <strong className="text-[#D08770]">{formatMoney(group.totalExpense, currentCurrencySymbol)}</strong></span>
                          )}
                          {group.totalIncome > 0 && (
                            <span>收: <strong className="text-[#A3BE8C]">{formatMoney(group.totalIncome, currentCurrencySymbol)}</strong></span>
                          )}
                          {group.totalTransfer > 0 && (
                            <span>转: <strong className="text-blue-500">{formatMoney(group.totalTransfer, currentCurrencySymbol)}</strong></span>
                          )}
                        </div>
                      </div>

                      {/* 当日流水卡片列表 */}
                      <div className="bg-gray-50/70 dark:bg-neutral-900/50 rounded-2xl p-1.5 flex flex-col divide-y divide-gray-100 dark:divide-neutral-800">
                        {group.transactions.map((tx) => {
                          const isExpense = tx.type === 'expense';
                          const isIncome = tx.type === 'income';
                          const isTransfer = tx.type === 'transfer';
                          const isLoan = tx.type === 'loan';
                          const isLoanInflow = isLoan && (tx.category_id === 'cat_loan_borrow' || tx.category_id === 'cat_loan_collect');
                          const catMeta = getCategoryMeta(tx.category_id, categories, tx.type);
                          const txLedger = ledgerMap.get(tx.ledger_id);
                          const txCurrencySymbol = getCurrencySymbol(txLedger?.currency);

                          // 构造副标题描述
                          const getSubtitle = () => {
                            const parts = [formatTime(tx.transaction_date)];
                            if (isTransfer) {
                              parts.push(`${tx.from_account || '账户'} ➔ ${tx.to_account || '账户'}`);
                            } else if (isLoan) {
                              const loanTag = tx.category_id === 'cat_loan_borrow' ? '借入' : tx.category_id === 'cat_loan_repay' ? '还款' : tx.category_id === 'cat_loan_collect' ? '收款' : '借出';
                              parts.push(`[${loanTag}] ${tx.from_account || '出资方'} ➔ ${tx.to_account || '收款方'}`);
                            }
                            if (tx.remark) {
                              parts.push(tx.remark);
                            }
                            return parts;
                          };

                          const subtitleParts = getSubtitle();

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
                                      : isIncome
                                      ? 'bg-emerald-100/70 dark:bg-emerald-950/40 text-[#A3BE8C]'
                                      : isTransfer
                                      ? 'bg-blue-100/70 dark:bg-blue-950/40 text-blue-500'
                                      : isLoanInflow
                                      ? 'bg-indigo-100/70 dark:bg-indigo-950/40 text-indigo-500'
                                      : 'bg-purple-100/70 dark:bg-purple-950/40 text-purple-500'
                                  }`}
                                >
                                  <CategoryIcon icon={catMeta.icon} className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
                                    <span>
                                      {isTransfer
                                        ? `${catMeta.name} · ${tx.from_account || '转出'} ➔ ${tx.to_account || '转入'}`
                                        : catMeta.fullPath}
                                    </span>
                                    {/* 全局视图或多账本时显示所属账本徽标 */}
                                    {activeLedgerId === 'all' && txLedger && (
                                      <span className="text-[9px] px-1 py-0.2 rounded bg-gray-200 dark:bg-neutral-700 text-gray-600 dark:text-gray-300 font-normal">
                                        {txLedger.name}
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-gray-400 flex items-center gap-1.5">
                                    <span>{subtitleParts[0]}</span>
                                    {subtitleParts.slice(1).map((part, idx) => (
                                      <React.Fragment key={idx}>
                                        <span>·</span>
                                        <span className="max-w-[140px] truncate">{part}</span>
                                      </React.Fragment>
                                    ))}
                                  </div>
                                </div>
                              </div>

                              {/* 右侧：金额与同步标记 */}
                              <div className="text-right flex items-center gap-2">
                                <div>
                                  <div
                                    className={`text-xs font-bold ${
                                      isExpense
                                        ? 'text-gray-900 dark:text-white'
                                        : isIncome
                                        ? 'text-[#A3BE8C]'
                                        : isTransfer
                                        ? 'text-blue-600 dark:text-blue-400'
                                        : isLoanInflow
                                        ? 'text-indigo-600 dark:text-indigo-400'
                                        : 'text-purple-600 dark:text-purple-400'
                                    }`}
                                  >
                                    {isExpense
                                      ? '-'
                                      : isIncome
                                      ? '+'
                                      : isTransfer
                                      ? '↔ '
                                      : isLoanInflow
                                      ? '+ '
                                      : '- '}
                                    {formatMoney(tx.amount, txCurrencySymbol)}
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
          </div>
        )}

        {/* 2. 【统计】板块 */}
        {navTab === 'stats' && (
          <StatisticsView
            transactions={transactions}
            categories={categories}
            ledgers={ledgers}
            activeLedgerId={activeLedgerId}
            onSelectLedger={handleSwitchLedger}
            onSelectTransaction={setSelectedTxForDetail}
          />
        )}

        {/* 3. 【记账】板块 (居中核心记账录入) */}
        {navTab === 'record' && (
          <div className="flex flex-col gap-4">
            {/* 3秒极简记账录入卡片 */}
            <div className="bg-white dark:bg-neutral-800 rounded-3xl p-4 shadow-sm border border-gray-100 dark:border-neutral-700">
              {/* 头部标题与当前账本提示 */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-neutral-700/60">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-gray-800 dark:text-gray-100">快速记账</h2>
                    <p className="text-[10px] text-gray-400">3秒极简记账，随时掌控收支</p>
                  </div>
                </div>
                {ledgers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsLedgerModalOpen(true)}
                    className="text-[11px] text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-neutral-900 px-2.5 py-1 rounded-xl border border-gray-100 dark:border-neutral-700/60 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-1.5"
                  >
                    <BookOpen className="w-3 h-3 text-indigo-500" />
                    <span className="font-semibold">{ledgers.find((l) => l.ledger_id === selectedLedgerForRecord)?.name || '日常账本'}</span>
                    <span className="text-[9px] text-gray-400">切换</span>
                  </button>
                )}
              </div>

              {/* 类型切换 (支出 / 收入 / 转账 / 借贷) */}
              <div className="flex bg-gray-100 dark:bg-neutral-900 rounded-2xl p-1 mb-3.5">
                {([
                  { type: 'expense', label: '支出' },
                  { type: 'income', label: '收入' },
                  { type: 'transfer', label: '转账' },
                  { type: 'loan', label: '借贷' },
                ] as const).map(({ type, label }) => {
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
                      {label}
                    </button>
                  );
                })}
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
                {/* 借贷子类型切换 (借出 / 借入 / 还款 / 收款) */}
                {activeTab === 'loan' && (
                  <div className="flex bg-purple-50/70 dark:bg-purple-950/30 rounded-2xl p-1 border border-purple-100 dark:border-purple-900/40">
                    {([
                      { type: 'lend', label: '借出 (借给他人)', icon: Send },
                      { type: 'borrow', label: '借入 (向人借款)', icon: HandCoins },
                      { type: 'repay', label: '还款 (偿还欠款)', icon: RotateCcw },
                      { type: 'collect', label: '收款 (收回外借)', icon: BadgeDollarSign },
                    ] as const).map(({ type: lt, label, icon: Icon }) => {
                      const isLtActive = loanType === lt;
                      return (
                        <button
                          key={lt}
                          type="button"
                          onClick={() => handleLoanTypeChange(lt)}
                          className={`flex-1 py-1.5 px-1 text-[11px] font-semibold rounded-xl transition-all flex items-center justify-center gap-1 ${
                            isLtActive
                              ? 'bg-white dark:bg-neutral-800 text-purple-700 dark:text-purple-300 shadow-xs'
                              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                          }`}
                        >
                          <Icon className="w-3 h-3 shrink-0" />
                          <span>{label.slice(0, 2)}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 金额输入框与快捷填充 */}
                <div className="flex flex-col gap-1.5">
                  <div className="relative">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-400">
                      {currentCurrencySymbol}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="0.00"
                      value={amountStr}
                      onKeyDown={(e) => {
                        if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') {
                          e.preventDefault();
                        }
                      }}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val.includes('-')) return;
                        setAmountStr(val);
                      }}
                      className="w-full pl-9 pr-4 py-2.5 text-xl font-bold rounded-2xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none transition-all"
                      autoFocus
                    />
                  </div>

                  {/* 快捷金额预设 */}
                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar text-[11px]">
                    {[10, 20, 50, 100, 200, 500].map((preset) => (
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

                {/* 目标记账账本选择器 (多账本支持) */}
                {ledgers.length > 0 && (
                  <div className="flex items-center justify-between px-1 py-1 rounded-xl bg-gray-50 dark:bg-neutral-900/60 text-xs">
                    <span className="text-[11px] text-gray-400 flex items-center gap-1">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                      记入账本
                    </span>
                    <select
                      value={selectedLedgerForRecord}
                      onChange={(e) => setSelectedLedgerForRecord(e.target.value)}
                      className="bg-white dark:bg-neutral-800 text-xs font-semibold px-2 py-1 rounded-lg border border-gray-200 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                    >
                      {ledgers.map((l) => (
                        <option key={l.ledger_id} value={l.ledger_id}>
                          {l.name} ({l.currency}) {l.is_default === 1 ? '★ 默认' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 转账账户选择器 (仅转账类型显示) */}
                {activeTab === 'transfer' && (
                  <div className="flex flex-col gap-1">
                    <div className="text-[11px] font-medium text-gray-400 px-0.5">转账账户与路径</div>
                    <AccountPicker
                      fromAccount={fromAccount}
                      toAccount={toAccount}
                      onChangeFrom={setFromAccount}
                      onChangeTo={setToAccount}
                      fromLabel="转出账户"
                      toLabel="转入账户"
                      fromPlaceholder="例如：微信零钱"
                      toPlaceholder="例如：招商银行"
                    />
                  </div>
                )}

                {/* 借贷账户/对象选择器 (仅借贷类型显示) */}
                {activeTab === 'loan' && (
                  <div className="flex flex-col gap-1">
                    <div className="text-[11px] font-medium text-gray-400 px-0.5">借贷相关账户与对象</div>
                    <AccountPicker
                      fromAccount={fromAccount}
                      toAccount={toAccount}
                      onChangeFrom={setFromAccount}
                      onChangeTo={setToAccount}
                      fromLabel={
                        loanType === 'lend'
                          ? '出资账户 (资金来源)'
                          : loanType === 'borrow'
                          ? '出资人/机构 (债权人)'
                          : loanType === 'repay'
                          ? '付款账户 (出资账户)'
                          : '还款人/债务人'
                      }
                      toLabel={
                        loanType === 'lend'
                          ? '借款人 (资金去向)'
                          : loanType === 'borrow'
                          ? '存入账户 (收款账户)'
                          : loanType === 'repay'
                          ? '债权人/还给谁'
                          : '收款账户 (存入账户)'
                      }
                      fromPlaceholder={
                        loanType === 'lend' ? '如：微信零钱' : loanType === 'borrow' ? '如：李四 / 微粒贷' : loanType === 'repay' ? '如：招商银行' : '如：张三'
                      }
                      toPlaceholder={
                        loanType === 'lend' ? '如：张三' : loanType === 'borrow' ? '如：招商银行' : loanType === 'repay' ? '如：李四' : '如：微信零钱'
                      }
                      fromPresets={
                        loanType === 'borrow' || loanType === 'collect'
                          ? ['张三', '李四', '王五', '微粒贷', '花呗/借呗', '亲友']
                          : ['微信零钱', '支付宝', '招商银行', '工商银行', '现金']
                      }
                      toPresets={
                        loanType === 'lend' || loanType === 'repay'
                          ? ['张三', '李四', '王五', '微粒贷', '花呗/借呗', '亲友']
                          : ['微信零钱', '支付宝', '招商银行', '工商银行', '建设银行']
                      }
                      showSwap={false}
                    />
                  </div>
                )}

                {/* 大类 + 小类二级联动分类选择器 */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-[11px] font-medium text-gray-400 px-0.5">
                    <span>分类选择</span>
                    <button
                      type="button"
                      onClick={() => setIsCategoryModalOpen(true)}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 font-normal"
                    >
                      <Settings className="w-3 h-3" />
                      <span>管理分类</span>
                    </button>
                  </div>
                  <CategoryPicker
                    categories={categories}
                    type={activeTab}
                    selectedCategoryId={selectedCategory}
                    onSelectCategory={setSelectedCategory}
                    onOpenManage={() => setIsCategoryModalOpen(true)}
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
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-gray-100 dark:bg-neutral-700/60 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      今天
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecordDateType('yesterday')}
                      className={`px-3 py-1 rounded-xl font-medium transition-all ${
                        recordDateType === 'yesterday'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-gray-100 dark:bg-neutral-700/60 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      昨天
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecordDateType('beforeYesterday')}
                      className={`px-3 py-1 rounded-xl font-medium transition-all ${
                        recordDateType === 'beforeYesterday'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-gray-100 dark:bg-neutral-700/60 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
                      }`}
                    >
                      前天
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecordDateType('custom')}
                      className={`flex items-center gap-1 px-3 py-1 rounded-xl font-medium transition-all ${
                        recordDateType === 'custom'
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-gray-100 dark:bg-neutral-700/60 text-gray-600 dark:text-gray-400 hover:bg-gray-200'
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
                    className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 disabled:opacity-40 transition-all flex items-center gap-1.5"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>
                      {activeTab === 'expense'
                        ? '记支出'
                        : activeTab === 'income'
                        ? '记收入'
                        : activeTab === 'transfer'
                        ? '记转账'
                        : '记借贷'}
                    </span>
                  </button>
                </div>
              </form>
            </div>

            {/* 首页月度总预算与大分类预算进度条看板 */}
            <BudgetProgressCard
              overview={budgetOverview}
              currencySymbol={currentCurrencySymbol}
              onOpenBudgetModal={() => setIsBudgetModalOpen(true)}
              ledgerName={activeLedger ? activeLedger.name : undefined}
            />
          </div>
        )}

        {/* 4. 【分类】板块 */}
        {navTab === 'category' && (
          <CategoriesView
            categories={categories}
            initialType={activeTab}
            currentUser={currentUser}
            onCategoriesChanged={refreshCategories}
            onRequireAuth={() => setIsAuthModalOpen(true)}
          />
        )}

        {/* 5. 【我的】板块 */}
        {navTab === 'profile' && (
          <ProfileView
            currentUser={currentUser}
            ledgers={ledgers}
            transactions={transactions}
            serverStatus={serverStatus}
            pendingCount={pendingCount}
            isSyncing={isSyncing}
            darkMode={darkMode}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
            onSync={handleSync}
            onOpenLedgerModal={() => setIsLedgerModalOpen(true)}
            onOpenBudgetModal={() => setIsBudgetModalOpen(true)}
            onLogout={handleRequestLogout}
            onOpenAuthModal={() => setIsAuthModalOpen(true)}
          />
        )}

        {/* 登录/注册 弹窗 */}
        <AuthModal
          isOpen={isAuthModalOpen}
          closable={true}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={handleAuthSuccess}
        />

        {/* 多账本管理与创建 弹窗 */}
        <LedgerManagementModal
          isOpen={isLedgerModalOpen}
          ledgers={ledgers}
          transactions={transactions}
          activeLedgerId={activeLedgerId}
          currentUser={currentUser}
          onClose={() => setIsLedgerModalOpen(false)}
          onSelectLedger={handleSwitchLedger}
          onLedgersChanged={refreshLedgers}
          onRequireAuth={() => setIsAuthModalOpen(true)}
        />

        {/* 月度预算设置与各大分类预算管理 弹窗 */}
        <BudgetManagementModal
          isOpen={isBudgetModalOpen}
          onClose={() => setIsBudgetModalOpen(false)}
          ledgers={ledgers}
          activeLedgerId={activeLedgerId}
          categories={categories}
          budgets={budgets}
          onBudgetsChanged={refreshBudgets}
          onRequireAuth={() => setIsAuthModalOpen(true)}
          currentUser={currentUser}
        />

        {/* 分类管理与排序 弹窗 (供快捷弹窗调用) */}
        <CategoryManagementModal
          isOpen={isCategoryModalOpen}
          categories={categories}
          initialType={activeTab}
          currentUser={currentUser}
          onClose={() => setIsCategoryModalOpen(false)}
          onCategoriesChanged={refreshCategories}
          onRequireAuth={() => setIsAuthModalOpen(true)}
        />

        {/* 流水明细详情、编辑与删除弹窗 */}
        <TransactionDetailModal
          isOpen={!!selectedTxForDetail}
          transaction={selectedTxForDetail}
          categories={categories}
          ledgers={ledgers}
          currentUser={currentUser}
          onClose={() => setSelectedTxForDetail(null)}
          onUpdate={handleUpdateTransaction}
          onDelete={handleDeleteTransaction}
          onRequireAuth={() => setIsAuthModalOpen(true)}
        />

        {/* 退出登录安全确认弹窗 (含未同步数据风险提示) */}
        {showLogoutConfirm && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="w-full max-w-xs bg-white dark:bg-neutral-800 rounded-3xl p-5 shadow-2xl border border-gray-100 dark:border-neutral-700 flex flex-col gap-3.5">
              <div className="flex items-center gap-2.5">
                {pendingCount > 0 ? (
                  <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center font-bold text-sm shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-300 flex items-center justify-center font-bold text-sm shrink-0">
                    <LogOut className="w-4 h-4" />
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-sm text-gray-900 dark:text-white">
                    {pendingCount > 0 ? '存在未同步数据' : '退出登录'}
                  </h3>
                  <p className="text-[10px] text-gray-400">
                    {pendingCount > 0 ? '退出前请注意数据安全' : '账号退出确认'}
                  </p>
                </div>
              </div>

              <div className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                {pendingCount > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <p>
                      检测到您本地还有 <strong className="text-amber-600 dark:text-amber-400 font-bold">{pendingCount} 笔</strong> 离线流水尚未同步至云端。
                    </p>
                    <p className="text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 p-2 rounded-xl border border-red-100 dark:border-red-900/40">
                      ⚠️ 若现在退出登录，本地未同步的流水记录可能会丢失！
                    </p>
                  </div>
                ) : (
                  <p>确认退出当前账号吗？已同步的数据均安全保存在您的 Cloudflare D1 云数据库中。</p>
                )}
              </div>

              <div className="flex flex-col gap-2 pt-1">
                {pendingCount > 0 && (
                  <button
                    type="button"
                    onClick={async () => {
                      setShowLogoutConfirm(false);
                      await handleSync();
                    }}
                    className="w-full py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition-all flex items-center justify-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>立即同步数据并保留</span>
                  </button>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLogoutConfirm(false)}
                    className="flex-1 py-2 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmLogout}
                    className={`flex-1 py-2 rounded-xl text-xs font-medium text-white transition-all shadow-xs ${
                      pendingCount > 0
                        ? 'bg-red-600 hover:bg-red-700'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    {pendingCount > 0 ? '仍然退出' : '确认退出'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 底部固定导航栏 (Bottom Navigation Bar - 5 图标无字精简模式) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border-t border-gray-200/80 dark:border-neutral-800 shadow-lg pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]">
        <div className="max-w-md mx-auto flex items-center justify-around py-2 px-3">
          {[
            { id: 'detail', label: '明细', icon: Receipt },
            { id: 'stats', label: '统计', icon: PieChart },
            { id: 'record', label: '记账', icon: PlusCircle, isCenter: true },
            { id: 'category', label: '分类', icon: Tag },
            { id: 'profile', label: '我的', icon: UserIcon },
          ].map((item) => {
            const Icon = item.icon;
            const isActive = navTab === item.id;
            const isCenter = !!item.isCenter;

            if (isCenter) {
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setNavTab(item.id as NavigationTab)}
                  title={item.label}
                  aria-label={item.label}
                  className="flex items-center justify-center -mt-5 group transition-transform active:scale-95"
                >
                  <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shadow-md shadow-indigo-600/25 transition-all ${
                      isActive
                        ? 'bg-indigo-600 text-white ring-4 ring-indigo-100 dark:ring-neutral-800 scale-105'
                        : 'bg-indigo-600 text-white hover:scale-105'
                    }`}
                  >
                    <Plus className="w-6 h-6 stroke-[2.5]" />
                  </div>
                </button>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setNavTab(item.id as NavigationTab)}
                title={item.label}
                aria-label={item.label}
                className={`flex items-center justify-center p-1.5 rounded-2xl transition-all ${
                  isActive
                    ? 'text-gray-900 dark:text-white scale-105'
                    : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                <div
                  className={`p-2 rounded-xl transition-all ${
                    isActive
                      ? 'bg-gray-100 dark:bg-neutral-800 text-gray-900 dark:text-white shadow-2xs'
                      : 'bg-transparent text-gray-400'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default App;
