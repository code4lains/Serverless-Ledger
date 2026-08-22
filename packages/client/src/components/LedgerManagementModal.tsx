import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  BookOpen,
  Plus,
  Edit3,
  Trash2,
  Check,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Save,
  Coins,
  ArrowRight,
  ShieldCheck,
  Building,
  Home,
  Plane,
  Hammer,
  Briefcase,
  Landmark,
} from 'lucide-react';
import {
  Ledger,
  CreateLedgerRequest,
  UpdateLedgerRequest,
  SUPPORTED_CURRENCIES,
  LEDGER_TEMPLATES,
  formatMoney,
  getCurrencySymbol,
  calculateTotals,
  Transaction,
} from '@ledger/shared';
import {
  createLedger,
  updateLedger,
  setDefaultLedger,
  deleteLedger,
} from '../api/client';

interface LedgerManagementModalProps {
  isOpen: boolean;
  ledgers: Ledger[];
  transactions: Transaction[];
  activeLedgerId: string; // 'all' or specific ledger_id
  onClose: () => void;
  onSelectLedger: (ledgerId: string) => void;
  onLedgersChanged: () => Promise<void>;
}

// 模板图标映射
const TEMPLATE_ICON_MAP: Record<string, React.ElementType> = {
  BookOpen,
  Home,
  Plane,
  Hammer,
  Briefcase,
  Landmark,
};

export function LedgerManagementModal({
  isOpen,
  ledgers,
  transactions,
  activeLedgerId,
  onClose,
  onSelectLedger,
  onLedgersChanged,
}: LedgerManagementModalProps) {
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [editingLedgerId, setEditingLedgerId] = useState<string | null>(null);
  const [deletingLedgerId, setDeletingLedgerId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // 新建表单状态
  const [newName, setNewName] = useState('');
  const [newCurrency, setNewCurrency] = useState('CNY');
  const [newIsDefault, setNewIsDefault] = useState(false);

  // 编辑表单状态
  const [editName, setEditName] = useState('');
  const [editCurrency, setEditCurrency] = useState('CNY');
  const [editIsDefault, setEditIsDefault] = useState(false);

  // 初始化重置
  useEffect(() => {
    if (isOpen) {
      setActiveTab('list');
      setEditingLedgerId(null);
      setDeletingLedgerId(null);
      setErrorMsg(null);
      setNewName('');
      setNewCurrency('CNY');
      setNewIsDefault(false);
    }
  }, [isOpen]);

  // 计算每个账本的统计数据
  const ledgerStatsMap = useMemo(() => {
    const map = new Map<string, { count: number; totalExpense: number; totalIncome: number; balance: number }>();
    for (const led of ledgers) {
      const ledTxs = transactions.filter((t) => t.ledger_id === led.ledger_id);
      const totals = calculateTotals(ledTxs);
      map.set(led.ledger_id, {
        count: ledTxs.length,
        totalExpense: totals.totalExpense,
        totalIncome: totals.totalIncome,
        balance: totals.balance,
      });
    }
    return map;
  }, [ledgers, transactions]);

  if (!isOpen) return null;

  // 应用模板快捷填充
  const handleApplyTemplate = (tpl: typeof LEDGER_TEMPLATES[0]) => {
    setNewName(tpl.name);
    setNewCurrency(tpl.currency || 'CNY');
  };

  // 提交新建账本
  const handleCreateLedger = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) {
      setErrorMsg('请输入账本名称');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const created = await createLedger({
        name: newName.trim(),
        currency: newCurrency,
        is_default: newIsDefault ? 1 : 0,
      });

      await onLedgersChanged();
      onSelectLedger(created.ledger_id);
      setActiveTab('list');
      setNewName('');
    } catch (err: any) {
      setErrorMsg(err?.message || '创建账本失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 开始编辑账本
  const handleStartEdit = (ledger: Ledger) => {
    setEditingLedgerId(ledger.ledger_id);
    setEditName(ledger.name);
    setEditCurrency(ledger.currency || 'CNY');
    setEditIsDefault(ledger.is_default === 1);
    setErrorMsg(null);
  };

  // 提交编辑修改
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLedgerId || !editName.trim()) return;

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await updateLedger(editingLedgerId, {
        name: editName.trim(),
        currency: editCurrency,
        is_default: editIsDefault ? 1 : 0,
      });
      await onLedgersChanged();
      setEditingLedgerId(null);
    } catch (err: any) {
      setErrorMsg(err?.message || '更新账本失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 设为默认账本
  const handleSetDefault = async (ledgerId: string) => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await setDefaultLedger(ledgerId);
      await onLedgersChanged();
    } catch (err: any) {
      setErrorMsg(err?.message || '设置默认账本失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 确认删除账本
  const handleConfirmDelete = async (ledgerId: string) => {
    if (ledgers.length <= 1) {
      setErrorMsg('至少需保留一个账本，无法删除唯一账本');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await deleteLedger(ledgerId);
      if (!res.success) {
        setErrorMsg(res.error || '删除失败');
        return;
      }

      await onLedgersChanged();
      setDeletingLedgerId(null);

      // 如果当前正处于被删除的账本视图中，自动切回默认账本或全局
      if (activeLedgerId === ledgerId) {
        const remaining = ledgers.filter((l) => l.ledger_id !== ledgerId);
        const nextDefault = remaining.find((l) => l.is_default === 1) || remaining[0];
        onSelectLedger(nextDefault ? nextDefault.ledger_id : 'all');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || '删除账本失败');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-neutral-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl border border-gray-100 dark:border-neutral-700/80 transition-all flex flex-col max-h-[85vh]">
        {/* 弹窗顶部 Header */}
        <div className="flex justify-between items-center px-5 pt-4 pb-3 border-b border-gray-100 dark:border-neutral-700/60 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">
                账本管理中心
              </h3>
              <p className="text-[11px] text-gray-400">
                共 {ledgers.length} 个独立核算账本
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab 导航切换 (账本列表 / 新建账本) */}
        <div className="flex px-5 pt-3 shrink-0">
          <div className="flex w-full bg-gray-100 dark:bg-neutral-900 rounded-xl p-1 text-xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('list');
                setEditingLedgerId(null);
                setDeletingLedgerId(null);
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'list'
                  ? 'bg-white dark:bg-neutral-800 text-gray-900 dark:text-white shadow-xs'
                  : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>所有账本 ({ledgers.length})</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('create');
                setEditingLedgerId(null);
                setDeletingLedgerId(null);
                setErrorMsg(null);
              }}
              className={`flex-1 py-1.5 font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'create'
                  ? 'bg-white dark:bg-neutral-800 text-gray-900 dark:text-white shadow-xs'
                  : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>创建新账本</span>
            </button>
          </div>
        </div>

        {/* 错误提示条 */}
        {errorMsg && (
          <div className="mx-5 mt-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/60 text-xs text-red-600 dark:text-red-400 flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="p-0.5 hover:opacity-75">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* 内容滚动区域 */}
        <div className="p-5 overflow-y-auto flex-1 flex flex-col gap-3">
          {activeTab === 'list' ? (
            /* 账本列表模式 */
            <div className="flex flex-col gap-3">
              {/* 全局账本视图快捷卡片 */}
              <div
                onClick={() => {
                  onSelectLedger('all');
                  onClose();
                }}
                className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                  activeLedgerId === 'all'
                    ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800 shadow-2xs'
                    : 'bg-gray-50/70 dark:bg-neutral-900/50 border-gray-100 dark:border-neutral-800 hover:bg-gray-100/70 dark:hover:bg-neutral-900'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xs font-bold">
                    全
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                      <span>全部账本透视</span>
                      {activeLedgerId === 'all' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-600 text-white font-medium">当前视图</span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      汇总统揽所有账本的收支、结余与明细
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                    共 {transactions.length} 笔
                  </div>
                </div>
              </div>

              {/* 账本列表 */}
              <div className="text-[11px] font-semibold text-gray-400 px-0.5 pt-1">
                独立核算账本列表
              </div>

              {ledgers.map((ledger) => {
                const isCurActive = activeLedgerId === ledger.ledger_id;
                const stats = ledgerStatsMap.get(ledger.ledger_id) || { count: 0, totalExpense: 0, totalIncome: 0, balance: 0 };
                const curSymbol = getCurrencySymbol(ledger.currency);
                const isEditing = editingLedgerId === ledger.ledger_id;
                const isDeleting = deletingLedgerId === ledger.ledger_id;

                if (isEditing) {
                  return (
                    <form
                      key={ledger.ledger_id}
                      onSubmit={handleSaveEdit}
                      className="p-3.5 rounded-2xl bg-gray-50 dark:bg-neutral-900 border border-indigo-200 dark:border-indigo-800 flex flex-col gap-2.5"
                    >
                      <div className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        编辑账本
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-400 block mb-1">账本名称</label>
                        <input
                          type="text"
                          required
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 focus:outline-none"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-gray-400 block mb-1">币种</label>
                          <select
                            value={editCurrency}
                            onChange={(e) => setEditCurrency(e.target.value)}
                            className="w-full px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 focus:outline-none"
                          >
                            {SUPPORTED_CURRENCIES.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex items-center pt-4">
                          <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editIsDefault}
                              onChange={(e) => setEditIsDefault(e.target.checked)}
                              className="rounded text-indigo-600 focus:ring-0"
                            />
                            <span>设为默认账本</span>
                          </label>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingLedgerId(null)}
                          className="px-3 py-1 text-xs rounded-xl bg-gray-200 dark:bg-neutral-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300"
                        >
                          取消
                        </button>
                        <button
                          type="submit"
                          disabled={isSubmitting || !editName.trim()}
                          className="px-3.5 py-1 text-xs font-semibold rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition-all flex items-center gap-1"
                        >
                          <Save className="w-3 h-3" />
                          <span>保存</span>
                        </button>
                      </div>
                    </form>
                  );
                }

                if (isDeleting) {
                  return (
                    <div
                      key={ledger.ledger_id}
                      className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/60 flex flex-col gap-2"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold text-red-600 dark:text-red-400">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span>确认删除账本【{ledger.name}】吗？</span>
                      </div>
                      <p className="text-[11px] text-red-700/80 dark:text-red-300/80 leading-relaxed">
                        删除后该账本及其关联的 {stats.count} 笔账单流水将一同被永久删除且不可恢复。
                      </p>
                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setDeletingLedgerId(null)}
                          className="px-3 py-1 text-xs rounded-xl bg-white dark:bg-neutral-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-neutral-700"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleConfirmDelete(ledger.ledger_id)}
                          className="px-3.5 py-1 text-xs font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700"
                        >
                          {isSubmitting ? '删除中...' : '确认永久删除'}
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={ledger.ledger_id}
                    className={`p-3.5 rounded-2xl border transition-all flex flex-col gap-2.5 ${
                      isCurActive
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 shadow-xs'
                        : 'bg-white dark:bg-neutral-900/60 border-gray-100 dark:border-neutral-800 hover:border-gray-200 dark:hover:border-neutral-700'
                    }`}
                  >
                    {/* 上部：名称、币种、状态标签、切换按钮 */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          onClick={() => {
                            onSelectLedger(ledger.ledger_id);
                            onClose();
                          }}
                          className="cursor-pointer"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-gray-900 dark:text-white">
                              {ledger.name}
                            </span>
                            {ledger.is_default === 1 && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 font-semibold flex items-center gap-0.5">
                                ★ 默认
                              </span>
                            )}
                            {isCurActive && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-emerald-600 text-white font-medium">
                                当前使用
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-gray-400 mt-0.5">
                            币种：{ledger.currency} ({curSymbol}) · {stats.count} 笔流水
                          </div>
                        </div>
                      </div>

                      {/* 结余金额 */}
                      <div className="text-right">
                        <div className="text-[10px] text-gray-400">账本结余</div>
                        <div
                          className={`text-xs font-bold ${
                            stats.balance >= 0 ? 'text-gray-900 dark:text-white' : 'text-[#D08770]'
                          }`}
                        >
                          {formatMoney(stats.balance, curSymbol)}
                        </div>
                      </div>
                    </div>

                    {/* 下部：操作工具栏 */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-neutral-800/80 text-[11px]">
                      <div className="flex items-center gap-1">
                        {!isCurActive && (
                          <button
                            type="button"
                            onClick={() => {
                              onSelectLedger(ledger.ledger_id);
                              onClose();
                            }}
                            className="px-2 py-0.5 rounded-lg bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 transition-colors font-medium"
                          >
                            进入账本
                          </button>
                        )}
                        {ledger.is_default !== 1 && (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleSetDefault(ledger.ledger_id)}
                            className="px-2 py-0.5 rounded-lg text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors"
                          >
                            设为默认
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(ledger)}
                          className="p-1 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                          title="编辑账本"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        {ledgers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setDeletingLedgerId(ledger.ledger_id)}
                            className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="删除账本"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* 创建新账本模式 */
            <form onSubmit={handleCreateLedger} className="flex flex-col gap-4">
              {/* 推荐场景模版快速填充 */}
              <div>
                <div className="text-[11px] font-semibold text-gray-400 mb-2 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  <span>推荐模版快速填充</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {LEDGER_TEMPLATES.map((tpl) => {
                    const Icon = TEMPLATE_ICON_MAP[tpl.icon] || BookOpen;
                    return (
                      <button
                        key={tpl.name}
                        type="button"
                        onClick={() => handleApplyTemplate(tpl)}
                        className={`p-2 rounded-xl border text-left transition-all flex flex-col gap-1 ${
                          newName === tpl.name
                            ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700'
                            : 'bg-gray-50/70 dark:bg-neutral-900/60 border-gray-100 dark:border-neutral-800 hover:bg-gray-100'
                        }`}
                      >
                        <div className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                          <Icon className="w-3.5 h-3.5 shrink-0" />
                          <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate">
                            {tpl.name}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400 truncate">
                          {tpl.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 账本名称 */}
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                  账本名称 *
                </label>
                <input
                  type="text"
                  required
                  placeholder="例如：装修账本、旅游度假账本"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none"
                />
              </div>

              {/* 币种选择 */}
              <div>
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">
                  核算币种
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {SUPPORTED_CURRENCIES.map((c) => {
                    const isSelected = newCurrency === c.code;
                    return (
                      <button
                        key={c.code}
                        type="button"
                        onClick={() => setNewCurrency(c.code)}
                        className={`py-1.5 px-2 rounded-xl text-xs font-medium border transition-all flex items-center justify-center gap-1 ${
                          isSelected
                            ? 'bg-gray-900 dark:bg-white text-white dark:text-gray-900 border-transparent shadow-xs'
                            : 'bg-gray-50 dark:bg-neutral-900 text-gray-600 dark:text-gray-300 border-gray-100 dark:border-neutral-800 hover:bg-gray-100'
                        }`}
                      >
                        <span>{c.symbol}</span>
                        <span>{c.code}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 默认账本勾选 */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="setAsDefault"
                  checked={newIsDefault}
                  onChange={(e) => setNewIsDefault(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-0"
                />
                <label
                  htmlFor="setAsDefault"
                  className="text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none"
                >
                  设为默认日常账本 (进入应用时优先展示)
                </label>
              </div>

              {/* 提交按钮 */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="flex-1 py-2 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-neutral-700/60 hover:bg-gray-200 transition-colors"
                >
                  返回列表
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !newName.trim()}
                  className="flex-1 py-2 rounded-xl text-xs font-medium text-white bg-gray-900 dark:bg-white dark:text-gray-900 shadow-sm hover:opacity-90 active:scale-95 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? '创建中...' : '立即创建账本'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
export default LedgerManagementModal;
