import React, { useState, useEffect } from 'react';
import {
  CloudOff,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Zap,
} from 'lucide-react';
import { networkMonitor, NetworkInfo, NetworkState } from '../api/network';
import { syncManager, SyncStats } from '../api/syncManager';

interface NetworkStatusBarProps {
  pendingCount: number;
  onSync: () => Promise<void>;
}

export function NetworkStatusBar({ pendingCount, onSync }: NetworkStatusBarProps) {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>(() => networkMonitor.getInfo());
  const [syncStats, setSyncStats] = useState<SyncStats>(() => syncManager.getStats());
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [isManualSyncing, setIsManualSyncing] = useState(false);

  useEffect(() => {
    let prevOnline = networkInfo.isOnline;
    let toastTimer: any = null;

    const unsubNet = networkMonitor.subscribe((info) => {
      // 网络恢复提示
      if (!prevOnline && info.isOnline) {
        setShowSuccessToast(true);
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(() => setShowSuccessToast(false), 4000);
      }
      prevOnline = info.isOnline;
      setNetworkInfo(info);
    });

    const unsubSync = syncManager.subscribe((stats) => {
      setSyncStats(stats);
    });

    return () => {
      if (toastTimer) clearTimeout(toastTimer);
      unsubNet();
      unsubSync();
    };
  }, []);

  const handleManualSync = async () => {
    if (isManualSyncing || syncStats.isSyncing) return;
    setIsManualSyncing(true);
    try {
      await onSync();
    } finally {
      setIsManualSyncing(false);
    }
  };

  const isSyncing = syncStats.isSyncing || isManualSyncing;

  // 1. 离线状态 (断网)
  if (networkInfo.state === 'offline' || !networkInfo.isOnline) {
    return (
      <div className="w-full px-3 py-2 rounded-2xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between animate-in fade-in slide-in-from-top-1 duration-200 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <CloudOff className="w-3 h-3 text-amber-600 dark:text-amber-400 animate-pulse" />
          </div>
          <div>
            <span className="font-bold">离线模式</span>
            <span className="opacity-90 ml-1">
              · 本地记账畅通无阻 {pendingCount > 0 && `(待同步 ${pendingCount} 笔)`}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={() => networkMonitor.checkHealth()}
          className="px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 text-[11px] font-semibold transition-colors flex items-center gap-1"
        >
          <RefreshCw className="w-2.5 h-2.5" />
          <span>重试</span>
        </button>
      </div>
    );
  }

  // 2. 弱网状态 (高延迟/丢包)
  if (networkInfo.state === 'weak') {
    return (
      <div className="w-full px-3 py-2 rounded-2xl bg-orange-500/10 dark:bg-orange-500/15 border border-orange-500/20 text-orange-800 dark:text-orange-300 text-xs flex items-center justify-between animate-in fade-in duration-200 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0">
            <WifiOff className="w-3 h-3 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <span className="font-bold">弱网环境</span>
            <span className="opacity-90 ml-1">
              {networkInfo.latencyMs ? `(${networkInfo.latencyMs}ms)` : ''} · 离线优先极速响应
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleManualSync}
          disabled={isSyncing}
          className="px-2.5 py-1 rounded-xl bg-orange-500/20 hover:bg-orange-500/30 text-orange-900 dark:text-orange-200 text-[11px] font-semibold transition-colors flex items-center gap-1"
        >
          <RefreshCw className={`w-2.5 h-2.5 ${isSyncing ? 'animate-spin' : ''}`} />
          <span>{isSyncing ? '同步中' : '同步'}</span>
        </button>
      </div>
    );
  }

  // 3. 正在同步中
  if (isSyncing) {
    return (
      <div className="w-full px-3 py-1.5 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-100 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-300 text-xs flex items-center justify-between animate-in fade-in duration-150">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 animate-spin" />
          <span className="font-medium">正在后台静默同步数据至 Cloudflare D1...</span>
        </div>
        <span className="text-[10px] text-indigo-500 font-semibold px-2 py-0.5 rounded-full bg-indigo-100/50 dark:bg-indigo-900/50">
          双向增量
        </span>
      </div>
    );
  }

  // 4. 网络刚恢复时的临时成功提示
  if (showSuccessToast) {
    return (
      <div className="w-full px-3 py-1.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-between animate-in fade-in duration-200">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          <span className="font-semibold">网络已恢复，所有离线数据已成功同步至云端</span>
        </div>
        <button
          type="button"
          onClick={() => setShowSuccessToast(false)}
          className="text-[11px] text-emerald-600 hover:underline"
        >
          知道了
        </button>
      </div>
    );
  }

  // 5. 若有待同步数据且网络良好，展示轻量同步提示
  if (pendingCount > 0) {
    return (
      <div className="w-full px-3 py-1.5 rounded-2xl bg-indigo-50/60 dark:bg-neutral-800/80 border border-indigo-100/60 dark:border-neutral-700/60 text-gray-700 dark:text-gray-300 text-xs flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-3.5 h-3.5 text-amber-500" />
          <span>
            本地有 <strong className="text-amber-600 dark:text-amber-400 font-bold">{pendingCount} 笔</strong> 数据待同步
          </span>
        </div>
        <button
          type="button"
          onClick={handleManualSync}
          className="px-2.5 py-1 rounded-xl bg-indigo-600 text-white text-[11px] font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-1 shadow-2xs"
        >
          <RefreshCw className="w-2.5 h-2.5" />
          <span>立即上传</span>
        </button>
      </div>
    );
  }

  return null;
}

export default NetworkStatusBar;
