/**
 * 校验并解析归属于当前用户的有效 ledger_id。
 * 若传入的 ledgerId 存在且属于当前用户，则返回该 ledgerId；
 * 否则安全回退至当前用户的默认账本（若用户无任何账本则自动为其创建默认账本）。
 */
export async function resolveUserLedgerId(
  db: D1Database,
  userId: string,
  ledgerId?: string | null
): Promise<string> {
  if (ledgerId) {
    const existing = await db
      .prepare('SELECT ledger_id FROM ledgers WHERE ledger_id = ? AND user_id = ?')
      .bind(ledgerId, userId)
      .first<{ ledger_id: string }>();
    if (existing) {
      return existing.ledger_id;
    }
  }

  // 回退至当前用户的默认账本 (优先 is_default = 1，其次按创建时间排序的第一个账本)
  const defLedger = await db
    .prepare('SELECT ledger_id FROM ledgers WHERE user_id = ? ORDER BY is_default DESC, created_at ASC LIMIT 1')
    .bind(userId)
    .first<{ ledger_id: string }>();

  if (defLedger) {
    return defLedger.ledger_id;
  }

  // 兜底：若用户尚未初始化任何账本，自动创建默认账本
  const newLedgerId = `led_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();
  await db
    .prepare('INSERT INTO ledgers (ledger_id, user_id, name, currency, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)')
    .bind(newLedgerId, userId, '默认账本', 'CNY', now, now)
    .run();

  return newLedgerId;
}
