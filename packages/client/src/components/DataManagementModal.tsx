import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Download,
  Upload,
  FileSpreadsheet,
  FileJson,
  FileText,
  CheckCircle2,
  AlertCircle,
  Clock,
  Coins,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  Landmark,
  Layers,
  Sparkles,
  HelpCircle,
  RefreshCw,
  Eye,
  Check,
  ChevronRight,
  FolderDown,
  ShieldCheck,
} from 'lucide-react';
import {
  Transaction,
  Category,
  Ledger,
  TransactionType,
  AuthUser,
  formatMoney,
  toYuan,
  getCurrencySymbol,
  exportTransactionsToCsv,
  exportTransactionsToJson,
  generateStandardCsvTemplate,
  detectAndParseBillCsv,
  detectAndParseBillFile,
  BillParseResult,
  ParsedBillItem,
  getCategoryMeta,
} from '@ledger/shared';
import { batchImportTransactions } from '../api/client';
import { CategoryIcon } from './CategoryIcon';

interface DataManagementModalProps {
  isOpen: boolean;
  initialTab?: 'export' | 'import';
  currentUser: AuthUser | null;
  ledgers: Ledger[];
  categories: Category[];
  transactions: Transaction[];
  activeLedgerId: string;
  onClose: () => void;
  onImportSuccess: () => Promise<void>;
  onRequireAuth?: () => void;
}

export function DataManagementModal({
  isOpen,
  initialTab = 'export',
  currentUser,
  ledgers,
  categories,
  transactions,
  activeLedgerId,
  onClose,
  onImportSuccess,
  onRequireAuth,
}: DataManagementModalProps) {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>(initialTab);

  // ================= 导出模块状态 =================
  const [exportLedgerId, setExportLedgerId] = useState<string>(activeLedgerId || 'all');
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [exportDateRange, setExportDateRange] = useState<'all' | 'year' | 'month' | 'custom'>('all');
  const [exportType, setExportType] = useState<'all' | TransactionType>('all');
  const [exportStartDate, setExportStartDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [exportEndDate, setExportEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [exportSuccessMessage, setExportSuccessMessage] = useState<string | null>(null);

  // ================= 导入模块状态 =================
  const [importTargetLedgerId, setImportTargetLedgerId] = useState<string>(() => {
    const defaultLed = ledgers.find((l) => l.is_default === 1) || ledgers[0];
    return activeLedgerId !== 'all' ? activeLedgerId : (defaultLed?.ledger_id || 'default_ledger');
  });
  const [importedFile, setImportedFile] = useState<File | null>(null);
  const [parseResult, setParseResult] = useState<BillParseResult | null>(null);
  const [isParsing, setIsParsing] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [importDoneStats, setImportDoneStats] = useState<{ count: number; format: string } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // 重置导入向导
  const handleResetImport = () => {
    setImportedFile(null);
    setParseResult(null);
    setIsParsing(false);
    setIsImporting(false);
    setImportProgress(0);
    setImportDoneStats(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // 待导出数据计算与预览
  const exportPreviewList = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    return transactions.filter((tx) => {
      if (exportLedgerId !== 'all' && tx.ledger_id !== exportLedgerId) return false;
      if (exportType !== 'all' && tx.type !== exportType) return false;

      if (exportDateRange === 'year') {
        const d = new Date(tx.transaction_date);
        if (d.getFullYear() !== currentYear) return false;
      } else if (exportDateRange === 'month') {
        const d = new Date(tx.transaction_date);
        if (d.getFullYear() !== currentYear || d.getMonth() !== currentMonth) return false;
      } else if (exportDateRange === 'custom') {
        if (exportStartDate && tx.transaction_date < exportStartDate) return false;
        if (exportEndDate && tx.transaction_date > `${exportEndDate}T23:59:59.999Z`) return false;
      }

      return true;
    });
  }, [transactions, exportLedgerId, exportType, exportDateRange, exportStartDate, exportEndDate]);

  // 导出数据统计
  const exportTotals = useMemo(() => {
    let expense = 0;
    let income = 0;
    for (const t of exportPreviewList) {
      if (t.type === 'expense') expense += t.amount;
      else if (t.type === 'income') income += t.amount;
    }
    return {
      count: exportPreviewList.length,
      expense,
      income,
      balance: income - expense,
    };
  }, [exportPreviewList]);

  // 触发导出并下载文件
  const handlePerformExport = () => {
    setIsExporting(true);
    setExportSuccessMessage(null);

    try {
      const selectedLedger = ledgers.find((l) => l.ledger_id === exportLedgerId);
      const ledgerNamePart = selectedLedger ? selectedLedger.name : '全量账本';
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

      let content = '';
      let filename = '';
      let mimeType = '';

      if (exportFormat === 'csv') {
        content = exportTransactionsToCsv(exportPreviewList, categories, ledgers, {
          ledgerId: exportLedgerId,
          type: exportType,
        });
        filename = `账盾_${ledgerNamePart}_${dateStr}.csv`;
        mimeType = 'text/csv;charset=utf-8;';
      } else {
        content = exportTransactionsToJson(exportPreviewList, categories, ledgers, {
          ledgerId: exportLedgerId,
          type: exportType,
        });
        filename = `账盾_数据备份_${ledgerNamePart}_${dateStr}.json`;
        mimeType = 'application/json;charset=utf-8;';
      }

      // 创建 Blob 并触发浏览器下载
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setExportSuccessMessage(`已成功导出 ${exportPreviewList.length} 笔流水至文件：${filename}`);
    } catch (err: any) {
      alert(`导出失败: ${err?.message || '未知错误'}`);
    } finally {
      setIsExporting(false);
    }
  };

  // 下载标准 CSV 导入模板
  const handleDownloadTemplate = () => {
    const templateContent = generateStandardCsvTemplate();
    const blob = new Blob([templateContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '账盾_标准记账导入模板.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 处理文件解析 (支持 .xls / .xlsx / .csv / .txt)
  const processFile = (file: File) => {
    if (!file) return;
    const lowerName = file.name.toLowerCase();
    const isSupported =
      lowerName.endsWith('.csv') ||
      lowerName.endsWith('.xls') ||
      lowerName.endsWith('.xlsx') ||
      lowerName.endsWith('.txt');

    if (!isSupported) {
      setImportError('仅支持上传 .xls、.xlsx、.csv 或 .txt 格式的账单文件');
      return;
    }

    setImportedFile(file);
    setIsParsing(true);
    setImportError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer;
        const result = detectAndParseBillFile(arrayBuffer, file.name, categories, importTargetLedgerId);
        setParseResult(result);
        if (result.valid_rows === 0) {
          setImportError('未能从文件中识别出有效交易流水，请检查文件格式或下载标准模板对照。');
        }
      } catch (err: any) {
        setImportError(`解析账单文件失败: ${err?.message || '格式无法识别'}`);
      } finally {
        setIsParsing(false);
      }
    };
    reader.onerror = () => {
      setImportError('读取文件发生错误，请重试');
      setIsParsing(false);
    };

    // 以 ArrayBuffer 形式读取以统一兼容二进制 Excel 与文本 CSV
    reader.readAsArrayBuffer(file);
  };

  // 文件拖拽与选择事件
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // 执行批量导入入库
  const handleExecuteImport = async () => {
    if (!parseResult || parseResult.items.length === 0) return;

    setIsImporting(true);
    setImportProgress(0);
    setImportError(null);

    try {
      // 转换并补充目标账本与当前用户主键
      const targetLedger = ledgers.find((l) => l.ledger_id === importTargetLedgerId) || ledgers[0];
      const effectiveLedgerId = targetLedger ? targetLedger.ledger_id : 'default_ledger';
      const effectiveUserId = currentUser ? currentUser.user_id : 'default_user';

      const validTxs: Transaction[] = parseResult.items.map((item, idx) => ({
        transaction_id: item.id || `tx_imp_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: effectiveUserId,
        ledger_id: effectiveLedgerId,
        type: item.type,
        amount: item.amount,
        category_id: item.matched_category_id || item.category_id || null,
        from_account: item.from_account || null,
        to_account: item.to_account || null,
        transaction_date: item.transaction_date,
        remark: item.remark || null,
        sync_status: currentUser ? 'pending' : 'synced',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      const res = await batchImportTransactions(validTxs, (p) => {
        setImportProgress(p);
      });

      if (res.success) {
        setImportDoneStats({
          count: res.importedCount,
          format: parseResult.format_name,
        });
        await onImportSuccess();
      } else {
        setImportError(res.error || '批量入库遇到问题');
      }
    } catch (err: any) {
      setImportError(`导入执行异常: ${err?.message || '未知错误'}`);
    } finally {
      setIsImporting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white dark:bg-neutral-800 rounded-3xl shadow-2xl border border-gray-100 dark:border-neutral-700/80 overflow-hidden flex flex-col max-h-[92vh] animate-modal-in">
        {/* 1. 顶部 Header */}
        <div className="p-4 sm:p-5 border-b border-gray-100 dark:border-neutral-700/80 flex items-center justify-between bg-gray-50/50 dark:bg-neutral-800/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shadow-indigo-600/20">
              <FolderDown className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-gray-900 dark:text-white flex items-center gap-1.5">
                <span>数据与资产管理</span>
                {/* <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 font-normal">
                  白皮书 7.3
                </span> */}
              </h3>
              <p className="text-[11px] text-gray-400">CSV 账单智能导入与多格式全量导出</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 2. 导出 / 导入 Tab 切换 Pills */}
        <div className="px-4 sm:px-5 pt-3">
          <div className="grid grid-cols-2 bg-gray-100/90 dark:bg-neutral-900/90 p-1 rounded-2xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setActiveTab('export');
                setExportSuccessMessage(null);
              }}
              className={`py-2 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-95 ${
                activeTab === 'export'
                  ? 'bg-white dark:bg-neutral-800 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
              }`}
            >
              <Download className="w-3.5 h-3.5" />
              <span>导出账单数据</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('import');
                handleResetImport();
              }}
              className={`py-2 rounded-xl transition-all duration-150 flex items-center justify-center gap-1.5 active:scale-95 ${
                activeTab === 'import'
                  ? 'bg-white dark:bg-neutral-800 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold'
                  : 'text-gray-500 hover:text-gray-800 dark:text-gray-400'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>导入 CSV 账单</span>
            </button>
          </div>
        </div>

        {/* 3. 模态框主体内容 (滚动区域) */}
        <div className="p-4 sm:p-5 overflow-y-auto no-scrollbar flex flex-col gap-4">
          {/* ================= 导出面板 (Export Panel) ================= */}
          {activeTab === 'export' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              {/* 导出范围与账本选择 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  选择导出账本
                </label>
                <select
                  value={exportLedgerId}
                  onChange={(e) => setExportLedgerId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none"
                >
                  <option value="all">全部账本透视 (全量数据汇总)</option>
                  {ledgers.map((l) => (
                    <option key={l.ledger_id} value={l.ledger_id}>
                      {l.name} ({l.currency}) {l.is_default === 1 ? '★ 默认' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* 时间跨度筛选 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  时间跨度
                </label>
                <div className="grid grid-cols-4 gap-1.5 text-xs">
                  {[
                    { id: 'all', label: '全部' },
                    { id: 'month', label: '本月' },
                    { id: 'year', label: '本年' },
                    { id: 'custom', label: '自定义' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setExportDateRange(item.id as any)}
                      className={`py-1.5 rounded-xl font-medium transition-all ${
                        exportDateRange === item.id
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {exportDateRange === 'custom' && (
                  <div className="grid grid-cols-2 gap-2 mt-1.5">
                    <div>
                      <span className="text-[10px] text-gray-400">起始日期</span>
                      <input
                        type="date"
                        value={exportStartDate}
                        onChange={(e) => setExportStartDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-gray-400">截止日期</span>
                      <input
                        type="date"
                        value={exportEndDate}
                        onChange={(e) => setExportEndDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs rounded-xl bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 focus:outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 导出文件格式选择 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  导出文件格式
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <div
                    onClick={() => setExportFormat('csv')}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                      exportFormat === 'csv'
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
                        : 'border-gray-200 dark:border-neutral-700 bg-gray-50/40 dark:bg-neutral-900/40 hover:bg-gray-50'
                    }`}
                  >
                    <FileSpreadsheet className={`w-5 h-5 mt-0.5 ${exportFormat === 'csv' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                    <div>
                      <div className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1">
                        <span>CSV 电子表格 (.csv)</span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        内置 UTF-8 BOM 兼容 Excel 打开不乱码，便于对账
                      </p>
                    </div>
                  </div>

                  <div
                    onClick={() => setExportFormat('json')}
                    className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                      exportFormat === 'json'
                        ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
                        : 'border-gray-200 dark:border-neutral-700 bg-gray-50/40 dark:bg-neutral-900/40 hover:bg-gray-50'
                    }`}
                  >
                    <FileJson className={`w-5 h-5 mt-0.5 ${exportFormat === 'json' ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                    <div>
                      <div className="text-xs font-bold text-gray-800 dark:text-gray-200 flex items-center gap-1">
                        <span>JSON 完整备份 (.json)</span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        原样保留全部模型结构与分类，支持整库迁移恢复
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 导出数据量概览小卡片 */}
              <div className="p-3.5 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 border border-gray-100 dark:border-neutral-800 flex items-center justify-between text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[11px] text-gray-400">即将导出的流水条数</span>
                  <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                    {exportTotals.count} 笔
                  </span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="text-[11px] text-gray-400">总支出 / 总收入</span>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                    出 ¥{toYuan(exportTotals.expense).toFixed(2)} · 入 ¥{toYuan(exportTotals.income).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* 导出成功提示 */}
              {exportSuccessMessage && (
                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-100 dark:border-emerald-900/50 flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
                  <span>{exportSuccessMessage}</span>
                </div>
              )}

              {/* 导出操作按钮 */}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  type="button"
                  disabled={isExporting || exportPreviewList.length === 0}
                  onClick={handlePerformExport}
                  className="w-full py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 disabled:opacity-40 transition-all flex items-center justify-center gap-2"
                >
                  <Download className={`w-4 h-4 ${isExporting ? 'animate-bounce' : ''}`} />
                  <span>{isExporting ? '正在生成导出文件...' : `立即导出并下载 (${exportPreviewList.length} 笔)`}</span>
                </button>

                <div className="flex items-center justify-between text-[11px] text-gray-400 px-1">
                  <span>需要历史账目格式规范？</span>
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
                  >
                    <FileText className="w-3 h-3" />
                    <span>下载标准记账 CSV 模板</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ================= 导入面板 (Import Panel) ================= */}
          {activeTab === 'import' && (
            <div className="flex flex-col gap-4 animate-fadeIn">
              {/* 导入完成状态展示 */}
              {importDoneStats ? (
                <div className="p-6 rounded-3xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40 flex flex-col items-center text-center gap-3 animate-in zoom-in-95 duration-200">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-emerald-900 dark:text-emerald-200">
                      账单批量导入成功！
                    </h4>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                      从【{importDoneStats.format}】成功导入了 <strong>{importDoneStats.count} 笔</strong> 流水明细。
                    </p>
                  </div>
                  <div className="w-full p-3 rounded-2xl bg-white/80 dark:bg-neutral-900/60 text-[11px] text-gray-600 dark:text-gray-300 flex items-center justify-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    <span>已即时写入本地 IndexedDB 离线数据库，网络正常将自动双向增量同步</span>
                  </div>
                  <div className="flex gap-2 w-full pt-1">
                    <button
                      type="button"
                      onClick={handleResetImport}
                      className="flex-1 py-2 rounded-xl text-xs font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 hover:bg-gray-50"
                    >
                      继续导入其他账单
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm"
                    >
                      完成并查看流水
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {/* Step 1: 上传 / 拖拽 CSV 文件 */}
                  {!parseResult ? (
                    <div className="flex flex-col gap-3">
                      <div
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        className={`p-6 rounded-3xl border-2 border-dashed transition-all flex flex-col items-center justify-center gap-2.5 cursor-pointer text-center ${
                          dragActive
                            ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40'
                            : 'border-gray-200 dark:border-neutral-700 hover:border-indigo-400 bg-gray-50/50 dark:bg-neutral-900/30'
                        }`}
                      >
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".csv,.xls,.xlsx,.txt"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                          <Upload className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-gray-800 dark:text-gray-200">
                            点击上传 或 拖拽账单文件至此处
                          </p>
                          <p className="text-[11px] text-gray-400 mt-1">
                            自动智能识别：小星记账 (.xls/.xlsx)、微信支付、支付宝明细、账盾标准或通用记账 CSV
                          </p>
                        </div>
                      </div>

                      {/* 错误提示 */}
                      {importError && (
                        <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
                          <AlertCircle className="w-4 h-4 shrink-0" />
                          <span>{importError}</span>
                        </div>
                      )}

                      {/* 标准模板下载引导 */}
                      <div className="p-3.5 rounded-2xl bg-indigo-50/50 dark:bg-neutral-900/60 border border-indigo-100/60 dark:border-neutral-800 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2 text-gray-600 dark:text-gray-300">
                          <FileText className="w-4 h-4 text-indigo-500" />
                          <span>初次使用？推荐下载标准记账模板整理数据</span>
                        </div>
                        <button
                          type="button"
                          onClick={handleDownloadTemplate}
                          className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline shrink-0"
                        >
                          下载模板 ➔
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Step 2: 格式识别结果、目标账本选择与明细预览 */
                    <div className="flex flex-col gap-3.5 animate-fadeIn">
                      {/* 格式智能识别徽章 */}
                      <div className="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          <div>
                            <span className="text-[10px] text-gray-400">已智能识别账单格式</span>
                            <h4 className="text-xs font-bold text-emerald-800 dark:text-emerald-200">
                              {parseResult.format_name}
                            </h4>
                            {parseResult.warnings && parseResult.warnings.length > 0 && (
                              <p className="text-[10px] text-emerald-700/80 dark:text-emerald-300/80 mt-0.5">
                                {parseResult.warnings.join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleResetImport}
                          className="text-[11px] text-gray-500 hover:text-indigo-600 dark:text-gray-400 hover:underline"
                        >
                          重新选择文件
                        </button>
                      </div>

                      {/* 目标账本选择 */}
                      <div className="flex items-center justify-between px-3 py-2 rounded-2xl bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 text-xs">
                        <span className="text-gray-600 dark:text-gray-300 font-medium">导入至目标账本</span>
                        <select
                          value={importTargetLedgerId}
                          onChange={(e) => setImportTargetLedgerId(e.target.value)}
                          className="bg-white dark:bg-neutral-800 text-xs font-semibold px-2.5 py-1 rounded-xl border border-gray-200 dark:border-neutral-700 text-gray-800 dark:text-gray-200 focus:outline-none cursor-pointer"
                        >
                          {ledgers.map((l) => (
                            <option key={l.ledger_id} value={l.ledger_id}>
                              {l.name} ({l.currency}) {l.is_default === 1 ? '★ 默认日常' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 数据摘要卡片 */}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="p-2.5 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 flex flex-col gap-0.5">
                          <span className="text-[10px] text-gray-400">有效交易笔数</span>
                          <span className="font-bold text-gray-800 dark:text-gray-200">
                            {parseResult.valid_rows} 笔
                          </span>
                        </div>
                        <div className="p-2.5 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 flex flex-col gap-0.5">
                          <span className="text-[10px] text-gray-400">总支出金额</span>
                          <span className="font-bold text-orange-600 dark:text-[#D08770]">
                            ¥{toYuan(parseResult.total_expense).toFixed(2)}
                          </span>
                        </div>
                        <div className="p-2.5 rounded-2xl bg-gray-50 dark:bg-neutral-900/60 flex flex-col gap-0.5">
                          <span className="text-[10px] text-gray-400">总收入金额</span>
                          <span className="font-bold text-emerald-600 dark:text-[#A3BE8C]">
                            ¥{toYuan(parseResult.total_income).toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* 明细预览表格 (前 8 条) */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500 dark:text-gray-400 px-0.5">
                          <span>数据预览 (展示前 {Math.min(parseResult.items.length, 6)} 笔)</span>
                          <span>智能分类映射</span>
                        </div>

                        <div className="flex flex-col gap-1.5 max-h-52 overflow-y-auto no-scrollbar border border-gray-100 dark:border-neutral-800 rounded-2xl p-1.5 bg-gray-50/40 dark:bg-neutral-900/40">
                          {parseResult.items.slice(0, 6).map((item, idx) => {
                            const catMeta = getCategoryMeta(item.matched_category_id || item.category_id, categories, item.type);
                            return (
                              <div
                                key={idx}
                                className="p-2 rounded-xl bg-white dark:bg-neutral-800/80 border border-gray-100 dark:border-neutral-700/60 flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <CategoryIcon
                                    icon={catMeta.icon}
                                    color={catMeta.color || (item.type === 'expense' ? '#D08770' : '#A3BE8C')}
                                    className="w-3.5 h-3.5 shrink-0"
                                  />
                                  <div className="flex flex-col min-w-0">
                                    <span className="font-semibold text-gray-800 dark:text-gray-200 truncate max-w-[130px]" title={item.remark || ''}>
                                      {item.remark || catMeta.name}
                                    </span>
                                    <span className="text-[9px] text-gray-400 truncate">
                                      {item.transaction_date.slice(0, 10)} · {item.from_account || item.to_account || '无账户'}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-gray-100 dark:bg-neutral-700 text-gray-600 dark:text-gray-300 font-medium">
                                    {catMeta.name}
                                  </span>
                                  <span className={`font-bold ${
                                    item.type === 'expense'
                                      ? 'text-orange-600 dark:text-[#D08770]'
                                      : item.type === 'income'
                                      ? 'text-emerald-600 dark:text-[#A3BE8C]'
                                      : 'text-indigo-600 dark:text-indigo-400'
                                  }`}>
                                    {item.type === 'expense' ? '-' : item.type === 'income' ? '+' : ''}¥{toYuan(item.amount).toFixed(2)}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* 导入进度条 */}
                      {isImporting && (
                        <div className="flex flex-col gap-1 pt-1">
                          <div className="flex justify-between text-[11px] text-gray-500">
                            <span>正在批量写入本地并同步至 D1...</span>
                            <span className="font-bold">{importProgress}%</span>
                          </div>
                          <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-neutral-700 overflow-hidden">
                            <div
                              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                              style={{ width: `${importProgress}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* 错误提示 */}
                      {importError && (
                        <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 text-xs text-red-600 dark:text-red-400">
                          {importError}
                        </div>
                      )}

                      {/* 执行导入按钮 */}
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          disabled={isImporting}
                          onClick={handleResetImport}
                          className="px-4 py-2.5 rounded-2xl text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-neutral-700 hover:bg-gray-200 transition-colors"
                        >
                          取消
                        </button>
                        <button
                          type="button"
                          disabled={isImporting || parseResult.valid_rows === 0}
                          onClick={handleExecuteImport}
                          className="flex-1 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white font-semibold text-xs shadow-md shadow-indigo-600/20 disabled:opacity-40 transition-all flex items-center justify-center gap-1.5"
                        >
                          {isImporting ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>正在导入 {importProgress}%...</span>
                            </>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                              <span>确认批量导入 ({parseResult.valid_rows} 笔流水)</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DataManagementModal;
