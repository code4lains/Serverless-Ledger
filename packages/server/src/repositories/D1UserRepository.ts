import { User, IUserRepository } from '@ledger/shared';

export class D1UserRepository implements IUserRepository {
  constructor(protected db: D1Database) {}

  async findById(userId: string): Promise<User | null> {
    const user = await this.db
      .prepare(
        'SELECT user_id, email, password_hash, invited_by, recovery_code, created_at, updated_at FROM users WHERE user_id = ?'
      )
      .bind(userId)
      .first<User>();
    return user || null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.db
      .prepare(
        'SELECT user_id, email, password_hash, invited_by, recovery_code, created_at, updated_at FROM users WHERE email = ?'
      )
      .bind(email.toLowerCase().trim())
      .first<User>();
    return user || null;
  }

  async create(user: {
    user_id: string;
    email: string;
    password_hash: string;
    invited_by?: string | null;
    recovery_code?: string | null;
    created_at?: string;
    updated_at?: string;
  }): Promise<User> {
    const now = new Date().toISOString();
    const createdAt = user.created_at || now;
    const updatedAt = user.updated_at || now;
    const invitedBy = user.invited_by || null;
    const recoveryCode = user.recovery_code || null;

    await this.db
      .prepare(
        'INSERT INTO users (user_id, email, password_hash, invited_by, recovery_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      )
      .bind(user.user_id, user.email, user.password_hash, invitedBy, recoveryCode, createdAt, updatedAt)
      .run();

    return {
      user_id: user.user_id,
      email: user.email,
      password_hash: user.password_hash,
      invited_by: invitedBy,
      recovery_code: recoveryCode,
      created_at: createdAt,
      updated_at: updatedAt,
    };
  }

  async updatePassword(userId: string, passwordHash: string): Promise<boolean> {
    const now = new Date().toISOString();
    const res = await this.db
      .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE user_id = ?')
      .bind(passwordHash, now, userId)
      .run();
    return (res.meta.changes || 0) > 0;
  }

  async updateRecoveryCode(userId: string, recoveryCode: string | null): Promise<boolean> {
    const now = new Date().toISOString();
    const res = await this.db
      .prepare('UPDATE users SET recovery_code = ?, updated_at = ? WHERE user_id = ?')
      .bind(recoveryCode, now, userId)
      .run();
    return (res.meta.changes || 0) > 0;
  }

  async resetPassword(userId: string, passwordHash: string, newRecoveryCode: string): Promise<boolean> {
    const now = new Date().toISOString();
    const res = await this.db
      .prepare('UPDATE users SET password_hash = ?, recovery_code = ?, updated_at = ? WHERE user_id = ?')
      .bind(passwordHash, newRecoveryCode, now, userId)
      .run();
    return (res.meta.changes || 0) > 0;
  }

  async delete(userId: string): Promise<boolean> {
    const res = await this.db.prepare('DELETE FROM users WHERE user_id = ?').bind(userId).run();
    return (res.meta.changes || 0) > 0;
  }

  /**
   * 级联原子注销用户所有数据 (BUG-S12)
   */
  async deleteCascade(userId: string): Promise<boolean> {
    const batchStatements: D1PreparedStatement[] = [
      this.db.prepare('DELETE FROM transactions WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM budgets WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM ledgers WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM categories WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM invite_codes WHERE creator_id = ?').bind(userId),
      this.db.prepare('UPDATE invite_codes SET used_by = NULL WHERE used_by = ?').bind(userId),
      this.db.prepare('DELETE FROM recurring_rules WHERE user_id = ?').bind(userId),
      this.db.prepare('DELETE FROM users WHERE user_id = ?').bind(userId),
    ];
    await this.db.batch(batchStatements);
    return true;
  }
}
