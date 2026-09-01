import React, { useState, useEffect } from 'react';
import {
  User as UserIcon,
  BookOpen,
  RefreshCw,
  Moon,
  Sun,
  ShieldCheck,
  LogOut,
  LogIn,
  ChevronRight,
  Database,
  Cloud,
  CloudOff,
  Wifi,
  WifiOff,
  CheckCircle2,
  AlertCircle,
  Info,
  Layers,
  Sparkles,
  Target,
  HardDrive,
  Activity,
  FolderDown,
  Download,
  Upload,
  Ticket,
  Copy,
  Check,
  Plus,
  KeyRound,
  Trash2,
  Repeat,
  Server,
  Globe,
  Settings,
  RotateCcw,
  Lock,
  Unlock,
  ShieldAlert,
  Shield,
  Zap,
} from 'lucide-react';
import { AuthUser, Ledger, Transaction, InviteEligibilityInfo, SyncProviderType } from '@ledger/shared';
import { networkMonitor, NetworkInfo } from '../api/network';
import { syncManager, SyncStats } from '../api/syncManager';
import { getLocalStorageStats, clearLocalDatabase } from '../db';
import {
  getInviteCodes,
  claimInviteCode,
  getCustomApiUrl,
  setCustomApiUrl,
  testApiConnection,
  getDisplayApiHost,
  getStoredToken,
} from '../api/client';
import {
  getSyncConfig,
  saveSyncConfig,
  isCloudSyncEnabled,
  SyncConfig,
} from '../sync/syncAdapter';
import {
  isVaultInitialized,
  isVaultUnlocked,
  lockVault,
  getVaultMetadata,
} from '../auth/localAuth';

interface ProfileViewProps {
  currentUser: AuthUser | null;
  ledgers: Ledger[];
  transactions: Transaction[];
  serverStatus: { ok: boolean; data?: any };
  pendingCount: number;
  isSyncing: boolean;
  darkMode: boolean;
  vaultStatus?: 'uninitialized' | 'unlocked' | 'locked';
  cloudTotalCount?: number | null;
  onToggleDarkMode: () => void;
  onSync: () => Promise<void>;
  onOpenLedgerModal: () => void;
  onOpenBudgetModal?: () => void;
  onOpenDataModal?: (initialTab?: 'export' | 'import') => void;
  onLogout: () => void;
  onOpenAuthModal?: () => void;
  onOpenVaultModal?: (action?: 'unlock' | 'setup' | 'reset' | 'change') => void;
  onLockVault?: () => void;
  onOpenDeleteAccountModal?: () => void;
  onOpenRecoveryCodeModal?: (code: string) => void;
  onOpenRecurringModal?: () => void;
  onRefreshData?: () => Promise<void>;
}

export function ProfileView({
  currentUser,
  ledgers,
  transactions,
  serverStatus,
  pendingCount,
  isSyncing,
  darkMode,
  vaultStatus = 'uninitialized',
  cloudTotalCount,
  onToggleDarkMode,
  onSync,
  onOpenLedgerModal,
  onOpenBudgetModal,
  onOpenDataModal,
  onLogout,
  onOpenAuthModal,
  onOpenVaultModal,
  onLockVault,
  onOpenDeleteAccountModal,
  onOpenRecoveryCodeModal,
  onOpenRecurringModal,
  onRefreshData,
}: ProfileViewProps) {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>(() => networkMonitor.getInfo());
  const [syncStats, setSyncStats] = useState<SyncStats>(() => syncManager.getStats());
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => getSyncConfig());
  const [storageStats, setStorageStats] = useState<{
    transactions: number;
    categories: number;
    ledgers: number;
    budgets: number;
    recurringRules: number;
    queueItems: number;
    pendingTransactions: number;
    totalPending: number;
    vaultMetaCount: number;
  } | null>(null);

  const [inviteInfo, setInviteInfo] = useState<InviteEligibilityInfo | null>(null);
  const [loadingInviteInfo, setLoadingInviteInfo] = useState(false);
  const [claimingInvite, setClaimingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState('');

  // 后端 API 服务器与云同步设置状态
  const [selectedProvider, setSelectedProvider] = useState<SyncProviderType>(() => syncConfig.provider || 'none');
  const [customServerUrl, setCustomServerUrl] = useState<string>(() => getCustomApiUrl());
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => syncConfig.autoSyncEnabled !== false);
  const [testingApi, setTestingApi] = useState(false);
  const [apiTestResult, setApiTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [apiSuccessMsg, setApiSuccessMsg] = useState('');

  // 全量同步触发状态
  const [fullSyncingDirection, setFullSyncingDirection] = useState<'push' | 'pull' | 'bidirectional' | null>(null);
  const [fullSyncFeedback, setFullSyncFeedback] = useState<string | null>(null);

  // 本地保险库状态
  const [isVaultActive, setIsVaultActive] = useState<boolean>(false);
  const [isVaultCached, setIsVaultCached] = useState<boolean>(false);

  useEffect(() => {
    const unsubNet = networkMonitor.subscribe((info) => setNetworkInfo(info));
    const unsubSync = syncManager.subscribe((stats) => setSyncStats(stats));

    const handleConfigChange = (e: any) => {
      const cfg = e.detail || getSyncConfig();
      setSyncConfig(cfg);
      setSelectedProvider(cfg.provider || 'none');
      setAutoSyncEnabled(cfg.autoSyncEnabled !== false);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('sync:config_changed', handleConfigChange);
    }

    return () => {
      unsubNet();
      unsubSync();
      if (typeof window !== 'undefined') {
        window.removeEventListener('sync:config_changed', handleConfigChange);
      }
    };
  }, []);

  const refreshStorageAndVault = () => {
    getLocalStorageStats().then((stats) => setStorageStats(stats));
    isVaultInitialized().then((init) => {
      setIsVaultActive(init);
      setIsVaultCached(isVaultUnlocked());
    });
  };

  useEffect(() => {
    refreshStorageAndVault();
  }, [transactions.length, pendingCount, isSyncing, vaultStatus]);

  useEffect(() => {
    if (currentUser) {
      setLoadingInviteInfo(true);
      getInviteCodes()
        .then((res) => {
          if (res.success && res.data) {
            setInviteInfo(res.data);
          }
        })
        .finally(() => setLoadingInviteInfo(false));
    } else {
      setInviteInfo(null);
    }
  }, [currentUser?.user_id, transactions.length]);

  const handleClaimInvite = async () => {
    setClaimingInvite(true);
    setInviteError('');
    try {
      const res = await claimInviteCode();
      if (res.success) {
        const refreshed = await getInviteCodes();
        if (refreshed.success && refreshed.data) {
          setInviteInfo(refreshed.data);
        }
      } else {
        setInviteError(res.error || '获取邀请码失败');
      }
    } catch (err: any) {
      setInviteError(err.message || '网络异常');
    } finally {
      setClaimingInvite(false);
    }
  };

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => {
      setCopiedCode((curr) => (curr === code ? null : curr));
    }, 2000);
  };

  const handleTestApi = async () => {
    setTestingApi(true);
    setApiTestResult(null);
    try {
      const res = await testApiConnection(customServerUrl.trim() || undefined);
      if (res.success) {
        setApiTestResult({
          success: true,
          message: `连接正常！(路由: ${res.targetBase}) 延迟: ${res.latencyMs}ms`,
        });
      } else {
        setApiTestResult({
          success: false,
          message: res.error || '无法连接该服务器',
        });
      }
    } catch (err: any) {
      setApiTestResult({
        success: false,
        message: err.message || '网络超时或地址不可达',
      });
    } finally {
      setTestingApi(false);
    }
  };

  const handleProviderChange = (newProvider: SyncProviderType) => {
    setSelectedProvider(newProvider);
    saveSyncConfig({ provider: newProvider });
    setApiSuccessMsg(`云同步服务提供方已设置为：${newProvider === 'none' ? '仅本地离线' : 'Cloudflare D1'}`);
    setTimeout(() => setApiSuccessMsg(''), 3000);
  };

  const handleToggleAutoSync = () => {
    const nextVal = !autoSyncEnabled;
    setAutoSyncEnabled(nextVal);
    saveSyncConfig({ autoSyncEnabled: nextVal });
    setApiSuccessMsg(nextVal ? '已开启断网恢复与周期自动静默同步' : '已暂停自动同步');
    setTimeout(() => setApiSuccessMsg(''), 3000);
  };

  const handleSaveApi = () => {
    setCustomApiUrl(customServerUrl.trim());
    saveSyncConfig({
      serverUrl: customServerUrl.trim(),
      provider: selectedProvider,
      autoSyncEnabled,
    });
    setApiSuccessMsg('云同步配置已保存生效');
    setTimeout(() => setApiSuccessMsg(''), 3000);
    networkMonitor.checkHealth();
  };

  const handleResetApi = () => {
    setCustomApiUrl('');
    setCustomServerUrl('');
    setApiTestResult(null);
    saveSyncConfig({ serverUrl: '' });
    setApiSuccessMsg('已恢复默认服务器配置');
    setTimeout(() => setApiSuccessMsg(''), 3000);
    networkMonitor.checkHealth();
  };

  // 全量同步操作
  const handleFullSync = async (direction: 'push_local_to_cloud' | 'pull_cloud_to_local' | 'bidirectional') => {
    if (!currentUser) {
      if (onOpenAuthModal) onOpenAuthModal();
      return;
    }

    const dirKey = direction === 'push_local_to_cloud' ? 'push' : direction === 'pull_cloud_to_local' ? 'pull' : 'bidirectional';
    setFullSyncingDirection(dirKey);
    setFullSyncFeedback(null);

    try {
      const res = await syncManager.fullSync(direction);
      if (res.success) {
        setFullSyncFeedback(
          direction === 'push_local_to_cloud'
            ? `全量上传成功！已推送 ${res.syncedTransactionsCount} 笔数据至云端。`
            : direction === 'pull_cloud_to_local'
            ? `全量拉取成功！已从云端同步 ${res.syncedTransactionsCount} 笔数据至本地。`
            : `双向全量对账完成！`
        );
        if (onRefreshData) await onRefreshData();
      } else {
        setFullSyncFeedback(`全量同步失败: ${res.error || '未知错误'}`);
      }
    } catch (err: any) {
      setFullSyncFeedback(`执行异常: ${err?.message || '网络中断'}`);
    } finally {
      setFullSyncingDirection(null);
    }
  };

  const formatLastSyncTime = (iso: string | null) => {
    if (!iso) return '尚未同步';
    try {
      const d = new Date(iso);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    } catch {
      return '近期';
    }
  };

  // 当前保险库恢复码提取 (供用户查看)
  const handleViewVaultRecoveryCode = async () => {
    try {
      const meta = await getVaultMetadata();
      if (meta && onOpenRecoveryCodeModal) {
        onOpenRecoveryCodeModal('已启用端到端加密保护');
      }
    } catch {
      // 容错
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 items-start animate-fadeIn">
      {/* 左列卡片流 (Column 1: 账户信息、云同步设置、本地保险库、偏好设置) */}
      <div className="flex flex-col gap-4">
        {/* 1. 用户信息卡片 */}
        <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-indigo-600 text-white flex items-center justify-center font-black text-lg shadow-sm shadow-indigo-500/20">
                {currentUser?.email ? currentUser.email[0].toUpperCase() : <UserIcon className="w-6 h-6 text-white" />}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base text-gray-900 dark:text-white truncate max-w-[180px]">
                    {currentUser?.email ? currentUser.email.split('@')[0] : '离线/访客模式'}
                  </h3>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5 ${
                    isVaultCached
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                      : isVaultActive
                      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                      : 'bg-gray-100 dark:bg-neutral-700 text-gray-500 dark:text-gray-400'
                  }`}>
                    {isVaultCached ? <ShieldCheck className="w-3.5 h-3.5" /> : isVaultActive ? <Lock className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
                    <span>{isVaultCached ? '保险库已解锁' : isVaultActive ? '保险库已锁定' : '未启用加密'}</span>
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  {currentUser?.email || '本地离线优先架构 · 数据完全私有掌控'}
                </p>
              </div>
            </div>

            {currentUser ? (
              <button
                type="button"
                onClick={onLogout}
                title="退出登录"
                className="p-2 rounded-2xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs hover:shadow-indigo-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>登录/注册</span>
              </button>
            )}
          </div>
        </div>

        {/* 2. 本地安全保险库与端到端加密卡片 (Local Vault & Encryption) */}
        <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs ${
                isVaultCached
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                  : isVaultActive
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                  : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
              }`}>
                {isVaultCached ? <ShieldCheck className="w-3.5 h-3.5" /> : isVaultActive ? <Lock className="w-3.5 h-3.5" /> : <Shield className="w-3.5 h-3.5" />}
              </div>
              <div>
                <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">本地安全保险库</h4>
                <p className="text-[10px] text-gray-400">AES-GCM-256 端到端加密 · 零知识架构</p>
              </div>
            </div>

            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
              isVaultCached
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                : isVaultActive
                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
                : 'bg-gray-100 dark:bg-neutral-700 text-gray-500 dark:text-gray-400'
            }`}>
              {isVaultCached ? '已解锁保护中' : isVaultActive ? '已锁定' : '未设置主密码'}
            </span>
          </div>

          <div className="p-3 rounded-2xl bg-gray-50/80 dark:bg-neutral-900/40 border border-gray-100 dark:border-neutral-800 flex flex-col gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
            {isVaultCached ? (
              <div className="flex items-start gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span>保险库当前已解锁，解密密钥安全保留在纯内存闭包中，离开时可随时一键锁定。</span>
              </div>
            ) : isVaultActive ? (
              <div className="flex items-start gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                <span>保险库处于锁定状态，内存密钥已被擦除。输入主密码解锁后方可访问私密数据。</span>
              </div>
            ) : (
              <div className="flex items-start gap-1.5">
                <Info className="w-3.5 h-3.5 text-indigo-500 shrink-0 mt-0.5" />
                <span>当前数据保存在本地明文数据库中。设置主密码可启用 AES-GCM-256 端到端加密保险库。</span>
              </div>
            )}
          </div>

          {/* 保险库操作按钮组 */}
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            {isVaultCached ? (
              <>
                <button
                  type="button"
                  onClick={onLockVault}
                  className="py-2 px-3 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-amber-200/60 dark:border-amber-900/40"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>立即锁定保险库</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenVaultModal && onOpenVaultModal('change')}
                  className="py-2 px-3 rounded-xl bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200 dark:hover:bg-neutral-600 text-gray-700 dark:text-gray-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-indigo-500" />
                  <span>修改主密码</span>
                </button>
              </>
            ) : isVaultActive ? (
              <>
                <button
                  type="button"
                  onClick={() => onOpenVaultModal && onOpenVaultModal('unlock')}
                  className="py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>输入密码解锁</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenVaultModal && onOpenVaultModal('reset')}
                  className="py-2 px-3 rounded-xl bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200 dark:hover:bg-neutral-600 text-gray-700 dark:text-gray-200 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-500" />
                  <span>使用恢复码重置</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onOpenVaultModal && onOpenVaultModal('setup')}
                className="col-span-2 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs shadow-indigo-500/20"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>初始化主密码并启用安全保险库</span>
              </button>
            )}
          </div>
        </div>

        {/* 3. 云端同步设置卡片 (Cloud Sync Settings Panel) */}
        <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                <Globe className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">云同步设置中心</h4>
                <p className="text-[10px] text-gray-400">服务提供方 · 接口配置 · 全量同步</p>
              </div>
            </div>

            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
              selectedProvider === 'none'
                ? 'bg-gray-100 dark:bg-neutral-700 text-gray-500 dark:text-gray-400'
                : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
            }`}>
              {selectedProvider === 'none' ? '🛡️ 仅本地离线' : '☁️ Cloudflare D1'}
            </span>
          </div>

          {/* 同步服务提供方选择 */}
          <div className="flex flex-col gap-1.5 text-xs">
            <span className="font-semibold text-gray-700 dark:text-gray-300 text-[11px]">同步服务提供方</span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleProviderChange('none')}
                className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                  selectedProvider === 'none'
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 font-bold text-indigo-700 dark:text-indigo-300'
                    : 'border-gray-200 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40 text-gray-600 dark:text-gray-400'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>仅本地离线 (None)</span>
                </div>
                <span className="text-[10px] opacity-75 font-normal">不发起任何网络轮询</span>
              </button>

              <button
                type="button"
                onClick={() => handleProviderChange('cloudflare_d1')}
                className={`p-2.5 rounded-xl border text-left flex flex-col gap-0.5 transition-all cursor-pointer ${
                  selectedProvider === 'cloudflare_d1'
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30 font-bold text-indigo-700 dark:text-indigo-300'
                    : 'border-gray-200 dark:border-neutral-700 bg-gray-50/50 dark:bg-neutral-900/40 text-gray-600 dark:text-gray-400'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs">
                  <Cloud className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Cloudflare D1</span>
                </div>
                <span className="text-[10px] opacity-75 font-normal">边缘数据库多端同步</span>
              </button>
            </div>
          </div>

          {/* 仅在启用云同步时展示详细端点与高级选项 */}
          {selectedProvider !== 'none' && (
            <div className="flex flex-col gap-2.5 pt-1 text-xs animate-fadeIn">
              {/* 后端 API 服务地址输入与测试 */}
              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-300">API 服务端地址</span>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                    <Globe className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="url"
                    placeholder="https://your-api.workers.dev"
                    value={customServerUrl}
                    onChange={(e) => {
                      setCustomServerUrl(e.target.value);
                      setApiTestResult(null);
                    }}
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 focus:border-indigo-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              {/* 自动同步开关 */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 dark:bg-neutral-900/60 border border-gray-100 dark:border-neutral-800 text-xs">
                <div className="flex items-center gap-2">
                  <Activity className="w-3.5 h-3.5 text-indigo-500" />
                  <div>
                    <span className="font-semibold text-gray-800 dark:text-gray-200 block">自动静默同步</span>
                    <span className="text-[10px] text-gray-400">网络连通及断网恢复时自动同步</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleAutoSync}
                  className={`w-11 h-6 rounded-full transition-colors duration-200 relative flex items-center p-0.5 cursor-pointer ${
                    autoSyncEnabled ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-neutral-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
                      autoSyncEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {apiTestResult && (
                <div
                  className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                    apiTestResult.success
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40'
                      : 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/40'
                  }`}
                >
                  {apiTestResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span className="leading-tight">{apiTestResult.message}</span>
                </div>
              )}

              {apiSuccessMsg && (
                <div className="p-2.5 rounded-xl text-xs bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40 flex items-center gap-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{apiSuccessMsg}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={testingApi}
                  onClick={handleTestApi}
                  className="flex-1 py-2 px-3 rounded-xl bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200 dark:hover:bg-neutral-600 font-semibold text-xs text-gray-700 dark:text-gray-200 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {testingApi ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Wifi className="w-3.5 h-3.5 text-indigo-500" />}
                  <span>测试连通性</span>
                </button>

                <button
                  type="button"
                  onClick={handleSaveApi}
                  className="flex-1 py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>保存设置</span>
                </button>

                {getCustomApiUrl() && (
                  <button
                    type="button"
                    onClick={handleResetApi}
                    title="恢复默认后端地址"
                    className="py-2 px-2.5 rounded-xl bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200 dark:hover:bg-neutral-600 text-gray-600 dark:text-gray-300 text-xs transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 全量同步控制组 */}
              <div className="pt-2 border-t border-gray-100 dark:border-neutral-700/60 flex flex-col gap-2">
                <span className="font-semibold text-gray-700 dark:text-gray-300 text-[11px]">全量同步控制</span>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={fullSyncingDirection !== null || isSyncing}
                    onClick={() => handleFullSync('push_local_to_cloud')}
                    className="py-2 px-2.5 rounded-xl bg-gray-50 dark:bg-neutral-900 hover:bg-gray-100 dark:hover:bg-neutral-700 border border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-gray-200 text-[11px] font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Upload className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{fullSyncingDirection === 'push' ? '上传中...' : '全量推送到云端'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={fullSyncingDirection !== null || isSyncing}
                    onClick={() => handleFullSync('pull_cloud_to_local')}
                    className="py-2 px-2.5 rounded-xl bg-gray-50 dark:bg-neutral-900 hover:bg-gray-100 dark:hover:bg-neutral-700 border border-gray-200 dark:border-neutral-700 text-gray-700 dark:text-gray-200 text-[11px] font-medium transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-500" />
                    <span>{fullSyncingDirection === 'pull' ? '拉取中...' : '从云端全量拉取'}</span>
                  </button>
                </div>

                {fullSyncFeedback && (
                  <div className="p-2 rounded-xl text-[11px] bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-900/50">
                    {fullSyncFeedback}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 手动同步按钮 */}
          <button
            type="button"
            disabled={isSyncing || selectedProvider === 'none'}
            onClick={onSync}
            className="w-full py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-xs shadow-indigo-500/10 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? '正在双向静默同步...' : selectedProvider === 'none' ? '当前处于仅本地模式' : '立即双向同步数据'}</span>
          </button>
        </div>

        {/* 4. 我的邀请码专区 (仅登录用户显示) */}
        {currentUser && (
          <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-xl bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xs">
                  <Ticket className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">我的邀请码</h4>
                  <p className="text-[10px] text-gray-400">邀请好友注册 · 旧用户专享</p>
                </div>
              </div>

              {inviteInfo && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 font-semibold">
                  已获取 {inviteInfo.claimed_count}/{inviteInfo.max_limit}
                </span>
              )}
            </div>

            {inviteInfo && inviteInfo.invite_codes && inviteInfo.invite_codes.length > 0 && (
              <div className="flex flex-col gap-2">
                {inviteInfo.invite_codes.map((item) => (
                  <div
                    key={item.code}
                    className="p-2.5 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-gray-900 dark:text-white tracking-wider text-xs bg-white dark:bg-neutral-800 px-2 py-1 rounded-lg border border-gray-200 dark:border-neutral-700">
                        {item.code}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        item.status === 'unused'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                          : 'bg-gray-200 dark:bg-neutral-700 text-gray-500 dark:text-gray-400'
                      }`}>
                        {item.status === 'unused' ? '未使用' : '已被使用'}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleCopyCode(item.code)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white dark:bg-neutral-800 hover:bg-gray-100 dark:hover:bg-neutral-700 text-indigo-600 dark:text-indigo-400 border border-gray-200 dark:border-neutral-700 font-medium transition-all active:scale-95 cursor-pointer"
                    >
                      {copiedCode === item.code ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400">已复制</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>复制</span>
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {inviteInfo && inviteInfo.can_generate && (
              <button
                type="button"
                disabled={claimingInvite}
                onClick={handleClaimInvite}
                className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-semibold hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 shadow-xs shadow-purple-500/20 cursor-pointer"
              >
                {claimingInvite ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                <span>获取新邀请码 (可获取 {inviteInfo.total_eligible - inviteInfo.claimed_count} 个)</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* 右列卡片流 (Column 2: 本地存储统计、数据管理、多账本、预算、偏好) */}
      <div className="flex flex-col gap-4">
        {/* 5. 本地存储统计与离线数据管理卡片 */}
        <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                <Database className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">本地存储与离线数据</h4>
                <p className="text-[10px] text-gray-400">IndexedDB 数据库概览 · 极速 0ms 访问</p>
              </div>
            </div>

            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-semibold">
              离线可用
            </span>
          </div>

          {/* 本地存储细分指标 */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-2.5 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-400">
                {cloudTotalCount !== undefined && cloudTotalCount !== null ? '总流水 (云端/库)' : '本地缓存流水'}
              </span>
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                {cloudTotalCount !== undefined && cloudTotalCount !== null
                  ? `${cloudTotalCount} 笔`
                  : `${storageStats ? storageStats.transactions : transactions.length} 笔`}
              </span>
            </div>

            <div className="p-2.5 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-400">账本 / 分类</span>
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                {ledgers.length} / {storageStats ? storageStats.categories : '-'}
              </span>
            </div>

            <div className="p-2.5 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 flex flex-col gap-0.5">
              <span className="text-[10px] text-gray-400">待同步队列</span>
              <span className={`text-xs font-bold ${
                (storageStats?.totalPending || pendingCount) > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}>
                {storageStats ? storageStats.totalPending : pendingCount} 项
              </span>
            </div>
          </div>

          {/* 数据与资产管理快捷入口 */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => onOpenDataModal && onOpenDataModal('export')}
              className="p-3 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 hover:bg-gray-100 dark:hover:bg-neutral-700/60 transition-colors flex flex-col gap-1 text-left group cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-neutral-700"
            >
              <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Download className="w-3.5 h-3.5" />
                  <span>导出备份数据</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <p className="text-[10px] text-gray-400">
                支持 CSV / JSON / 🔒 加密备份包
              </p>
            </button>

            <button
              type="button"
              onClick={() => onOpenDataModal && onOpenDataModal('import')}
              className="p-3 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 hover:bg-gray-100 dark:hover:bg-neutral-700/60 transition-colors flex flex-col gap-1 text-left group cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-neutral-700"
            >
              <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Upload className="w-3.5 h-3.5" />
                  <span>导入账单/恢复</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </div>
              <p className="text-[10px] text-gray-400">
                智能识别微信/支付宝/小星/加密包
              </p>
            </button>
          </div>

          {/* 周期记账快捷入口 */}
          <button
            type="button"
            onClick={onOpenRecurringModal}
            className="p-3 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 hover:bg-indigo-100/70 dark:hover:bg-indigo-900/40 transition-colors flex items-center justify-between group cursor-pointer border border-indigo-100/60 dark:border-indigo-900/40"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <Repeat className="w-4 h-4" />
              </div>
              <div className="text-left">
                <span className="font-bold text-xs text-gray-800 dark:text-gray-200 block group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                  周期记账管理
                </span>
                <span className="text-[10px] text-gray-400">
                  房租、工资、会员订阅到期自动记录
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {/* 6. 多账本管理中心 */}
        <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                <BookOpen className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">多账本管理</h4>
                <p className="text-[10px] text-gray-400">日常、生意、旅行独立核算</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onOpenLedgerModal}
              className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
            >
              <span>管理 ({ledgers.length})</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex flex-col gap-1.5 pt-1">
            {ledgers.slice(0, 3).map((led) => (
              <div
                key={led.ledger_id}
                onClick={onOpenLedgerModal}
                className="p-2.5 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 hover:bg-gray-100 dark:hover:bg-neutral-700/60 transition-colors flex items-center justify-between cursor-pointer text-xs"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{led.name}</span>
                  {led.is_default === 1 && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-semibold">
                      默认日常
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-gray-400 font-medium">{led.currency}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 7. 月度预算管理中心 */}
        <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                <Target className="w-3.5 h-3.5" />
              </div>
              <div>
                <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">预算管理中心</h4>
                <p className="text-[10px] text-gray-400">月度总预算与各分类支出上限</p>
              </div>
            </div>
            {onOpenBudgetModal && (
              <button
                type="button"
                onClick={onOpenBudgetModal}
                className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
              >
                <span>预算设置</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 8. 系统偏好设置 */}
        <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-2xs border border-gray-100 dark:border-neutral-700/80 flex flex-col gap-3">
          <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">偏好设置</h4>

          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2.5 text-xs">
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors ${
                darkMode ? 'bg-indigo-950/60 text-indigo-400' : 'bg-amber-50 text-amber-500'
              }`}>
                {darkMode ? <Moon className="w-4 h-4 text-indigo-400" /> : <Sun className="w-4 h-4 text-amber-500" />}
              </div>
              <div>
                <span className="font-semibold text-gray-800 dark:text-gray-200 block">深色外观模式</span>
                <span className="text-[10px] text-gray-400">适配 OLED 纯黑与低饱和莫兰迪色系</span>
              </div>
            </div>

            <button
              type="button"
              onClick={onToggleDarkMode}
              aria-label="切换深色模式"
              className={`w-11 h-6 rounded-full transition-colors duration-300 relative flex items-center p-0.5 focus:outline-none cursor-pointer ${
                darkMode ? 'bg-indigo-600 shadow-glow-indigo' : 'bg-gray-300 dark:bg-neutral-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ease-out ${
                  darkMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* 9. 账号安全与危险操作 (仅登录状态下显示) */}
        {currentUser && (
          <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-2xs border border-gray-100 dark:border-neutral-700/80 flex flex-col gap-3">
            <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">账号与安全</h4>

            <div className="flex flex-col gap-2 pt-1">
              {currentUser.recovery_code && (
                <div className="p-3 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                      <KeyRound className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-semibold text-gray-800 dark:text-gray-200 block">云端密码恢复凭证</span>
                      <span className="text-[10px] text-gray-400">用于找回云端登录密码</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenRecoveryCodeModal && onOpenRecoveryCodeModal(currentUser.recovery_code!)}
                    className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-neutral-800 hover:bg-gray-100 dark:hover:bg-neutral-700 border border-amber-200 dark:border-amber-900/50 text-[11px] font-semibold text-amber-700 dark:text-amber-300 transition-all active:scale-95 shadow-2xs cursor-pointer"
                  >
                    查看凭证
                  </button>
                </div>
              )}

              <div className="p-3 rounded-2xl bg-red-50/50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 flex items-center justify-center">
                    <Trash2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-semibold text-red-700 dark:text-red-300 block">注销当前账号</span>
                    <span className="text-[10px] text-red-500/80">永久删除云端及本地所有记录</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenDeleteAccountModal}
                  className="px-2.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-[11px] font-semibold transition-all active:scale-95 shadow-xs shadow-red-500/20 cursor-pointer"
                >
                  注销账号
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 10. 关于账盾 */}
        <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-2 text-center text-xs">
          <div className="flex items-center justify-center gap-1.5 font-bold text-gray-800 dark:text-gray-200">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>账盾 · Serverless Ledger</span>
          </div>
          <p className="text-[11px] text-gray-400">
            数据私有掌控 · 纯净无广告 · 离线优先架构 · 端到端加密保护
          </p>
          <p className="text-[10px] text-gray-400">版本 v2.0.0 (Offline-First Edition)</p>
        </div>
      </div>
    </div>
  );
}

export default ProfileView;
