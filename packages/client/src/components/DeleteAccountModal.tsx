import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  Download,
  Trash2,
  FileSpreadsheet,
  FileJson,
  Check,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import {
  AuthUser,
  Ledger,
  Category,
  Transaction,
  exportTransactionsToCsv,
  exportTransactionsToJson,
} from '@ledger/shared';
import { deleteAccount } from '../api/client';
import { clearLocalDatabase } from '../db';

interface DeleteAccountModalProps {
  isOpen: boolean;
  currentUser: AuthUser | null;
  ledgers: Ledger[];
  categories: Category[];
  transactions: Transaction[];
  onClose: () => void;
  onDeleteSuccess: () => Promise<void>;
}

export function DeleteAccountModal({
  isOpen,
  currentUser,
  ledgers,
  categories,
  transactions,
  onClose,
  onDeleteSuccess,
}: DeleteAccountModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [backupDownloaded, setBackupDownloaded] = useState<'csv' | 'json' | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen || !currentUser) return null;

  const handleBackupCsv = () => {
    exportTransactionsToCsv(transactions, categories, ledgers);
    setBackupDownloaded('csv');
  };

  const handleBackupJson = () => {
    exportTransactionsToJson(transactions, categories, ledgers);
    setBackupDownloaded('json');
  };

  const handleDelete = async () => {
    if (confirmText.trim() !== '确认注销') return;

    setIsDeleting(true);
    setErrorMessage('');
    try {
      const res = await deleteAccount();
      if (res.success) {
        // 清理本地数据库与离线队列
        await clearLocalDatabase();
        await onDeleteSuccess();
        onClose();
      } else {
        setErrorMessage(res.error || '注销账户失败，请稍后重试');
      }
    } catch (err: any) {
      setErrorMessage(err.message || '网络连接异常，注销失败');
    } finally {
      setIsDeleting(false);
    }
  };

  const isConfirmed = confirmText.trim() === '确认注销';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white dark:bg-neutral-800 rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-red-100 dark:border-red-950/50 flex flex-col gap-5 relative animate-scaleUp">
        {/* 关闭按钮 */}
        <button
          type="button"
          disabled={isDeleting}
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>

        {/* 头部危险警示 */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 flex items-center justify-center">
            <Trash2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-1.5">
              <span>注销账号与删除全部数据</span>
            </h3>
            <p className="text-xs text-red-500 font-medium mt-0.5">
              ⚠️ 此操作不可逆，所有数据将被永久彻底删除
            </p>
          </div>
        </div>

        {/* 风险警告详情 */}
        <div className="p-3.5 rounded-2xl bg-red-50/80 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 text-xs text-red-800 dark:text-red-300 flex flex-col gap-1.5 leading-relaxed">
          <div className="flex items-center gap-1.5 font-bold text-red-700 dark:text-red-400">
            <ShieldAlert className="w-4 h-4" />
            <span>注销后将彻底清除以下所有信息：</span>
          </div>
          <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-red-700/90 dark:text-red-300/90">
            <li>云端数据库中与您账号关联的全部 <strong>{transactions.length} 笔流水明细</strong></li>
            <li>您创建的 <strong>{ledgers.length} 个独立核算账本</strong> 与自定义分类</li>
            <li>您设置的月度预算、历史记录与所有邀请码配额</li>
            <li>本地设备上的离线缓存与待同步数据</li>
          </ul>
        </div>

        {/* 建议用户备份专区（直接提供一键备份按钮） */}
        <div className="p-4 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 border border-gray-200 dark:border-neutral-700/80 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1.5">
              <Download className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>注销前数据备份（强烈建议）</span>
            </span>
            {backupDownloaded && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <Check className="w-3 h-3" />
                <span>已导出备份</span>
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            为防止数据丢失，您可以在确认注销前直接点击下方按钮下载数据备份副本：
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleBackupCsv}
              className="py-2 px-3 rounded-xl bg-white dark:bg-neutral-800 hover:bg-gray-100 dark:hover:bg-neutral-700 border border-gray-200 dark:border-neutral-700 text-xs font-semibold text-gray-700 dark:text-gray-200 flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>导出 CSV 格式备份</span>
            </button>
            <button
              type="button"
              onClick={handleBackupJson}
              className="py-2 px-3 rounded-xl bg-white dark:bg-neutral-800 hover:bg-gray-100 dark:hover:bg-neutral-700 border border-gray-200 dark:border-neutral-700 text-xs font-semibold text-gray-700 dark:text-gray-200 flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-xs"
            >
              <FileJson className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>导出 JSON 备份</span>
            </button>
          </div>
        </div>

        {/* 错误提示 */}
        {errorMessage && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400">
            {errorMessage}
          </div>
        )}

        {/* 安全输入确认 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            请输入 <span className="text-red-600 font-bold select-all">确认注销</span> 以继续：
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="在此输入“确认注销”"
            disabled={isDeleting}
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 transition-all"
          />
        </div>

        {/* 底部按钮 */}
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            disabled={isDeleting}
            onClick={onClose}
            className="py-2.5 px-4 rounded-2xl bg-gray-100 hover:bg-gray-200 dark:bg-neutral-700 dark:hover:bg-neutral-600 text-gray-700 dark:text-gray-200 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!isConfirmed || isDeleting}
            onClick={handleDelete}
            className="py-2.5 px-4 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-xs font-semibold shadow-xs shadow-red-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>正在注销并清除数据...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>确认永久注销</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
