/**
 * 账盾 Android 桌面小组件 - 原生桥接层
 *
 * 通过 Capacitor registerPlugin 定义 `LedgerWidget` 插件，
 * 将组装好的 WidgetPayload 推送到 Android 原生端更新桌面小组件。
 *
 * 注意：
 * - 不要强依赖 `@capacitor/app`，本文件仅依赖 `@capacitor/core`。
 * - Web 环境必须静默 return（Capacitor.isNativePlatform 检查），不得抛错。
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

export type WidgetClickAction = 'record' | 'detail' | 'stats';

export interface WidgetPayload {
  ledgerName: string;
  item1_label: string;
  item1_val: string;
  item2_label: string;
  item2_val: string;
  item3_label: string;
  item3_val: string;
  clickAction: WidgetClickAction;
  updatedAt: string;
  updatedAtDay?: string;
}

export interface LedgerWidgetPlugin {
  updateWidgetData(options: { data: WidgetPayload }): Promise<void>;
}

export const LedgerWidget = registerPlugin<LedgerWidgetPlugin>('LedgerWidget');

/**
 * 推送小组件数据到原生端。
 * Web / 非原生环境静默 return；原生端调用失败也不抛错（内部 try/catch）。
 */
export async function pushWidgetData(payload: WidgetPayload): Promise<void> {
  try {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    await LedgerWidget.updateWidgetData({ data: payload });
  } catch {
    // Web 端或原生插件缺失时静默忽略，避免页面崩溃
  }
}
