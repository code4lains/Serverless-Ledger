import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Target,
  BookOpen,
  Calendar,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Save,
  HelpCircle,
  TrendingDown,
  Layers,
} from 'lucide-react';
import {
  Category,
  Ledger,
  Budget,
  BudgetPeriod,
  SetBudgetItem,
  formatMoney,
  toCents,
  fromCents,
  getCurrencySymbol,
} from '@ledger/shared';
import { saveBatchBudgets } from '../api/client';
import { CategoryIcon } from './CategoryIcon';

interface BudgetManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  ledgers: Ledger[];
  activeLedgerId: string;
  categories: Category[];
  budgets: Budget[];
  onBudgetsChanged: () => Promise<void>;
}

export function BudgetManagementModal({
  isOpen,
  onClose,
  ledgers,
  activeLedgerId,
  categories,
  budgets,
  onBudgetsChanged,
}: BudgetManagementModalProps) {
  const [selectedLedgerId, setSelectedLedgerId] = useState<string>(() => {
    if (activeLedgerId && activeLedgerId !== 'all') return activeLedgerId;
    const def = ledgers.find((l) => l.is_default === 1);
    return def ? def.ledger_id : (ledgers[0]?.ledger_id || 'default_ledger');
  });

  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [totalBudgetStr, setTotalBudgetStr] = useState<string>('');
  const [categoryBudgetsMap, setCategoryBudgetsMap] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // 仅获取所有支出 (Expense) 大分类 (parent_id 为空)
  const expenseParentCategories = useMemo(() => {
    return categories
      .filter((c) => c.type === 'expense' && !c.parent_id)
      .sort((a, b) => a.sort_order - b.sort_order);
  }, [categories]);

  // 获取当前选择账本对象与币种
  const selectedLedger = useMemo(() => {
    return ledgers.find((l) => l.ledger_id === selectedLedgerId) || ledgers[0] || null;
  }, [ledgers, selectedLedgerId]);

  const currencySymbol = getCurrencySymbol(selectedLedger?.currency);

  // 初始化或切换账本/周期时回显现有预算
  useEffect(() => {
    if (!isOpen) return;

    // 若当前 selectedLedgerId 为 all 或无效，纠正为有效账本
    let targetLedgerId = selectedLedgerId;
    if (!targetLedgerId || targetLedgerId === 'all' || !ledgers.some((l) => l.ledger_id === targetLedgerId)) {
      const def = ledgers.find((l) => l.is_default === 1) || ledgers[0];
      targetLedgerId = def ? def.ledger_id : 'default_ledger';
      setSelectedLedgerId(targetLedgerId);
    }

    const currentBudgets = budgets.filter(
      (b) => b.ledger_id === targetLedgerId && b.period === period
    );

    // 回显总预算
    const totalB = currentBudgets.find((b) => !b.category_id);
    if (totalB && totalB.amount > 0) {
      setTotalBudgetStr((totalB.amount / 100).toString());
    } else {
      setTotalBudgetStr('');
    }

    // 回显各大分类预算
    const catMap: Record<string, string> = {};
    for (const b of currentBudgets) {
      if (b.category_id && b.amount > 0) {
        catMap[b.category_id] = (b.amount / 100).toString();
      }
    }
    setCategoryBudgetsMap(catMap);
    setErrorMessage('');
  }, [isOpen, selectedLedgerId, period, budgets, ledgers]);

  // 计算大分类预算总和
  const totalCategoryBudgetSumCents = useMemo(() => {
    let sum = 0;
    for (const val of Object.values(categoryBudgetsMap)) {
      const parsed = parseFloat(val);
      if (!isNaN(parsed) && parsed > 0) {
        sum += toCents(val);
      }
    }
    return sum;
  }, [categoryBudgetsMap]);

  const totalBudgetCents = useMemo(() => {
    const parsed = parseFloat(totalBudgetStr);
    if (isNaN(parsed) || parsed <= 0) return 0;
    return toCents(totalBudgetStr);
  }, [totalBudgetStr]);

  if (!isOpen) return null;

  // 处理大分类预算输入变动
  const handleCategoryBudgetChange = (categoryId: string, val: string) => {
    if (val.includes('-')) return;
    setCategoryBudgetsMap((prev) => ({
      ...prev,
      [categoryId]: val,
    }));
  };

  // 快速清空单项大分类预算
  const handleClearCategoryBudget = (categoryId: string) => {
    setCategoryBudgetsMap((prev) => {
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });
  };

  // 提交保存预算
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    setErrorMessage('');
    setIsSaving(true);

    try {
      const budgetItems: SetBudgetItem[] = [];

      // 1. 添加总预算项
      if (totalBudgetCents > 0) {
        budgetItems.push({
          category_id: null,
          amount: totalBudgetCents,
        });
      }

      // 2. 添加各支出大分类预算项
      for (const cat of expenseParentCategories) {
        const catVal = categoryBudgetsMap[cat.category_id];
        if (catVal) {
          const catCents = toCents(catVal);
          if (catCents > 0) {
            budgetItems.push({
              category_id: cat.category_id,
              amount: catCents,
            });
          }
        }
      }

      await saveBatchBudgets(selectedLedgerId, period, budgetItems);
      await onBudgetsChanged();
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || '保存预算失败，请重试');
    } finally {
      setIsSaving(false);
    }
  };

  // 清空所有预算
  const handleClearAll = async () => {
    if (isSaving) return;
    if (window.confirm('确定要清空当前账本的所有预算设置吗？')) {
      try {
        setIsSaving(true);
        setErrorMessage('');
        setTotalBudgetStr('');
        setCategoryBudgetsMap({});
        await saveBatchBudgets(selectedLedgerId, period, []);
        await onBudgetsChanged();
      } catch (err: any) {
        setErrorMessage(err.message || '清空预算失败，请重试');
      } finally {
        setIsSaving(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-md max-h-[90vh] bg-white dark:bg-neutral-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-neutral-700/80 flex flex-col overflow-hidden animate-modal-in">
        {/* 顶部标题栏 */}
        <div className="flex items-center justify-between p-4 sm:p-5 pb-3 border-b border-gray-100 dark:border-neutral-700/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-sm shadow-xs">
              <Target className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white">
                预算设置与管理
              </h3>
              <p className="text-[11px] text-gray-400">设置月度总预算与各支出大分类预算</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容滚动区域 */}
        <form onSubmit={handleSave} className="flex flex-col flex-1 overflow-y-auto p-4 sm:p-5 gap-4">
          {/* 账本与周期选择 */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* 账本选择 */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-gray-400 flex items-center gap-1">
                <BookOpen className="w-3 h-3 text-indigo-500" />
                目标账本
              </label>
              <select
                value={selectedLedgerId}
                onChange={(e) => setSelectedLedgerId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none font-semibold cursor-pointer"
              >
                {ledgers.map((l) => (
                  <option key={l.ledger_id} value={l.ledger_id}>
                    {l.name} ({l.currency}) {l.is_default === 1 ? '★' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 周期切换 */}
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-gray-400 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-indigo-500" />
                预算周期
              </label>
              <div className="flex bg-gray-100 dark:bg-neutral-900 rounded-xl p-0.5">
                <button
                  type="button"
                  onClick={() => setPeriod('monthly')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    period === 'monthly'
                      ? 'bg-white dark:bg-neutral-800 text-gray-900 dark:text-white shadow-xs'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  月度预算
                </button>
                <button
                  type="button"
                  onClick={() => setPeriod('yearly')}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    period === 'yearly'
                      ? 'bg-white dark:bg-neutral-800 text-gray-900 dark:text-white shadow-xs'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  年度预算
                </button>
              </div>
            </div>
          </div>

          {/* 1. 总预算设置 */}
          <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40 flex flex-col gap-2.5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                {period === 'monthly' ? '月度总预算额度' : '年度总预算额度'}
              </span>
              <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                {totalBudgetCents > 0 ? formatMoney(totalBudgetCents, currencySymbol) : '未设置'}
              </span>
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-bold text-gray-400">
                {currencySymbol}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                placeholder="0.00 (输入总预算金额)"
                value={totalBudgetStr}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.includes('-')) return;
                  setTotalBudgetStr(val);
                }}
                className="w-full pl-8 pr-3 py-2 text-base font-bold rounded-xl bg-white dark:bg-neutral-800 border border-indigo-200 dark:border-indigo-800/60 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            {/* 快捷总预算预设 */}
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar text-[11px]">
              {[2000, 3000, 5000, 8000, 10000, 20000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setTotalBudgetStr(preset.toString())}
                  className="px-2.5 py-0.5 rounded-lg bg-white dark:bg-neutral-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-neutral-700 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 text-[10px] whitespace-nowrap transition-colors"
                >
                  {preset}
                </button>
              ))}
              {totalBudgetStr && (
                <button
                  type="button"
                  onClick={() => setTotalBudgetStr('')}
                  className="px-2 py-0.5 rounded-lg text-gray-400 hover:text-red-500 text-[10px] whitespace-nowrap"
                >
                  清空
                </button>
              )}
            </div>
          </div>

          {/* 2. 支出各大分类预算设置 */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center px-0.5">
              <span className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-indigo-500" />
                支出大分类预算
              </span>
              <span className="text-[11px] text-gray-400">
                共 {expenseParentCategories.length} 个支出大类
              </span>
            </div>

            <div className="flex flex-col gap-2">
              {expenseParentCategories.map((cat) => {
                const currentVal = categoryBudgetsMap[cat.category_id] || '';
                return (
                  <div
                    key={cat.category_id}
                    className="p-2.5 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 border border-gray-100 dark:border-neutral-800/80 flex items-center justify-between gap-3 hover:border-gray-200 dark:hover:border-neutral-700 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-[100px] shrink-0">
                      <CategoryIcon
                        icon={cat.icon || 'Tag'}
                        color={cat.color || '#D08770'}
                        className="w-4 h-4"
                      />
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                        {cat.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-1 justify-end">
                      <div className="relative max-w-[140px] flex-1">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400">
                          {currencySymbol}
                        </span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="未设置"
                          value={currentVal}
                          onChange={(e) => handleCategoryBudgetChange(cat.category_id, e.target.value)}
                          className="w-full pl-6 pr-2 py-1 text-xs font-bold text-right rounded-xl bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 text-gray-900 dark:text-white focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                      {currentVal && (
                        <button
                          type="button"
                          onClick={() => handleClearCategoryBudget(cat.category_id)}
                          className="p-1 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100 dark:hover:bg-neutral-800 transition-colors"
                          title="清空该分类预算"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. 统计与超额分配提示 */}
          <div className="p-3 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 border border-gray-100 dark:border-neutral-800 flex flex-col gap-1.5 text-xs">
            <div className="flex justify-between items-center text-gray-600 dark:text-gray-300">
              <span>各分类预算合计：</span>
              <strong className="font-semibold text-gray-900 dark:text-white">
                {formatMoney(totalCategoryBudgetSumCents, currencySymbol)}
              </strong>
            </div>

            {totalBudgetCents > 0 && (
              <div className="flex justify-between items-center text-gray-600 dark:text-gray-300">
                <span>总预算额度：</span>
                <strong className="font-semibold text-indigo-600 dark:text-indigo-400">
                  {formatMoney(totalBudgetCents, currencySymbol)}
                </strong>
              </div>
            )}

            {totalBudgetCents > 0 && totalCategoryBudgetSumCents > totalBudgetCents && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400 pt-1 border-t border-gray-200 dark:border-neutral-800">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>提示：各大分类预算总和已超出设定的总预算额度</span>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 底部操作按钮 */}
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-neutral-700/60">
            <button
              type="button"
              onClick={handleClearAll}
              disabled={isSaving}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>清空预算</span>
            </button>

            <div className="flex-1 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200 transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? '保存中...' : '保存预算'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export default BudgetManagementModal;
