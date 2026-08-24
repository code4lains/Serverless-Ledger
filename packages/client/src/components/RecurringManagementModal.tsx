import React, { useState, useEffect, useMemo } from 'react';
import {
  Repeat,
  X,
  Plus,
  Trash2,
  Edit3,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Calendar,
  Layers,
  Sparkles,
  ChevronRight,
  Clock,
  ArrowRight,
  Tag,
  BookOpen,
  DollarSign,
  Info,
} from 'lucide-react';
import {
  RecurringRule,
  RecurringFrequency,
  TransactionType,
  Category,
  Ledger,
  AuthUser,
  formatMoney,
  toCents,
  toYuan,
  getCategoryMeta,
  formatFrequencyLabel,
  PRESET_RECURRING_TEMPLATES,
  RecurringPresetTemplate,
} from '@ledger/shared';
import {
  getRecurringRules,
  createRecurringRule,
  updateRecurringRule,
  deleteRecurringRule,
  executeDueRecurringRules,
} from '../api/client';
import { CategoryIcon } from './CategoryIcon';
import { recurringEngine } from '../api/recurringEngine';

interface RecurringManagementModalProps {
  isOpen: boolean;
  currentUser: AuthUser | null;
  ledgers: Ledger[];
  categories: Category[];
  activeLedgerId: string;
  onClose: () => void;
  onRulesChanged?: () => void;
  onTriggerAutoProcess?: () => Promise<void>;
  onRequireAuth?: () => void;
}

export function RecurringManagementModal({
  isOpen,
  currentUser,
  ledgers,
  categories,
  activeLedgerId,
  onClose,
  onRulesChanged,
  onTriggerAutoProcess,
  onRequireAuth,
}: RecurringManagementModalProps) {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'create'>('list');
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  // 表单状态
  const [name, setName] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState('');
  const [selectedLedgerId, setSelectedLedgerId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [fromAccount, setFromAccount] = useState('微信零钱');
  const [toAccount, setToAccount] = useState('招商银行');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [interval, setInterval] = useState<number>(1);
  const [dayOfMonth, setDayOfMonth] = useState<number>(1);
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);
  const [monthOfYear, setMonthOfYear] = useState<number>(1);
  const [startDate, setStartDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>('');
  const [remark, setRemark] = useState('');
  const [autoRecord, setAutoRecord] = useState<number>(1);

  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // 载入规则列表
  const loadRules = async () => {
    setLoading(true);
    try {
      const data = await getRecurringRules();
      setRules(data);
    } catch (err) {
      console.error('Failed to load recurring rules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRules();
      setMessage(null);
    }
  }, [isOpen]);

  // 重置新建表单
  const resetForm = () => {
    setName('');
    setType('expense');
    setAmountStr('');
    const defaultLed = ledgers.find((l) => l.is_default === 1) || ledgers[0];
    setSelectedLedgerId(activeLedgerId !== 'all' ? activeLedgerId : defaultLed ? defaultLed.ledger_id : '');
    const firstCat = categories.find((c) => c.type === 'expense' && !c.parent_id);
    setSelectedCategoryId(firstCat ? firstCat.category_id : '');
    setFromAccount('微信零钱');
    setToAccount('招商银行');
    setFrequency('monthly');
    setInterval(1);
    setDayOfMonth(new Date().getDate());
    setDayOfWeek(new Date().getDay() || 7);
    setMonthOfYear(new Date().getMonth() + 1);
    setStartDate(new Date().toISOString().slice(0, 10));
    setEndDate('');
    setRemark('');
    setAutoRecord(1);
    setEditingRuleId(null);
  };

  // 应用预置模板
  const handleApplyPreset = (template: RecurringPresetTemplate) => {
    setName(template.name);
    setType(template.type);
    setAmountStr((template.suggestedAmount / 100).toString());
    setFrequency(template.frequency);
    if (template.day_of_month) setDayOfMonth(template.day_of_month);
    if (template.day_of_week) setDayOfWeek(template.day_of_week);
    setRemark(template.remark);
    if (template.defaultCategory) {
      const matched = categories.find((c) => c.category_id === template.defaultCategory);
      if (matched) setSelectedCategoryId(matched.category_id);
    }
    setActiveTab('create');
  };

  // 载入编辑规则
  const handleEditRule = (rule: RecurringRule) => {
    setEditingRuleId(rule.rule_id);
    setName(rule.name);
    setType(rule.type);
    setAmountStr((rule.amount / 100).toString());
    setSelectedLedgerId(rule.ledger_id);
    setSelectedCategoryId(rule.category_id || '');
    setFromAccount(rule.from_account || '微信零钱');
    setToAccount(rule.to_account || '招商银行');
    setFrequency(rule.frequency);
    setInterval(rule.interval || 1);
    setDayOfMonth(rule.day_of_month || 1);
    setDayOfWeek(rule.day_of_week || 1);
    setMonthOfYear(rule.month_of_year || 1);
    setStartDate(rule.start_date ? rule.start_date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEndDate(rule.end_date ? rule.end_date.slice(0, 10) : '');
    setRemark(rule.remark || '');
    setAutoRecord(rule.auto_record);
    setActiveTab('create');
  };

  // 提交保存规则
  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setMessage({ text: '请输入周期规则名称', type: 'error' });
      return;
    }

    const cents = toCents(amountStr);
    if (isNaN(cents) || cents < 1) {
      setMessage({ text: '请输入有效的金额 (大于 0)', type: 'error' });
      return;
    }

    const defaultLed = ledgers.find((l) => l.is_default === 1) || ledgers[0];
    const targetLedgerId = selectedLedgerId || defaultLed?.ledger_id || 'default_ledger';

    try {
      if (editingRuleId) {
        await updateRecurringRule(editingRuleId, {
          name: trimmedName,
          type,
          amount: cents,
          ledger_id: targetLedgerId,
          category_id: selectedCategoryId || null,
          from_account: fromAccount || null,
          to_account: toAccount || null,
          remark: remark.trim() || null,
          frequency,
          interval,
          day_of_month: frequency === 'monthly' || frequency === 'yearly' ? dayOfMonth : null,
          day_of_week: frequency === 'weekly' ? dayOfWeek : null,
          month_of_year: frequency === 'yearly' ? monthOfYear : null,
          start_date: startDate,
          end_date: endDate.trim() ? endDate.trim() : null,
          auto_record: autoRecord,
        });
        setMessage({ text: '周期规则更新成功', type: 'success' });
      } else {
        await createRecurringRule({
          name: trimmedName,
          type,
          amount: cents,
          ledger_id: targetLedgerId,
          category_id: selectedCategoryId || null,
          from_account: fromAccount || null,
          to_account: toAccount || null,
          remark: remark.trim() || null,
          frequency,
          interval,
          day_of_month: frequency === 'monthly' || frequency === 'yearly' ? dayOfMonth : null,
          day_of_week: frequency === 'weekly' ? dayOfWeek : null,
          month_of_year: frequency === 'yearly' ? monthOfYear : null,
          start_date: startDate,
          end_date: endDate.trim() ? endDate.trim() : null,
          status: 'active',
          auto_record: autoRecord,
        });
        setMessage({ text: '周期规则创建成功！', type: 'success' });
      }

      await loadRules();
      if (onRulesChanged) onRulesChanged();

      setTimeout(() => {
        setActiveTab('list');
        resetForm();
      }, 800);
    } catch (err: any) {
      setMessage({ text: err.message || '保存周期规则失败', type: 'error' });
    }
  };

  // 切换规则状态 (active / paused)
  const handleToggleStatus = async (rule: RecurringRule) => {
    const newStatus = rule.status === 'active' ? 'paused' : 'active';
    try {
      await updateRecurringRule(rule.rule_id, { status: newStatus });
      await loadRules();
      if (onRulesChanged) onRulesChanged();
    } catch (err) {
      console.error('Failed to toggle recurring status:', err);
    }
  };

  // 删除规则
  const handleDeleteRule = async (ruleId: string) => {
    if (!window.confirm('确定要删除该周期记账规则吗？已生成的历史账单不受影响。')) return;
    try {
      await deleteRecurringRule(ruleId);
      await loadRules();
      if (onRulesChanged) onRulesChanged();
    } catch (err) {
      console.error('Failed to delete recurring rule:', err);
    }
  };

  // 立即触发执行
  const handleExecuteNow = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await recurringEngine.processDueRules(true);
      if (result.createdTransactions.length > 0) {
        setMessage({
          text: `成功执行！已自动生成 ${result.createdTransactions.length} 笔账单流水`,
          type: 'success',
        });
      } else {
        setMessage({ text: '当前暂无到期的周期规则需要执行', type: 'success' });
      }
      await loadRules();
      if (onTriggerAutoProcess) await onTriggerAutoProcess();
    } catch (err: any) {
      setMessage({ text: err.message || '执行周期记账失败', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  // 分类字典与账本字典
  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>();
    for (const c of categories) map.set(c.category_id, c);
    return map;
  }, [categories]);

  const ledgerMap = useMemo(() => {
    const map = new Map<string, Ledger>();
    for (const l of ledgers) map.set(l.ledger_id, l);
    return map;
  }, [ledgers]);

  // 适用的分类列表
  const filteredCategories = useMemo(() => {
    return categories.filter((c) => c.type === type);
  }, [categories, type]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[90vh] bg-white dark:bg-neutral-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-neutral-700 flex flex-col overflow-hidden animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部标题栏 */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-neutral-700/80 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-2xs">
              <Repeat className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                <span>周期记账管理</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-300 font-medium">
                  自动记录
                </span>
              </h3>
              <p className="text-[10px] text-gray-400">设定固定周期，到达设定条件后自动记录</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab 导航切换 */}
        <div className="px-4 pt-3 pb-1 border-b border-gray-100 dark:border-neutral-700/80 flex items-center justify-between shrink-0 bg-gray-50/50 dark:bg-neutral-850/40">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('list');
                setEditingRuleId(null);
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all ${
                activeTab === 'list'
                  ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-300 shadow-2xs'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-800'
              }`}
            >
              全部规则 ({rules.length})
            </button>
            <button
              type="button"
              onClick={() => {
                resetForm();
                setActiveTab('create');
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all flex items-center gap-1 ${
                activeTab === 'create'
                  ? 'bg-white dark:bg-neutral-700 text-indigo-600 dark:text-indigo-300 shadow-2xs'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-800'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{editingRuleId ? '编辑规则' : '新增规则'}</span>
            </button>
          </div>

          {activeTab === 'list' && rules.length > 0 && (
            <button
              type="button"
              onClick={handleExecuteNow}
              disabled={loading}
              className="px-2.5 py-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 rounded-lg transition-colors flex items-center gap-1 active:scale-95"
            >
              <Play className="w-3 h-3" />
              <span>立即检查执行</span>
            </button>
          )}
        </div>

        {/* 提示条 */}
        {message && (
          <div
            className={`mx-4 mt-3 p-2.5 rounded-xl border flex items-center gap-2 text-xs animate-in fade-in duration-150 ${
              message.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/50 text-emerald-600 dark:text-emerald-400'
                : 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800/50 text-red-600 dark:text-red-400'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* 主体滚动区 */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          {activeTab === 'list' ? (
            /* 规则列表视图 */
            rules.length === 0 ? (
              <div className="py-8 flex flex-col items-center justify-center text-center gap-3 text-gray-400">
                <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-neutral-700/60 flex items-center justify-center text-gray-400">
                  <Repeat className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">暂无周期记账规则</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    添加房租、发薪日、会员订阅等固定开销，系统到期将自动为您记录
                  </p>
                </div>

                {/* 快捷预置模板卡片 */}
                <div className="w-full mt-2 pt-3 border-t border-gray-100 dark:border-neutral-700/60">
                  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 block mb-2 text-left">
                    ⚡ 常用模板一键创建：
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-left">
                    {PRESET_RECURRING_TEMPLATES.map((tmpl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleApplyPreset(tmpl)}
                        className="p-2.5 rounded-xl bg-gray-50 dark:bg-neutral-750 border border-gray-100 dark:border-neutral-700/80 hover:border-indigo-300 dark:hover:border-indigo-700 flex flex-col gap-0.5 transition-all text-left group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-800 dark:text-gray-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                            {tmpl.name}
                          </span>
                          <span className="text-[10px] text-indigo-500 font-medium">
                            {tmpl.frequency === 'monthly' ? `每月${tmpl.day_of_month}号` : '每年'}
                          </span>
                        </div>
                        <span className="text-[10px] text-gray-400">
                          {formatMoney(tmpl.suggestedAmount)} · {tmpl.type === 'expense' ? '支出' : '收入'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2.5">
                {rules.map((rule) => {
                  const catMeta = getCategoryMeta(rule.category_id, categories, rule.type);
                  const led = ledgerMap.get(rule.ledger_id);
                  const isPaused = rule.status === 'paused';

                  return (
                    <div
                      key={rule.rule_id}
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isPaused
                          ? 'bg-gray-50/60 dark:bg-neutral-800/40 border-gray-200 dark:border-neutral-700/50 opacity-70'
                          : 'bg-white dark:bg-neutral-800 border-gray-100 dark:border-neutral-700/80 shadow-2xs hover:border-indigo-200 dark:hover:border-indigo-900/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm shadow-2xs ${
                              isPaused
                                ? 'bg-gray-200 text-gray-400 dark:bg-neutral-700 dark:text-gray-500'
                                : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400'
                            }`}
                          >
                            <CategoryIcon icon={catMeta.icon} color={isPaused ? undefined : catMeta.color} />
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="font-bold text-xs text-gray-900 dark:text-white truncate">
                                {rule.name}
                              </h4>
                              <span
                                className={`text-[9px] px-1.5 py-0.5 rounded-md font-semibold ${
                                  rule.type === 'expense'
                                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                                    : rule.type === 'income'
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400'
                                }`}
                              >
                                {formatFrequencyLabel(rule)}
                              </span>
                              {led && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-gray-100 dark:bg-neutral-700 text-gray-500 dark:text-gray-400">
                                  {led.name}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
                              <span className="flex items-center gap-0.5">
                                <Clock className="w-3 h-3 text-indigo-400" />
                                <span>下次: {rule.next_run_date}</span>
                              </span>
                              {rule.last_run_date && <span>上次已记: {rule.last_run_date}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`font-mono font-bold text-xs block ${
                              rule.type === 'expense'
                                ? 'text-rose-600 dark:text-rose-400'
                                : rule.type === 'income'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : 'text-blue-600 dark:text-blue-400'
                            }`}
                          >
                            {rule.type === 'expense' ? '-' : '+'}
                            {formatMoney(rule.amount)}
                          </span>

                          <div className="flex items-center justify-end gap-1 mt-1">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(rule)}
                              title={isPaused ? '恢复启用' : '暂停规则'}
                              className={`p-1 rounded-lg transition-colors text-[10px] flex items-center gap-0.5 px-1.5 ${
                                isPaused
                                  ? 'bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 hover:bg-amber-100'
                                  : 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100'
                              }`}
                            >
                              {isPaused ? <Play className="w-2.5 h-2.5" /> : <Pause className="w-2.5 h-2.5" />}
                              <span>{isPaused ? '已暂停' : '生效中'}</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleEditRule(rule)}
                              title="编辑"
                              className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteRule(rule.rule_id)}
                              title="删除"
                              className="p-1 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            /* 新增 / 编辑 表单视图 */
            <form onSubmit={handleSaveRule} className="flex flex-col gap-3">
              {/* 类型选择 */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                  账单类型
                </label>
                <div className="grid grid-cols-3 gap-1.5 bg-gray-100 dark:bg-neutral-900 p-1 rounded-xl">
                  {(['expense', 'income', 'transfer'] as TransactionType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      className={`py-1.5 text-xs font-semibold rounded-lg transition-all ${
                        type === t
                          ? 'bg-white dark:bg-neutral-700 text-gray-900 dark:text-white shadow-2xs'
                          : 'text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {t === 'expense' ? '支出' : t === 'income' ? '收入' : '转账'}
                    </button>
                  ))}
                </div>
              </div>

              {/* 规则名称与金额 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                    规则名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="如：每月房租、发薪日、宽带费"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-indigo-300 dark:focus:border-indigo-600 focus:outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                    每期金额 (元) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-indigo-300 dark:focus:border-indigo-600 focus:outline-none transition-all font-mono"
                  />
                </div>
              </div>

              {/* 周期频率与触发日期 */}
              <div className="p-3 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-semibold text-indigo-900 dark:text-indigo-300 flex items-center gap-1">
                    <Repeat className="w-3.5 h-3.5" />
                    <span>周期设定</span>
                  </label>
                </div>

                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'daily', label: '每天' },
                    { id: 'weekly', label: '每周' },
                    { id: 'monthly', label: '每月' },
                    { id: 'yearly', label: '每年' },
                  ].map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFrequency(f.id as RecurringFrequency)}
                      className={`py-1.5 text-xs font-medium rounded-xl transition-all ${
                        frequency === f.id
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-white dark:bg-neutral-800 text-gray-600 dark:text-gray-300 hover:bg-indigo-50'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                {/* 每周对应星期几 */}
                {frequency === 'weekly' && (
                  <div>
                    <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-1">
                      执行日：每周几
                    </label>
                    <div className="grid grid-cols-7 gap-1">
                      {['一', '二', '三', '四', '五', '六', '日'].map((w, idx) => {
                        const dayNum = idx + 1;
                        return (
                          <button
                            key={dayNum}
                            type="button"
                            onClick={() => setDayOfWeek(dayNum)}
                            className={`py-1 text-xs rounded-lg font-medium transition-all ${
                              dayOfWeek === dayNum
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white dark:bg-neutral-800 text-gray-600 dark:text-gray-300'
                            }`}
                          >
                            周{w}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 每月对应几号 */}
                {frequency === 'monthly' && (
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-gray-600 dark:text-gray-300 shrink-0">
                      执行日：每月
                    </label>
                    <select
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(parseInt(e.target.value))}
                      className="px-3 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-indigo-100 dark:border-indigo-900/50 font-medium focus:outline-none"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {d} 号 {d === 31 ? '(月末自动适配)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 每年对应几月几号 */}
                {frequency === 'yearly' && (
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-gray-600 dark:text-gray-300 shrink-0">
                      每年执行：
                    </label>
                    <select
                      value={monthOfYear}
                      onChange={(e) => setMonthOfYear(parseInt(e.target.value))}
                      className="px-2.5 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-indigo-100 dark:border-indigo-900/50 font-medium"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                        <option key={m} value={m}>
                          {m} 月
                        </option>
                      ))}
                    </select>
                    <select
                      value={dayOfMonth}
                      onChange={(e) => setDayOfMonth(parseInt(e.target.value))}
                      className="px-2.5 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-indigo-100 dark:border-indigo-900/50 font-medium"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>
                          {d} 日
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 开始与结束日期 */}
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">
                      生效起始日
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-indigo-100 dark:border-indigo-900/50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 dark:text-gray-400 mb-0.5">
                      截止日 (选填)
                    </label>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      placeholder="永久生效"
                      className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-white dark:bg-neutral-800 border border-indigo-100 dark:border-indigo-900/50"
                    />
                  </div>
                </div>
              </div>

              {/* 账本与分类选择 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                    归属账本
                  </label>
                  <select
                    value={selectedLedgerId}
                    onChange={(e) => setSelectedLedgerId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-indigo-300 dark:focus:border-indigo-600 focus:outline-none"
                  >
                    {ledgers.map((l) => (
                      <option key={l.ledger_id} value={l.ledger_id}>
                        {l.name} ({l.currency})
                      </option>
                    ))}
                  </select>
                </div>

                {type !== 'transfer' && (
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                      账单分类
                    </label>
                    <select
                      value={selectedCategoryId}
                      onChange={(e) => setSelectedCategoryId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-indigo-300 dark:focus:border-indigo-600 focus:outline-none"
                    >
                      {filteredCategories.map((c) => (
                        <option key={c.category_id} value={c.category_id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 账户选择 */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                    {type === 'transfer' ? '转出账户' : type === 'income' ? '收款账户' : '付款账户'}
                  </label>
                  <input
                    type="text"
                    value={fromAccount}
                    onChange={(e) => setFromAccount(e.target.value)}
                    placeholder="如：微信零钱、招商银行"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-indigo-300 dark:focus:border-indigo-600 focus:outline-none"
                  />
                </div>

                {type === 'transfer' && (
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                      转入账户
                    </label>
                    <input
                      type="text"
                      value={toAccount}
                      onChange={(e) => setToAccount(e.target.value)}
                      placeholder="如：招商银行"
                      className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-indigo-300 dark:focus:border-indigo-600 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* 备注 */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                  备注说明 (选填)
                </label>
                <input
                  type="text"
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="如：房东张阿姨招行转账"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-indigo-300 dark:focus:border-indigo-600 focus:outline-none"
                />
              </div>

              {/* 按钮操作 */}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('list');
                    resetForm();
                  }}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-2 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{editingRuleId ? '保存修改' : '创建周期规则'}</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default RecurringManagementModal;
