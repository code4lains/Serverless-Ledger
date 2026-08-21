import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  FileText,
  Trash2,
  Edit3,
  CheckCircle2,
  Clock,
  BookOpen,
  ArrowDownLeft,
  ArrowUpRight,
  Save,
  AlertTriangle,
} from 'lucide-react';
import {
  Transaction,
  Category,
  TransactionType,
  formatMoney,
  toYuan,
  toCents,
  formatRelativeDate,
  formatTime,
  getCategoryMeta,
} from '@ledger/shared';
import { CategoryIcon } from './CategoryIcon';
import { CategoryPicker } from './CategoryPicker';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  categories: Category[];
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedTx: Transaction) => Promise<void>;
  onDelete: (transactionId: string) => Promise<void>;
}

export function TransactionDetailModal({
  transaction,
  categories,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
}: TransactionDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 编辑态表单
  const [editType, setEditType] = useState<TransactionType>('expense');
  const [editAmountStr, setEditAmountStr] = useState<string>('');
  const [editCategoryId, setEditCategoryId] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [editRemark, setEditRemark] = useState<string>('');

  // 同步初始化编辑数据
  useEffect(() => {
    if (transaction) {
      setEditType(transaction.type);
      setEditAmountStr(toYuan(transaction.amount).toString());
      setEditCategoryId(transaction.category_id || '');
      setEditRemark(transaction.remark || '');

      // 将 ISO 格式转为 datetime-local (YYYY-MM-DDTHH:mm)
      try {
        const d = new Date(transaction.transaction_date);
        const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        setEditDate(localIso);
      } catch {
        setEditDate(new Date().toISOString().slice(0, 16));
      }
    }
    setIsEditing(false);
    setIsDeleting(false);
  }, [transaction, isOpen]);

  if (!isOpen || !transaction) return null;

  const categoryInfo = getCategoryMeta(transaction.category_id, categories, transaction.type);
  const isExpense = transaction.type === 'expense';


  // 保存编辑
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editAmountStr || parseFloat(editAmountStr) <= 0) return;

    setIsSaving(true);
    try {
      const updatedTx: Transaction = {
        ...transaction,
        type: editType,
        amount: toCents(editAmountStr),
        category_id: editCategoryId || null,
        transaction_date: editDate ? new Date(editDate).toISOString() : transaction.transaction_date,
        remark: editRemark.trim() || null,
      };

      await onUpdate(updatedTx);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  };

  // 确认删除
  const handleConfirmDelete = async () => {
    setIsSaving(true);
    try {
      await onDelete(transaction.transaction_id);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-neutral-800 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-gray-100 dark:border-neutral-700/80 transition-all">
        {/* 顶部 Header */}
        <div className="flex justify-between items-center px-5 pt-4 pb-3 border-b border-gray-100 dark:border-neutral-700/60">
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                isExpense
                  ? 'bg-orange-50 dark:bg-orange-950/40 text-[#D08770]'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-[#A3BE8C]'
              }`}
            >
              <CategoryIcon icon={categoryInfo.icon} className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                {isEditing ? '编辑流水' : '明细详情'}
              </h3>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="p-5 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
          {/* 删除二次确认浮层 */}
          {isDeleting ? (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/50 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-semibold text-xs">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>确认删除此流水吗？</span>
              </div>
              <p className="text-[11px] text-red-700/80 dark:text-red-300/80 leading-relaxed">
                删除后本地与 Cloudflare D1 数据库中该笔账单将不可恢复。
              </p>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setIsDeleting(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={handleConfirmDelete}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium text-white bg-red-600 hover:bg-red-700 shadow-sm transition-all"
                >
                  {isSaving ? '删除中...' : '确认删除'}
                </button>
              </div>
            </div>
          ) : isEditing ? (
            /* 编辑表单 */
            <form onSubmit={handleSave} className="flex flex-col gap-3.5">
              {/* 类型切换 */}
              <div className="flex bg-gray-100 dark:bg-neutral-900 rounded-xl p-1">
                {(['expense', 'income'] as TransactionType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setEditType(t)}
                    className={`flex-1 py-1 text-xs font-medium rounded-lg transition-all ${
                      editType === t
                        ? 'bg-white dark:bg-neutral-800 text-gray-900 dark:text-white shadow-xs'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {t === 'expense' ? '支出' : '收入'}
                  </button>
                ))}
              </div>

              {/* 金额 */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">金额 (元)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">¥</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editAmountStr}
                    onChange={(e) => setEditAmountStr(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 text-lg font-bold rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* 分类二级选择 */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">分类选择</label>
                <CategoryPicker
                  categories={categories}
                  type={editType}
                  selectedCategoryId={editCategoryId}
                  onSelectCategory={setEditCategoryId}
                />
              </div>

              {/* 日期时间 */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">记账时间</label>
                <input
                  type="datetime-local"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none"
                />
              </div>

              {/* 备注 */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">备注说明</label>
                <input
                  type="text"
                  placeholder="添加备注..."
                  value={editRemark}
                  onChange={(e) => setEditRemark(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none"
                />
              </div>

              {/* 编辑态底部按钮 */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="flex-1 py-2 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-neutral-700/60 hover:bg-gray-200 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !editAmountStr || parseFloat(editAmountStr) <= 0}
                  className="flex-1 py-2 rounded-xl text-xs font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 shadow-sm hover:opacity-90 transition-all flex items-center justify-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? '保存中...' : '保存修改'}</span>
                </button>
              </div>
            </form>
          ) : (
            /* 详情展示态 */
            <>
              {/* 金额大字 */}
              <div className="text-center py-2">
                <div className="text-xs text-gray-400 mb-0.5">{categoryInfo.fullPath || '日常收支'}</div>
                <div
                  className={`text-3xl font-extrabold tracking-tight ${
                    isExpense ? 'text-gray-900 dark:text-white' : 'text-[#A3BE8C]'
                  }`}
                >
                  {isExpense ? '-' : '+'}
                  {formatMoney(transaction.amount)}
                </div>
              </div>

              {/* 信息项列表 */}
              <div className="flex flex-col gap-2.5 bg-gray-50 dark:bg-neutral-900/60 rounded-2xl p-3.5 text-xs">
                <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" /> 记账日期
                  </span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {formatRelativeDate(transaction.transaction_date)} {formatTime(transaction.transaction_date)}
                  </span>
                </div>

                <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" /> 所属账本
                  </span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    默认日常账本
                  </span>
                </div>

                <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" /> 备注信息
                  </span>
                  <span className="font-medium text-gray-800 dark:text-gray-200 max-w-[180px] truncate">
                    {transaction.remark || '无备注'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1.5">
                    {transaction.sync_status === 'synced' ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Clock className="w-3.5 h-3.5 text-amber-500" />
                    )}
                    同步状态
                  </span>
                  <span
                    className={`font-medium ${
                      transaction.sync_status === 'synced'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-500'
                    }`}
                  >
                    {transaction.sync_status === 'synced' ? '已同步至 Cloudflare D1' : '本地暂存 (离线优先)'}
                  </span>
                </div>
              </div>

              {/* 操作按钮组 */}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsDeleting(true)}
                  className="flex-1 py-2 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>删除</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="flex-1 py-2 rounded-xl text-xs font-medium text-gray-800 dark:text-gray-100 bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>编辑修改</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
