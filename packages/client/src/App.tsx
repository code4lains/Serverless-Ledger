import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Lock,
  Unlock,
  ShieldAlert,
  Shield,
  Sparkles,
} from 'lucide-react';
import {
  Transaction,
  Category,
  Ledger,
  TransactionType,
  LoanType,
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
import {
  localDb,
  seedLocalCategories,
  seedLocalLedgers,
  DEFAULT_LOCAL_LEDGER_ID,
  getLocalStorageStats,
} from './db';
import {
  getCategories,
  getLedgers,
  getBudgets,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  queryTransactions,
  syncManager,
  SyncStats,
  isWebdavSyncConfigured,
  isVaultInitialized,
  isVaultUnlocked,
  restoreVaultSession,
  lockVault,
} from './api/client';
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
import { DataManagementModal } from './components/DataManagementModal';
import { RecoveryCodeModal } from './components/RecoveryCodeModal';
import { RecurringManagementModal } from './components/RecurringManagementModal';
import { OnboardingModal } from './components/OnboardingModal';
import { VaultModal, VaultModalAction } from './components/VaultModal';
import { NumericKeypad } from './components/NumericKeypad';
import { CalculatorModal } from './components/CalculatorModal';
import { recurringEngine } from './api/recurringEngine';

export type NavigationTab = 'detail' | 'stats' | 'record' | 'category' | 'profile';

export function App() {
  const [navTab, setNavTab] = useState<NavigationTab>('record');
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('ledger_theme');
    if (saved === 'dark') return true;
    if (saved === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [vaultStatus, setVaultStatus] = useState<'uninitialized' | 'unlocked' | 'locked'>('uninitialized');
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);
  const [isVaultModalOpen, setIsVaultModalOpen] = useState<boolean>(false);
  const [vaultModalAction, setVaultModalAction] = useState<VaultModalAction>('unlock');

  const [isCalculatorOpen, setIsCalculatorOpen] = useState<boolean>(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState<boolean>(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState<boolean>(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState<boolean>(false);
  const [dataModalMode, setDataModalMode] = useState<'export' | 'import'>('export');
  const [isRecoveryCodeModalOpen, setIsRecoveryCodeModalOpen] = useState<boolean>(false);
  const [activeRecoveryCode, setActiveRecoveryCode] = useState<string>('');
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState<boolean>(false);
  const [selectedTxForDetail, setSelectedTxForDetail] = useState<Transaction | null>(null);

  // 基础数据状态
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [activeLedgerId, setActiveLedgerId] = useState<string>('all');
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState<boolean>(true);

  // 记账表单状态
  const [recordType, setRecordType] = useState<TransactionType>('expense');
  const [recordAmountStr, setRecordAmountStr] = useState<string>('');
  const [recordCategoryId, setRecordCategoryId] = useState<string>('');
  const [recordFromAccount, setRecordFromAccount] = useState<string>('');
  const [recordToAccount, setRecordToAccount] = useState<string>('');
  const [recordLoanType, setRecordLoanType] = useState<LoanType>('lend');
  const [recordDate, setRecordDate] = useState<string>(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [recordRemark, setRecordRemark] = useState<string>('');
  const [isSubmittingRecord, setIsSubmittingRecord] = useState<boolean>(false);

  // 检测是否为移动触控设备 (移动端屏蔽系统软键盘，PC/Web 端放开实体键盘输入)
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || ('ontouchstart' in window && window.innerWidth < 768);
  }, []);

  // PC/Web 端实体键盘安全格式化处理 (只允许数字与至多两位小数)
  const handleAmountInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.replace(/[^0-9.]/g, '');
    const dotCount = (val.match(/\./g) || []).length;
    if (dotCount > 1) {
      const firstDot = val.indexOf('.');
      val = val.slice(0, firstDot + 1) + val.slice(firstDot + 1).replace(/\./g, '');
    }
    if (val.includes('.')) {
      const [intPart, decPart] = val.split('.');
      val = `${intPart.slice(0, 9)}.${decPart.slice(0, 2)}`;
    } else {
      val = val.slice(0, 9);
    }
    setRecordAmountStr(val);
  };

  // 明细检索过滤状态
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | TransactionType>('all');
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  // 同步状态
  const [syncStats, setSyncStats] = useState<SyncStats>(() => syncManager.getStats());
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'info' | 'success' | 'warning' } | null>(null);

  const showToast = (text: string, type: 'info' | 'success' | 'warning' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 3500);
  };

  // 深色模式处理
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('ledger_theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('ledger_theme', 'light');
    }
  }, [darkMode]);

  // 检测保险库状态 (支持自动记住上次未手动锁定的解锁会话)
  const checkVaultStatus = async () => {
    const initialized = await isVaultInitialized();
    if (!initialized) {
      setVaultStatus('uninitialized');
      const hasSeen = localStorage.getItem('ledger_has_seen_onboarding');
      if (!hasSeen) {
        setIsOnboardingOpen(true);
      }
    } else {
      await restoreVaultSession();
      const unlocked = isVaultUnlocked();
      setVaultStatus(unlocked ? 'unlocked' : 'locked');
    }
  };

  // 刷新分类
  const refreshCategories = async () => {
    const list = await getCategories();
    setCategories(list);
  };

  // 刷新账本
  const refreshLedgers = async () => {
    const list = await getLedgers();
    setLedgers(list);
    if (activeLedgerId === 'all' || !list.find((l) => l.ledger_id === activeLedgerId)) {
      const def = list.find((l) => l.is_default === 1);
      if (def) {
        setActiveLedgerId(def.ledger_id);
      } else if (list.length > 0) {
        setActiveLedgerId(list[0].ledger_id);
      }
    }
  };

  // 刷新预算
  const refreshBudgets = async () => {
    const list = await getBudgets(activeLedgerId === 'all' ? undefined : activeLedgerId);
    setBudgets(list);
  };

  // 刷新账单流水
  const refreshTransactions = async () => {
    setLoadingTransactions(true);
    try {
      const list = await queryTransactions({
        ledger_id: activeLedgerId,
        type: filterType,
        category_id: filterCategoryId,
        start_date: filterStartDate || undefined,
        end_date: filterEndDate || undefined,
        search: filterSearch || undefined,
      });
      setTransactions(list);
    } finally {
      setLoadingTransactions(false);
    }
  };

  // 加载全量本地数据
  const loadAllData = async () => {
    await refreshCategories();
    await refreshLedgers();
    await refreshBudgets();
    await refreshTransactions();
    await recurringEngine.processDueRules().catch(() => {});
  };

  // 初始化应用 (纯本地 Dexie 0ms 秒开)
  useEffect(() => {
    syncManager.start();

    const unsubSync = syncManager.subscribe((stats) => {
      setSyncStats(stats);
      if (!stats.isSyncing) {
        loadAllData();
      }
    });

    const handleVaultChange = () => {
      checkVaultStatus();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('vault:status_changed', handleVaultChange);
    }

    const init = async () => {
      await checkVaultStatus();
      await loadAllData();
    };

    init();

    return () => {
      unsubSync();
      syncManager.stop();
      if (typeof window !== 'undefined') {
        window.removeEventListener('vault:status_changed', handleVaultChange);
      }
    };
  }, []);

  // 当切换账本或筛选条件时刷新流水与预算
  useEffect(() => {
    refreshTransactions();
    refreshBudgets();
  }, [activeLedgerId, filterType, filterCategoryId, filterStartDate, filterEndDate, filterSearch]);

  // 默认分类自适应
  useEffect(() => {
    if (categories.length > 0 && !recordCategoryId) {
      const initialCatId = getInitialCategoryId(recordType, categories);
      setRecordCategoryId(initialCatId);
    }
  }, [recordType, categories]);

  // 借贷子类型切换处理
  const handleLoanTypeChange = (lt: LoanType) => {
    setRecordLoanType(lt);
    const categoryMap: Record<LoanType, string> = {
      lend: 'cat_loan_lend',
      borrow: 'cat_loan_borrow',
      repay: 'cat_loan_repay',
      collect: 'cat_loan_collect',
    };
    setRecordCategoryId(categoryMap[lt]);
  };

  // 手动触发快照同步
  const handleSync = async () => {
    if (vaultStatus === 'uninitialized') {
      handleOpenVaultModal('setup');
      showToast('请先设置主密码', 'warning');
      return;
    }
    if (vaultStatus === 'locked' || !isVaultUnlocked()) {
      handleOpenVaultModal('unlock');
      showToast('请先解锁保险库', 'warning');
      return;
    }

    const res = await syncManager.sync();
    if (res.success) {
      showToast(res.message, 'success');
      await loadAllData();
    } else {
      showToast(res.message || '同步失败', 'warning');
    }
  };

  // 记账提交 (支持普通保存与保存再记)
  const handleRecordSubmit = async (e?: React.FormEvent, stayAndContinue = false) => {
    if (e) e.preventDefault();
    const cleanStr = String(recordAmountStr).trim().replace(/,/g, '').replace(/[^0-9.-]/g, '');
    const amountInCents = toCents(cleanStr);

    if (amountInCents <= 0) {
      showToast('请输入有效金额', 'warning');
      return;
    }

    const effectiveLedgerId =
      activeLedgerId && activeLedgerId !== 'all'
        ? activeLedgerId
        : ledgers.find((l) => l.is_default === 1)?.ledger_id || ledgers[0]?.ledger_id || DEFAULT_LOCAL_LEDGER_ID;

    setIsSubmittingRecord(true);
    try {
      const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const nowIso = new Date().toISOString();

      await createTransaction({
        transaction_id: txId,
        user_id: 'default_user',
        ledger_id: effectiveLedgerId,
        type: recordType,
        amount: amountInCents,
        category_id: recordCategoryId || null,
        from_account: (recordType === 'transfer' || recordType === 'loan') ? (recordFromAccount.trim() || null) : null,
        to_account: (recordType === 'transfer' || recordType === 'loan') ? (recordToAccount.trim() || null) : null,
        transaction_date: recordDate ? new Date(recordDate).toISOString() : nowIso,
        remark: recordRemark.trim() || null,
      });

      setRecordAmountStr('');
      setRecordRemark('');
      if (stayAndContinue) {
        showToast('已保存，请继续记账', 'success');
      } else {
        showToast('记账成功！', 'success');
      }
      await refreshTransactions();
      await refreshBudgets();

      // 如果启用了自动同步，触发后台静默同步
      syncManager.triggerAutoSync().catch(() => {});
    } catch (err: any) {
      showToast(err?.message || '记账失败', 'warning');
    } finally {
      setIsSubmittingRecord(false);
    }
  };

  // 修改账单流水
  const handleUpdateTransaction = async (updatedTx: Transaction) => {
    await updateTransaction(updatedTx.transaction_id, updatedTx);
    showToast('修改已保存', 'success');
    await refreshTransactions();
    await refreshBudgets();
    setSelectedTxForDetail(null);
  };

  // 删除账单流水
  const handleDeleteTransaction = async (transactionId: string) => {
    await deleteTransaction(transactionId);
    showToast('账单已删除', 'info');
    await refreshTransactions();
    await refreshBudgets();
    setSelectedTxForDetail(null);
  };

  // 保险库操作
  const handleLockVault = () => {
    lockVault();
    setVaultStatus('locked');
    showToast('🔒 账本已锁定', 'info');
  };

  const handleOpenVaultModal = (action?: VaultModalAction) => {
    setVaultModalAction(action || (vaultStatus === 'locked' ? 'unlock' : 'setup'));
    setIsVaultModalOpen(true);
  };

  const handleVaultSuccess = async (action: VaultModalAction, newRecoveryCode?: string) => {
    await checkVaultStatus();
    await loadAllData();
    if (action === 'setup') {
      showToast('🛡️ 主密码设置完成', 'success');
    } else if (action === 'unlock') {
      showToast('🔓 账本已解锁', 'success');
    } else if (action === 'change') {
      showToast('主密码已修改', 'success');
    } else if (action === 'reset') {
      showToast('主密码已重置并解锁', 'success');
    }
  };

  // 统计计算
  const totals = useMemo(() => calculateTotals(transactions), [transactions]);
  const groupedTransactions = useMemo(() => groupTransactionsByDay(transactions), [transactions]);
  const currentLedger = useMemo(() => ledgers.find((l) => l.ledger_id === activeLedgerId), [ledgers, activeLedgerId]);
  const curSymbol = getCurrencySymbol(currentLedger?.currency);

  const budgetOverview = useMemo(() => {
    return calculateBudgetOverview(
      budgets,
      transactions,
      categories,
      { ledgerId: activeLedgerId, period: 'monthly' }
    );
  }, [budgets, transactions, categories, activeLedgerId]);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200">
      {/* Toast 提示条 */}
      {toastMessage && (
        <div className="fixed top-[max(1rem,calc(1rem+env(safe-area-inset-top,0px)))] left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <div
            className={`px-4 py-2 rounded-2xl shadow-xl text-xs font-semibold flex items-center gap-2 ${
              toastMessage.type === 'success'
                ? 'bg-emerald-600 text-white'
                : toastMessage.type === 'warning'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 text-white dark:bg-white dark:text-slate-900'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* 顶部导航栏 */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80 px-4 pt-[max(0.75rem,calc(0.75rem+env(safe-area-inset-top,0px)))] pb-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/20">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-base font-bold tracking-tight">账盾</h1>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200/50 dark:border-indigo-800/50">
                  v3.0
                </span>
              </div>
            </div>
          </div>

          {/* 账本选择器 */}
          {ledgers.length > 0 && (
            <div className="flex items-center gap-1">
              {vaultStatus === 'locked' ? (
                <button
                  type="button"
                  onClick={() => handleOpenVaultModal('unlock')}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1.5 transition"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>账本已锁定</span>
                </button>
              ) : (
                <select
                  value={activeLedgerId}
                  onChange={(e) => setActiveLedgerId(e.target.value)}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border-none text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="all">全部账本</option>
                  {ledgers.map((l) => (
                    <option key={l.ledger_id} value={l.ledger_id}>
                      {l.name} ({l.currency})
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {/* 右侧操作区：WebDAV 同步状态 + 保险库锁 */}
          <div className="flex items-center gap-2">
            {/* WebDAV 同步快捷触发 */}
            {isWebdavSyncConfigured() && (
              <button
                type="button"
                onClick={handleSync}
                disabled={syncStats.isSyncing}
                title="WebDAV 同步"
                className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition"
              >
                <RefreshCw className={`w-4 h-4 ${syncStats.isSyncing ? 'animate-spin text-indigo-500' : ''}`} />
              </button>
            )}

            {/* 保险库状态与锁 */}
            {vaultStatus === 'unlocked' && (
              <button
                type="button"
                onClick={handleLockVault}
                title="已解锁，点击锁定"
                className="p-2 rounded-xl bg-slate-100 hover:bg-amber-50 dark:bg-slate-800 dark:hover:bg-amber-950/40 text-emerald-600 dark:text-emerald-400 hover:text-amber-600 transition"
              >
                <ShieldCheck className="w-4 h-4" />
              </button>
            )}

            {vaultStatus === 'locked' && (
              <button
                type="button"
                onClick={() => handleOpenVaultModal('unlock')}
                title="已锁定，点击输入密码解锁"
                className="p-2 rounded-xl bg-amber-500 text-slate-900 font-bold hover:bg-amber-600 transition shadow"
              >
                <Lock className="w-4 h-4" />
              </button>
            )}

            {vaultStatus === 'uninitialized' && (
              <button
                type="button"
                onClick={() => handleOpenVaultModal('setup')}
                title="设置主密码"
                className="p-2 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition shadow"
              >
                <Sparkles className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* 主体视口容器 */}
      <main className={`flex-1 max-w-4xl w-full mx-auto ${navTab === 'record' ? 'px-2 py-1.5 sm:p-6 space-y-2 sm:space-y-6' : 'p-4 sm:p-6 space-y-6'}`}>
        {/* 当保险库处于锁定状态且不在设置页时，展示全局数据遮蔽与快速解锁面板 */}
        {vaultStatus === 'locked' && navTab !== 'profile' ? (
          <div className="py-14 px-4 max-w-md mx-auto space-y-6 text-center animate-fade-in">
            <div className="w-24 h-24 mx-auto rounded-3xl bg-amber-500/10 dark:bg-amber-400/10 border border-amber-500/20 flex items-center justify-center text-amber-500 dark:text-amber-400 shadow-xl shadow-amber-500/5">
              <Lock className="w-12 h-12" />
            </div>

            <div className="space-y-2">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>账本已锁定</span>
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                财务数据已锁定保护
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed max-w-sm mx-auto">
                财务数据已锁定保护。请输入主密码解锁后查看与记账。
              </p>
            </div>

            <div className="pt-2 space-y-3">
              <button
                type="button"
                onClick={() => handleOpenVaultModal('unlock')}
                className="w-full py-3.5 px-6 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold text-sm shadow-lg shadow-amber-500/25 active:scale-98 transition flex items-center justify-center gap-2"
              >
                <Unlock className="w-4 h-4" />
                <span>输入主密码立即解锁</span>
              </button>

              <button
                type="button"
                onClick={() => setNavTab('profile')}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
              >
                前往「设置」
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* 视口内容切换 */}
            {navTab === 'record' && (
              <div className="space-y-2 sm:space-y-6">
                {/* 记账主面板 (桌面端左右分栏：左卡片表单 + 右数字键盘，手机端单列紧凑一屏) */}
                <div className="p-2.5 sm:p-6 rounded-2xl sm:rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-6 items-center">
                    {/* 左侧区域：类型选择、金额输入、分类/账户、时间与备注 */}
                    <div className="md:col-span-7 space-y-2.5 sm:space-y-3.5">
                      {/* 收支类型切换 */}
                      <div className="grid grid-cols-4 gap-1 p-0.5 sm:p-1 rounded-xl sm:rounded-2xl bg-slate-100 dark:bg-slate-800/60">
                        {(['expense', 'income', 'transfer', 'loan'] as TransactionType[]).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => {
                              setRecordType(t);
                              if (t === 'loan') {
                                handleLoanTypeChange(recordLoanType);
                              }
                            }}
                            className={`py-1.5 sm:py-2 px-2 rounded-lg sm:rounded-xl text-xs font-bold transition flex items-center justify-center gap-1 ${
                              recordType === t
                                ? t === 'expense'
                                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                            } ${
                              recordType === t && t === 'expense' ? 'bg-rose-500 text-white shadow-sm' : ''
                            } ${
                              recordType === t && t === 'income' ? 'bg-emerald-500 text-white shadow-sm' : ''
                            } ${
                              recordType === t && t === 'transfer' ? 'bg-blue-500 text-white shadow-sm' : ''
                            } ${
                              recordType === t && t === 'loan' ? 'bg-purple-500 text-white shadow-sm' : ''
                            }`}
                          >
                            {t === 'expense' && '支出'}
                            {t === 'income' && '收入'}
                            {t === 'transfer' && '转账'}
                            {t === 'loan' && '借贷'}
                          </button>
                        ))}
                      </div>

                      {/* 借贷子类型切换 */}
                      {recordType === 'loan' && (
                        <div className="grid grid-cols-4 gap-1 p-0.5 sm:p-1 rounded-lg sm:rounded-xl bg-purple-50 dark:bg-purple-950/30 text-purple-900 dark:text-purple-300">
                          {(['lend', 'borrow', 'repay', 'collect'] as LoanType[]).map((lt) => (
                            <button
                              key={lt}
                              type="button"
                              onClick={() => handleLoanTypeChange(lt)}
                              className={`py-1 px-1 rounded-md sm:rounded-lg text-[11px] sm:text-xs font-semibold transition ${
                                recordLoanType === lt
                                  ? 'bg-purple-600 text-white shadow-xs'
                                  : 'text-purple-700 dark:text-purple-300 hover:bg-purple-100 dark:hover:bg-purple-900/40'
                              }`}
                            >
                              {lt === 'lend' && '借出款项'}
                              {lt === 'borrow' && '借入款项'}
                              {lt === 'repay' && '归还借款'}
                              {lt === 'collect' && '收回借款'}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* 金额输入与展示框 */}
                      <div className="flex items-center justify-between p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition shadow-xs">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className="text-lg sm:text-2xl font-bold text-slate-400 shrink-0">
                            {curSymbol}
                          </span>
                          <input
                            type="text"
                            inputMode={isMobile ? 'none' : 'decimal'}
                            readOnly={isMobile}
                            placeholder="0.00"
                            value={recordAmountStr}
                            onChange={handleAmountInputChange}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleRecordSubmit(undefined, e.shiftKey || e.ctrlKey);
                              }
                            }}
                            className="w-full bg-transparent border-none p-0 text-2xl sm:text-4xl font-black tracking-tight font-mono text-slate-900 dark:text-white placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:ring-0"
                            autoFocus={!isMobile}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => setIsCalculatorOpen(true)}
                          className="px-2.5 py-1 rounded-lg sm:rounded-xl bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 text-[11px] sm:text-xs font-bold text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-600 shadow-xs flex items-center gap-1 transition shrink-0 cursor-pointer"
                        >
                          <span>🧮</span>
                          <span>计算器</span>
                        </button>
                      </div>

                      {/* 分类选择 */}
                      {(recordType === 'expense' || recordType === 'income') && (
                        <CategoryPicker
                          type={recordType}
                          categories={categories}
                          selectedCategoryId={recordCategoryId}
                          onSelectCategory={(id) => setRecordCategoryId(id)}
                          onOpenManage={() => setIsCategoryModalOpen(true)}
                        />
                      )}

                      {/* 账户选择 */}
                      {(recordType === 'transfer' || recordType === 'loan') && (
                        <AccountPicker
                          fromAccount={recordFromAccount}
                          toAccount={recordToAccount}
                          onChangeFrom={setRecordFromAccount}
                          onChangeTo={setRecordToAccount}
                          fromLabel={recordType === 'transfer' ? '转出账户' : recordLoanType === 'lend' || recordLoanType === 'repay' ? '出资账户' : '债务人/对象'}
                          toLabel={recordType === 'transfer' ? '转入账户' : recordLoanType === 'borrow' || recordLoanType === 'collect' ? '存入账户' : '债权人/对象'}
                        />
                      )}

                      {/* 日期与备注 (单行紧凑并排) */}
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <div className="w-[136px] sm:w-[170px] shrink-0">
                          <input
                            type="datetime-local"
                            value={recordDate}
                            onChange={(e) => setRecordDate(e.target.value)}
                            className="w-full px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] sm:text-xs font-medium text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            placeholder="备注说明 (可选)"
                            value={recordRemark}
                            onChange={(e) => setRecordRemark(e.target.value)}
                            className="w-full px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-[11px] sm:text-xs text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 右侧区域：触控数字键盘 (桌面端右侧分栏展示，移动端自动排列在下方) */}
                    <div className="md:col-span-5 flex flex-col justify-center h-full pt-0.5 md:pt-0">
                      <NumericKeypad
                        value={recordAmountStr}
                        onChange={setRecordAmountStr}
                        onSubmit={() => handleRecordSubmit(undefined, false)}
                        onSubmitAndContinue={() => handleRecordSubmit(undefined, true)}
                        onOpenCalculator={() => setIsCalculatorOpen(true)}
                        isSubmitting={isSubmittingRecord}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 明细流水板块 */}
            {navTab === 'detail' && (
              <div className="space-y-4">
                {/* 月度预算进度概览卡片 */}
                {budgetOverview.hasAnyBudget && (
                  <BudgetProgressCard
                    overview={budgetOverview}
                    currencySymbol={curSymbol}
                    onOpenBudgetModal={() => setIsBudgetModalOpen(true)}
                  />
                )}
                {/* 检索与筛选栏 */}
                <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="按备注搜索账单..."
                        value={filterSearch}
                        onChange={(e) => setFilterSearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* 汇总统计条 */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-center">
                    <div className="p-2 rounded-xl bg-rose-50/50 dark:bg-rose-950/20">
                      <div className="text-[11px] text-rose-600 dark:text-rose-400">总支出</div>
                      <div className="text-sm font-bold text-rose-700 dark:text-rose-300 mt-0.5">
                        {formatMoney(totals.totalExpense, curSymbol)}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20">
                      <div className="text-[11px] text-emerald-600 dark:text-emerald-400">总收入</div>
                      <div className="text-sm font-bold text-emerald-700 dark:text-emerald-300 mt-0.5">
                        {formatMoney(totals.totalIncome, curSymbol)}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/20">
                      <div className="text-[11px] text-indigo-600 dark:text-indigo-400">收支结余</div>
                      <div className="text-sm font-bold text-indigo-700 dark:text-indigo-300 mt-0.5">
                        {formatMoney(totals.balance, curSymbol)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 流水列表 */}
                {loadingTransactions ? (
                  <div className="text-center py-12 text-slate-400 text-xs">加载中...</div>
                ) : groupedTransactions.length === 0 ? (
                  <div className="text-center py-16 text-slate-400 space-y-2">
                    <Inbox className="w-12 h-12 mx-auto stroke-1" />
                    <p className="text-xs">暂无账单记录</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {groupedTransactions.map((group) => (
                      <div key={group.date} className="space-y-2">
                        <div className="flex items-center justify-between px-2 text-xs text-slate-500 font-semibold">
                          <span>{group.displayDate}</span>
                          <div className="flex items-center gap-2 text-[11px]">
                            {group.totalExpense > 0 && <span className="text-rose-500">支 {formatMoney(group.totalExpense, curSymbol)}</span>}
                            {group.totalIncome > 0 && <span className="text-emerald-500">收 {formatMoney(group.totalIncome, curSymbol)}</span>}
                          </div>
                        </div>

                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-sm">
                          {group.transactions.map((tx) => {
                            const catMeta = getCategoryMeta(tx.category_id, categories, tx.type);
                            return (
                              <div
                                key={tx.transaction_id}
                                onClick={() => setSelectedTxForDetail(tx)}
                                className="p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition cursor-pointer"
                              >
                                <div className="flex items-center gap-3">
                                  <CategoryIcon
                                    icon={catMeta.icon || 'Tag'}
                                    className="w-9 h-9 rounded-xl p-2 bg-slate-100 dark:bg-slate-800"
                                  />
                                  <div>
                                    <div className="text-xs font-bold text-slate-900 dark:text-white">
                                      {catMeta.fullPath || catMeta.name}
                                    </div>
                                    <div className="text-[11px] text-slate-400 mt-0.5">
                                      {formatTime(tx.transaction_date)}
                                      {tx.remark ? ` · ${tx.remark}` : ''}
                                    </div>
                                  </div>
                                </div>

                                <div
                                  className={`text-sm font-black tracking-tight ${
                                    tx.type === 'expense'
                                      ? 'text-rose-600 dark:text-rose-400'
                                      : tx.type === 'income'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : 'text-slate-800 dark:text-slate-200'
                                  }`}
                                >
                                  {tx.type === 'expense' ? '-' : tx.type === 'income' ? '+' : ''}
                                  {formatMoney(tx.amount, curSymbol)}
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
            )}

            {/* 统计报表板块 */}
            {navTab === 'stats' && (
              <StatisticsView
                transactions={transactions}
                categories={categories}
                ledgers={ledgers}
                activeLedgerId={activeLedgerId}
                onSelectLedger={(id) => setActiveLedgerId(id)}
              />
            )}

            {/* 分类管理板块 */}
            {navTab === 'category' && (
              <CategoriesView
                categories={categories}
                initialType="expense"
                onCategoriesChanged={refreshCategories}
              />
            )}

            {/* 我的设置板块 */}
            {navTab === 'profile' && (
              <ProfileView
                ledgers={ledgers}
                transactions={transactions}
                darkMode={darkMode}
                vaultStatus={vaultStatus}
                onToggleDarkMode={() => setDarkMode(!darkMode)}
                onSync={handleSync}
                onOpenLedgerModal={() => setIsLedgerModalOpen(true)}
                onOpenBudgetModal={() => setIsBudgetModalOpen(true)}
                onOpenDataModal={(mode) => {
                  setDataModalMode(mode || 'export');
                  setIsDataModalOpen(true);
                }}
                onOpenVaultModal={handleOpenVaultModal}
                onLockVault={handleLockVault}
                onOpenRecoveryCodeModal={(code) => {
                  setActiveRecoveryCode(code);
                  setIsRecoveryCodeModalOpen(true);
                }}
                onOpenRecurringModal={() => setIsRecurringModalOpen(true)}
                onRefreshData={loadAllData}
              />
            )}
          </>
        )}
      </main>

      {/* 底部固定导航栏 */}
      <footer className="sticky bottom-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800/80 pt-2 pb-[max(0.5rem,calc(0.5rem+env(safe-area-inset-bottom,0px)))] px-4">
        <div className="max-w-md mx-auto grid grid-cols-5 gap-1 text-center">
          {[
            { key: 'record', label: '记账', icon: PlusCircle },
            { key: 'detail', label: '明细', icon: Receipt },
            { key: 'stats', label: '统计', icon: PieChart },
            { key: 'category', label: '分类', icon: Tag },
            { key: 'profile', label: '设置', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = navTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setNavTab(tab.key as NavigationTab)}
                className={`py-1.5 flex flex-col items-center gap-1 rounded-xl transition ${
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px]">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </footer>

      {/* 弹窗集合 */}
      {/* 1. 保险库弹窗 (本地密码设置/解锁/重置) */}
      <VaultModal
        isOpen={isVaultModalOpen}
        initialAction={vaultModalAction}
        onClose={() => setIsVaultModalOpen(false)}
        onSuccess={handleVaultSuccess}
        onOpenRecoveryCode={(code) => {
          setActiveRecoveryCode(code);
          setIsRecoveryCodeModalOpen(true);
        }}
      />

      {/* 2. 首次进入引导弹窗 */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={() => {
          localStorage.setItem('ledger_has_seen_onboarding', 'true');
          setIsOnboardingOpen(false);
        }}
        onComplete={async () => {
          localStorage.setItem('ledger_has_seen_onboarding', 'true');
          setIsOnboardingOpen(false);
          await checkVaultStatus();
          await loadAllData();
          showToast('🛡️ 主密码设置完成', 'success');
        }}
        onOpenCloudSync={() => setNavTab('profile')}
      />

      {/* 3. 恢复凭证展示弹窗 */}
      <RecoveryCodeModal
        isOpen={isRecoveryCodeModalOpen}
        recoveryCode={activeRecoveryCode}
        isVaultCode={true}
        onClose={() => setIsRecoveryCodeModalOpen(false)}
      />

      {/* 4. 流水详情与修改弹窗 */}
      <TransactionDetailModal
        isOpen={!!selectedTxForDetail}
        transaction={selectedTxForDetail}
        categories={categories}
        ledgers={ledgers}
        onClose={() => setSelectedTxForDetail(null)}
        onUpdate={handleUpdateTransaction}
        onDelete={handleDeleteTransaction}
      />

      {/* 5. 账本管理弹窗 */}
      <LedgerManagementModal
        isOpen={isLedgerModalOpen}
        ledgers={ledgers}
        transactions={transactions}
        activeLedgerId={activeLedgerId}
        onClose={() => setIsLedgerModalOpen(false)}
        onSelectLedger={(id) => {
          setActiveLedgerId(id);
          setIsLedgerModalOpen(false);
        }}
        onLedgersChanged={refreshLedgers}
      />

      {/* 6. 预算管理弹窗 */}
      <BudgetManagementModal
        isOpen={isBudgetModalOpen}
        onClose={() => setIsBudgetModalOpen(false)}
        ledgers={ledgers}
        activeLedgerId={activeLedgerId}
        categories={categories}
        budgets={budgets}
        onBudgetsChanged={refreshBudgets}
      />

      {/* 7. 分类管理弹窗 */}
      <CategoryManagementModal
        isOpen={isCategoryModalOpen}
        categories={categories}
        initialType={recordType}
        onClose={() => setIsCategoryModalOpen(false)}
        onCategoriesChanged={refreshCategories}
      />

      {/* 8. 周期规则管理弹窗 */}
      <RecurringManagementModal
        isOpen={isRecurringModalOpen}
        ledgers={ledgers}
        categories={categories}
        activeLedgerId={activeLedgerId}
        onClose={() => setIsRecurringModalOpen(false)}
        onRulesChanged={loadAllData}
        onTriggerAutoProcess={loadAllData}
      />

      {/* 9. 数据导入导出弹窗 */}
      <DataManagementModal
        isOpen={isDataModalOpen}
        initialTab={dataModalMode}
        ledgers={ledgers}
        categories={categories}
        transactions={transactions}
        activeLedgerId={activeLedgerId}
        onClose={() => setIsDataModalOpen(false)}
        onImportSuccess={loadAllData}
      />

      {/* 10. 简易计算器弹窗抽屉 */}
      <CalculatorModal
        isOpen={isCalculatorOpen}
        initialValue={recordAmountStr}
        onClose={() => setIsCalculatorOpen(false)}
        onConfirm={(val) => setRecordAmountStr(val)}
      />
    </div>
  );
}

export default App;

