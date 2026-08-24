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
  Ticket,
  Copy,
  Check,
  Plus,
  KeyRound,
  Trash2,
  Repeat,
} from 'lucide-react';
import { AuthUser, Ledger, Transaction, InviteEligibilityInfo } from '@ledger/shared';
import { networkMonitor, NetworkInfo } from '../api/network';
import { syncManager, SyncStats } from '../api/syncManager';
import { getLocalStorageStats } from '../db';
import { getInviteCodes, claimInviteCode } from '../api/client';

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
  onOpenDeleteAccountModal?: () => void;
  onOpenRecoveryCodeModal?: (code: string) => void;
  onOpenRecurringModal?: () => void;
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
  onOpenDeleteAccountModal,
  onOpenRecoveryCodeModal,
  onOpenRecurringModal,
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

  const [inviteInfo, setInviteInfo] = useState<InviteEligibilityInfo | null>(null);
  const [loadingInviteInfo, setLoadingInviteInfo] = useState(false);
  const [claimingInvite, setClaimingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [inviteError, setInviteError] = useState('');

  useEffect(() => {
    const unsubNet = networkMonitor.subscribe((info) => setNetworkInfo(info));
    const unsubSync = syncManager.subscribe((stats) => setSyncStats(stats));

    return () => {
      unsubNet();
      unsubSync();
    };
  }, []);

  useEffect(() => {
    getLocalStorageStats().then((stats) => setStorageStats(stats));
  }, [transactions.length, pendingCount, isSyncing]);

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
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6 items-start animate-fadeIn">
      {/* 左列卡片流 (Column 1: 账户信息、邀请资格、离线同步引擎、偏好设置与安全) */}
      <div className="flex flex-col gap-4">
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
                    <ShieldCheck className="w-3.5 h-3.5" />
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

          {!currentUser && (
            <div className="pt-2 border-t border-gray-100 dark:border-neutral-700/60 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
              <span>登录后开启多端数据同步与云端加密备份</span>
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
              >
                立即登录 ➔
              </button>
            </div>
          )}
        </div>

        {/* 1.5 我的邀请码专区 (仅登录用户显示) */}
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

            {/* 规则说明与状态提示 */}
            <div className="p-3 rounded-2xl bg-gray-50/80 dark:bg-neutral-900/40 border border-gray-100 dark:border-neutral-800/80 flex flex-col gap-1 text-[11px] text-gray-600 dark:text-gray-300">
              <div className="flex items-start gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />
                <span className="leading-relaxed">
                  规则说明：注册完成且记账后第 3 天可获取第 1 个邀请码，随后每 30 天可获取 1 个，上限 3 个。
                </span>
              </div>

              {inviteInfo && !inviteInfo.has_recorded_transaction && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium pl-5">
                  • 需先记录至少一笔账单以激活邀请资格。
                </p>
              )}

              {inviteInfo && inviteInfo.has_recorded_transaction && !inviteInfo.can_generate && inviteInfo.claimed_count < inviteInfo.max_limit && inviteInfo.next_unlock_date && (
                <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium pl-5">
                  • 下一个邀请码将于 {new Date(inviteInfo.next_unlock_date).toLocaleDateString()} 解锁。
                </p>
              )}

              {inviteInfo && inviteInfo.claimed_count >= inviteInfo.max_limit && (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pl-5">
                  • 您已成功获取全部 3 个邀请码。
                </p>
              )}
            </div>

            {inviteError && (
              <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/50 text-xs text-red-600 dark:text-red-400">
                {inviteError}
              </div>
            )}

            {/* 邀请码列表 */}
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

            {/* 生成/获取邀请码按钮 */}
            {inviteInfo && inviteInfo.can_generate && (
              <button
                type="button"
                disabled={claimingInvite}
                onClick={handleClaimInvite}
                className="w-full py-2.5 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white text-xs font-semibold hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5 shadow-xs shadow-purple-500/20 cursor-pointer"
              >
                {claimingInvite ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>正在生成邀请码...</span>
                  </>
                ) : (
                  <>
                    <Plus className="w-3.5 h-3.5" />
                    <span>获取新邀请码 (可获取 {inviteInfo.total_eligible - inviteInfo.claimed_count} 个)</span>
                  </>
                )}
              </button>
            )}
          </div>
        )}

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
            className="w-full py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-xs shadow-indigo-500/10 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? '正在双向静默同步...' : '立即同步数据至云端'}</span>
          </button>
        </div>

        {/* 4. 系统首选项与暗黑模式 */}
        <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-2xs border border-gray-100 dark:border-neutral-700/80 flex flex-col gap-3">
          <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">偏好设置</h4>

          <div className="flex items-center justify-between py-1">
            <div className="flex items-center gap-2.5 text-xs">
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center transition-colors ${
                darkMode ? 'bg-indigo-950/60 text-indigo-400' : 'bg-amber-50 text-amber-500'
              }`}>
                {darkMode ? (
                  <Moon className="w-4 h-4 text-indigo-400" />
                ) : (
                  <Sun className="w-4 h-4 text-amber-500" />
                )}
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
              className={`w-12 h-6.5 rounded-full transition-all duration-300 relative flex items-center p-1 focus:outline-none cursor-pointer ${
                darkMode ? 'bg-indigo-600 shadow-glow-indigo' : 'bg-gray-300 dark:bg-neutral-700'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full bg-white shadow-md transform transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                  darkMode ? 'translate-x-5.5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        {/* 4.5 账号安全与危险操作 (仅登录状态下显示) */}
        {currentUser && (
          <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-2xs border border-gray-100 dark:border-neutral-700/80 flex flex-col gap-3">
            <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">账号与安全</h4>

            <div className="flex flex-col gap-2 pt-1">
              {/* 查看/备份密码恢复码 */}
              {currentUser.recovery_code && (
                <div className="p-3 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                      <KeyRound className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-semibold text-gray-800 dark:text-gray-200 block">密码恢复凭证</span>
                      <span className="text-[10px] text-gray-400">用于找回/重置登录密码</span>
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

              {/* 注销账户危险入口 */}
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
      </div>

      {/* 右列卡片流 (Column 2: 多账本管理、预算中心、数据与资产导入导出、关于账盾) */}
      <div className="flex flex-col gap-4">
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
              className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
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
                className="text-[11px] text-center text-gray-400 hover:text-gray-600 py-1 cursor-pointer"
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
                className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
              >
                <span>预算设置</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
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
            {/* <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-semibold">
              白皮书 7.3
            </span> */}
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
                  设定房租、工资、会员订阅，到期自动记录
                </span>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-indigo-400 group-hover:translate-x-0.5 transition-transform" />
          </button>
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
          <p className="text-[10px] text-gray-400">版本 v1.0.0</p>
        </div>
      </div>
    </div>
  );
}

export default ProfileView;
