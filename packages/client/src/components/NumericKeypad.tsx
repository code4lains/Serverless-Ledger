import React from 'react';
import { Delete, Calculator } from 'lucide-react';

interface NumericKeypadProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  onSubmitAndContinue?: () => void;
  onOpenCalculator?: () => void;
  isSubmitting?: boolean;
}

export function NumericKeypad({
  value,
  onChange,
  onSubmit,
  onSubmitAndContinue,
  onOpenCalculator,
  isSubmitting = false,
}: NumericKeypadProps) {
  // 点击数字
  const handleDigit = (digit: string) => {
    if (!value || value === '0') {
      if (digit === '0') {
        onChange('0');
      } else {
        onChange(digit);
      }
      return;
    }

    // 检查小数位数
    if (value.includes('.')) {
      const parts = value.split('.');
      if (parts[1] && parts[1].length >= 2) {
        return; // 最多 2 位小数
      }
    } else {
      // 限制整数部分最大长度
      if (value.length >= 9) {
        return;
      }
    }

    onChange(value + digit);
  };

  // 点击小数点
  const handleDot = () => {
    if (value.includes('.')) return;
    if (!value) {
      onChange('0.');
    } else {
      onChange(value + '.');
    }
  };

  // 点击退格删除
  const handleBackspace = () => {
    if (!value || value.length <= 1) {
      onChange('');
    } else {
      onChange(value.slice(0, -1));
    }
  };

  return (
    <div className="w-full select-none bg-slate-50/70 dark:bg-slate-900/60 rounded-2xl p-1 sm:p-1.5 border border-slate-100 dark:border-slate-800/80 shadow-inner flex flex-col justify-center h-full">
      <div className="grid grid-cols-4 gap-1 sm:gap-1.5 h-56 sm:h-64 md:h-[290px]">
        {/* Row 1: 1, 2, 3, ⌫ */}
        <button
          type="button"
          onClick={() => handleDigit('1')}
          className="rounded-xl sm:rounded-2xl bg-white dark:bg-slate-800 text-xl sm:text-2xl font-semibold text-slate-800 dark:text-slate-100 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          1
        </button>
        <button
          type="button"
          onClick={() => handleDigit('2')}
          className="rounded-xl sm:rounded-2xl bg-white dark:bg-slate-800 text-xl sm:text-2xl font-semibold text-slate-800 dark:text-slate-100 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          2
        </button>
        <button
          type="button"
          onClick={() => handleDigit('3')}
          className="rounded-xl sm:rounded-2xl bg-white dark:bg-slate-800 text-xl sm:text-2xl font-semibold text-slate-800 dark:text-slate-100 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          3
        </button>
        <button
          type="button"
          onClick={handleBackspace}
          className="rounded-xl sm:rounded-2xl bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          title="删除"
        >
          <Delete className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>

        {/* Row 2: 4, 5, 6, 保存再记 */}
        <button
          type="button"
          onClick={() => handleDigit('4')}
          className="rounded-xl sm:rounded-2xl bg-white dark:bg-slate-800 text-xl sm:text-2xl font-semibold text-slate-800 dark:text-slate-100 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          4
        </button>
        <button
          type="button"
          onClick={() => handleDigit('5')}
          className="rounded-xl sm:rounded-2xl bg-white dark:bg-slate-800 text-xl sm:text-2xl font-semibold text-slate-800 dark:text-slate-100 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          5
        </button>
        <button
          type="button"
          onClick={() => handleDigit('6')}
          className="rounded-xl sm:rounded-2xl bg-white dark:bg-slate-800 text-xl sm:text-2xl font-semibold text-slate-800 dark:text-slate-100 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          6
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onSubmitAndContinue}
          className="rounded-xl sm:rounded-2xl bg-slate-100 dark:bg-slate-800/80 text-[11px] sm:text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center p-0.5 text-center cursor-pointer"
        >
          保存再记
        </button>

        {/* Row 3: 7, 8, 9, 保存 (跨两行) */}
        <button
          type="button"
          onClick={() => handleDigit('7')}
          className="rounded-xl sm:rounded-2xl bg-white dark:bg-slate-800 text-xl sm:text-2xl font-semibold text-slate-800 dark:text-slate-100 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          7
        </button>
        <button
          type="button"
          onClick={() => handleDigit('8')}
          className="rounded-xl sm:rounded-2xl bg-white dark:bg-slate-800 text-xl sm:text-2xl font-semibold text-slate-800 dark:text-slate-100 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          8
        </button>
        <button
          type="button"
          onClick={() => handleDigit('9')}
          className="rounded-xl sm:rounded-2xl bg-white dark:bg-slate-800 text-xl sm:text-2xl font-semibold text-slate-800 dark:text-slate-100 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          9
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onSubmit}
          className="row-span-2 rounded-xl sm:rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm sm:text-lg shadow-md shadow-blue-600/25 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          {isSubmitting ? '保存中' : '保存'}
        </button>

        {/* Row 4: 🧮, 0, . */}
        <button
          type="button"
          onClick={onOpenCalculator}
          className="rounded-xl sm:rounded-2xl bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
          title="打开计算器"
        >
          <Calculator className="w-5 h-5 sm:w-6 sm:h-6" />
        </button>
        <button
          type="button"
          onClick={() => handleDigit('0')}
          className="rounded-xl sm:rounded-2xl bg-white dark:bg-slate-800 text-xl sm:text-2xl font-semibold text-slate-800 dark:text-slate-100 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          0
        </button>
        <button
          type="button"
          onClick={handleDot}
          className="rounded-xl sm:rounded-2xl bg-white dark:bg-slate-800 text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 shadow-xs hover:bg-slate-100 dark:hover:bg-slate-700 active:scale-95 transition-all flex items-center justify-center cursor-pointer"
        >
          .
        </button>
      </div>
    </div>
  );
}
