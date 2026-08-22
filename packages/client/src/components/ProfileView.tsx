import React, { useState } from 'react';
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
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
  Sparkles,
} from 'lucide-react';
import { AuthUser, Ledger, Transaction } from '@ledger/shared';

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
  onLogout,
  onOpenAuthModal,
}: ProfileViewProps) {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const formattedDate = currentUser?.created_at
    ? new Date(currentUser.created_at).toLocaleDateString()
    : '近期';

  return (
    <div className="flex flex-col gap-4 animate-fadeIn">
      {/* 1. 用户信息卡片 (适配已登录与访客模式) */}
      <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 flex items-center justify-center font-black text-lg shadow-sm">
              {currentUser?.email ? currentUser.email[0].toUpperCase() : <UserIcon className="w-6 h-6 text-gray-400 dark:text-gray-600" />}
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
                {currentUser?.email || '当前处于免登录浏览模式'}
              </p>
            </div>
          </div>

          {currentUser ? (
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              title="退出登录"
              className="p-2 rounded-2xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-semibold shadow-xs hover:opacity-90 active:scale-95 transition-all"
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
            <BookOpen className="w-4 h-4 text-emerald-500" />
            <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">多账本体系</h4>
          </div>
          <span className="text-[11px] text-gray-400">{ledgers.length} 个账本</span>
        </div>

        {/* 简要账本列表展示 */}
        <div className="flex flex-col gap-2 pt-1">
          {ledgers.map((l) => (
            <div
              key={l.ledger_id}
              className="flex items-center justify-between p-2.5 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 text-xs"
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-800 dark:text-gray-200">{l.name}</span>
                <span className="text-[10px] text-gray-400">({l.currency})</span>
                {l.is_default === 1 && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-medium">
                    默认
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onOpenLedgerModal}
          className="w-full py-2 rounded-xl bg-gray-100 dark:bg-neutral-700 text-gray-700 dark:text-gray-200 text-xs font-semibold hover:bg-gray-200 dark:hover:bg-neutral-600 transition-all flex items-center justify-center gap-1 mt-1"
        >
          <span>管理账本与新建账本</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 3. Cloudflare 云端同步中心 */}
      <div className="p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 flex flex-col gap-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cloud className="w-4 h-4 text-blue-500" />
            <h4 className="font-bold text-xs text-gray-800 dark:text-gray-200">
              Cloudflare Serverless D1 同步
            </h4>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <span
              className={`w-2 h-2 rounded-full ${
                serverStatus.ok ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span className={serverStatus.ok ? 'text-emerald-600' : 'text-amber-500'}>
              {serverStatus.ok ? '在线服务中' : '离线存储'}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 flex flex-col gap-1">
            <span className="text-[11px] text-gray-400">本地离线流水</span>
            <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
              {transactions.length} 笔
            </span>
          </div>
          <div className="p-3 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 flex flex-col gap-1">
            <span className="text-[11px] text-gray-400">待上传增量</span>
            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
              {pendingCount} 笔
            </span>
          </div>
        </div>

        <button
          type="button"
          disabled={isSyncing}
          onClick={onSync}
          className="w-full py-2.5 rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-xs font-semibold hover:opacity-90 active:scale-95 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? '正在双向同步中...' : '立即同步数据至云端'}</span>
        </button>
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
          数据私有掌控 · 纯净无广告 · 基于 Cloudflare Workers & D1 全球边缘计算
        </p>
        <p className="text-[10px] text-gray-400">版本 v1.0.0</p>
      </div>

      {/* 退出登录确认弹窗 */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-xs bg-white dark:bg-neutral-800 rounded-3xl p-5 shadow-2xl border border-gray-100 dark:border-neutral-700 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-gray-900 dark:text-white font-bold text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span>退出登录</span>
            </div>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              确认退出当前账号吗？已同步的数据均保存在您的 Cloudflare D1 云数据库中。
            </p>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowLogoutConfirm(false)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200"
              >
                取消
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  onLogout();
                }}
                className="px-3.5 py-1.5 rounded-xl text-xs font-medium text-white bg-red-600 hover:bg-red-700 shadow-xs"
              >
                确认退出
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
