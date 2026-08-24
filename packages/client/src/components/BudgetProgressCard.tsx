import React, { useState } from 'react';
import {
  Target,
  Settings,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Plus,
  TrendingDown,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  BudgetOverview,
  BudgetProgressItem,
  formatMoney,
  getBudgetStatusMeta,
} from '@ledger/shared';
import { CategoryIcon } from './CategoryIcon';

interface BudgetProgressCardProps {
  overview: BudgetOverview;
  currencySymbol: string;
  onOpenBudgetModal: () => void;
  ledgerName?: string;
}

export function BudgetProgressCard({
  overview,
  currencySymbol,
  onOpenBudgetModal,
  ledgerName,
}: BudgetProgressCardProps) {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);

  const { totalBudget, categoryBudgets, hasAnyBudget } = overview;
  const totalStatusMeta = totalBudget ? getBudgetStatusMeta(totalBudget.status) : null;

  // 默认折叠时展示前 3 个大分类预算，展开时展示全部
  const displayedCategoryBudgets = isExpanded
    ? categoryBudgets
    : categoryBudgets.slice(0, 3);

  return (
    <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-neutral-800 shadow-2xs border border-gray-100 dark:border-neutral-700/80 flex flex-col gap-3.5 transition-all">
      {/* 头部标题与操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shadow-2xs">
            <Target className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-xs font-bold text-gray-800 dark:text-gray-100">
                {overview.period === 'monthly' ? '月度预算看板' : '年度预算看板'}
              </h3>
              {ledgerName && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-gray-100 dark:bg-neutral-700 text-gray-500 dark:text-gray-400 font-normal">
                  {ledgerName}
                </span>
              )}
            </div>
            <p className="text-[10px] text-gray-400">
              {hasAnyBudget ? '实时监控支出消耗与预警' : '合理规划收支，告别盲目消费'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {totalBudget && totalStatusMeta && (
            <span
              className={`text-[10px] px-2.5 py-0.8 rounded-full font-semibold flex items-center gap-1 transition-all ${totalStatusMeta.badgeBg} ${totalStatusMeta.badgeText} ${
                totalBudget.status === 'exceeded' || totalBudget.status === 'warning'
                  ? 'animate-subtle-pulse ring-1 ring-amber-500/20'
                  : ''
              }`}
            >
              {totalBudget.status === 'exceeded' ? (
                <AlertCircle className="w-3 h-3 text-red-500" />
              ) : totalBudget.status === 'warning' ? (
                <AlertTriangle className="w-3 h-3 text-amber-500" />
              ) : (
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
              )}
              <span>
                {totalBudget.status === 'exceeded'
                  ? '已超支'
                  : totalBudget.status === 'warning'
                  ? '预警 (≥80%)'
                  : `${Math.round(totalBudget.percentage)}%`}
              </span>
            </span>
          )}

          <button
            type="button"
            onClick={onOpenBudgetModal}
            className="p-1.5 rounded-xl hover:bg-gray-100 dark:hover:bg-neutral-700 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center gap-1 text-[11px] font-medium active:scale-95"
            title="设置预算"
          >
            <Settings className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">设置</span>
          </button>
        </div>
      </div>

      {/* 1. 总预算主进度条展示 */}
      {totalBudget ? (
        <div className="p-3.5 rounded-2xl bg-gray-50/80 dark:bg-neutral-900/60 border border-gray-100/80 dark:border-neutral-800 flex flex-col gap-2.5">
          <div className="flex justify-between items-baseline text-xs">
            <div className="flex items-baseline gap-1.5">
              <span className="text-gray-400 text-[11px]">已用:</span>
              <strong className="text-sm font-bold text-gray-900 dark:text-white">
                {formatMoney(totalBudget.spent_amount, currencySymbol)}
              </strong>
              <span className="text-gray-400 text-[10px]">
                / 预算 {formatMoney(totalBudget.budget_amount, currencySymbol)}
              </span>
            </div>

            <div className="text-right">
              {totalBudget.status === 'exceeded' ? (
                <span className="text-[11px] font-bold text-red-600 dark:text-red-400">
                  超支 {formatMoney(Math.abs(totalBudget.remaining_amount), currencySymbol)}
                </span>
              ) : (
                <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  剩余 <strong className="text-emerald-600 dark:text-emerald-400">{formatMoney(totalBudget.remaining_amount, currencySymbol)}</strong>
                </span>
              )}
            </div>
          </div>

          {/* 莫兰迪动态进度条 */}
          <div className="w-full h-2.5 rounded-full bg-gray-200/80 dark:bg-neutral-700/80 overflow-hidden relative">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out shadow-xs"
              style={{
                width: `${Math.min(Math.max(totalBudget.percentage, 2), 100)}%`,
                backgroundColor: totalStatusMeta?.barColor || '#6366F1',
              }}
            />
          </div>

          {/* 预警文字提示 */}
          {totalBudget.status === 'exceeded' && (
            <div className="text-[10px] text-red-600 dark:text-red-400 flex items-center gap-1 font-medium pt-0.5 animate-in fade-in duration-200">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>本月总支出已超出预算额度，请合理控制开支！</span>
            </div>
          )}
          {totalBudget.status === 'warning' && (
            <div className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium pt-0.5 animate-in fade-in duration-200">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>预算消耗已达到 80% 警戒线，注意消费节奏。</span>
            </div>
          )}
        </div>
      ) : (
        /* 未设置总预算时的空状态引导 */
        <div className="p-3.5 rounded-2xl bg-indigo-50/40 dark:bg-indigo-950/20 border border-dashed border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-indigo-900 dark:text-indigo-200">
            <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
            <span className="text-[11px]">尚未设置本月总预算，快来设定消费目标吧</span>
          </div>
          <button
            type="button"
            onClick={onOpenBudgetModal}
            className="px-3 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs active:scale-95 transition-all shrink-0 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>设置预算</span>
          </button>
        </div>
      )}

      {/* 2. 各大分类预算进度条列表 */}
      {categoryBudgets.length > 0 && (
        <div className="flex flex-col gap-2 pt-1 border-t border-gray-100 dark:border-neutral-700/60">
          <div className="flex justify-between items-center text-[11px] text-gray-400 px-0.5">
            <span className="font-medium flex items-center gap-1">
              <Layers className="w-3 h-3 text-indigo-500" />
              各大分类预算进度 ({categoryBudgets.length})
            </span>
            <button
              type="button"
              onClick={onOpenBudgetModal}
              className="text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              调整分类预算
            </button>
          </div>

          <div className="flex flex-col gap-2.5">
            {displayedCategoryBudgets.map((item) => {
              const catStatusMeta = getBudgetStatusMeta(item.status);
              const barColor = item.status === 'exceeded'
                ? '#EF4444'
                : item.status === 'warning'
                ? '#F59E0B'
                : item.category_color || '#6366F1';

              return (
                <div
                  key={item.category_id || item.category_name}
                  className="flex flex-col gap-1 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CategoryIcon
                        icon={item.category_icon || 'Tag'}
                        color={item.category_color || '#6366F1'}
                        className="w-3.5 h-3.5"
                      />
                      <span className="font-semibold text-gray-800 dark:text-gray-200">
                        {item.category_name}
                      </span>
                      {item.status === 'exceeded' && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-bold animate-subtle-pulse">
                          超支
                        </span>
                      )}
                      {item.status === 'warning' && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-bold animate-subtle-pulse">
                          预警
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="font-semibold text-gray-900 dark:text-white">
                        {formatMoney(item.spent_amount, currencySymbol)}
                      </span>
                      <span className="text-gray-400 text-[10px]">
                        / {formatMoney(item.budget_amount, currencySymbol)}
                      </span>
                      <span className="text-[10px] text-gray-400 w-8 text-right font-medium">
                        {Math.round(item.percentage)}%
                      </span>
                    </div>
                  </div>

                  {/* 大分类子进度条 */}
                  <div className="w-full h-1.5 rounded-full bg-gray-100 dark:bg-neutral-700/80 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${Math.min(Math.max(item.percentage, 2), 100)}%`,
                        backgroundColor: barColor,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* 展开 / 收起更多分类预算 */}
          {categoryBudgets.length > 3 && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="py-1 text-[11px] font-medium text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center justify-center gap-1 pt-1 active:scale-95"
            >
              <span>{isExpanded ? '收起分类预算' : `展开其余 ${categoryBudgets.length - 3} 个分类预算`}</span>
              {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default BudgetProgressCard;
