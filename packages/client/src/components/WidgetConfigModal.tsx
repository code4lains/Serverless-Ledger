import React, { useEffect, useState } from 'react';
import type { Ledger } from '@ledger/shared';
import {
  type WidgetDataMetric,
  type WidgetSettings,
  calculateAndSyncWidgetData,
  getWidgetSettings,
  saveWidgetSettings,
} from '../widget/widgetDataSync';
import { ArrowLeft, HelpCircle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  ledgers: Ledger[];
  activeLedgerId: string;
}

const METRIC_OPTIONS: { key: WidgetDataMetric; label: string }[] = [
  { key: 'today_expense', label: '今日支出' },
  { key: 'today_income', label: '今日收入' },
  { key: 'month_expense', label: '本月支出' },
  { key: 'month_income', label: '本月收入' },
  { key: 'month_balance', label: '本月结余' },
  { key: 'year_expense', label: '本年支出' },
];

export const WidgetConfigModal: React.FC<Props> = ({ isOpen, onClose, ledgers, activeLedgerId }) => {
  const [settings, setSettings] = useState<WidgetSettings>(() => getWidgetSettings());
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setSettings(getWidgetSettings());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      saveWidgetSettings(settings);
      await calculateAndSyncWidgetData(activeLedgerId);
    } finally {
      setSaving(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-stone-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-800">
          <button type="button" onClick={onClose} className="p-2 text-stone-600 dark:text-stone-300">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100">编辑小部件</h2>
          <button type="button" className="p-2 text-stone-400 hover:text-stone-600">
            <HelpCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-1 divide-y divide-stone-100 dark:divide-stone-800 text-sm">
          <div className="py-3 flex items-center justify-between">
            <span className="text-stone-700 dark:text-stone-200">账本</span>
            <select
              value={settings.ledgerId}
              onChange={(e) => setSettings({ ...settings, ledgerId: e.target.value })}
              className="text-right bg-transparent text-stone-500 dark:text-stone-400 focus:outline-none"
            >
              <option value="current">当前账本</option>
              {ledgers.map((l) => (
                <option key={l.ledger_id} value={l.ledger_id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="py-3 flex items-center justify-between">
            <span className="text-stone-700 dark:text-stone-200">数据一</span>
            <select
              value={settings.slot1}
              onChange={(e) => setSettings({ ...settings, slot1: e.target.value as WidgetDataMetric })}
              className="text-right bg-transparent text-stone-500 dark:text-stone-400 focus:outline-none"
            >
              {METRIC_OPTIONS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="py-3 flex items-center justify-between">
            <span className="text-stone-700 dark:text-stone-200">数据二</span>
            <select
              value={settings.slot2}
              onChange={(e) => setSettings({ ...settings, slot2: e.target.value as WidgetDataMetric })}
              className="text-right bg-transparent text-stone-500 dark:text-stone-400 focus:outline-none"
            >
              {METRIC_OPTIONS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="py-3 flex items-center justify-between">
            <span className="text-stone-700 dark:text-stone-200">数据三</span>
            <select
              value={settings.slot3}
              onChange={(e) => setSettings({ ...settings, slot3: e.target.value as WidgetDataMetric })}
              className="text-right bg-transparent text-stone-500 dark:text-stone-400 focus:outline-none"
            >
              {METRIC_OPTIONS.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="py-3 flex items-center justify-between">
            <span className="text-stone-700 dark:text-stone-200">点击后</span>
            <select
              value={settings.clickAction}
              onChange={(e) =>
                setSettings({ ...settings, clickAction: e.target.value as WidgetSettings['clickAction'] })
              }
              className="text-right bg-transparent text-stone-500 dark:text-stone-400 focus:outline-none"
            >
              <option value="record">打开记账页</option>
              <option value="detail">打开明细流水</option>
              <option value="stats">打开统计报表</option>
            </select>
          </div>
        </div>

        <div className="px-4 py-3 bg-stone-50 dark:bg-stone-800/40 text-xs text-stone-400 leading-relaxed">
          提示：小部件展示所选账本的统计指标，点击卡片可快速跳转至指定页面。
        </div>

        <div className="p-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition text-white font-medium rounded-xl shadow-md disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WidgetConfigModal;
