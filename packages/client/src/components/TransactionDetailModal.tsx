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
  ArrowRightLeft,
  Landmark,
  Save,
  AlertTriangle,
  Send,
  HandCoins,
  RotateCcw,
  BadgeDollarSign,
} from 'lucide-react';
import {
  Transaction,
  Category,
  Ledger,
  TransactionType,
  LoanType,
  formatMoney,
  toYuan,
  toCents,
  formatRelativeDate,
  formatTime,
  getCategoryMeta,
  getCurrencySymbol,
} from '@ledger/shared';
import { CategoryIcon } from './CategoryIcon';
import { CategoryPicker } from './CategoryPicker';
import { AccountPicker } from './AccountPicker';
import { Layers } from 'lucide-react';

import { AuthUser } from '@ledger/shared';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  categories: Category[];
  ledgers?: Ledger[];
  currentUser?: AuthUser | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedTx: Transaction) => Promise<void>;
  onDelete: (transactionId: string) => Promise<void>;
  onRequireAuth?: () => void;
}

export function TransactionDetailModal({
  transaction,
  categories,
  ledgers = [],
  currentUser,
  isOpen,
  onClose,
  onUpdate,
  onDelete,
  onRequireAuth,
}: TransactionDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 编辑态表单
  const [editLedgerId, setEditLedgerId] = useState<string>('');
  const [editType, setEditType] = useState<TransactionType>('expense');
  const [editAmountStr, setEditAmountStr] = useState<string>('');
  const [editCategoryId, setEditCategoryId] = useState<string>('');
  const [editFromAccount, setEditFromAccount] = useState<string>('');
  const [editToAccount, setEditToAccount] = useState<string>('');
  const [editLoanType, setEditLoanType] = useState<LoanType>('lend');
  const [editDate, setEditDate] = useState<string>('');
  const [editRemark, setEditRemark] = useState<string>('');

  // 同步初始化编辑数据
  useEffect(() => {
    if (transaction) {
      setEditLedgerId(transaction.ledger_id || '');
      setEditType(transaction.type);
      setEditAmountStr(toYuan(transaction.amount).toString());
      setEditCategoryId(transaction.category_id || '');
      setEditFromAccount(transaction.from_account || '');
      setEditToAccount(transaction.to_account || '');
      setEditRemark(transaction.remark || '');

      // 推断借贷子类型
      if (transaction.type === 'loan') {
        if (transaction.category_id === 'cat_loan_borrow') {
          setEditLoanType('borrow');
        } else if (transaction.category_id === 'cat_loan_repay') {
          setEditLoanType('repay');
        } else if (transaction.category_id === 'cat_loan_collect') {
          setEditLoanType('collect');
        } else {
          setEditLoanType('lend');
        }
      }

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

  const currentLedger = ledgers.find((l) => l.ledger_id === transaction.ledger_id);
  const curSymbol = getCurrencySymbol(currentLedger?.currency);
  const categoryInfo = getCategoryMeta(transaction.category_id, categories, transaction.type);
  const isExpense = transaction.type === 'expense';
  const isIncome = transaction.type === 'income';
  const isTransfer = transaction.type === 'transfer';
  const isLoan = transaction.type === 'loan';

  // 借贷流向判断
  const isLoanInflow = transaction.type === 'loan' && (
    transaction.category_id === 'cat_loan_borrow' || transaction.category_id === 'cat_loan_collect'
  );

  // 切换编辑态借贷子类型
  const handleLoanTypeChange = (lt: LoanType) => {
    setEditLoanType(lt);
    const categoryMap: Record<LoanType, string> = {
      lend: 'cat_loan_lend',
      borrow: 'cat_loan_borrow',
      repay: 'cat_loan_repay',
      collect: 'cat_loan_collect',
    };
    setEditCategoryId(categoryMap[lt]);
  };

  // 保存编辑
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(editAmountStr);
    if (!editAmountStr || isNaN(parsedAmount) || parsedAmount <= 0) return;

    setIsSaving(true);
    try {
      const updatedTx: Transaction = {
        ...transaction,
        ledger_id: editLedgerId || transaction.ledger_id,
        type: editType,
        amount: toCents(editAmountStr),
        category_id: editCategoryId || null,
        from_account: (editType === 'transfer' || editType === 'loan') ? (editFromAccount.trim() || null) : null,
        to_account: (editType === 'transfer' || editType === 'loan') ? (editToAccount.trim() || null) : null,
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

  // 借贷编辑态标签
  const getLoanLabels = () => {
    switch (editLoanType) {
      case 'lend':
        return { fromLabel: '出资账户', toLabel: '借款人/对象', fromHolder: '如：微信零钱', toHolder: '如：张三' };
      case 'borrow':
        return { fromLabel: '出资人/机构', toLabel: '存入账户', fromHolder: '如：李四 / 微粒贷', toHolder: '如：招商银行' };
      case 'repay':
        return { fromLabel: '付款账户', toLabel: '债权人/还给谁', fromHolder: '如：支付宝', toHolder: '如：李四' };
      case 'collect':
        return { fromLabel: '债务人/谁还款', toLabel: '收款账户', fromHolder: '如：张三', toHolder: '如：微信零钱' };
    }
  };

  const loanLabels = getLoanLabels();

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
                  : isIncome
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-[#A3BE8C]'
                  : isTransfer
                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-500'
                  : 'bg-purple-50 dark:bg-purple-950/40 text-purple-500'
              }`}
            >
              <CategoryIcon icon={categoryInfo.icon} className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                {isEditing ? '编辑账单' : '明细详情'}
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
              {/* 类型切换 (支出 / 收入 / 转账 / 借贷) */}
              <div className="flex bg-gray-100 dark:bg-neutral-900 rounded-xl p-1">
                {([
                  { type: 'expense', label: '支出' },
                  { type: 'income', label: '收入' },
                  { type: 'transfer', label: '转账' },
                  { type: 'loan', label: '借贷' },
                ] as const).map(({ type: t, label }) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setEditType(t);
                      if (t === 'transfer' && !editCategoryId) {
                        setEditCategoryId('cat_tr_internal');
                      } else if (t === 'loan' && !editCategoryId) {
                        setEditCategoryId('cat_loan_lend');
                      }
                    }}
                    className={`flex-1 py-1 text-xs font-medium rounded-lg transition-all ${
                      editType === t
                        ? 'bg-white dark:bg-neutral-800 text-gray-900 dark:text-white shadow-xs'
                        : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* 借贷模式子类型切换 */}
              {editType === 'loan' && (
                <div className="flex bg-purple-50 dark:bg-purple-950/40 rounded-xl p-1 border border-purple-100 dark:border-purple-900/50">
                  {([
                    { type: 'lend', label: '借出' },
                    { type: 'borrow', label: '借入' },
                    { type: 'repay', label: '还款' },
                    { type: 'collect', label: '收款' },
                  ] as const).map(({ type: lt, label }) => (
                    <button
                      key={lt}
                      type="button"
                      onClick={() => handleLoanTypeChange(lt)}
                      className={`flex-1 py-1 text-xs font-medium rounded-lg transition-all ${
                        editLoanType === lt
                          ? 'bg-white dark:bg-neutral-800 text-purple-700 dark:text-purple-300 shadow-xs'
                          : 'text-gray-500 hover:text-gray-800'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* 金额 */}
              <div>
                <label className="text-[11px] font-medium text-gray-400 mb-1 block">金额 (元)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-gray-400">¥</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={editAmountStr}
                    onKeyDown={(e) => {
                      if (e.key === '-' || e.key === '+' || e.key === 'e' || e.key === 'E') {
                        e.preventDefault();
                      }
                    }}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.includes('-')) return;
                      setEditAmountStr(val);
                    }}
                    className="w-full pl-8 pr-3 py-2 text-lg font-bold rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* 转账/借贷 账户选择器 */}
              {editType === 'transfer' && (
                <div>
                  <label className="text-[11px] font-medium text-gray-400 mb-1 block">转账账户</label>
                  <AccountPicker
                    fromAccount={editFromAccount}
                    toAccount={editToAccount}
                    onChangeFrom={setEditFromAccount}
                    onChangeTo={setEditToAccount}
                    fromLabel="转出账户"
                    toLabel="转入账户"
                    fromPlaceholder="例如：微信零钱"
                    toPlaceholder="例如：招商银行"
                  />
                </div>
              )}

              {editType === 'loan' && (
                <div>
                  <label className="text-[11px] font-medium text-gray-400 mb-1 block">借贷相关账户/对象</label>
                  <AccountPicker
                    fromAccount={editFromAccount}
                    toAccount={editToAccount}
                    onChangeFrom={setEditFromAccount}
                    onChangeTo={setEditToAccount}
                    fromLabel={loanLabels.fromLabel}
                    toLabel={loanLabels.toLabel}
                    fromPlaceholder={loanLabels.fromHolder}
                    toPlaceholder={loanLabels.toHolder}
                    showSwap={false}
                  />
                </div>
              )}

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

              {/* 所属账本选择 */}
              {ledgers && ledgers.length > 0 && (
                <div>
                  <label className="text-[11px] font-medium text-gray-400 mb-1 block">所属账本</label>
                  <select
                    value={editLedgerId}
                    onChange={(e) => setEditLedgerId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none"
                  >
                    {ledgers.map((l) => (
                      <option key={l.ledger_id} value={l.ledger_id}>
                        {l.name} ({l.currency}) {l.is_default === 1 ? '★ 默认' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

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
                  className="flex-1 py-2 rounded-xl text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm hover:opacity-90 transition-all flex items-center justify-center gap-1"
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
                <div className="text-xs text-gray-400 mb-0.5">{categoryInfo.fullPath || '账单明细'}</div>
                <div
                  className={`text-3xl font-extrabold tracking-tight ${
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
                  {isExpense ? '-' : isIncome ? '+' : isTransfer ? '↔ ' : isLoanInflow ? '+ ' : '- '}
                  {formatMoney(transaction.amount, curSymbol)}
                </div>
              </div>

              {/* 转账 / 借贷 专属路径卡片 */}
              {(isTransfer || isLoan) && (transaction.from_account || transaction.to_account) && (
                <div className="p-3 rounded-2xl bg-gray-50 dark:bg-neutral-900/80 border border-gray-100 dark:border-neutral-700/60 flex items-center justify-between text-xs">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[10px] text-gray-400">
                      {isTransfer ? '转出账户' : isLoanInflow ? '出资人/债务人' : '出资账户'}
                    </span>
                    <span className="font-semibold text-gray-700 dark:text-gray-200">
                      {transaction.from_account || '未指定'}
                    </span>
                  </div>
                  <div className="px-2 text-gray-400">
                    <ArrowRightLeft className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex flex-col gap-0.5 text-right">
                    <span className="text-[10px] text-gray-400">
                      {isTransfer ? '转入账户' : isLoanInflow ? '存入账户' : '借款人/债权人'}
                    </span>
                    <span className="font-semibold text-gray-700 dark:text-gray-200">
                      {transaction.to_account || '未指定'}
                    </span>
                  </div>
                </div>
              )}

              {/* 信息项列表 */}
              <div className="flex flex-col gap-2.5 bg-gray-50 dark:bg-neutral-900/60 rounded-2xl p-3.5 text-xs">
                {/* 账本归属 */}
                <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-500" /> 所属账本
                  </span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {currentLedger ? `${currentLedger.name} (${currentLedger.currency})` : '默认账本'}
                  </span>
                </div>

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
                    <BookOpen className="w-3.5 h-3.5" /> 账单类型
                  </span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {isExpense ? '日常支出' : isIncome ? '日常收入' : isTransfer ? '内部转账' : '借贷往来'}
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
                  onClick={() => {
                    if (!currentUser) {
                      onRequireAuth?.();
                      return;
                    }
                    setIsDeleting(true);
                  }}
                  className="flex-1 py-2 rounded-xl text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>删除</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!currentUser) {
                      onRequireAuth?.();
                      return;
                    }
                    setIsEditing(true);
                  }}
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

