/**
 * 极简记账 - 金额精度转换与处理工具
 * 遵循《项目技术白皮书 6.2 金额精度问题》：
 * 前后端交互及 D1 数据库存储一律将金额放大100倍以整数 (Integer) 存储。
 */

/**
 * 将浮点数金额（元）安全转换为整数（分）
 * 例如 12.34 -> 1234, "12.34" -> 1234
 */
export function toCents(yuan: number | string): number {
  if (typeof yuan === 'string') {
    const parsed = parseFloat(yuan);
    if (isNaN(parsed)) return 0;
    return Math.round(parsed * 100);
  }
  if (isNaN(yuan)) return 0;
  return Math.round(yuan * 100);
}

/**
 * 将整数（分）转换为浮点数金额（元）
 * 例如 1234 -> 12.34
 */
export function toYuan(cents: number): number {
  if (isNaN(cents)) return 0;
  return cents / 100;
}

/**
 * 格式化金额（分）为展示字符串
 * @param cents 存储的整数分
 * @param currencySymbol 货币符号，默认 "¥"
 * @returns 格式化后的字符串，例如 "¥12.34"
 */
export function formatMoney(cents: number, currencySymbol: string = '¥'): string {
  const yuan = toYuan(cents);
  const formatted = yuan.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currencySymbol}${formatted}`;
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
