import { Hono } from 'hono';
import { Env, AppVariables } from '../types';
import { hashPassword, verifyPassword, generateJwtToken, getJwtSecret, timingSafeEqualString, TOKEN_EXPIRY_SECONDS } from '../utils/auth';
import { verifyTurnstileToken } from '../utils/turnstile';
import { requireAuth } from '../middleware/auth';
import {
  ApiResponse,
  AuthResponse,
  AuthUser,
  RegisterRequest,
  LoginRequest,
  User,
  Ledger,
  AuthConfig,
  InviteCode,
  InviteEligibilityInfo,
  calculateInviteEligibility,
  ResetPasswordRequest,
} from '@ledger/shared';

const authRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// 获取系统当前注册模式: 0: 禁止注册, 1: 邀请注册模式 (默认), 2: 自由注册模式
function getRegMode(env: Env): number {
  const mode = env.REG_MODE;
  if (mode === undefined || mode === null || mode === '') {
    return 1;
  }
  const parsed = Number(mode);
  return isNaN(parsed) ? 1 : parsed;
}

// 生成随机邀请码 (INV-前缀 + 6位无歧义字符)
function generateRandomInviteCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let randomPart = '';
  for (let i = 0; i < 6; i++) {
    randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `INV-${randomPart}`;
}

// 生成 8 位包含字母和数字的随机密码恢复码 (全大写，排除易混淆字符)
function generateRecoveryCode(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// 简单邮箱格式校验
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 获取系统认证与注册模式配置
 * GET /api/auth/config
 */
authRouter.get('/config', async (c) => {
  const regMode = getRegMode(c.env);
  const res: ApiResponse<AuthConfig> = {
    success: true,
    data: {
      reg_mode: regMode,
    },
  };
  return c.json(res, 200);
});

/**
 * 用户注册
 * POST /api/auth/register
 */
authRouter.post('/register', async (c) => {
  try {
    const regMode = getRegMode(c.env);

    // 当 REG_MODE 为 0 时，系统禁止注册
    if (regMode === 0) {
      const res: ApiResponse = {
        success: false,
        error: '系统当前未开放注册，请联系管理员或稍后再试',
      };
      return c.json(res, 403);
    }

    const body = await c.req.json<RegisterRequest>();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const inviteCodeRaw = typeof body.invite_code === 'string' ? body.invite_code.trim().toUpperCase() : undefined;

    // 当 REG_MODE 为 1 时，必须提供有效邀请码
    let validInviteCodeRecord: InviteCode | null = null;
    if (regMode === 1) {
      if (!inviteCodeRaw) {
        const res: ApiResponse = {
          success: false,
          error: '当前系统为邀请注册模式，请输入邀请码',
        };
        return c.json(res, 400);
      }

      validInviteCodeRecord = await c.env.DB.prepare(
        'SELECT code, creator_id, used_by, status, created_at, used_at FROM invite_codes WHERE code = ?'
      )
        .bind(inviteCodeRaw)
        .first<InviteCode>();

      if (!validInviteCodeRecord || validInviteCodeRecord.status !== 'unused') {
        const res: ApiResponse = {
          success: false,
          error: '邀请码无效或已被使用',
        };
        return c.json(res, 400);
      }
    } else if (regMode === 2 && inviteCodeRaw) {
      // REG_MODE 为 2 时邀请码为可选，若用户输入了有效未使用的邀请码则予以关联
      validInviteCodeRecord = await c.env.DB.prepare(
        'SELECT code, creator_id, used_by, status, created_at, used_at FROM invite_codes WHERE code = ?'
      )
        .bind(inviteCodeRaw)
        .first<InviteCode>();
      if (validInviteCodeRecord && validInviteCodeRecord.status !== 'unused') {
        validInviteCodeRecord = null;
      }
    }

    // 1. Cloudflare Turnstile 人机验证
    const clientIp = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for');
    const turnstileCheck = await verifyTurnstileToken(c.env.TURNSTILE_SECRET_KEY, body.turnstile_token, clientIp);
    if (!turnstileCheck.success) {
      const res: ApiResponse = {
        success: false,
        error: turnstileCheck.message || '人机验证失败，请重试',
      };
      return c.json(res, 400);
    }

    if (!email || !isValidEmail(email)) {
      const res: ApiResponse = {
        success: false,
        error: '请输入有效的邮箱地址',
      };
      return c.json(res, 400);
    }

    if (email.length > 100) {
      const res: ApiResponse = {
        success: false,
        error: '邮箱长度不能超过 100 个字符',
      };
      return c.json(res, 400);
    }

    if (!password || password.length < 6) {
      const res: ApiResponse = {
        success: false,
        error: '密码长度至少需 6 位',
      };
      return c.json(res, 400);
    }

    if (password.length > 128) {
      const res: ApiResponse = {
        success: false,
        error: '密码长度不能超过 128 位',
      };
      return c.json(res, 400);
    }

    if (inviteCodeRaw && inviteCodeRaw.length > 50) {
      const res: ApiResponse = {
        success: false,
        error: '邀请码格式无效',
      };
      return c.json(res, 400);
    }

    // 查重：验证邮箱是否已被占用
    const existing = await c.env.DB.prepare('SELECT user_id FROM users WHERE email = ?')
      .bind(email)
      .first<{ user_id: string }>();

    if (existing) {
      const res: ApiResponse = {
        success: false,
        error: '该邮箱已被注册，请直接登录',
      };
      return c.json(res, 400);
    }

    const userId = `usr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const passwordHash = await hashPassword(password);
    const now = new Date().toISOString();
    const invitedBy = validInviteCodeRecord ? validInviteCodeRecord.creator_id : null;
    const recoveryCode = generateRecoveryCode();

    // 1. 写入用户表 (包含 8 位密码恢复码)
    await c.env.DB.prepare(
      'INSERT INTO users (user_id, email, password_hash, invited_by, recovery_code, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(userId, email, passwordHash, invitedBy, recoveryCode, now, now)
      .run();

    // 2. 若使用了有效邀请码，标记邀请码为已使用 (BUG-S04 原子条件更新防 TOCTOU)
    if (validInviteCodeRecord) {
      const updateResult = await c.env.DB.prepare(
        'UPDATE invite_codes SET status = ?, used_by = ?, used_at = ? WHERE code = ? AND status = ?'
      )
        .bind('used', userId, now, validInviteCodeRecord.code, 'unused')
        .run();

      if (regMode === 1 && (!updateResult.meta.changes || updateResult.meta.changes === 0)) {
        await c.env.DB.prepare('DELETE FROM users WHERE user_id = ?').bind(userId).run();
        const res: ApiResponse = {
          success: false,
          error: '邀请码已被其他用户同时使用，请更换邀请码',
        };
        return c.json(res, 400);
      }
    }

    // 3. 自动为新用户创建默认日常账本
    const defaultLedgerId = `led_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await c.env.DB.prepare(
      'INSERT INTO ledgers (ledger_id, user_id, name, currency, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
    )
      .bind(defaultLedgerId, userId, '默认账本', 'CNY', now, now)
      .run();

    // 4. 签发 JWT
    const secret = getJwtSecret(c.env);
    const token = await generateJwtToken({ user_id: userId, email }, secret, TOKEN_EXPIRY_SECONDS);

    const authUser: AuthUser = {
      user_id: userId,
      email,
      created_at: now,
      default_ledger_id: defaultLedgerId,
      invited_by: invitedBy,
      recovery_code: recoveryCode,
    };

    const res: ApiResponse<AuthResponse> = {
      success: true,
      data: {
        user: authUser,
        token,
        expires_in: TOKEN_EXPIRY_SECONDS,
        new_recovery_code: recoveryCode,
      },
      message: '注册成功，欢迎使用账盾',
    };

    return c.json(res, 201);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '注册失败，请稍后重试',
    };
    return c.json(res, 500);
  }
});

/**
 * 用户登录
 * POST /api/auth/login
 */
authRouter.post('/login', async (c) => {
  try {
    const body = await c.req.json<LoginRequest>();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    // 1. Cloudflare Turnstile 人机验证
    const clientIp = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for');
    const turnstileCheck = await verifyTurnstileToken(c.env.TURNSTILE_SECRET_KEY, body.turnstile_token, clientIp);
    if (!turnstileCheck.success) {
      const res: ApiResponse = {
        success: false,
        error: turnstileCheck.message || '人机验证失败，请重试',
      };
      return c.json(res, 400);
    }

    if (!email || !password) {
      const res: ApiResponse = {
        success: false,
        error: '请输入邮箱和密码',
      };
      return c.json(res, 400);
    }

    if (email.length > 100) {
      const res: ApiResponse = {
        success: false,
        error: '邮箱长度不能超过 100 个字符',
      };
      return c.json(res, 400);
    }

    if (password.length > 128) {
      const res: ApiResponse = {
        success: false,
        error: '密码长度不能超过 128 位',
      };
      return c.json(res, 400);
    }

    // 查询用户
    const user = await c.env.DB.prepare(
      'SELECT user_id, email, password_hash, invited_by, recovery_code, created_at, updated_at FROM users WHERE email = ?'
    )
      .bind(email)
      .first<User>();

    if (!user || !user.password_hash) {
      const res: ApiResponse = {
        success: false,
        error: '邮箱或密码错误',
      };
      return c.json(res, 401);
    }

    // 校验密码
    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch) {
      const res: ApiResponse = {
        success: false,
        error: '邮箱或密码错误',
      };
      return c.json(res, 401);
    }

    // 若登录时发现用户没有恢复码，则自动生成一个并绑定提供给用户
    let newRecoveryCode: string | null = null;
    let currentRecoveryCode = user.recovery_code;
    if (!currentRecoveryCode) {
      newRecoveryCode = generateRecoveryCode();
      currentRecoveryCode = newRecoveryCode;
      const now = new Date().toISOString();
      await c.env.DB.prepare('UPDATE users SET recovery_code = ?, updated_at = ? WHERE user_id = ?')
        .bind(newRecoveryCode, now, user.user_id)
        .run();
    }

    // 获取用户默认账本
    const defaultLedger = await c.env.DB.prepare(
      'SELECT ledger_id FROM ledgers WHERE user_id = ? AND is_default = 1 LIMIT 1'
    )
      .bind(user.user_id)
      .first<Ledger>();

    // 签发 JWT
    const secret = getJwtSecret(c.env);
    const token = await generateJwtToken(
      { user_id: user.user_id, email: user.email },
      secret,
      TOKEN_EXPIRY_SECONDS
    );

    const authUser: AuthUser = {
      user_id: user.user_id,
      email: user.email,
      created_at: user.created_at,
      default_ledger_id: defaultLedger?.ledger_id,
      invited_by: user.invited_by,
      recovery_code: currentRecoveryCode,
    };

    const res: ApiResponse<AuthResponse> = {
      success: true,
      data: {
        user: authUser,
        token,
        expires_in: TOKEN_EXPIRY_SECONDS,
        new_recovery_code: newRecoveryCode,
      },
      message: '登录成功',
    };

    return c.json(res, 200);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '登录失败，请稍后重试',
    };
    return c.json(res, 500);
  }
});

/**
 * 获取当前登录用户信息
 * GET /api/auth/me
 */
authRouter.get('/me', requireAuth, async (c) => {
  try {
    const jwtUser = c.get('user')!;

    const user = await c.env.DB.prepare(
      'SELECT user_id, email, invited_by, recovery_code, created_at, updated_at FROM users WHERE user_id = ?'
    )
      .bind(jwtUser.userId)
      .first<User>();

    if (!user) {
      const res: ApiResponse = {
        success: false,
        error: '用户不存在或已注销',
      };
      return c.json(res, 404);
    }

    const defaultLedger = await c.env.DB.prepare(
      'SELECT ledger_id FROM ledgers WHERE user_id = ? AND is_default = 1 LIMIT 1'
    )
      .bind(user.user_id)
      .first<Ledger>();

    const authUser: AuthUser = {
      user_id: user.user_id,
      email: user.email,
      created_at: user.created_at,
      default_ledger_id: defaultLedger?.ledger_id,
      invited_by: user.invited_by,
      recovery_code: user.recovery_code,
    };

    const res: ApiResponse<AuthUser> = {
      success: true,
      data: authUser,
    };

    return c.json(res, 200);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '获取用户信息失败',
    };
    return c.json(res, 500);
  }
});

/**
 * 找回密码 (凭 8 位密码恢复码重置密码)
 * POST /api/auth/reset-password
 */
authRouter.post('/reset-password', async (c) => {
  try {
    const body = await c.req.json<ResetPasswordRequest>();
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const recoveryCodeInput = typeof body.recovery_code === 'string' ? body.recovery_code.trim().toUpperCase() : '';
    const newPassword = typeof body.new_password === 'string' ? body.new_password : '';

    // 1. Cloudflare Turnstile 人机验证
    const clientIp = c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for');
    const turnstileCheck = await verifyTurnstileToken(c.env.TURNSTILE_SECRET_KEY, body.turnstile_token, clientIp);
    if (!turnstileCheck.success) {
      const res: ApiResponse = {
        success: false,
        error: turnstileCheck.message || '人机验证失败，请重试',
      };
      return c.json(res, 400);
    }

    if (!email || !isValidEmail(email)) {
      const res: ApiResponse = {
        success: false,
        error: '请输入有效的邮箱地址',
      };
      return c.json(res, 400);
    }

    if (email.length > 100) {
      const res: ApiResponse = {
        success: false,
        error: '邮箱长度不能超过 100 个字符',
      };
      return c.json(res, 400);
    }

    if (!recoveryCodeInput) {
      const res: ApiResponse = {
        success: false,
        error: '请输入 8 位密码恢复码',
      };
      return c.json(res, 400);
    }

    if (recoveryCodeInput.length > 32) {
      const res: ApiResponse = {
        success: false,
        error: '恢复码格式无效',
      };
      return c.json(res, 400);
    }

    if (!newPassword || newPassword.length < 6) {
      const res: ApiResponse = {
        success: false,
        error: '新密码长度至少需 6 位',
      };
      return c.json(res, 400);
    }

    if (newPassword.length > 128) {
      const res: ApiResponse = {
        success: false,
        error: '新密码长度不能超过 128 位',
      };
      return c.json(res, 400);
    }

    const user = await c.env.DB.prepare(
      'SELECT user_id, email, recovery_code FROM users WHERE email = ?'
    )
      .bind(email)
      .first<User>();

    if (!user) {
      const res: ApiResponse = {
        success: false,
        error: '该邮箱不存在或恢复码错误',
      };
      return c.json(res, 400);
    }

    // 恢复码校验 (不区分大小写，已转为全大写比对，使用常数时间比对防止时序攻击 BUG-S08)
    const userRecoveryCode = (user.recovery_code || '').trim().toUpperCase();
    if (!userRecoveryCode || !timingSafeEqualString(userRecoveryCode, recoveryCodeInput)) {
      const res: ApiResponse = {
        success: false,
        error: '密码恢复码错误，请核对后重试',
      };
      return c.json(res, 400);
    }

    // 密码加密并更新，轮换生成新的 8 位恢复码 (BUG-S03)
    const passwordHash = await hashPassword(newPassword);
    const newRecoveryCode = generateRecoveryCode();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      'UPDATE users SET password_hash = ?, recovery_code = ?, updated_at = ? WHERE user_id = ?'
    )
      .bind(passwordHash, newRecoveryCode, now, user.user_id)
      .run();

    const res: ApiResponse<{ new_recovery_code: string }> = {
      success: true,
      message: '密码重置成功，请使用新密码登录',
      data: {
        new_recovery_code: newRecoveryCode,
      },
    };

    return c.json(res, 200);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '重置密码失败，请稍后重试',
    };
    return c.json(res, 500);
  }
});

/**
 * 用户注销账户 (删除系统中其所关联的所有记录)
 * DELETE /api/auth/account
 */
authRouter.delete('/account', requireAuth, async (c) => {
  try {
    const jwtUser = c.get('user')!;
    const userId = jwtUser.userId;

    // BUG-S12: 使用 D1 atomic batch 确保注销账户级联删除的事务原子性
    const batchStatements: D1PreparedStatement[] = [
      c.env.DB.prepare('DELETE FROM transactions WHERE user_id = ?').bind(userId),
      c.env.DB.prepare('DELETE FROM budgets WHERE user_id = ?').bind(userId),
      c.env.DB.prepare('DELETE FROM ledgers WHERE user_id = ?').bind(userId),
      c.env.DB.prepare('DELETE FROM categories WHERE user_id = ?').bind(userId),
      c.env.DB.prepare('DELETE FROM invite_codes WHERE creator_id = ?').bind(userId),
      c.env.DB.prepare('UPDATE invite_codes SET used_by = NULL WHERE used_by = ?').bind(userId),
      c.env.DB.prepare('DELETE FROM recurring_rules WHERE user_id = ?').bind(userId),
      c.env.DB.prepare('DELETE FROM users WHERE user_id = ?').bind(userId),
    ];

    await c.env.DB.batch(batchStatements);

    const res: ApiResponse = {
      success: true,
      message: '账号及所有关联数据已成功注销',
    };

    return c.json(res, 200);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '注销失败，请稍后重试',
    };
    return c.json(res, 500);
  }
});

/**
 * 获取当前登录用户的邀请码列表与获取资格
 * GET /api/auth/invite-codes
 */
authRouter.get('/invite-codes', requireAuth, async (c) => {
  try {
    const jwtUser = c.get('user')!;

    const user = await c.env.DB.prepare(
      'SELECT user_id, email, created_at, updated_at FROM users WHERE user_id = ?'
    )
      .bind(jwtUser.userId)
      .first<User>();

    if (!user) {
      const res: ApiResponse = {
        success: false,
        error: '用户不存在',
      };
      return c.json(res, 404);
    }

    // 1. 查询用户是否已写入过记账数据及首次记账时间
    const txRow = await c.env.DB.prepare(
      'SELECT COUNT(*) as count, MIN(created_at) as first_created_at, MIN(transaction_date) as first_tx_date FROM transactions WHERE user_id = ?'
    )
      .bind(user.user_id)
      .first<{ count: number; first_created_at: string | null; first_tx_date: string | null }>();

    const hasRecordedTransaction = (txRow?.count || 0) > 0;
    const firstTxDate = txRow?.first_created_at || txRow?.first_tx_date || null;

    // 2. 查询用户已生成的邀请码
    const inviteCodesResult = await c.env.DB.prepare(
      'SELECT code, creator_id, used_by, status, created_at, used_at FROM invite_codes WHERE creator_id = ? ORDER BY created_at DESC'
    )
      .bind(user.user_id)
      .all<InviteCode>();

    const inviteCodes = inviteCodesResult.results || [];

    // 3. 计算获取资格 (基于首次记账时间)
    const eligibility = calculateInviteEligibility(
      user.created_at,
      hasRecordedTransaction,
      inviteCodes.length,
      Date.now(),
      firstTxDate
    );

    const data: InviteEligibilityInfo = {
      ...eligibility,
      invite_codes: inviteCodes,
    };

    const res: ApiResponse<InviteEligibilityInfo> = {
      success: true,
      data,
    };

    return c.json(res, 200);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '获取邀请码信息失败',
    };
    return c.json(res, 500);
  }
});

/**
 * 领取/生成新的邀请码
 * POST /api/auth/invite-codes
 */
authRouter.post('/invite-codes', requireAuth, async (c) => {
  try {
    const jwtUser = c.get('user')!;

    const user = await c.env.DB.prepare(
      'SELECT user_id, email, created_at, updated_at FROM users WHERE user_id = ?'
    )
      .bind(jwtUser.userId)
      .first<User>();

    if (!user) {
      const res: ApiResponse = {
        success: false,
        error: '用户不存在',
      };
      return c.json(res, 404);
    }

    // 1. 检查是否写入过记账数据及首次记账时间
    const txRow = await c.env.DB.prepare(
      'SELECT COUNT(*) as count, MIN(created_at) as first_created_at, MIN(transaction_date) as first_tx_date FROM transactions WHERE user_id = ?'
    )
      .bind(user.user_id)
      .first<{ count: number; first_created_at: string | null; first_tx_date: string | null }>();

    const hasRecordedTransaction = (txRow?.count || 0) > 0;
    const firstTxDate = txRow?.first_created_at || txRow?.first_tx_date || null;

    // 2. 检查已生成的邀请码数量
    const inviteCodesResult = await c.env.DB.prepare(
      'SELECT code, creator_id, used_by, status, created_at, used_at FROM invite_codes WHERE creator_id = ? ORDER BY created_at DESC'
    )
      .bind(user.user_id)
      .all<InviteCode>();

    const inviteCodes = inviteCodesResult.results || [];

    // 3. 计算资格 (基于首次记账时间)
    const eligibility = calculateInviteEligibility(
      user.created_at,
      hasRecordedTransaction,
      inviteCodes.length,
      Date.now(),
      firstTxDate
    );

    if (!eligibility.can_generate) {
      let reason = '当前暂无可领取的邀请码';
      if (!hasRecordedTransaction) {
        reason = '需先写入至少一笔记账数据以激活邀请资格';
      } else if (inviteCodes.length >= 3) {
        reason = '已达到邀请码获取上限（最多 3 个）';
      } else if (eligibility.next_unlock_date) {
        reason = `下一个邀请码将于 ${new Date(eligibility.next_unlock_date).toLocaleDateString()} 解锁`;
      }
      const res: ApiResponse = {
        success: false,
        error: reason,
      };
      return c.json(res, 400);
    }

    // 4. 生成唯一邀请码
    let newCode = generateRandomInviteCode();
    let isUnique = false;
    for (let attempts = 0; attempts < 5; attempts++) {
      const existing = await c.env.DB.prepare('SELECT code FROM invite_codes WHERE code = ?')
        .bind(newCode)
        .first<{ code: string }>();
      if (!existing) {
        isUnique = true;
        break;
      }
      newCode = generateRandomInviteCode();
    }

    if (!isUnique) {
      newCode = `INV-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    }

    const now = new Date().toISOString();

    // BUG-S05: 原子条件插入，防止并发请求突破配额上限 (<= 3)
    const insertResult = await c.env.DB.prepare(
      `INSERT INTO invite_codes (code, creator_id, status, created_at)
       SELECT ?, ?, 'unused', ?
       WHERE (SELECT COUNT(*) FROM invite_codes WHERE creator_id = ?) < ?`
    )
      .bind(
        newCode,
        user.user_id,
        now,
        user.user_id,
        Math.min(eligibility.total_eligible, 3)
      )
      .run();

    if (!insertResult.meta.changes || insertResult.meta.changes === 0) {
      const res: ApiResponse = {
        success: false,
        error: '已达到当前可领取的邀请码上限，请勿重复提交',
      };
      return c.json(res, 400);
    }

    const createdInviteCode: InviteCode = {
      code: newCode,
      creator_id: user.user_id,
      status: 'unused',
      created_at: now,
    };

    const res: ApiResponse<InviteCode> = {
      success: true,
      data: createdInviteCode,
      message: '邀请码生成成功',
    };

    return c.json(res, 201);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: err?.message || '生成邀请码失败',
    };
    return c.json(res, 500);
  }
});

export default authRouter;

