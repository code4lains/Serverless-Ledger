/**
 * 账盾 Android 桌面小组件 - 前端数据同步层
 *
 * 职责：读取用户的小组件配置，从本地 Dexie 数据库统计指标，
 * 组装 WidgetPayload 并经由 LedgerWidget 桥接推送到原生端。
 *
 * 约束：
 * - 时间窗口统计必须使用本地时间（直接比较本地 y/m/d），
 *   禁止使用 `toISOString().slice(0, 10)`（有时区 bug）。
 * - Web 环境必须静默 return（Capacitor.isNativePlatform 检查）。
 * - 全函数 try/catch，失败 console.warn 且不抛错。
 * - 不要强依赖 `@capacitor/app`。
 */

import { Capacitor } from '@capacitor/core';
import { parseLocalDate, type Transaction } from '@ledger/shared';
import { localDb } from '../db';
import { LedgerWidget, type WidgetClickAction, type WidgetPayload } from './ledgerWidgetBridge';

export type WidgetDataMetric =
  | 'today_expense'
  | 'today_income'
  | 'month_expense'
  | 'month_income'
  | 'month_balance'
  | 'year_expense';

export interface WidgetSettings {
  ledgerId: string;
  slot1: WidgetDataMetric;
  slot2: WidgetDataMetric;
  slot3: WidgetDataMetric;
  clickAction: WidgetClickAction;
}

export const WIDGET_SETTINGS_STORAGE_KEY = 'ledger_widget_user_settings';

export const DEFAULT_WIDGET_SETTINGS: WidgetSettings = {
  ledgerId: 'current',
  slot1: 'today_expense',
  slot2: 'month_expense',
  slot3: 'month_balance',
  clickAction: 'record',
};

export const METRIC_LABELS: Record<WidgetDataMetric, string> = {
  today_expense: '今日支出',
  today_income: '今日收入',
  month_expense: '本月支出',
  month_income: '本月收入',
  month_balance: '本月结余',
  year_expense: '本年支出',
};

const VALID_METRICS: ReadonlySet<string> = new Set(Object.keys(METRIC_LABELS));
const VALID_CLICK_ACTIONS: ReadonlySet<string> = new Set(['record', 'detail', 'stats']);

function isValidMetric(value: unknown): value is WidgetDataMetric {
  return typeof value === 'string' && VALID_METRICS.has(value);
}

function sanitizeSettings(input: Partial<WidgetSettings>): WidgetSettings {
  return {
    ledgerId:
      typeof input.ledgerId === 'string' && input.ledgerId.length > 0
        ? input.ledgerId
        : DEFAULT_WIDGET_SETTINGS.ledgerId,
    slot1: isValidMetric(input.slot1) ? input.slot1 : DEFAULT_WIDGET_SETTINGS.slot1,
    slot2: isValidMetric(input.slot2) ? input.slot2 : DEFAULT_WIDGET_SETTINGS.slot2,
    slot3: isValidMetric(input.slot3) ? input.slot3 : DEFAULT_WIDGET_SETTINGS.slot3,
    clickAction:
      typeof input.clickAction === 'string' && VALID_CLICK_ACTIONS.has(input.clickAction)
        ? (input.clickAction as WidgetClickAction)
        : DEFAULT_WIDGET_SETTINGS.clickAction,
  };
}

export function getWidgetSettings(): WidgetSettings {
  try {
    if (typeof localStorage === 'undefined') {
      return { ...DEFAULT_WIDGET_SETTINGS };
    }
    const raw = localStorage.getItem(WIDGET_SETTINGS_STORAGE_KEY);
    if (!raw) {
      return { ...DEFAULT_WIDGET_SETTINGS };
    }
    const parsed = JSON.parse(raw) as Partial<WidgetSettings>;
    if (!parsed || typeof parsed !== 'object') {
      return { ...DEFAULT_WIDGET_SETTINGS };
    }
    // 与默认合并，防止缺字段 / 非法值
    return sanitizeSettings(parsed);
  } catch {
    return { ...DEFAULT_WIDGET_SETTINGS };
  }
}

export function saveWidgetSettings(settings: WidgetSettings): void {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }
    const sanitized = sanitizeSettings(settings);
    localStorage.setItem(WIDGET_SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
  } catch {
    // localStorage 不可用/配额满时静默忽略
  }
}

/** 金额格式化：整数分 -> 保留两位小数的元字符串 */
export function formatAmount(cents: number): string {
  const value = Number.isFinite(cents) ? cents : 0;
  return (value / 100).toFixed(2);
}

/** 纯函数输入所需的最小交易字段（便于单测构造数据） */
export type WidgetTxInput = Pick<Transaction, 'transaction_date' | 'type' | 'amount'>;

function toLocalDate(value: string): Date | null {
  if (!value) return null;
  const d = parseLocalDate(value);
  if (Number.isNaN(d.getTime())) {
    return null;
  }
  return d;
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameLocalMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isSameLocalYear(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear();
}

function sumBy(
  txs: WidgetTxInput[],
  type: Transaction['type'],
  inWindow: (d: Date) => boolean,
): number {
  let total = 0;
  for (const tx of txs) {
    if (tx.type !== type) {
      continue;
    }
    const d = toLocalDate(tx.transaction_date);
    if (!d || !inWindow(d)) {
      continue;
    }
    const amount = Number.isFinite(tx.amount) ? tx.amount : 0;
    total += amount;
  }
  return total;
}

function resolveMetricValue(txs: WidgetTxInput[], metric: WidgetDataMetric, now: Date): number {
  switch (metric) {
    case 'today_expense':
      return sumBy(txs, 'expense', (d) => isSameLocalDay(d, now));
    case 'today_income':
      return sumBy(txs, 'income', (d) => isSameLocalDay(d, now));
    case 'month_expense':
      return sumBy(txs, 'expense', (d) => isSameLocalMonth(d, now));
    case 'month_income':
      return sumBy(txs, 'income', (d) => isSameLocalMonth(d, now));
    case 'month_balance': {
      const income = sumBy(txs, 'income', (d) => isSameLocalMonth(d, now));
      const expense = sumBy(txs, 'expense', (d) => isSameLocalMonth(d, now));
      return income - expense;
    }
    case 'year_expense':
      return sumBy(txs, 'expense', (d) => isSameLocalYear(d, now));
    default:
      return 0;
  }
}

/**
 * 纯函数：由交易列表 + 账本名 + 配置 + 当前时间组装 WidgetPayload。
 * 不依赖 Capacitor / localDb，便于单元测试。
 */
export function computeWidgetPayloadPure(
  txs: WidgetTxInput[],
  ledgerName: string,
  settings: WidgetSettings,
  now: Date,
): WidgetPayload {
  const safeSettings = sanitizeSettings(settings);
  const list = Array.isArray(txs) ? txs : [];
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const localDayStr = `${y}-${m}-${d}`;

  return {
    ledgerName,
    item1_label: METRIC_LABELS[safeSettings.slot1],
    item1_val: formatAmount(resolveMetricValue(list, safeSettings.slot1, now)),
    item2_label: METRIC_LABELS[safeSettings.slot2],
    item2_val: formatAmount(resolveMetricValue(list, safeSettings.slot2, now)),
    item3_label: METRIC_LABELS[safeSettings.slot3],
    item3_val: formatAmount(resolveMetricValue(list, safeSettings.slot3, now)),
    clickAction: safeSettings.clickAction,
    updatedAt: now.toISOString(),
    updatedAtDay: localDayStr,
  };
}

/**
 * 统计本地数据并同步到 Android 桌面小组件。
 *
 * targetLedgerId 解析规则：
 * - settings.ledgerId === 'current' 时使用传入的 activeLedgerId；
 *   activeLedgerId 为 'all'/缺省时不过滤（查全部）。
 * - 否则使用 settings.ledgerId；若其指向不存在的账本，回退到 'all'。
 *
 * 仅在 Android 原生环境执行，其余环境静默 return；全程 try/catch，
 * 失败仅 console.warn，不抛错。
 */
export async function calculateAndSyncWidgetData(activeLedgerId?: string): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return;
    }

    const settings = getWidgetSettings();
    const ledgers = await localDb.ledgers.toArray();

    let targetLedgerId: string;
    if (settings.ledgerId === 'current') {
      targetLedgerId = activeLedgerId ?? 'all';
      if (!targetLedgerId) {
        targetLedgerId = 'all';
      }
    } else {
      targetLedgerId = settings.ledgerId;
    }
    if (targetLedgerId !== 'all' && !ledgers.some((l) => l.ledger_id === targetLedgerId)) {
      targetLedgerId = 'all';
    }

    // 账本名称解析：若为全部账本但本地仅有1个账本，或者当前处于默认账本，优化展示名称
    let ledgerName = '全部账本';
    if (targetLedgerId !== 'all') {
      ledgerName = ledgers.find((l) => l.ledger_id === targetLedgerId)?.name ?? '全部账本';
    } else {
      if (ledgers.length === 1) {
        ledgerName = ledgers[0].name;
      } else {
        const def = ledgers.find((l) => l.is_default === 1);
        if (def && (!activeLedgerId || activeLedgerId === 'all' || activeLedgerId === def.ledger_id)) {
          ledgerName = def.name;
        } else if (activeLedgerId && activeLedgerId !== 'all') {
          const matched = ledgers.find((l) => l.ledger_id === activeLedgerId);
          if (matched) ledgerName = matched.name;
        }
      }
    }

    const txs: Transaction[] =
      targetLedgerId === 'all'
        ? await localDb.transactions.toArray()
        : await localDb.transactions
            .filter((t) => t.ledger_id === targetLedgerId || (!t.ledger_id && ledgers.length === 1))
            .toArray();

    const now = new Date();
    const payload = computeWidgetPayloadPure(txs, ledgerName, settings, now);

    await LedgerWidget.updateWidgetData({ data: payload });
  } catch (err) {
    console.warn('[widget] calculateAndSyncWidgetData failed:', err);
  }
}
