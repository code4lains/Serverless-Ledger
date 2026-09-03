import React, { useState, useEffect } from 'react';
import { Delete, X } from 'lucide-react';

interface CalculatorModalProps {
  isOpen: boolean;
  initialValue?: string;
  onClose: () => void;
  onConfirm: (calculatedAmount: string) => void;
}

export function CalculatorModal({
  isOpen,
  initialValue = '',
  onClose,
  onConfirm,
}: CalculatorModalProps) {
  const [currentNum, setCurrentNum] = useState<string>('0');
  const [tokens, setTokens] = useState<string[]>([]);
  const [expressionPreview, setExpressionPreview] = useState<string>('');
  const [isCalculated, setIsCalculated] = useState<boolean>(false);

  // 初始化重置
  useEffect(() => {
    if (isOpen) {
      const cleanInit = initialValue ? String(initialValue).trim() : '0';
      setCurrentNum(cleanInit || '0');
      setTokens([]);
      setExpressionPreview('');
      setIsCalculated(false);
    }
  }, [isOpen, initialValue]);

  // 辅助安全求值
  const evaluateTokens = (tokenList: string[], lastNum: string): number => {
    const allTokens = [...tokenList];
    if (lastNum !== '') {
      allTokens.push(lastNum);
    }

    if (allTokens.length === 0) return 0;

    // 先做乘除
    const pass1: (number | string)[] = [];
    let i = 0;
    while (i < allTokens.length) {
      const token = allTokens[i];
      if (token === '×' || token === '÷') {
        const prev = Number(pass1.pop()) || 0;
        const next = Number(allTokens[i + 1]) || 0;
        if (token === '×') {
          pass1.push(prev * next);
        } else {
          pass1.push(next === 0 ? 0 : prev / next);
        }
        i += 2;
      } else {
        const num = Number(token);
        pass1.push(isNaN(num) ? token : num);
        i += 1;
      }
    }

    // 后做加减
    let result = typeof pass1[0] === 'number' ? pass1[0] : 0;
    let j = 1;
    while (j < pass1.length) {
      const op = pass1[j];
      const nextVal = Number(pass1[j + 1]) || 0;
      if (op === '+') {
        result += nextVal;
      } else if (op === '-') {
        result -= nextVal;
      }
      j += 2;
    }

    return Math.max(0, result);
  };

  // 数字输入
  const handleDigit = (d: string) => {
    if (isCalculated) {
      setCurrentNum(d);
      setTokens([]);
      setExpressionPreview('');
      setIsCalculated(false);
      return;
    }

    if (currentNum === '0') {
      setCurrentNum(d);
      return;
    }

    if (currentNum.includes('.')) {
      const parts = currentNum.split('.');
      if (parts[1] && parts[1].length >= 2) return;
    } else {
      if (currentNum.length >= 9) return;
    }

    setCurrentNum(currentNum + d);
  };

  // 小数点
  const handleDot = () => {
    if (isCalculated) {
      setCurrentNum('0.');
      setTokens([]);
      setExpressionPreview('');
      setIsCalculated(false);
      return;
    }

    if (currentNum.includes('.')) return;
    if (!currentNum) {
      setCurrentNum('0.');
    } else {
      setCurrentNum(currentNum + '.');
    }
  };

  // 运算符 (+, -, ×, ÷)
  const handleOperator = (op: '+' | '-' | '×' | '÷') => {
    setIsCalculated(false);
    if (currentNum !== '') {
      const newTokens = [...tokens, currentNum, op];
      setTokens(newTokens);
      setExpressionPreview(newTokens.join(' '));
      setCurrentNum('');
    } else if (tokens.length > 0) {
      // 替换最后一个操作符
      const newTokens = [...tokens];
      newTokens[newTokens.length - 1] = op;
      setTokens(newTokens);
      setExpressionPreview(newTokens.join(' '));
    }
  };

  // 等号求值
  const handleEquals = () => {
    if (tokens.length === 0 && currentNum === '') return;

    const numToUse = currentNum === '' ? (tokens[tokens.length - 2] || '0') : currentNum;
    const fullExpr = `${tokens.join(' ')} ${numToUse} =`;
    const res = evaluateTokens(tokens, numToUse);
    const formattedRes = parseFloat(res.toFixed(2)).toString();

    setExpressionPreview(fullExpr);
    setCurrentNum(formattedRes);
    setTokens([]);
    setIsCalculated(true);
  };

  // 退格
  const handleBackspace = () => {
    if (isCalculated) {
      handleClear();
      return;
    }

    if (currentNum.length > 1) {
      setCurrentNum(currentNum.slice(0, -1));
    } else if (currentNum.length === 1) {
      setCurrentNum('0');
    } else if (tokens.length > 0) {
      // 回退运算符
      const newTokens = [...tokens];
      newTokens.pop(); // pop operator
      const lastNum = newTokens.pop() || '0';
      setTokens(newTokens);
      setCurrentNum(lastNum);
      setExpressionPreview(newTokens.join(' '));
    }
  };

  // 清空
  const handleClear = () => {
    setCurrentNum('0');
    setTokens([]);
    setExpressionPreview('');
    setIsCalculated(false);
  };

  // 确定
  const handleConfirm = () => {
    let finalAmount = currentNum;
    if (tokens.length > 0) {
      const numToUse = currentNum === '' ? (tokens[tokens.length - 2] || '0') : currentNum;
      const res = evaluateTokens(tokens, numToUse);
      finalAmount = parseFloat(res.toFixed(2)).toString();
    }
    onConfirm(finalAmount);
    onClose();
  };

  // 实体键盘输入监听支持 (0-9, ., +, -, *, /, =, Enter, Backspace, Esc, C)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA') {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === '.') {
        e.preventDefault();
        handleDot();
      } else if (e.key === '+') {
        e.preventDefault();
        handleOperator('+');
      } else if (e.key === '-') {
        e.preventDefault();
        handleOperator('-');
      } else if (e.key === '*' || e.key === 'x' || e.key === 'X') {
        e.preventDefault();
        handleOperator('×');
      } else if (e.key === '/') {
        e.preventDefault();
        handleOperator('÷');
      } else if (e.key === '=' || (e.key === 'Enter' && tokens.length > 0 && !isCalculated)) {
        e.preventDefault();
        handleEquals();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleConfirm();
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentNum, tokens, isCalculated, initialValue]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-fade-in">
      <div
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden animate-slide-up flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 顶部简易标题与关闭按键 */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2">
          <span className="text-xs font-bold text-slate-400">简易计算器</span>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 算式与结果显示屏 (参考 Image 2) */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/40 text-right flex flex-col justify-end min-h-[90px] border-b border-slate-100 dark:border-slate-800/80">
          <div className="text-xs text-slate-400 font-mono tracking-wider truncate h-5">
            {expressionPreview || '\u00A0'}
          </div>
          <div className="text-3xl sm:text-4xl font-black text-slate-800 dark:text-slate-100 font-mono tracking-tight mt-1 truncate">
            {currentNum || '0'}
          </div>
        </div>

        {/* 键盘区域 (4列 x 5行，参考 Image 2) */}
        <div className="p-4 grid grid-cols-4 gap-2 bg-slate-100/60 dark:bg-slate-950 select-none">
          {/* Row 1: C, ⌫, ÷, × */}
          <button
            type="button"
            onClick={handleClear}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold text-xl hover:bg-blue-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            C
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold text-xl hover:bg-blue-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            <Delete className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => handleOperator('÷')}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold text-2xl hover:bg-blue-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            ÷
          </button>
          <button
            type="button"
            onClick={() => handleOperator('×')}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold text-2xl hover:bg-blue-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            ×
          </button>

          {/* Row 2: 1, 2, 3, + */}
          <button
            type="button"
            onClick={() => handleDigit('1')}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            1
          </button>
          <button
            type="button"
            onClick={() => handleDigit('2')}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            2
          </button>
          <button
            type="button"
            onClick={() => handleDigit('3')}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            3
          </button>
          <button
            type="button"
            onClick={() => handleOperator('+')}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold text-2xl hover:bg-blue-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            +
          </button>

          {/* Row 3: 4, 5, 6, - */}
          <button
            type="button"
            onClick={() => handleDigit('4')}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            4
          </button>
          <button
            type="button"
            onClick={() => handleDigit('5')}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            5
          </button>
          <button
            type="button"
            onClick={() => handleDigit('6')}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            6
          </button>
          <button
            type="button"
            onClick={() => handleOperator('-')}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold text-2xl hover:bg-blue-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            -
          </button>

          {/* Row 4: 7, 8, 9, = */}
          <button
            type="button"
            onClick={() => handleDigit('7')}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            7
          </button>
          <button
            type="button"
            onClick={() => handleDigit('8')}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            8
          </button>
          <button
            type="button"
            onClick={() => handleDigit('9')}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            9
          </button>
          <button
            type="button"
            onClick={handleEquals}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 font-bold text-2xl hover:bg-blue-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            =
          </button>

          {/* Row 5: 关闭, 0, ., 确定 */}
          <button
            type="button"
            onClick={onClose}
            className="h-13 sm:h-14 rounded-2xl bg-slate-200/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-sm hover:bg-slate-300 dark:hover:bg-slate-700 active:scale-95 transition flex items-center justify-center cursor-pointer"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-semibold text-xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleDot}
            className="h-13 sm:h-14 rounded-2xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold text-2xl hover:bg-slate-50 dark:hover:bg-slate-700 active:scale-95 transition shadow-xs flex items-center justify-center cursor-pointer"
          >
            .
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="h-13 sm:h-14 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-base shadow-lg shadow-blue-600/30 active:scale-95 transition flex items-center justify-center cursor-pointer"
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
