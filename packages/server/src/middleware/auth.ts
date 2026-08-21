import { Context, Next } from 'hono';
import { Env, AppVariables } from '../types';
import { verifyJwtToken, DEFAULT_JWT_SECRET } from '../utils/auth';
import { ApiResponse, JwtPayload } from '@ledger/shared';

type AuthContext = Context<{ Bindings: Env; Variables: AppVariables }>;

/**
 * 严格认证中间件：请求必须携带有效的 Bearer JWT
 */
export async function requireAuth(c: AuthContext, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const res: ApiResponse = {
      success: false,
      error: '请先登录 (未提供有效认证凭证)',
    };
    return c.json(res, 401);
  }

  const token = authHeader.substring(7).trim();
  const secret = c.env.JWT_SECRET || DEFAULT_JWT_SECRET;

  try {
    const payload = await verifyJwtToken(token, secret);
    c.set('user', payload);
    await next();
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: '登录已过期或无效，请重新登录',
    };
    return c.json(res, 401);
  }
}

/**
 * 可选认证中间件：若携带 Token 则解析，若未携带则作为访客继续执行
 */
export async function optionalAuth(c: AuthContext, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    const secret = c.env.JWT_SECRET || DEFAULT_JWT_SECRET;
    try {
      const payload = await verifyJwtToken(token, secret);
      c.set('user', payload);
    } catch {
      // 忽略无效 token，以访客处理
    }
  }

  await next();
}
