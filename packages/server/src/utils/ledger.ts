import { D1LedgerRepository } from '../repositories/D1LedgerRepository';

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
  const ledgerRepo = new D1LedgerRepository(db);
  return await ledgerRepo.resolveUserLedgerId(userId, ledgerId);
}
