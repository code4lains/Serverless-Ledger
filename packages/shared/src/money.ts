/**
 * 账盾 - 金额精度转换与处理工具
 * 遵循《项目技术白皮书 6.2 金额精度问题》：
 * 前后端交互及 D1 数据库存储一律将金额放大100倍以整数 (Integer) 存储。
 */

/**
 * 将浮点数金额（元）安全转换为整数（分）
 * 例如 12.34 -> 1234, "12.34" -> 1234
 */
export function toCents(yuan: number | string | null | undefined): number {
  if (yuan === null || yuan === undefined) return 0;
  if (typeof yuan === 'number') {
    if (!Number.isFinite(yuan) || Math.abs(yuan) > Number.MAX_SAFE_INTEGER) return 0;
    const rounded = Math.round(Number(yuan.toFixed(2)) * 100);
    return rounded === 0 ? 0 : rounded;
  }
  const cleanStr = String(yuan).trim().replace(/,/g, '').replace(/[^0-9.-]/g, '');
  if (!cleanStr) return 0;
  const parsed = parseFloat(cleanStr);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > Number.MAX_SAFE_INTEGER) return 0;
  const rounded = Math.round(parsed * 100);
  return rounded === 0 ? 0 : rounded;
}

/**
 * 将整数（分）转换为浮点数金额（元）
 * 例如 1234 -> 12.34
 */
export function toYuan(cents: number | null | undefined): number {
  if (cents === null || cents === undefined || typeof cents !== 'number') return 0;
  if (!Number.isFinite(cents) || Math.abs(cents) > Number.MAX_SAFE_INTEGER) return 0;
  if (cents === 0) return 0;
  const yuan = cents / 100;
  return yuan === 0 ? 0 : yuan;
}

export const fromCents = toYuan;
export const centsToYuan = toYuan;

/**
 * 格式化金额（分）为展示字符串
 * @param cents 存储的整数分
 * @param currencySymbol 货币符号，默认 "¥"
 * @returns 格式化后的字符串，例如 "¥12.34", "-¥12.34"
 */
export function formatMoney(cents: number | null | undefined, currencySymbol: string = '¥'): string {
  if (cents === null || cents === undefined || typeof cents !== 'number' || !Number.isFinite(cents)) {
    return `${currencySymbol}0.00`;
  }
  const isNegative = cents < 0;
  const absYuan = Math.abs(toYuan(cents));
  const formatted = absYuan.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${isNegative ? '-' : ''}${currencySymbol}${formatted}`;
}

const CURRENCY_SYMBOL_MAP: Record<string, string> = {
  CNY: '¥',
  RMB: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  HKD: 'HK$',
};

/**
 * 根据币种代码获取对应的货币符号
 */
export function getCurrencySymbol(currencyCode?: string): string {
  if (!currencyCode) return '¥';
  const upper = currencyCode.toUpperCase();
  return CURRENCY_SYMBOL_MAP[upper] || '¥';
}
