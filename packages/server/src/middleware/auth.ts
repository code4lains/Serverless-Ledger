import { Context, Next } from 'hono';
import { Env, AppVariables } from '../types';
import { verifyJwtToken, getJwtSecret } from '../utils/auth';
import { ApiResponse, JwtPayload } from '@ledger/shared';
import { D1UserRepository } from '../repositories/D1UserRepository';

type AuthContext = Context<{ Bindings: Env; Variables: AppVariables }>;

/**
 * 严格认证中间件：请求必须携带有效的 Bearer JWT
 */
export async function requireAuth(c: AuthContext, next: Next) {
  // BUG-S10 优化：若 optionalAuth 已经成功解析并校验了用户合法性，直接复用，避免重复查询 D1 数据库
  if (c.get('user')) {
    await next();
    return;
  }

  const authHeader = c.req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const res: ApiResponse = {
      success: false,
      error: '请先登录 (未提供有效认证凭证)',
    };
    return c.json(res, 401);
  }

  const token = authHeader.substring(7).trim();
  let secret: string;
  try {
    secret = getJwtSecret(c.env);
  } catch (err: any) {
    const res: ApiResponse = {
      success: false,
      error: '服务端安全配置错误：生产环境未配置 JWT_SECRET',
    };
    return c.json(res, 500);
  }

  let payload: JwtPayload;
  try {
    payload = await verifyJwtToken(token, secret);
  } catch {
    const res: ApiResponse = {
      success: false,
      error: '登录已过期或无效，请重新登录',
    };
    return c.json(res, 401);
  }

  // 校验数据库中用户是否仍存在，防止已删除用户的 JWT 仍可使用
  try {
    if (c.env?.DB) {
      const userRepo = new D1UserRepository(c.env.DB);
      const user = await userRepo.findById(payload.userId);

      if (!user) {
        const res: ApiResponse = {
          success: false,
          error: '用户不存在或已被注销，请重新登录',
        };
        return c.json(res, 401);
      }
    }

    c.set('user', payload);
    await next();
  } catch (dbErr: any) {
    console.error('Database query error in requireAuth:', dbErr);
    const res: ApiResponse = {
      success: false,
      error: '数据库查询异常，请稍后重试',
    };
    return c.json(res, 500);
  }
}

/**
 * 可选认证中间件：若携带 Token 则解析，若未携带则作为访客继续执行
 */
export async function optionalAuth(c: AuthContext, next: Next) {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    let secret: string;
    try {
      secret = getJwtSecret(c.env);
    } catch (err: any) {
      const res: ApiResponse = {
        success: false,
        error: '服务端安全配置错误：生产环境未配置 JWT_SECRET',
      };
      return c.json(res, 500);
    }

    try {
      const payload = await verifyJwtToken(token, secret);
      if (c.env?.DB) {
        try {
          const userRepo = new D1UserRepository(c.env.DB);
          const user = await userRepo.findById(payload.userId);
          if (user) {
            c.set('user', payload);
          }
        } catch (dbErr) {
          console.error('Database error in optionalAuth:', dbErr);
        }
      } else {
        c.set('user', payload);
      }
    } catch {
      // 忽略无效 token，以访客处理
    }
  }

  await next();
}
