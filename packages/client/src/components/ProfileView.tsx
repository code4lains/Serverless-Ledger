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
  AlertTriangle,
  Info,
  Layers,
  Sparkles,
  Target,
  HardDrive,
  Activity,
  FolderDown,
  Download,
  Upload,
} from 'lucide-react';
import { AuthUser, Ledger, Transaction } from '@ledger/shared';
import { networkMonitor, NetworkInfo } from '../api/network';
import { syncManager, SyncStats } from '../api/syncManager';
import { getLocalStorageStats } from '../db';

interface ProfileViewProps {
  currentUser: AuthUser | null;
  ledgers: Ledger[];
  transactions: Transaction[];
  serverStatus: { ok: boolean; data?: any };
  pendingCount: number;
  isSyncing: boolean;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onSync: () => Promise<void>;
  onOpenLedgerModal: () => void;
  onOpenBudgetModal?: () => void;
  onOpenDataModal?: (initialTab?: 'export' | 'import') => void;
  onLogout: () => void;
  onOpenAuthModal?: () => void;
}


export function ProfileView({
  currentUser,
  ledgers,
  transactions,
  serverStatus,
  pendingCount,
  isSyncing,
  darkMode,
  onToggleDarkMode,
  onSync,
  onOpenLedgerModal,
  onOpenBudgetModal,
  onOpenDataModal,
  onLogout,
  onOpenAuthModal,
}: ProfileViewProps) {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>(() => networkMonitor.getInfo());
  const [syncStats, setSyncStats] = useState<SyncStats>(() => syncManager.getStats());
  const [storageStats, setStorageStats] = useState<{
    transactions: number;
    categories: number;
    ledgers: number;
    budgets: number;
    queueItems: number;
    pendingTransactions: number;
    totalPending: number;
  } | null>(null);

  useEffect(() => {
    const unsubNet = networkMonitor.subscribe((info) => setNetworkInfo(info));
    const unsubSync = syncManager.subscribe((stats) => setSyncStats(stats));

    getLocalStorageStats().then((stats) => setStorageStats(stats));

    return () => {
      unsubNet();
      unsubSync();
    };
  }, [transactions, isSyncing, pendingCount]);

  const formattedDate = currentUser?.created_at
    ? new Date(currentUser.created_at).toLocaleDateString()
    : '近期';

  const formatLastSyncTime = (iso: string | null) => {
    if (!iso) return '尚未同步';
    try {
      const d = new Date(iso);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    } catch {
      return '近期';
    }
  };

  return (
    <div className="flex flex-col gap-4 animate-fadeIn">
      {/* 1. 用户信息卡片 (适配已登录与访客模式) */}
      <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-indigo-500 to-indigo-600 text-white flex items-center justify-center font-black text-lg shadow-sm shadow-indigo-500/20">
              {currentUser?.email ? currentUser.email[0].toUpperCase() : <UserIcon className="w-6 h-6 text-white" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-base text-gray-900 dark:text-white truncate max-w-[180px]">
                  {currentUser?.email ? currentUser.email.split('@')[0] : '访客体验模式'}
                </h3>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold flex items-center gap-0.5 ${
                  currentUser
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                    : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'
                }`}>
                  <ShieldCheck className="w-3 h-3" />
                  <span>{currentUser ? '已加密' : '未登录'}</span>
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-0.5">
                {currentUser?.email || '当前处于免登录浏览模式 (离线优先)'}
              </p>
            </div>
          </div>

          {currentUser ? (
            <button
              type="button"
              onClick={onLogout}
              title="退出登录"
              className="p-2 rounded-2xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs hover:shadow-indigo-500/20 active:scale-95 transition-all"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>登录/注册</span>
            </button>
          )}
        </div>

        {!currentUser && (
          <div className="pt-2 border-t border-gray-100 dark:border-neutral-700/60 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
            <span>登录后开启多端数据同步与云端加密备份</span>
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
            >
              立即登录 ➔
            </button>
          </div>
        )}
      </div>

      {/* 2. 多账本管理中心 */}
      <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
              <BookOpen className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">多账本管理</h4>
              <p className="text-[10px] text-gray-400">日常、生意、旅行等独立核算</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenLedgerModal}
            className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
          >
            <span>管理 ({ledgers.length})</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 账本列表快速预览 */}
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
          {ledgers.length > 3 && (
            <button
              type="button"
              onClick={onOpenLedgerModal}
              className="text-[11px] text-center text-gray-400 hover:text-gray-600 py-1"
            >
              查看其余 {ledgers.length - 3} 个账本...
            </button>
          )}
        </div>
      </div>

      {/* 2.5 月度预算管理中心 */}
      <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
              <Target className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">预算管理中心</h4>
              <p className="text-[10px] text-gray-400">设置月度总预算与各分类支出上限</p>
            </div>
          </div>
          {onOpenBudgetModal && (
            <button
              type="button"
              onClick={onOpenBudgetModal}
              className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
            >
              <span>预算设置</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 3. 离线优先与云端双向同步引擎 (白皮书 7.3 强化) */}
      <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-xl flex items-center justify-center font-bold text-xs ${
              networkInfo.state === 'online'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                : networkInfo.state === 'weak'
                ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
            }`}>
              {networkInfo.state === 'online' ? (
                <Cloud className="w-3.5 h-3.5" />
              ) : networkInfo.state === 'weak' ? (
                <WifiOff className="w-3.5 h-3.5" />
              ) : (
                <CloudOff className="w-3.5 h-3.5" />
              )}
            </div>
            <div>
              <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">离线缓存与双向同步</h4>
              <p className="text-[10px] text-gray-400">IndexedDB 离线优先 · 弱网无缝切换</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 ${
              networkInfo.state === 'online'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                : networkInfo.state === 'weak'
                ? 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400'
                : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                networkInfo.state === 'online'
                  ? 'bg-emerald-500'
                  : networkInfo.state === 'weak'
                  ? 'bg-orange-500 animate-pulse'
                  : 'bg-amber-500 animate-pulse'
              }`} />
              <span>
                {networkInfo.state === 'online'
                  ? '网络优良'
                  : networkInfo.state === 'weak'
                  ? '弱网环境'
                  : '离线模式'}
              </span>
              {networkInfo.latencyMs !== null && networkInfo.state !== 'offline' && (
                <span className="opacity-75 font-normal">({networkInfo.latencyMs}ms)</span>
              )}
            </span>
          </div>
        </div>

        {/* 离线数据与队列概览 */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="p-2.5 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-400">本地离线流水</span>
            <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
              {storageStats ? storageStats.transactions : transactions.length} 笔
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

          <div className="p-2.5 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 flex flex-col gap-0.5">
            <span className="text-[10px] text-gray-400">上次同步</span>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate" title={syncStats.lastSyncedAt || ''}>
              {formatLastSyncTime(syncStats.lastSyncedAt)}
            </span>
          </div>
        </div>

        {/* 离线特性健康指标 */}
        <div className="p-3 rounded-2xl bg-gray-50/80 dark:bg-neutral-900/40 border border-gray-100 dark:border-neutral-800 flex flex-col gap-2 text-[11px]">
          <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> PWA 离线冷启动支持
            </span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">已就绪</span>
          </div>
          <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> 离线防复活墓碑保护
            </span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">活跃</span>
          </div>
          <div className="flex items-center justify-between text-gray-600 dark:text-gray-300">
            <span className="flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-indigo-500" /> 网络恢复自动静默同步
            </span>
            <span className="font-semibold text-indigo-600 dark:text-indigo-400">自动开启</span>
          </div>
        </div>

        <button
          type="button"
          disabled={isSyncing}
          onClick={onSync}
          className="w-full py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-xs shadow-indigo-500/10"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? '正在双向静默同步...' : '立即同步数据至云端'}</span>
        </button>
      </div>

      {/* 3.5 数据与资产管理中心 (白皮书 7.3: CSV 数据导入与导出) */}
      <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
              <FolderDown className="w-3.5 h-3.5" />
            </div>
            <div>
              <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">数据与资产管理</h4>
              <p className="text-[10px] text-gray-400">CSV 账单导入 · 多格式全量导出 · 资产掌控</p>
            </div>
          </div>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-semibold">
            白皮书 7.3
          </span>
        </div>

        {/* 快捷操作入口 */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => onOpenDataModal && onOpenDataModal('export')}
            className="p-3 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 hover:bg-gray-100 dark:hover:bg-neutral-700/60 transition-colors flex flex-col gap-1 text-left group cursor-pointer border border-transparent hover:border-gray-200 dark:hover:border-neutral-700"
          >
            <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400">
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <Download className="w-3.5 h-3.5" />
                <span>导出账单数据</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="text-[10px] text-gray-400">
              支持 CSV (Excel防乱码) / JSON 备份
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
                <span>导入 CSV 账单</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </div>
            <p className="text-[10px] text-gray-400">
              智能识别微信/支付宝/通用账单
            </p>
          </button>
        </div>
      </div>

      {/* 4. 系统首选项与暗黑模式 */}

      <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3">
        <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">偏好设置</h4>

        <div className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2 text-xs">
            {darkMode ? (
              <Moon className="w-4 h-4 text-indigo-400" />
            ) : (
              <Sun className="w-4 h-4 text-amber-500" />
            )}
            <span className="font-medium text-gray-700 dark:text-gray-300">深色外观模式</span>
          </div>

          <button
            type="button"
            onClick={onToggleDarkMode}
            className={`w-11 h-6 rounded-full transition-colors relative flex items-center p-0.5 ${
              darkMode ? 'bg-indigo-600' : 'bg-gray-300'
            }`}
          >
            <div
              className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform ${
                darkMode ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* 5. 关于账盾 */}
      <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-2 text-center text-xs">
        <div className="flex items-center justify-center gap-1.5 font-bold text-gray-800 dark:text-gray-200">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>账盾 · Serverless Ledger</span>
        </div>
        <p className="text-[11px] text-gray-400">
          数据私有掌控 · 纯净无广告 · 离线优先架构 · 基于 Cloudflare 全球边缘计算
        </p>
        <p className="text-[10px] text-gray-400">版本 v1.0.0 (Phase 3 体验强化)</p>
      </div>
    </div>
  );
}

export default ProfileView;
