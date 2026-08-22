import React from 'react';
import { ArrowRightLeft, ArrowDown, Wallet, User } from 'lucide-react';

interface AccountPickerProps {
  fromAccount: string;
  toAccount: string;
  onChangeFrom: (val: string) => void;
  onChangeTo: (val: string) => void;
  fromLabel?: string;
  toLabel?: string;
  fromPlaceholder?: string;
  toPlaceholder?: string;
  fromPresets?: string[];
  toPresets?: string[];
  showSwap?: boolean;
}

const DEFAULT_ACCOUNT_PRESETS = [
  '微信零钱',
  '支付宝',
  '招商银行',
  '工商银行',
  '建设银行',
  '现金',
  '信用卡',
  '余额宝',
  '零钱通',
];

export function AccountPicker({
  fromAccount,
  toAccount,
  onChangeFrom,
  onChangeTo,
  fromLabel = '转出账户',
  toLabel = '转入账户',
  fromPlaceholder = '例如：微信零钱',
  toPlaceholder = '例如：招商银行',
  fromPresets = DEFAULT_ACCOUNT_PRESETS,
  toPresets = DEFAULT_ACCOUNT_PRESETS,
  showSwap = true,
}: AccountPickerProps) {
  // 一键互换转出与转入账户
  const handleSwap = () => {
    const temp = fromAccount;
    onChangeFrom(toAccount);
    onChangeTo(temp);
  };

  return (
    <div className="flex flex-col gap-2.5 bg-gray-50/80 dark:bg-neutral-900/60 p-3 rounded-2xl border border-gray-100 dark:border-neutral-700/60">
      {/* 顶部或行内：转出账户与转入账户 */}
      <div className="flex items-center gap-2">
        {/* 转出账户 / 来源 */}
        <div className="flex-1 flex flex-col gap-1">
          <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
            <span>{fromLabel}</span>
          </div>
          <input
            type="text"
            placeholder={fromPlaceholder}
            value={fromAccount}
            onChange={(e) => onChangeFrom(e.target.value)}
            className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 focus:border-gray-400 dark:focus:border-neutral-500 focus:outline-none transition-all shadow-2xs"
          />
        </div>

        {/* 交换按钮 */}
        {showSwap && (
          <div className="flex items-center justify-center pt-4">
            <button
              type="button"
              onClick={handleSwap}
              title="交换转出与转入账户"
              className="p-2 rounded-xl bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-700 hover:scale-105 active:scale-95 transition-all shadow-2xs"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 转入账户 / 目标 */}
        <div className="flex-1 flex flex-col gap-1">
          <div className="text-[11px] font-medium text-gray-500 dark:text-gray-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>{toLabel}</span>
          </div>
          <input
            type="text"
            placeholder={toPlaceholder}
            value={toAccount}
            onChange={(e) => onChangeTo(e.target.value)}
            className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 focus:border-gray-400 dark:focus:border-neutral-500 focus:outline-none transition-all shadow-2xs"
          />
        </div>
      </div>

      {/* 快捷账户选择 Chips */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-gray-100 dark:border-neutral-800/80">
        {/* 来源快捷建议 */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar text-[10px]">
          <span className="text-gray-400 shrink-0 font-medium px-1">来源快捷:</span>
          {fromPresets.slice(0, 6).map((item) => (
            <button
              key={`from_${item}`}
              type="button"
              onClick={() => onChangeFrom(item)}
              className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors ${
                fromAccount === item
                  ? 'bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 font-medium'
                  : 'bg-white dark:bg-neutral-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-700'
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {/* 去向快捷建议 */}
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar text-[10px]">
          <span className="text-gray-400 shrink-0 font-medium px-1">去向快捷:</span>
          {toPresets.slice(0, 6).map((item) => (
            <button
              key={`to_${item}`}
              type="button"
              onClick={() => onChangeTo(item)}
              className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors ${
                toAccount === item
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-medium'
                  : 'bg-white dark:bg-neutral-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-700'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
