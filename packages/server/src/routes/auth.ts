import { Hono } from 'hono';
import { Env, AppVariables } from '../types';
import { hashPassword, verifyPassword, generateJwtToken, DEFAULT_JWT_SECRET, TOKEN_EXPIRY_SECONDS } from '../utils/auth';
import { verifyTurnstileToken } from '../utils/turnstile';
import { requireAuth } from '../middleware/auth';
import { ApiResponse, AuthResponse, AuthUser, RegisterRequest, LoginRequest, User, Ledger } from '@ledger/shared';

const authRouter = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// 简单邮箱格式校验
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * 用户注册
 * POST /api/auth/register
 */
authRouter.post('/register', async (c) => {
  try {
    const body = await c.req.json<RegisterRequest>();
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

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

    if (!password || password.length < 6) {
      const res: ApiResponse = {
        success: false,
        error: '密码长度至少需 6 位',
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

    // 1. 写入用户表
    await c.env.DB.prepare(
      'INSERT INTO users (user_id, email, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
      .bind(userId, email, passwordHash, now, now)
      .run();

    // 2. 自动为新用户创建默认日常账本
    const defaultLedgerId = `led_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await c.env.DB.prepare(
      'INSERT INTO ledgers (ledger_id, user_id, name, currency, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
    )
      .bind(defaultLedgerId, userId, '默认账本', 'CNY', now, now)
      .run();

    // 3. 签发 JWT
    const secret = c.env.JWT_SECRET || DEFAULT_JWT_SECRET;
    const token = await generateJwtToken({ user_id: userId, email }, secret, TOKEN_EXPIRY_SECONDS);

    const authUser: AuthUser = {
      user_id: userId,
      email,
      created_at: now,
      default_ledger_id: defaultLedgerId,
    };

    const res: ApiResponse<AuthResponse> = {
      success: true,
      data: {
        user: authUser,
        token,
        expires_in: TOKEN_EXPIRY_SECONDS,
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
    const email = body.email?.trim().toLowerCase();
    const password = body.password;

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

    // 查询用户
    const user = await c.env.DB.prepare(
      'SELECT user_id, email, password_hash, created_at, updated_at FROM users WHERE email = ?'
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

    // 获取用户默认账本
    const defaultLedger = await c.env.DB.prepare(
      'SELECT ledger_id FROM ledgers WHERE user_id = ? AND is_default = 1 LIMIT 1'
    )
      .bind(user.user_id)
      .first<Ledger>();

    // 签发 JWT
    const secret = c.env.JWT_SECRET || DEFAULT_JWT_SECRET;
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
    };

    const res: ApiResponse<AuthResponse> = {
      success: true,
      data: {
        user: authUser,
        token,
        expires_in: TOKEN_EXPIRY_SECONDS,
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
      'SELECT user_id, email, created_at, updated_at FROM users WHERE user_id = ?'
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

export default authRouter;
