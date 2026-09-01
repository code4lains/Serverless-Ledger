import { InviteCode, IInviteCodeRepository } from '@ledger/shared';

export class D1InviteCodeRepository implements IInviteCodeRepository {
  constructor(protected db: D1Database) {}

  async findByCode(code: string): Promise<InviteCode | null> {
    const res = await this.db
      .prepare('SELECT code, creator_id, used_by, status, created_at, used_at FROM invite_codes WHERE code = ?')
      .bind(code.toUpperCase().trim())
      .first<InviteCode>();
    return res || null;
  }

  async findByCreator(creatorId: string): Promise<InviteCode[]> {
    const { results } = await this.db
      .prepare(
        'SELECT code, creator_id, used_by, status, created_at, used_at FROM invite_codes WHERE creator_id = ? ORDER BY created_at DESC'
      )
      .bind(creatorId)
      .all<InviteCode>();
    return results || [];
  }

  async create(creatorId: string, code: string): Promise<InviteCode> {
    const now = new Date().toISOString();
    await this.db
      .prepare('INSERT INTO invite_codes (code, creator_id, status, created_at) VALUES (?, ?, ?, ?)')
      .bind(code, creatorId, 'unused', now)
      .run();

    return {
      code,
      creator_id: creatorId,
      status: 'unused',
      created_at: now,
    };
  }

  /**
   * 原子条件插入防超额 (BUG-S05)
   */
  async createWithQuota(creatorId: string, code: string, maxAllowed: number): Promise<InviteCode | null> {
    const now = new Date().toISOString();
    const res = await this.db
      .prepare(
        `INSERT INTO invite_codes (code, creator_id, status, created_at)
         SELECT ?, ?, 'unused', ?
         WHERE (SELECT COUNT(*) FROM invite_codes WHERE creator_id = ?) < ?`
      )
      .bind(code, creatorId, now, creatorId, maxAllowed)
      .run();

    if (!res.meta.changes || res.meta.changes === 0) {
      return null;
    }

    return {
      code,
      creator_id: creatorId,
      status: 'unused',
      created_at: now,
    };
  }

  /**
   * 原子标记已使用 (BUG-S04)
   */
  async markUsed(code: string, usedByUserId: string): Promise<boolean> {
    const now = new Date().toISOString();
    const res = await this.db
      .prepare('UPDATE invite_codes SET status = ?, used_by = ?, used_at = ? WHERE code = ? AND status = ?')
      .bind('used', usedByUserId, now, code, 'unused')
      .run();
    return (res.meta.changes || 0) > 0;
  }

  async countByCreator(creatorId: string): Promise<number> {
    const res = await this.db
      .prepare('SELECT COUNT(*) as count FROM invite_codes WHERE creator_id = ?')
      .bind(creatorId)
      .first<{ count: number }>();
    return Number(res?.count || 0);
  }
}
