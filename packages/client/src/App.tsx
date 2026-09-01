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
  Lock,
  Unlock,
  ShieldAlert,
  Shield,
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
import {
  localDb,
  seedLocalCategories,
  seedLocalLedgers,
  DEFAULT_LOCAL_LEDGER_ID,
  getLocalStorageStats,
  clearUserData,
  clearLocalDatabase,
  migrateGuestDataToUser,
} from './db';
import {
  checkServerHealth,
  getCategories,
  getLedgers,
  getBudgets,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getStoredUser,
  fetchCurrentUser,
  clearSession,
} from './api/client';
import { networkMonitor, NetworkInfo } from './api/network';
import { syncManager, SyncStats } from './api/syncManager';
import {
  isVaultInitialized,
  isVaultUnlocked,
  lockVault,
} from './auth/localAuth';
import { isCloudSyncEnabled } from './sync/syncAdapter';
import { NetworkStatusBar } from './components/NetworkStatusBar';
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
import { DataManagementModal } from './components/DataManagementModal';
import { RecoveryCodeModal } from './components/RecoveryCodeModal';
import { DeleteAccountModal } from './components/DeleteAccountModal';
import { RecurringManagementModal } from './components/RecurringManagementModal';
import { OnboardingModal } from './components/OnboardingModal';
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
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(() => getStoredUser());
  const [vaultStatus, setVaultStatus] = useState<'uninitialized' | 'unlocked' | 'locked'>('uninitialized');
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  const [authModalTab, setAuthModalTab] = useState<'vault' | 'cloud'>('vault');
  const [authVaultAction, setAuthVaultAction] = useState<'unlock' | 'setup' | 'reset' | 'change'>('unlock');
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState<boolean>(false);
  const [isLedgerModalOpen, setIsLedgerModalOpen] = useState<boolean>(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState<boolean>(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState<boolean>(false);
  const [dataModalMode, setDataModalMode] = useState<'export' | 'import'>('export');
  const [isRecoveryCodeModalOpen, setIsRecoveryCodeModalOpen] = useState<boolean>(false);
  const [activeRecoveryCode, setActiveRecoveryCode] = useState<string>('');
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState<boolean>(false);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState<boolean>(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState<boolean>(false);
  const [selectedTxForDetail, setSelectedTxForDetail] = useState<Transaction | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<{ message: string; type?: 'success' | 'info' | 'error' } | null>(null);

  // 快捷微动效提示 Toast
  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setFeedbackToast({ message, type });
    setTimeout(() => {
      setFeedbackToast((prev) => (prev?.message === message ? null : prev));
    }, 2800);
  };

  // 切换深浅主题并持久化
  const handleToggleTheme = () => {
    setDarkMode((prev) => {
      const next = !prev;
      localStorage.setItem('ledger_theme', next ? 'dark' : 'light');
      return next;
    });
  };

  // 初始化与监听系统暗黑主题
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

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

  // 明细列表分页与按需懒加载 (单页 40 条，触底自动追加，极大提高巨量流水下的流畅度)
  const DETAIL_PAGE_SIZE = 40;
  const [displayLimit, setDisplayLimit] = useState<number>(DETAIL_PAGE_SIZE);
  const detailListObserverRef = useRef<HTMLDivElement | null>(null);

  // 从本地 Dexie 加载流水与待同步状态
  const loadLocalData = async (user?: AuthUser | null) => {
    const effectiveUser = user !== undefined ? user : currentUser;
    let list: Transaction[] = [];
    if (effectiveUser) {
      list = await localDb.transactions
        .where('user_id')
        .equals(effectiveUser.user_id)
        .sortBy('transaction_date');
    } else {
      // 访客 / 离线模式：加载本地未归属其他用户的流水或 default_user 流水
      list = await localDb.transactions
        .filter((t) => !t.user_id || t.user_id === 'default_user')
        .sortBy('transaction_date');
    }
    list.reverse();
    setTransactions(list);
    const stats = await getLocalStorageStats();
    setPendingCount(stats.totalPending);
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
    await triggerRecurringAutoProcess(null);

    // 非阻塞异步探测服务端健康状态
    checkServerHealth().then((health) => {
      setServerStatus({ ok: health.isOnline, data: health });
    }).catch(() => {});
  };

  // 检查并自动执行本地到期周期记账规则
  const triggerRecurringAutoProcess = async (user?: AuthUser | null) => {
    try {
      const res = await recurringEngine.processDueRules(false);
      if (res.createdTransactions.length > 0 && res.summaryText) {
        showToast(`🔔 ${res.summaryText}`, 'success');
        await loadLocalData(user);
      }
    } catch (err) {
      console.warn('周期记账自动处理通知:', err);
    }
  };

  // 刷新并检测本地安全保险库状态
  const checkVaultStatus = async () => {
    try {
      const initialized = await isVaultInitialized();
      if (initialized) {
        const unlocked = isVaultUnlocked();
        setVaultStatus(unlocked ? 'unlocked' : 'locked');
      } else {
        setVaultStatus('uninitialized');
        const hasSeenOnboarding = localStorage.getItem('ledger_has_seen_onboarding');
        if (!hasSeenOnboarding) {
          setIsOnboardingOpen(true);
        }
      }
    } catch (e) {
      console.warn('检测本地保险库状态异常:', e);
    }
  };

  // 载入并同步当前用户数据 (0ms 离线启动，网络在后台非阻塞静默同步)
  const loadUserData = async (user: AuthUser) => {
    // 自动将本地离线/访客模式下的流水与账单迁移至该登录账号
    await migrateGuestDataToUser(user.user_id);

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
    await triggerRecurringAutoProcess(user);

    // 如果开启了云端同步且网络可用，在后台静默发起双向同步，绝不阻塞用户界面渲染
    if (isCloudSyncEnabled()) {
      checkServerHealth().then((health) => {
        setServerStatus({ ok: health.isOnline, data: health });
        if (health.isOnline) {
          syncManager.syncAll(true).then(async () => {
            await refreshLedgers();
            await refreshBudgets();
            await refreshCategories();
            await loadLocalData(user);
          }).catch(() => {});
        }
      }).catch(() => {});
    }
  };

  // 初始化应用 (纯本地 Dexie 0ms 秒开)
  useEffect(() => {
    // 启动网络感知器与后台自动同步
    networkMonitor.start(30000);
    syncManager.start();

    // 订阅同步完成事件以自动刷新本地 UI
    const unsubSync = syncManager.subscribe((stats) => {
      setIsSyncing(stats.isSyncing);
      if (!stats.isSyncing) {
        refreshLedgers();
        refreshBudgets();
        refreshCategories();
        loadLocalData();
      }
    });

    const init = async () => {
      // 1. 立即检测本地保险库状态
      await checkVaultStatus();

      // 2. 立即从本地 IndexedDB 加载基础数据 (0ms 秒开)
      const stored = getStoredUser();
      if (!stored) {
        setCurrentUser(null);
        await loadGuestData();
        return;
      }

      setCurrentUser(stored);
      await loadUserData(stored);

      // 3. 后台验证 Token 有效性 (非阻塞)
      if (isCloudSyncEnabled()) {
        fetchCurrentUser().then((userRes) => {
          if (userRes.success && userRes.data) {
            setCurrentUser(userRes.data);
          } else {
            clearSession();
            setCurrentUser(null);
            loadGuestData();
          }
        }).catch(() => {});
      }
    };

    init();

    const handleUnauthorized = async () => {
      const prevUser = getStoredUser();
      clearSession();
      setCurrentUser(null);
      if (prevUser) {
        await clearUserData(prevUser.user_id);
      }
      await loadGuestData();
      showToast('登录凭证已失效，已切换至离线/访客模式', 'info');
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);

    return () => {
      unsubSync();
      networkMonitor.stop();
      syncManager.stop();
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  // 保险库操作处理函数
  const handleLockVault = () => {
    lockVault();
    setVaultStatus('locked');
    showToast('🔒 本地安全保险库已锁定，内存密钥已安全擦除', 'info');
  };

  const handleOpenVaultModal = (action?: 'unlock' | 'setup' | 'reset' | 'change') => {
    setAuthModalTab('vault');
    setAuthVaultAction(action || (vaultStatus === 'locked' ? 'unlock' : 'setup'));
    setIsAuthModalOpen(true);
  };

  const handleVaultUnlocked = async () => {
    setVaultStatus('unlocked');
    await refreshLedgers();
    await refreshBudgets();
    await refreshCategories();
    await loadLocalData();
    showToast('🛡️ 本地安全保险库已解锁', 'success');
  };

  const handleVaultSetupSuccess = (recoveryCode: string) => {
    setVaultStatus('unlocked');
    setActiveRecoveryCode(recoveryCode);
    setIsRecoveryCodeModalOpen(true);
    showToast('🎉 保险库初始化成功！请妥善保存 16 位应急恢复凭证', 'success');
  };

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

  // 提交记账 (3秒快速极简记账，未登录模式无缝记账至本地 Dexie)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const parsedAmount = parseFloat(amountStr);
    if (!amountStr || isNaN(parsedAmount) || parsedAmount <= 0) return;

    const amountInCents = toCents(amountStr);
    if (amountInCents <= 0) return;

    const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const userId = currentUser ? currentUser.user_id : 'default_user';

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

    // 触发展示记账成功微交互提示 Toast
    const catMeta = getCategoryMeta(selectedCategory, categories, activeTab);
    const typeLabel = activeTab === 'expense' ? '支出' : activeTab === 'income' ? '收入' : activeTab === 'transfer' ? '转账' : '借贷';
    const targetLedgerName = ledgers.find((l) => l.ledger_id === targetLedgerId)?.name || '账本';
    showToast(`✓ 已记一笔${typeLabel} ¥${amountStr}${catMeta?.name ? ` · ${catMeta.name}` : ''} (${targetLedgerName})`);

    // 快速重置并刷新
    setAmountStr('');
    setRemark('');
    await loadLocalData();
  };

  // 手动触发同步
  const handleSync = async () => {
    if (!currentUser) {
      showToast('当前处于离线/访客模式，登录云端账号后可自动多端同步', 'info');
      setAuthModalTab('cloud');
      setIsAuthModalOpen(true);
      return;
    }
    setIsSyncing(true);
    await syncManager.syncAll();
    const health = await checkServerHealth();
    setServerStatus({ ok: health.isOnline, data: health });
    await refreshLedgers();
    await refreshBudgets();
    await refreshCategories();
    await loadLocalData();
    setIsSyncing(false);
  };

  // 触发退出登录请求 (前置检查未同步数据)
  const handleRequestLogout = () => {
    setShowLogoutConfirm(true);
  };

  // 确认退出登录 (BUG-C04: 彻底清理本地 IndexedDB 私有数据)
  const handleConfirmLogout = async () => {
    setShowLogoutConfirm(false);
    const prevUser = currentUser;
    clearSession();
    setCurrentUser(null);
    if (prevUser) {
      await clearUserData(prevUser.user_id);
    } else {
      await clearLocalDatabase();
    }
    await loadGuestData();
    showToast('已安全退出登录，本地私有数据已清除', 'info');
  };

  // 登录/注册成功回调 (BUG-C04: 切换账号时先清理前一个用户的本地私有数据)
  const handleAuthSuccess = async (user: AuthUser, newRecoveryCode?: string | null) => {
    if (currentUser && currentUser.user_id !== user.user_id) {
      await clearUserData(currentUser.user_id);
    }
    setCurrentUser(user);
    setIsAuthModalOpen(false);
    await loadUserData(user);
    if (newRecoveryCode) {
      setActiveRecoveryCode(newRecoveryCode);
      setIsRecoveryCodeModalOpen(true);
    }
  };

  // 账号注销成功回调 (BUG-C04: 注销时原子清理本地私有数据与缓存)
  const handleDeleteAccountSuccess = async () => {
    const prevUser = currentUser;
    setIsDeleteAccountModalOpen(false);
    clearSession();
    setCurrentUser(null);
    if (prevUser) {
      await clearUserData(prevUser.user_id);
    } else {
      await clearLocalDatabase();
    }
    await loadGuestData();
    showToast('账号及所有关联数据已成功注销', 'info');
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

  // 筛选条件或 Tab 变化时平滑重置懒加载展示数量
  useEffect(() => {
    setDisplayLimit(DETAIL_PAGE_SIZE);
  }, [activeLedgerId, filterType, searchKeyword, navTab]);

  // 监听明细列表触底并自动无感追加下一批次数据 (懒加载)
  useEffect(() => {
    if (navTab !== 'detail') return;
    const target = detailListObserverRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0] && entries[0].isIntersecting) {
          setDisplayLimit((prev) => {
            if (prev < filteredTransactions.length) {
              return prev + DETAIL_PAGE_SIZE;
            }
            return prev;
          });
        }
      },
      { rootMargin: '250px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [navTab, filteredTransactions.length]);

  // 独立账本核算：收支与结余统计 (基于当前筛选的所有交易)
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

  // 明细按需懒加载切片 (仅对可见切片进行日历分组与渲染，解决海量数据 DOM 卡顿)
  const visibleTransactions = useMemo(() => {
    return filteredTransactions.slice(0, displayLimit);
  }, [filteredTransactions, displayLimit]);

  // 按天分组的流水明细 (仅对可见切片计算分组，保证 60fps 极速滑动)
  const dayGroups = useMemo(() => {
    return groupTransactionsByDay(visibleTransactions);
  }, [visibleTransactions]);

  // 切换账本
  const handleSwitchLedger = (ledgerId: string) => {
    setActiveLedgerId(ledgerId);
    if (ledgerId !== 'all') {
      setSelectedLedgerForRecord(ledgerId);
    }
  };

  return (
    <div className="min-h-screen bg-morandi-bg dark:bg-morandi-darkBg text-gray-800 dark:text-gray-100 flex flex-col items-center p-3 sm:p-6 pb-32 md:pb-12 font-sans transition-colors duration-200">
      {/* 浮动微动效反馈 Toast */}
      {feedbackToast && (
        <div className="fixed top-4 z-60 max-w-sm px-4 py-2.5 rounded-2xl bg-white/95 dark:bg-neutral-800/95 text-gray-900 dark:text-white shadow-xl shadow-indigo-500/10 border border-gray-100 dark:border-neutral-700/80 backdrop-blur-md animate-toast-in flex items-center gap-2.5 text-xs font-semibold">
          <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
          <span>{feedbackToast.message}</span>
        </div>
      )}

      <div className="w-full max-w-md md:max-w-3xl lg:max-w-5xl xl:max-w-6xl flex flex-col gap-4 sm:gap-6 transition-all duration-300">
        {/* 顶部导航与状态栏 (适配移动端与桌面端) */}
        <header className="flex justify-between items-center py-2 px-1 gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center font-bold text-sm shadow-sm shadow-indigo-500/25 transition-transform hover:scale-105 active:scale-95">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-gray-900 dark:text-white">账盾</h1>
              <p className="text-[10px] text-gray-400 font-medium">Serverless Ledger</p>
            </div>
          </div>

          {/* 桌面端专属顶部横向导航切换栏 (md: 及以上显示) */}
          <nav className="hidden md:flex items-center bg-gray-100/90 dark:bg-neutral-800/90 p-1 rounded-2xl border border-gray-200/60 dark:border-neutral-700/60 shadow-2xs">
            {[
              { id: 'detail', label: '明细', icon: Receipt },
              { id: 'stats', label: '统计', icon: PieChart },
              { id: 'record', label: '记账', icon: PlusCircle, isHighlight: true },
              { id: 'category', label: '分类', icon: Tag },
              { id: 'profile', label: '我的', icon: UserIcon },
            ].map((item) => {
              const Icon = item.icon;
              const isActive = navTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setNavTab(item.id as NavigationTab)}
                  className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 cursor-pointer ${
                    isActive
                      ? item.isHighlight
                        ? 'bg-indigo-600 text-white shadow-xs scale-102'
                        : 'bg-white dark:bg-neutral-700 text-gray-900 dark:text-white shadow-2xs'
                      : item.isHighlight
                      ? 'text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 font-bold'
                      : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            {currentUser ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white dark:bg-neutral-800/90 shadow-2xs border border-gray-100 dark:border-neutral-700/80 text-xs">
                <UserIcon className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span className="font-medium max-w-[90px] truncate text-gray-700 dark:text-gray-200" title={currentUser.email}>
                  {currentUser.email.split('@')[0]}
                </span>
                <button
                  onClick={handleRequestLogout}
                  title="退出登录"
                  className="p-0.5 hover:bg-gray-100 dark:hover:bg-neutral-700 rounded-lg text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3 h-3" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setAuthModalTab('cloud');
                  setIsAuthModalOpen(true);
                }}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs hover:shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>登录/注册</span>
              </button>
            )}
            {/* 本地安全保险库状态与锁定/解锁快捷按钮 */}
            {vaultStatus === 'unlocked' && (
              <button
                type="button"
                onClick={handleLockVault}
                title="本地保险库已解锁，点击立即锁定并清除内存密钥"
                className="p-2 rounded-xl bg-white dark:bg-neutral-800/90 shadow-2xs border border-gray-100 dark:border-neutral-700/80 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-emerald-600 dark:text-emerald-400 hover:text-amber-600 active:scale-95 transition-all cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
              </button>
            )}

            {vaultStatus === 'locked' && (
              <button
                type="button"
                onClick={() => handleOpenVaultModal('unlock')}
                title="本地保险库处于锁定状态，点击输入主密码解锁"
                className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 shadow-2xs border border-amber-200 dark:border-amber-900/50 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 active:scale-95 transition-all cursor-pointer animate-pulse"
              >
                <Lock className="w-4 h-4" />
              </button>
            )}

            {vaultStatus === 'uninitialized' && (
              <button
                type="button"
                onClick={() => handleOpenVaultModal('setup')}
                title="尚未设置本地保险库主密码，点击启用端到端加密"
                className="p-2 rounded-xl bg-white dark:bg-neutral-800/90 shadow-2xs border border-gray-100 dark:border-neutral-700/80 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-gray-400 hover:text-indigo-600 active:scale-95 transition-all cursor-pointer"
              >
                <Shield className="w-4 h-4" />
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
              className="p-2 rounded-xl bg-white dark:bg-neutral-800/90 shadow-2xs border border-gray-100 dark:border-neutral-700/80 hover:bg-gray-50 dark:hover:bg-neutral-700 active:scale-95 transition-all text-gray-600 dark:text-gray-300 relative cursor-pointer"
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
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-neutral-800 animate-pulse" />
              )}
            </button>
            <button
              type="button"
              onClick={handleToggleTheme}
              title={darkMode ? '切换为浅色模式' : '切换为深色模式'}
              className="p-2 rounded-xl bg-white dark:bg-neutral-800/90 shadow-2xs border border-gray-100 dark:border-neutral-700/80 hover:bg-gray-50 dark:hover:bg-neutral-700 active:scale-90 transition-all text-gray-600 dark:text-gray-300 cursor-pointer group"
            >
              <div className="transform transition-transform duration-300 group-hover:rotate-12">
                {darkMode ? (
                  <Sun className="w-4 h-4 text-amber-400 transition-all duration-300 scale-100 rotate-0" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-600 transition-all duration-300 scale-100 rotate-0" />
                )}
              </div>
            </button>
          </div>
        </header>

        {/* 本地保险库锁定提示条 */}
        {vaultStatus === 'locked' && (
          <div className="p-3 sm:p-3.5 rounded-2xl bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 text-amber-900 dark:text-amber-200 flex items-center justify-between text-xs animate-fadeIn">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="font-medium">本地安全保险库已锁定，敏感私密数据受 AES-GCM-256 加密保护。</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleOpenVaultModal('unlock')}
                className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs shadow-xs transition-all cursor-pointer"
              >
                输入密码解锁
              </button>
            </div>
          </div>
        )}

        {/* 弱网/离线感知与同步状态条 */}
        <NetworkStatusBar
          pendingCount={pendingCount}
          onSync={handleSync}
          onOpenSyncSettings={() => {
            setNavTab('profile');
          }}
        />

        {/* 如果保险库已锁定且不在“我的”页面，展示隐私遮罩，阻断业务 UI 渲染 */}
        {vaultStatus === 'locked' && navTab !== 'profile' ? (
          <div className="flex flex-col items-center justify-center py-24 px-4 mt-8 bg-white/60 dark:bg-neutral-900/60 backdrop-blur-3xl rounded-3xl border border-gray-200/50 dark:border-neutral-800/50 shadow-xl mx-2 sm:mx-0">
            <div className="w-20 h-20 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mb-6 shadow-inner">
              <Lock className="w-10 h-10 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">本地保险库已锁定</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 text-center max-w-sm leading-relaxed">
              您的财务数据正处于安全保护模式。为防止隐私泄露，请先验证主密码以继续访问记账明细与统计报表。
            </p>
            <button
              type="button"
              onClick={() => handleOpenVaultModal('unlock')}
              className="px-8 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-lg shadow-indigo-600/30 hover:shadow-indigo-600/50 transition-all active:scale-95 cursor-pointer"
            >
              输入主密码解锁
            </button>
          </div>
        ) : (
          <div className="animate-fadeIn">
            {/* 1. 【明细】板块 (结余汇总与流水时间轴列表 - 响应式双栏布局) */}
            {navTab === 'detail' && (
          <div className="lg:grid lg:grid-cols-12 lg:gap-6 items-start flex flex-col gap-4">
            {/* 左侧区域 (lg:col-span-5): 账本选择器 + 结余汇总大卡片 + 月度预算看板 */}
            <div className="lg:col-span-5 w-full flex flex-col gap-4 lg:sticky lg:top-4">
              {/* 快捷多账本切换胶囊栏 */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 px-0.5">
                {/* 全部账本透视 */}
                <button
                  type="button"
                  onClick={() => handleSwitchLedger('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
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
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
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
                  className="px-2.5 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-900/60 hover:bg-emerald-100 transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
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
                <div className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-3 text-white">
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
            </div>

            {/* 右侧区域 (lg:col-span-7): 账单流水明细列表 */}
            <div className="lg:col-span-7 w-full bg-white dark:bg-neutral-800 rounded-3xl p-4 sm:p-5 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3">
              {/* 列表头部与筛选器 */}
              <div className="flex flex-col gap-2.5 pb-2 border-b border-gray-100 dark:border-neutral-700/60">
                <div className="flex justify-between items-center">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {activeLedger ? `【${activeLedger.name}】流水明细` : '全账本流水明细'}
                  </h2>
                  <span className="text-[11px] text-gray-400">
                    共 {filteredTransactions.length} 笔记录
                    {filteredTransactions.length > displayLimit && (
                      <span className="text-indigo-600 dark:text-indigo-400 ml-1 font-medium">
                        (已载入前 {visibleTransactions.length} 笔)
                      </span>
                    )}
                  </span>
                </div>

                {/* 筛选切换 (全部 / 支出 / 收入 / 转账 / 借贷) & 搜索 */}
                <div className="flex flex-wrap items-center gap-2">
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
                          className={`px-2 py-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                            isCur
                              ? 'bg-white dark:bg-neutral-800 text-gray-900 dark:text-white shadow-2xs font-semibold'
                              : 'text-gray-500 hover:text-gray-800'
                          }`}
                        >
                          {labels[t]}
                        </button>
                      );
                    })}
                  </div>

                  {/* 搜索框 */}
                  <div className="relative flex-1 min-w-[140px]">
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
                <div className="py-12 flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-2xl bg-gray-50 dark:bg-neutral-900 flex items-center justify-center text-gray-300 dark:text-neutral-600 mb-2">
                    <Receipt className="w-6 h-6" />
                  </div>
                  <p className="text-xs text-gray-400 font-medium">
                    {searchKeyword ? '没有找到匹配的记账明细' : '当前账本暂无流水记录，快去记一笔吧'}
                  </p>
                  <button
                    type="button"
                    onClick={() => setNavTab('record')}
                    className="mt-3 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>立即记一笔</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {dayGroups.map((group) => (
                    <div key={group.date} className="flex flex-col gap-1.5">
                      {/* 日期分组标题 */}
                      <div className="flex justify-between items-center px-1 text-[11px] text-gray-400 font-medium">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-gray-600 dark:text-gray-300">{group.displayDate}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px]">
                          {group.totalExpense > 0 && (
                            <span className="text-[#D08770]">支 {formatMoney(group.totalExpense, currentCurrencySymbol)}</span>
                          )}
                          {group.totalIncome > 0 && (
                            <span className="text-[#A3BE8C]">收 {formatMoney(group.totalIncome, currentCurrencySymbol)}</span>
                          )}
                          {group.totalTransfer > 0 && (
                            <span className="text-blue-500">转 {formatMoney(group.totalTransfer, currentCurrencySymbol)}</span>
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
                              className="py-2.5 px-2.5 flex items-center justify-between hover:bg-white dark:hover:bg-neutral-800/90 rounded-2xl transition-all cursor-pointer group active:scale-[0.99] border border-transparent hover:border-gray-100 dark:hover:border-neutral-700/60 shadow-none hover:shadow-2xs"
                            >
                              {/* 左侧：分类图标与名称/备注 */}
                              <div className="flex items-center gap-3">
                                <div
                                  className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-105 group-active:scale-95 shadow-2xs ${
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

                  {/* 懒加载触底哨兵与分页加载指示条 */}
                  {filteredTransactions.length > 0 && (
                    <div className="pt-2 flex flex-col items-center gap-2">
                      {displayLimit < filteredTransactions.length ? (
                        <div ref={detailListObserverRef} className="w-full flex flex-col items-center gap-1.5 py-3">
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-500" />
                            <span>正在向下无感加载更多明细 ({visibleTransactions.length}/{filteredTransactions.length})...</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDisplayLimit((prev) => prev + DETAIL_PAGE_SIZE)}
                            className="text-[11px] px-3 py-1 rounded-xl bg-gray-100 dark:bg-neutral-800 hover:bg-gray-200 dark:hover:bg-neutral-700 text-indigo-600 dark:text-indigo-400 font-medium transition-colors cursor-pointer"
                          >
                            点击快速加载更多 (+{Math.min(DETAIL_PAGE_SIZE, filteredTransactions.length - visibleTransactions.length)} 笔)
                          </button>
                        </div>
                      ) : (
                        filteredTransactions.length > DETAIL_PAGE_SIZE && (
                          <div className="text-[11px] text-gray-400 py-3 text-center">
                            ✓ 已加载全部 {filteredTransactions.length} 笔流水明细
                          </div>
                        )
                      )}
                    </div>
                  )}
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

        {/* 3. 【记账】板块 (居中核心记账录入与桌面端双栏看板) */}
        {navTab === 'record' && (
          <div className="lg:grid lg:grid-cols-12 lg:gap-6 items-start flex flex-col gap-4">
            {/* 左侧区域 (lg:col-span-7): 3秒极简记账录入卡片 */}
            <div className="lg:col-span-7 w-full bg-white dark:bg-neutral-800 rounded-3xl p-4 sm:p-5 shadow-sm border border-gray-100 dark:border-neutral-700">
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
                    className="text-[11px] text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-neutral-900 px-2.5 py-1 rounded-xl border border-gray-100 dark:border-neutral-700/60 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors flex items-center gap-1.5 cursor-pointer"
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
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-xl transition-all cursor-pointer ${
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
                          className={`flex-1 py-1.5 px-1 text-[11px] font-semibold rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer ${
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
                        className="px-2.5 py-1 rounded-xl bg-gray-100 dark:bg-neutral-800/80 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-neutral-700 active:scale-95 transition-all shadow-2xs font-semibold cursor-pointer"
                      >
                        +{preset}
                      </button>
                    ))}
                    {amountStr && (
                      <button
                        type="button"
                        onClick={() => setAmountStr('')}
                        className="px-2.5 py-1 rounded-xl text-gray-400 hover:text-red-500 dark:hover:text-red-400 text-[10px] font-medium active:scale-95 transition-all cursor-pointer"
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
                      className="bg-white dark:bg-neutral-800 text-xs font-semibold px-2 py-1 rounded-lg border border-gray-200 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none cursor-pointer"
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
                      className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 font-normal cursor-pointer"
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

                {/* 日期 + 备注 (左侧) 与 方形大记账按钮 (右侧) 紧凑联动布局 */}
                <div className="pt-2.5 border-t border-gray-100 dark:border-neutral-700/60 flex items-stretch gap-2.5">
                  {/* 左侧：记账日期与备注输入框 */}
                  <div className="flex-1 flex flex-col justify-between gap-2 min-w-0">
                    {/* 记账日期快捷切换 */}
                    <div className="flex flex-col gap-1">
                      <div className="text-[11px] font-medium text-gray-400 px-0.5">记账日期</div>
                      <div className="grid grid-cols-4 gap-1 text-xs">
                        <button
                          type="button"
                          onClick={() => setRecordDateType('today')}
                          className={`py-1.5 rounded-xl font-medium text-center transition-all cursor-pointer ${
                            recordDateType === 'today'
                              ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                              : 'bg-gray-100 dark:bg-neutral-700/60 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700'
                          }`}
                        >
                          今天
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecordDateType('yesterday')}
                          className={`py-1.5 rounded-xl font-medium text-center transition-all cursor-pointer ${
                            recordDateType === 'yesterday'
                              ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                              : 'bg-gray-100 dark:bg-neutral-700/60 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700'
                          }`}
                        >
                          昨天
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecordDateType('beforeYesterday')}
                          className={`py-1.5 rounded-xl font-medium text-center transition-all cursor-pointer ${
                            recordDateType === 'beforeYesterday'
                              ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                              : 'bg-gray-100 dark:bg-neutral-700/60 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700'
                          }`}
                        >
                          前天
                        </button>
                        <button
                          type="button"
                          onClick={() => setRecordDateType('custom')}
                          className={`py-1.5 rounded-xl font-medium flex items-center justify-center gap-0.5 transition-all cursor-pointer ${
                            recordDateType === 'custom'
                              ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                              : 'bg-gray-100 dark:bg-neutral-700/60 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700'
                          }`}
                        >
                          <Calendar className="w-3 h-3 shrink-0" />
                          <span>自定义</span>
                        </button>
                      </div>

                      {recordDateType === 'custom' && (
                        <div className="mt-0.5">
                          <input
                            type="date"
                            value={customDate}
                            onChange={(e) => setCustomDate(e.target.value)}
                            className="w-full px-2.5 py-1 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>

                    {/* 备注输入框 */}
                    <div className="flex flex-col gap-0.5">
                      <input
                        type="text"
                        placeholder="添加备注 (可选)..."
                        value={remark}
                        onChange={(e) => setRemark(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none transition-all placeholder:text-gray-400"
                      />
                    </div>
                  </div>

                  {/* 右侧：方形大记账按钮 (明显、大尺寸正方形触控区) */}
                  <button
                    type="submit"
                    disabled={!amountStr || parseFloat(amountStr) <= 0}
                    className={`w-24 sm:w-28 rounded-2xl flex flex-col items-center justify-center gap-1.5 p-2 font-bold text-white shadow-lg active:scale-95 transition-all duration-200 shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      activeTab === 'expense'
                        ? 'bg-gradient-to-br from-indigo-600 to-indigo-700 shadow-indigo-600/30 hover:from-indigo-500 hover:to-indigo-600'
                        : activeTab === 'income'
                        ? 'bg-gradient-to-br from-emerald-600 to-teal-700 shadow-emerald-600/30 hover:from-emerald-500 hover:to-teal-600'
                        : activeTab === 'transfer'
                        ? 'bg-gradient-to-br from-blue-600 to-indigo-700 shadow-blue-600/30 hover:from-blue-500 hover:to-indigo-600'
                        : 'bg-gradient-to-br from-purple-600 to-indigo-700 shadow-purple-600/30 hover:from-purple-500 hover:to-indigo-600'
                    }`}
                    style={{ minHeight: '86px' }}
                    title="点击记录账目"
                  >
                    <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center backdrop-blur-xs">
                      <Plus className="w-5 h-5 text-white stroke-[2.5]" />
                    </div>
                    <span className="text-xs tracking-wide">
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

            {/* 右侧区域 (lg:col-span-5): 预算进度看板 + 桌面端最近5笔记录速览 */}
            <div className="lg:col-span-5 w-full flex flex-col gap-4">
              <BudgetProgressCard
                overview={budgetOverview}
                currencySymbol={currentCurrencySymbol}
                onOpenBudgetModal={() => setIsBudgetModalOpen(true)}
                ledgerName={activeLedger ? activeLedger.name : undefined}
              />

              {/* 桌面端特有：最近5笔记录速览卡片 */}
              <div className="hidden lg:flex flex-col gap-2.5 p-4 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700">
                <div className="flex items-center justify-between pb-2 border-b border-gray-100 dark:border-neutral-700/60">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-gray-800 dark:text-gray-200">
                    <Receipt className="w-3.5 h-3.5 text-indigo-500" />
                    <span>最近记录速览</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNavTab('detail')}
                    className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                  >
                    查看全部明细 ➔
                  </button>
                </div>

                {transactions.length === 0 ? (
                  <div className="py-6 text-center text-xs text-gray-400">暂无记账流水，快记下第一笔吧</div>
                ) : (
                  <div className="flex flex-col divide-y divide-gray-100 dark:divide-neutral-750">
                    {transactions.slice(0, 5).map((tx) => {
                      const isExp = tx.type === 'expense';
                      const isInc = tx.type === 'income';
                      const catMeta = getCategoryMeta(tx.category_id, categories, tx.type);
                      const txCur = getCurrencySymbol(ledgerMap.get(tx.ledger_id)?.currency);
                      return (
                        <div
                          key={tx.transaction_id}
                          onClick={() => setSelectedTxForDetail(tx)}
                          className="py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-neutral-750 px-1.5 rounded-xl transition-all cursor-pointer text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <CategoryIcon icon={catMeta.icon} className="w-3.5 h-3.5 text-gray-500" />
                            <span className="font-semibold text-gray-800 dark:text-gray-200">{catMeta.name}</span>
                            {tx.remark && (
                              <span className="text-[11px] text-gray-400 truncate max-w-[120px]">· {tx.remark}</span>
                            )}
                          </div>
                          <span
                            className={`font-bold ${
                              isExp ? 'text-gray-900 dark:text-white' : isInc ? 'text-[#A3BE8C]' : 'text-blue-500'
                            }`}
                          >
                            {isExp ? '-' : isInc ? '+' : ''}
                            {formatMoney(tx.amount, txCur)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

            {/* 4. 【分类】板块 (默认固定展示 支出大类) */}
            {navTab === 'category' && (
              <CategoriesView
                categories={categories}
                initialType="expense"
                currentUser={currentUser}
                onCategoriesChanged={refreshCategories}
                onRequireAuth={() => setIsAuthModalOpen(true)}
              />
            )}
          </div>
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
            vaultStatus={vaultStatus}
            onToggleDarkMode={() => setDarkMode(!darkMode)}
            onSync={handleSync}
            onOpenLedgerModal={() => setIsLedgerModalOpen(true)}
            onOpenBudgetModal={() => setIsBudgetModalOpen(true)}
            onOpenDataModal={(mode) => {
              setDataModalMode(mode || 'export');
              setIsDataModalOpen(true);
            }}
            onLogout={handleRequestLogout}
            onOpenAuthModal={() => {
              setAuthModalTab('cloud');
              setIsAuthModalOpen(true);
            }}
            onOpenVaultModal={handleOpenVaultModal}
            onLockVault={handleLockVault}
            onOpenDeleteAccountModal={() => setIsDeleteAccountModalOpen(true)}
            onOpenRecoveryCodeModal={(code) => {
              setActiveRecoveryCode(code);
              setIsRecoveryCodeModalOpen(true);
            }}
            onOpenRecurringModal={() => setIsRecurringModalOpen(true)}
            onRefreshData={async () => {
              await refreshLedgers();
              await refreshBudgets();
              await refreshCategories();
              await loadLocalData();
            }}
          />
        )}

        {/* 周期记账规则管理弹窗 */}
        <RecurringManagementModal
          isOpen={isRecurringModalOpen}
          currentUser={currentUser}
          ledgers={ledgers}
          categories={categories}
          activeLedgerId={activeLedgerId}
          onClose={() => setIsRecurringModalOpen(false)}
          onRulesChanged={async () => {
            await triggerRecurringAutoProcess(currentUser);
          }}
          onTriggerAutoProcess={async () => {
            await loadLocalData(currentUser);
          }}
          onRequireAuth={() => {
            setAuthModalTab('cloud');
            setIsAuthModalOpen(true);
          }}
        />

        {/* 密码/凭证恢复弹窗 (支持 16 位保险库凭证与 8 位云端恢复码) */}
        <RecoveryCodeModal
          isOpen={isRecoveryCodeModalOpen}
          recoveryCode={activeRecoveryCode}
          userEmail={currentUser?.email}
          isVaultCode={activeRecoveryCode.replace(/-/g, '').length >= 16}
          onClose={() => setIsRecoveryCodeModalOpen(false)}
        />

        {/* 注销账号确认弹窗 (含一键备份) */}
        <DeleteAccountModal
          isOpen={isDeleteAccountModalOpen}
          currentUser={currentUser}
          ledgers={ledgers}
          categories={categories}
          transactions={transactions}
          onClose={() => setIsDeleteAccountModalOpen(false)}
          onDeleteSuccess={handleDeleteAccountSuccess}
        />

        {/* 数据与资产管理 弹窗 (CSV/Excel 导入导出与端到端加密备份包) */}
        <DataManagementModal
          isOpen={isDataModalOpen}
          initialTab={dataModalMode}
          currentUser={currentUser}
          ledgers={ledgers}
          categories={categories}
          transactions={transactions}
          activeLedgerId={activeLedgerId}
          onClose={() => setIsDataModalOpen(false)}
          onImportSuccess={async () => {
            await refreshLedgers();
            await refreshBudgets();
            await refreshCategories();
            await loadLocalData();
            if (currentUser && isCloudSyncEnabled()) {
              syncManager.syncAll(true).catch(() => {});
            }
          }}
          onRequireAuth={() => {
            setAuthModalTab('cloud');
            setIsAuthModalOpen(true);
          }}
        />

        {/* 新用户首次冷启动欢迎与本地保险库引导弹窗 */}
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
            await loadLocalData(currentUser);
            showToast('🛡️ 本地安全保险库初始化完成', 'success');
          }}
          onOpenCloudSync={() => {
            setAuthModalTab('cloud');
            setIsAuthModalOpen(true);
          }}
        />

        {/* 认证与保险库综合弹窗 (双模：本地保险库主密码 / 云端同步账号) */}
        <AuthModal
          isOpen={isAuthModalOpen}
          closable={true}
          initialTab={authModalTab}
          initialVaultAction={authVaultAction}
          onClose={() => setIsAuthModalOpen(false)}
          onSuccess={handleAuthSuccess}
          onVaultUnlocked={handleVaultUnlocked}
          onVaultSetupSuccess={handleVaultSetupSuccess}
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

      {/* 底部固定导航栏 (仅在移动端屏幕 md:hidden 显示，桌面端统一使用顶部导航) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 dark:bg-neutral-900/90 backdrop-blur-xl border-t border-gray-200/80 dark:border-neutral-800 shadow-lg pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] md:hidden">
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
