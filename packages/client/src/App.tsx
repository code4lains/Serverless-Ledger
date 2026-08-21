import React, { useState, useEffect } from 'react';
import {
  Wallet,
  PlusCircle,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Moon,
  Sun,
  CheckCircle2,
  Clock,
  Cloud,
  CloudOff,
  Database,
  Smartphone,
  Monitor,
  Globe,
  Layers,
  Utensils,
  Car,
  ShoppingBag,
  Film,
  Coffee,
  UtensilsCrossed,
  Briefcase,
  Gift,
  HelpCircle,
} from 'lucide-react';
import { Transaction, Category, TransactionType, formatMoney, toCents } from '@ledger/shared';
import { localDb, seedLocalCategories } from './db';
import { checkServerHealth, getCategories, createTransaction, syncPendingTransactions } from './api/client';

export function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  const [activeTab, setActiveTab] = useState<TransactionType>('expense');
  const [amountStr, setAmountStr] = useState<string>('');
  const [remark, setRemark] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [serverStatus, setServerStatus] = useState<{ ok: boolean; data?: any }>({ ok: false });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);

  // 初始化主题
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // 加载数据与初始化
  const loadLocalData = async () => {
    const list = await localDb.transactions.orderBy('transaction_date').reverse().toArray();
    setTransactions(list);
    const pending = await localDb.transactions.where('sync_status').equals('pending').count();
    setPendingCount(pending);
  };

  useEffect(() => {
    const init = async () => {
      await seedLocalCategories();
      const cats = await getCategories();
      setCategories(cats);
      if (cats.length > 0) {
        const defaultCat = cats.find((c) => c.type === 'expense');
        if (defaultCat) setSelectedCategory(defaultCat.category_id);
      }
      await loadLocalData();

      // 检查后端 CF Workers + D1 连通性
      const health = await checkServerHealth();
      setServerStatus(health);
    };

    init();
  }, []);

  // 提交记账 (3秒快速记账)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amountStr || parseFloat(amountStr) <= 0) return;

    const amountInCents = toCents(amountStr);
    const txId = `tx_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    await createTransaction({
      transaction_id: txId,
      user_id: 'default_user',
      ledger_id: 'default_ledger',
      type: activeTab,
      amount: amountInCents,
      category_id: selectedCategory || null,
      transaction_date: new Date().toISOString(),
      remark: remark.trim() || null,
    });

    setAmountStr('');
    setRemark('');
    await loadLocalData();
  };

  // 手动触发同步
  const handleSync = async () => {
    setIsSyncing(true);
    await syncPendingTransactions();
    const health = await checkServerHealth();
    setServerStatus(health);
    await loadLocalData();
    setIsSyncing(false);
  };

  // 计算本月支出/收入总额 (单位: 分)
  const totalExpense = transactions
    .filter((t) => t.type === 'expense')
    .reduce((acc, cur) => acc + cur.amount, 0);

  const totalIncome = transactions
    .filter((t) => t.type === 'income')
    .reduce((acc, cur) => acc + cur.amount, 0);

  // 渲染图标
  const renderCategoryIcon = (iconName?: string) => {
    const props = { className: 'w-4 h-4' };
    switch (iconName) {
      case 'Utensils':
      case 'Coffee':
      case 'UtensilsCrossed':
        return <Utensils {...props} />;
      case 'Car':
        return <Car {...props} />;
      case 'ShoppingBag':
        return <ShoppingBag {...props} />;
      case 'Film':
        return <Film {...props} />;
      case 'Briefcase':
        return <Briefcase {...props} />;
      case 'Gift':
        return <Gift {...props} />;
      default:
        return <Wallet {...props} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#F7F6F2] dark:bg-[#18191A] text-gray-800 dark:text-gray-100 flex flex-col items-center p-3 sm:p-6 font-sans">
      <div className="w-full max-w-md flex flex-col gap-4">
        {/* 顶部导航与状态栏 */}
        <header className="flex justify-between items-center py-2 px-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 flex items-center justify-center font-bold text-sm shadow-sm">
              ￥
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">极简记账</h1>
              <p className="text-[11px] text-gray-400">Serverless Ledger v1.0</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSync}
              disabled={isSyncing}
              title="同步数据到 Cloudflare D1"
              className="p-2 rounded-xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 hover:bg-gray-50 active:scale-95 transition-all text-gray-600 dark:text-gray-300"
            >
              <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-500' : ''}`} />
            </button>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl bg-white dark:bg-neutral-800 shadow-sm border border-gray-100 dark:border-neutral-700 hover:bg-gray-50 active:scale-95 transition-all text-gray-600 dark:text-gray-300"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-gray-600" />}
            </button>
          </div>
        </header>

        {/* 全栈开发管线连通状态面板 */}
        <div className="bg-white dark:bg-neutral-800/80 rounded-2xl p-3.5 shadow-sm border border-gray-100 dark:border-neutral-700/60 backdrop-blur-sm">
          <div className="flex items-center justify-between text-xs font-medium text-gray-500 dark:text-gray-400 mb-2.5">
            <span className="flex items-center gap-1.5 font-semibold text-gray-700 dark:text-gray-200">
              <Layers className="w-3.5 h-3.5 text-indigo-500" /> 开发管线架构已就绪
            </span>
            <div className="flex items-center gap-1.5">
              <span title="Web PWA"><Globe className="w-3 h-3 text-emerald-500" /></span>
              <span title="Capacitor Mobile"><Smartphone className="w-3 h-3 text-blue-500" /></span>
              <span title="Tauri Desktop"><Monitor className="w-3 h-3 text-purple-500" /></span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="p-2 rounded-xl bg-gray-50 dark:bg-neutral-900/60 flex items-center justify-between">
              <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                <Database className="w-3.5 h-3.5 text-blue-500" /> 本地 Dexie DB
              </span>
              <span className="font-medium text-emerald-600 dark:text-emerald-400">已就绪 ({transactions.length}条)</span>
            </div>
            <div className="p-2 rounded-xl bg-gray-50 dark:bg-neutral-900/60 flex items-center justify-between">
              <span className="flex items-center gap-1 text-gray-600 dark:text-gray-300">
                {serverStatus.ok ? <Cloud className="w-3.5 h-3.5 text-emerald-500" /> : <CloudOff className="w-3.5 h-3.5 text-amber-500" />}
                CF Workers & D1
              </span>
              <span className={`font-medium ${serverStatus.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500'}`}>
                {serverStatus.ok ? '在线' : '离线模式'}
              </span>
            </div>
          </div>

          {pendingCount > 0 && (
            <div className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 px-1">
              <Clock className="w-3 h-3" /> 有 {pendingCount} 笔流水暂存本地，联网后将自动上传
            </div>
          )}
        </div>

        {/* 概览卡片 (收支汇总) */}
        <div className="bg-gradient-to-br from-neutral-800 to-neutral-900 text-white rounded-3xl p-5 shadow-md">
          <div className="text-xs text-neutral-400 mb-1">本月结余 (CNY)</div>
          <div className="text-2xl font-extrabold tracking-tight mb-4">
            {formatMoney(totalIncome - totalExpense)}
          </div>
          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-neutral-700/60 text-xs">
            <div>
              <div className="text-neutral-400 flex items-center gap-1">
                <ArrowDownLeft className="w-3.5 h-3.5 text-[#D08770]" /> 总支出
              </div>
              <div className="text-sm font-semibold mt-0.5 text-[#D08770]">{formatMoney(totalExpense)}</div>
            </div>
            <div>
              <div className="text-neutral-400 flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5 text-[#A3BE8C]" /> 总收入
              </div>
              <div className="text-sm font-semibold mt-0.5 text-[#A3BE8C]">{formatMoney(totalIncome)}</div>
            </div>
          </div>
        </div>

        {/* 3秒极简记账录入区 */}
        <div className="bg-white dark:bg-neutral-800 rounded-3xl p-4 shadow-sm border border-gray-100 dark:border-neutral-700">
          {/* 类型切换 */}
          <div className="flex bg-gray-100 dark:bg-neutral-900 rounded-2xl p-1 mb-4">
            {(['expense', 'income', 'transfer', 'loan'] as TransactionType[]).map((type) => {
              const labels: Record<TransactionType, string> = {
                expense: '支出',
                income: '收入',
                transfer: '转账',
                loan: '借贷',
              };
              const isActive = activeTab === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setActiveTab(type)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-xl transition-all ${
                    isActive
                      ? 'bg-white dark:bg-neutral-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700'
                  }`}
                >
                  {labels[type]}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            {/* 金额输入 */}
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-400">¥</span>
              <input
                type="number"
                step="0.01"
                placeholder="0.00"
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 text-xl font-bold rounded-2xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none transition-all"
                autoFocus
              />
            </div>

            {/* 分类快选 */}
            <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar text-xs">
              {categories
                .filter((c) => c.type === (activeTab === 'income' ? 'income' : 'expense'))
                .map((cat) => {
                  const isSelected = selectedCategory === cat.category_id;
                  return (
                    <button
                      key={cat.category_id}
                      type="button"
                      onClick={() => setSelectedCategory(cat.category_id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl whitespace-nowrap transition-all border ${
                        isSelected
                          ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900 border-gray-800 dark:border-gray-200 shadow-sm'
                          : 'bg-gray-50 dark:bg-neutral-900/80 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-neutral-700'
                      }`}
                    >
                      {renderCategoryIcon(cat.icon)}
                      <span>{cat.name}</span>
                    </button>
                  );
                })}
            </div>

            {/* 备注与提交 */}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="添加备注 (可选)..."
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                className="flex-1 px-3.5 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-transparent focus:border-gray-300 dark:focus:border-neutral-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={!amountStr || parseFloat(amountStr) <= 0}
                className="px-5 py-2 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 font-medium text-xs shadow-sm hover:opacity-90 active:scale-95 disabled:opacity-40 transition-all flex items-center gap-1"
              >
                <PlusCircle className="w-3.5 h-3.5" /> 记一笔
              </button>
            </div>
          </form>
        </div>

        {/* 账单流水列表 */}
        <div className="bg-white dark:bg-neutral-800 rounded-3xl p-4 shadow-sm border border-gray-100 dark:border-neutral-700">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xs font-bold uppercase tracking-wider text-gray-400">最近明细</h2>
            <span className="text-[11px] text-gray-400">共 {transactions.length} 笔</span>
          </div>

          {transactions.length === 0 ? (
            <div className="py-8 text-center text-xs text-gray-400 flex flex-col items-center gap-1.5">
              <HelpCircle className="w-6 h-6 text-gray-300 dark:text-neutral-600" />
              暂无记账数据，试着上方记一笔吧
            </div>
          ) : (
            <div className="flex flex-col divide-y divide-gray-100 dark:divide-neutral-700/60">
              {transactions.map((tx) => {
                const cat = categories.find((c) => c.category_id === tx.category_id);
                const isExpense = tx.type === 'expense';
                return (
                  <div key={tx.transaction_id} className="py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                          isExpense
                            ? 'bg-orange-50 dark:bg-orange-950/40 text-[#D08770]'
                            : 'bg-emerald-50 dark:bg-emerald-950/40 text-[#A3BE8C]'
                        }`}
                      >
                        {renderCategoryIcon(cat?.icon)}
                      </div>
                      <div>
                        <div className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                          {cat?.name || (tx.type === 'expense' ? '支出' : '收入')}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {tx.remark || new Date(tx.transaction_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>

                    <div className="text-right flex items-center gap-2">
                      <div>
                        <div
                          className={`text-xs font-bold ${
                            isExpense ? 'text-gray-900 dark:text-white' : 'text-[#A3BE8C]'
                          }`}
                        >
                          {isExpense ? '-' : '+'}
                          {formatMoney(tx.amount)}
                        </div>
                        <div className="text-[10px] text-gray-400">
                          {new Date(tx.transaction_date).toLocaleDateString()}
                        </div>
                      </div>
                      {tx.sync_status === 'synced' ? (
                        <span title="已同步到 Cloudflare D1"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /></span>
                      ) : (
                        <span title="暂存本地 IndexedDB"><Clock className="w-3.5 h-3.5 text-amber-500" /></span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
