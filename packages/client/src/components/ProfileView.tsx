import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  RefreshCw,
  Moon,
  Sun,
  ShieldCheck,
  ChevronRight,
  Database,
  Cloud,
  CloudOff,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Download,
  Upload,
  KeyRound,
  Trash2,
  Repeat,
  Server,
  Settings,
  Lock,
  Unlock,
  ShieldAlert,
  Zap,
  Layers,
  Sparkles,
  Globe,
  Sliders,
} from 'lucide-react';
import { Ledger, Transaction, SyncConfig, SyncProviderType } from '@ledger/shared';
import { syncManager, SyncStats } from '../api/syncManager';
import { getLocalStorageStats, clearLocalDatabase } from '../db';
import {
  getSyncConfig,
  saveSyncConfig,
  isWebdavSyncConfigured,
  DEFAULT_REMOTE_PATH,
} from '../sync/syncConfig';
import { getWebDavAdapter, isNativeAppEnvironment } from '../sync/webdavAdapter';
import {
  isVaultInitialized,
  isVaultUnlocked,
  lockVault,
} from '../auth/localAuth';

interface ProfileViewProps {
  ledgers: Ledger[];
  transactions: Transaction[];
  darkMode: boolean;
  vaultStatus?: 'uninitialized' | 'unlocked' | 'locked';
  onToggleDarkMode: () => void;
  onSync?: () => Promise<void>;
  onOpenLedgerModal: () => void;
  onOpenBudgetModal?: () => void;
  onOpenDataModal?: (initialTab?: 'export' | 'import') => void;
  onOpenVaultModal?: (action?: 'unlock' | 'setup' | 'reset' | 'change') => void;
  onLockVault?: () => void;
  onOpenRecoveryCodeModal?: (code: string) => void;
  onOpenRecurringModal?: () => void;
  onRefreshData?: () => Promise<void>;
}

export function ProfileView({
  ledgers,
  transactions,
  darkMode,
  vaultStatus = 'uninitialized',
  onToggleDarkMode,
  onSync,
  onOpenLedgerModal,
  onOpenBudgetModal,
  onOpenDataModal,
  onOpenVaultModal,
  onLockVault,
  onOpenRecoveryCodeModal,
  onOpenRecurringModal,
  onRefreshData,
}: ProfileViewProps) {
  const [syncStats, setSyncStats] = useState<SyncStats>(() => syncManager.getStats());
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(() => getSyncConfig());
  const [storageStats, setStorageStats] = useState<{
    transactions: number;
    categories: number;
    ledgers: number;
    budgets: number;
    recurringRules: number;
    vaultMetaCount: number;
  } | null>(null);

  const isNative = isNativeAppEnvironment();

  // WebDAV 表单状态
  const [selectedProvider, setSelectedProvider] = useState<SyncProviderType>(() => syncConfig.provider || 'none');
  const [webdavUrl, setWebdavUrl] = useState<string>(() => syncConfig.webdavUrl || '');
  const [webdavUsername, setWebdavUsername] = useState<string>(() => syncConfig.webdavUsername || '');
  const [webdavPassword, setWebdavPassword] = useState<string>(() => syncConfig.webdavPassword || '');
  const [remotePath, setRemotePath] = useState<string>(() => syncConfig.remotePath || DEFAULT_REMOTE_PATH);
  const [useCorsProxy, setUseCorsProxy] = useState<boolean>(() => (isNative ? false : syncConfig.useCorsProxy || false));
  const [corsProxyUrl, setCorsProxyUrl] = useState<string>(() => (isNative ? '' : syncConfig.corsProxyUrl || ''));
  const [showAdvancedCors, setShowAdvancedCors] = useState<boolean>(false);
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(() => syncConfig.autoSyncEnabled !== false);

  const [testingWebdav, setTestingWebdav] = useState(false);
  const [webdavTestResult, setWebdavTestResult] = useState<{
    success: boolean;
    message: string;
    isCorsError?: boolean;
    suggestProxy?: boolean;
  } | null>(null);
  const [configSaveSuccess, setConfigSaveSuccess] = useState('');

  // 快照手动同步触发状态
  const [manualSyncing, setManualSyncing] = useState<'push' | 'pull' | null>(null);
  const [syncFeedback, setSyncFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 本地保险库状态
  const [isVaultActive, setIsVaultActive] = useState<boolean>(false);
  const [isVaultCached, setIsVaultCached] = useState<boolean>(false);

  useEffect(() => {
    // 若在原生端运行，自动纠正之前可能误存的代理配置
    if (isNative && syncConfig.useCorsProxy) {
      saveSyncConfig({ useCorsProxy: false, corsProxyUrl: '' });
      setUseCorsProxy(false);
      setCorsProxyUrl('');
    }

    const unsubSync = syncManager.subscribe((stats) => setSyncStats(stats));

    const handleConfigChange = (e: any) => {
      const cfg = e.detail || getSyncConfig();
      setSyncConfig(cfg);
      setSelectedProvider(cfg.provider || 'none');
      setWebdavUrl(cfg.webdavUrl || '');
      setWebdavUsername(cfg.webdavUsername || '');
      setWebdavPassword(cfg.webdavPassword || '');
      setRemotePath(cfg.remotePath || DEFAULT_REMOTE_PATH);
      setUseCorsProxy(isNative ? false : cfg.useCorsProxy || false);
      setCorsProxyUrl(isNative ? '' : cfg.corsProxyUrl || '');
      setAutoSyncEnabled(cfg.autoSyncEnabled !== false);
    };

    const handleVaultChange = () => {
      refreshStorageAndVault();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('sync:config_changed', handleConfigChange);
      window.addEventListener('vault:status_changed', handleVaultChange);
    }

    return () => {
      unsubSync();
      if (typeof window !== 'undefined') {
        window.removeEventListener('sync:config_changed', handleConfigChange);
        window.removeEventListener('vault:status_changed', handleVaultChange);
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
  }, [transactions.length, vaultStatus]);

  // 测试 WebDAV 连通性
  const handleTestWebDav = async (overrideProxy?: boolean) => {
    if (!webdavUrl.trim()) {
      setWebdavTestResult({ success: false, message: '请先填写 WebDAV 服务器地址' });
      return;
    }

    setTestingWebdav(true);
    setWebdavTestResult(null);

    const effectiveProxy = overrideProxy !== undefined ? overrideProxy : useCorsProxy;
    const tempConfig: SyncConfig = {
      provider: 'webdav',
      webdavUrl: webdavUrl.trim(),
      webdavUsername: webdavUsername.trim(),
      webdavPassword: webdavPassword.trim(),
      remotePath: remotePath.trim() || DEFAULT_REMOTE_PATH,
      useCorsProxy: effectiveProxy,
      corsProxyUrl: corsProxyUrl.trim(),
    };

    try {
      const adapter = getWebDavAdapter(tempConfig);
      const res = await adapter.testConnection();
      setWebdavTestResult(res);
    } catch (err: any) {
      setWebdavTestResult({
        success: false,
        message: err?.message || '测试连接异常',
      });
    } finally {
      setTestingWebdav(false);
    }
  };

  // 一键开启 CORS 中继并保存 (仅网页版有效)
  const handleEnableProxyAndSave = () => {
    if (isNative) {
      handleTestWebDav(false);
      return;
    }
    setUseCorsProxy(true);
    const updated = saveSyncConfig({
      provider: selectedProvider,
      webdavUrl: webdavUrl.trim(),
      webdavUsername: webdavUsername.trim(),
      webdavPassword: webdavPassword.trim(),
      remotePath: remotePath.trim() || DEFAULT_REMOTE_PATH,
      autoSyncEnabled,
      useCorsProxy: true,
      corsProxyUrl: corsProxyUrl.trim() || '/api/webdav-proxy',
    });

    setSyncConfig(updated);
    setConfigSaveSuccess('已自动开启内置 CORS 跨域中继并保存！');
    setTimeout(() => setConfigSaveSuccess(''), 3000);
    handleTestWebDav(true);
  };

  // 保存 WebDAV 设置
  const handleSaveWebDavConfig = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveProxy = isNative ? false : useCorsProxy;
    const updated = saveSyncConfig({
      provider: selectedProvider,
      webdavUrl: webdavUrl.trim(),
      webdavUsername: webdavUsername.trim(),
      webdavPassword: webdavPassword.trim(),
      remotePath: remotePath.trim() || DEFAULT_REMOTE_PATH,
      useCorsProxy: effectiveProxy,
      corsProxyUrl: effectiveProxy ? corsProxyUrl.trim() : '',
      autoSyncEnabled,
    });

    setSyncConfig(updated);
    setConfigSaveSuccess('WebDAV 同步配置已保存');
    setTimeout(() => setConfigSaveSuccess(''), 3000);
  };

  // 手动快照上传/恢复
  const handleManualSync = async (direction: 'push' | 'pull') => {
    if (!isVaultActive) {
      if (onOpenVaultModal) onOpenVaultModal('setup');
      setSyncFeedback({ type: 'error', message: '尚未初始化本地安全保险库，请先设置主密码以加密保护快照数据' });
      return;
    }

    if (!isVaultUnlocked()) {
      if (onOpenVaultModal) onOpenVaultModal('unlock');
      setSyncFeedback({ type: 'error', message: '本地保险库当前处于锁定状态，请先输入主密码解锁后再执行 WebDAV 同步' });
      return;
    }

    setManualSyncing(direction);
    setSyncFeedback(null);

    try {
      const res = await syncManager.sync(direction);
      if (res.success) {
        setSyncFeedback({ type: 'success', message: res.message });
        if (onRefreshData) {
          await onRefreshData();
        }
        refreshStorageAndVault();
      } else {
        setSyncFeedback({ type: 'error', message: res.message || res.error || '同步失败' });
      }
    } catch (err: any) {
      setSyncFeedback({ type: 'error', message: err?.message || '同步发生异常' });
    } finally {
      setManualSyncing(null);
    }
  };

  const requireUnlockWrapper = (action?: () => void) => {
    if (!action) return;
    if (isVaultActive && !isVaultCached) {
      if (onOpenVaultModal) onOpenVaultModal('unlock');
      return;
    }
    action();
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      {/* 顶部个人与架构概览卡片 */}
      <div className="p-6 rounded-3xl bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 text-white shadow-xl shadow-indigo-600/15 relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <HardDrive className="w-48 h-48" />
        </div>

        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
              <ShieldCheck className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">帐盾 · 纯本地记账系统</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  安全
                </span>
              </div>
              <p className="text-xs text-indigo-100/80 mt-1">
                数据 100% 留存在本机 IndexedDB · 支持端到端 WebDAV 快照同步
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isVaultActive ? (
              isVaultCached ? (
                <button
                  type="button"
                  onClick={() => {
                    lockVault();
                    setIsVaultCached(false);
                    if (onLockVault) onLockVault();
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-300" />
                  <span>锁定保险库</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onOpenVaultModal && onOpenVaultModal('unlock')}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-900 text-xs font-bold flex items-center gap-1.5 transition shadow"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>解锁保险库</span>
                </button>
              )
            ) : (
              <button
                type="button"
                onClick={() => onOpenVaultModal && onOpenVaultModal('setup')}
                className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-900 text-xs font-bold flex items-center gap-1.5 transition shadow"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>初始化主密码</span>
              </button>
            )}
          </div>
        </div>

        {/* 存储统计徽章 */}
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-6 mt-6 border-t border-white/10 text-center">
          <div className="p-2 rounded-xl bg-white/5 backdrop-blur-sm">
            <div className="text-[11px] text-indigo-200">账单流水</div>
            <div className="text-base font-bold mt-0.5">
              {isVaultActive && !isVaultCached ? '***' : storageStats?.transactions || transactions.length}
            </div>
          </div>
          <div className="p-2 rounded-xl bg-white/5 backdrop-blur-sm">
            <div className="text-[11px] text-indigo-200">账本数量</div>
            <div className="text-base font-bold mt-0.5">
              {isVaultActive && !isVaultCached ? '***' : storageStats?.ledgers || ledgers.length}
            </div>
          </div>
          <div className="p-2 rounded-xl bg-white/5 backdrop-blur-sm">
            <div className="text-[11px] text-indigo-200">分类标签</div>
            <div className="text-base font-bold mt-0.5">
              {isVaultActive && !isVaultCached ? '***' : storageStats?.categories || 0}
            </div>
          </div>
          <div className="p-2 rounded-xl bg-white/5 backdrop-blur-sm">
            <div className="text-[11px] text-indigo-200">月度预算</div>
            <div className="text-base font-bold mt-0.5">
              {isVaultActive && !isVaultCached ? '***' : storageStats?.budgets || 0}
            </div>
          </div>
          <div className="p-2 rounded-xl bg-white/5 backdrop-blur-sm col-span-3 sm:col-span-1">
            <div className="text-[11px] text-indigo-200">周期规则</div>
            <div className="text-base font-bold mt-0.5">
              {isVaultActive && !isVaultCached ? '***' : storageStats?.recurringRules || 0}
            </div>
          </div>
        </div>
      </div>

      {/* WebDAV 同步配置卡片 */}
      <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/50 flex items-center justify-center text-sky-600 dark:text-sky-400">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                WebDAV 私有云快照同步
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                支持群晖 NAS、坚果云、Nextcloud 等标准 WebDAV 服务端
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {isWebdavSyncConfigured() ? (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>已配置</span>
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                <CloudOff className="w-3.5 h-3.5" />
                <span>未启用</span>
              </span>
            )}
          </div>
        </div>

        {/* 同步服务选择 */}
        <div className="grid grid-cols-2 gap-3 p-1 rounded-2xl bg-slate-100 dark:bg-slate-800/60">
          <button
            type="button"
            onClick={() => setSelectedProvider('none')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              selectedProvider === 'none'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <HardDrive className="w-4 h-4" />
            <span>纯离线单机模式</span>
          </button>
          <button
            type="button"
            onClick={() => setSelectedProvider('webdav')}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
              selectedProvider === 'webdav'
                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>WebDAV 快照同步</span>
          </button>
        </div>

        {selectedProvider === 'webdav' && (
          <form onSubmit={handleSaveWebDavConfig} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                WebDAV 服务器 URL
              </label>
              <input
                type="text"
                placeholder="例如: https://dav.jianguoyun.com/dav/ 或 https://nas:5006"
                value={webdavUrl}
                onChange={(e) => setWebdavUrl(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  账号 / 邮箱
                </label>
                <input
                  type="text"
                  placeholder="用户名或坚果云账号"
                  value={webdavUsername}
                  onChange={(e) => setWebdavUsername(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  密码 / 应用授权码
                </label>
                <input
                  type="password"
                  placeholder="WebDAV 专用应用密码"
                  value={webdavPassword}
                  onChange={(e) => setWebdavPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                远端快照存储路径
              </label>
              <input
                type="text"
                placeholder="/ServerlessLedger/ledger-vault.enc.json"
                value={remotePath}
                onChange={(e) => setRemotePath(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              />
            </div>

            {/* 自动同步勾选 */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
              <div className="text-xs">
                <div className="font-semibold text-slate-800 dark:text-slate-200">
                  定时自动全量加密快照同步
                </div>
                <div className="text-slate-500 dark:text-slate-400 mt-0.5">
                  开启后在后台定时检查并自动同步多端快照变更
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoSyncEnabled}
                onChange={(e) => setAutoSyncEnabled(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
            </div>

            {/* 原生 App 运行状态提示 vs 网页版 CORS 跨域代理选项 */}
            {isNative ? (
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <div className="font-semibold text-slate-800 dark:text-slate-200">
                    📱 移动端原生直连模式
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    当前运行于 Android / iOS 原生客户端，底层网络引擎直连 WebDAV 服务端，免除浏览器跨域限制，无需开启代理。
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-2xl bg-sky-50/60 dark:bg-sky-950/30 border border-sky-100 dark:border-sky-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                    <div>
                      <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        CORS 跨域中继转发
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        网页版连接未开启跨域的坚果云/NAS 时启用
                      </div>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={useCorsProxy}
                    onChange={(e) => setUseCorsProxy(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 cursor-pointer"
                  />
                </div>

                {useCorsProxy && (
                  <div className="space-y-1.5 pt-1 border-t border-sky-100 dark:border-sky-900/30">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                        跨域中继代理 URL
                      </label>
                      <span className="text-[10px] text-slate-400">
                        留空默认使用内置中继 (`/api/webdav-proxy`)
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder="/api/webdav-proxy 或 https://your-cors-proxy.workers.dev"
                      value={corsProxyUrl}
                      onChange={(e) => setCorsProxyUrl(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-sky-200 dark:border-sky-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            )}

            {/* 测试连通性结果反馈 */}
            {webdavTestResult && (
              <div
                className={`p-3.5 rounded-xl text-xs space-y-2 ${
                  webdavTestResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                }`}
              >
                <div className="flex items-start gap-2">
                  {webdavTestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-500" />
                  )}
                  <div className="leading-relaxed">{webdavTestResult.message}</div>
                </div>

                {/* 针对 Failed to fetch (CORS 拦截) 提供一键解决按钮 */}
                {webdavTestResult.suggestProxy && !useCorsProxy && (
                  <button
                    type="button"
                    onClick={handleEnableProxyAndSave}
                    className="mt-1 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow transition flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5 text-amber-300" />
                    <span>一键启用 CORS 跨域中继并重试</span>
                  </button>
                )}
              </div>
            )}

            {configSaveSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 text-xs flex items-center gap-2 border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span>{configSaveSuccess}</span>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => handleTestWebDav()}
                disabled={testingWebdav}
                className="py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition flex items-center justify-center gap-2"
              >
                <Zap className={`w-3.5 h-3.5 text-amber-500 ${testingWebdav ? 'animate-spin' : ''}`} />
                <span>{testingWebdav ? '测试中...' : '测试连通性'}</span>
              </button>

              <button
                type="submit"
                className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 transition flex items-center justify-center gap-2"
              >
                <span>保存 WebDAV 配置</span>
              </button>
            </div>
          </form>
        )}

        {/* 手动同步操作区域 */}
        {isWebdavSyncConfigured() && (
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400">最后同步时间：</span>
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                {syncStats.lastSyncedAt
                  ? new Date(syncStats.lastSyncedAt).toLocaleString()
                  : '尚未同步'}
              </span>
            </div>

            {syncFeedback && (
              <div
                className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                  syncFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                }`}
              >
                {syncFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                )}
                <span>{syncFeedback.message}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleManualSync('push')}
                disabled={manualSyncing !== null || syncStats.isSyncing}
                className="py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 transition flex items-center justify-center gap-2"
              >
                <Upload className={`w-3.5 h-3.5 text-indigo-500 ${manualSyncing === 'push' ? 'animate-bounce' : ''}`} />
                <span>{manualSyncing === 'push' ? '上传中...' : '推送到 WebDAV'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleManualSync('pull')}
                disabled={manualSyncing !== null || syncStats.isSyncing}
                className="py-2.5 px-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200 transition flex items-center justify-center gap-2"
              >
                <Download className={`w-3.5 h-3.5 text-emerald-500 ${manualSyncing === 'pull' ? 'animate-bounce' : ''}`} />
                <span>{manualSyncing === 'pull' ? '拉取中...' : '从 WebDAV 恢复'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 财务与功能管理入口组 */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2">
          财务管理与工具
        </h4>

        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-sm">
          {/* 账本管理 */}
          <button
            type="button"
            onClick={() => requireUnlockWrapper(onOpenLedgerModal)}
            className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  多账本独立核算管理
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  当前拥有 {isVaultActive && !isVaultCached ? '***' : ledgers.length} 个独立账本
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>

          {/* 预算管理 */}
          {onOpenBudgetModal && (
            <button
              type="button"
              onClick={() => requireUnlockWrapper(onOpenBudgetModal)}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    月度预算与分类限额
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    设定总预算与各大类消费限额
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          )}

          {/* 周期记账规则 */}
          {onOpenRecurringModal && (
            <button
              type="button"
              onClick={() => requireUnlockWrapper(onOpenRecurringModal)}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-50 dark:bg-purple-950/50 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <Repeat className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    周期自动记账规则
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    固定房租、工资、会员订阅定时自动入账
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          )}

          {/* 数据备份与导入导出 */}
          {onOpenDataModal && (
            <button
              type="button"
              onClick={() => requireUnlockWrapper(() => onOpenDataModal('export'))}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400">
                  <Download className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    离线账单导入与备份导出
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    支持微信/支付宝 CSV 账单导入与 `.enc.json` 加密备份包
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          )}
        </div>
      </div>

      {/* 安全与偏好设置组 */}
      <div className="space-y-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-2">
          安全与系统设置
        </h4>

        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-sm">
          {/* 主密码与安全凭证 */}
          {isVaultActive && (
            <button
              type="button"
              onClick={() => onOpenVaultModal && onOpenVaultModal('change')}
              className="w-full p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/50 flex items-center justify-center text-rose-600 dark:text-rose-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">
                    修改保险库主密码
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    重设 Web Crypto 派生密钥
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          )}

          {/* 深色模式切换 */}
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300">
                {darkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5 text-amber-500" />}
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  深色模式外观
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {darkMode ? '深色夜间主题' : '浅色明亮主题'}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onToggleDarkMode}
              className={`w-12 h-6.5 rounded-full p-1 transition-colors duration-200 ease-in-out ${
                darkMode ? 'bg-indigo-600' : 'bg-slate-200'
              }`}
            >
              <div
                className={`w-4.5 h-4.5 rounded-full bg-white shadow-md transform transition-transform duration-200 ease-in-out ${
                  darkMode ? 'translate-x-5.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* 清空本地数据库 (危险操作) */}
          <button
            type="button"
            onClick={async () => {
              if (window.confirm('⚠️ 警告：此操作将清空本地所有账本、流水、分类与设置，确定继续吗？')) {
                await clearLocalDatabase();
                if (onRefreshData) await onRefreshData();
                refreshStorageAndVault();
                alert('本地数据库已重置为初始状态');
              }
            }}
            className="w-full p-4 flex items-center justify-between hover:bg-red-50 dark:hover:bg-red-950/20 transition text-left text-red-600 dark:text-red-400"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-red-50 dark:bg-red-950/50 flex items-center justify-center text-red-600 dark:text-red-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold">
                  清空本地全部数据
                </div>
                <div className="text-xs text-red-500/80 dark:text-red-400/70">
                  重置 IndexedDB 数据库并恢复默认预置分类
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-red-400" />
          </button>
        </div>
      </div>

      {/* 底部应用信息 */}
      <div className="text-center pt-4 text-xs text-slate-400 dark:text-slate-500 space-y-1">
        <p className="font-semibold text-slate-500 dark:text-slate-400">
          账盾 (Serverless Ledger) v3.0.0
        </p>
        <p>100% 本地优先 · 零知识安全保险库 · WebDAV 快照同步</p>
      </div>
    </div>
  );
}
