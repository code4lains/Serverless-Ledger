/**
 * 账盾 - 云端身份认证与会话管理 (Cloud Auth)
 * 遵循《白皮书 2.0 & 7.3 统一认证》规范：
 * - 用户注册、登录、信息校验、邀请码领取、重置密码、注销账户
 * - 本地 Token 与 AuthUser 状态持久化管理
 */

import {
  ApiResponse,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  AuthUser,
  AuthConfig,
  InviteCode,
  InviteEligibilityInfo,
  ResetPasswordRequest,
  ExecuteDueRecurringResult,
} from '@ledger/shared';
import {
  TOKEN_KEY,
  saveSyncConfig,
  isCloudSyncEnabled,
} from '../sync/syncAdapter';
import {
  apiFetch,
  apiUrl,
  safeParseApiResponse,
  getAuthHeaders,
  USER_KEY,
} from './httpClient';

/**
 * 本地持久化 Token 读取
 */
export function getStoredToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

/**
 * 本地持久化用户信息读取
 */
export function getStoredUser(): AuthUser | null {
  if (typeof localStorage === 'undefined') return null;
  const userStr = localStorage.getItem(USER_KEY);
  if (!userStr) return null;
  try {
    return JSON.parse(userStr) as AuthUser;
  } catch {
    return null;
  }
}

/**
 * 保存用户登录会话
 */
export function setSession(auth: AuthResponse) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(TOKEN_KEY, auth.token);
  localStorage.setItem(USER_KEY, JSON.stringify(auth.user));
  saveSyncConfig({ authToken: auth.token, provider: 'cloudflare_d1' });
}

/**
 * 兼容别名：保存用户会话
 */
export const saveSession = setSession;

/**
 * 清除用户登录会话
 */
export function clearSession() {
  if (typeof localStorage === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  saveSyncConfig({ authToken: '', provider: 'none' });
}

/**
 * 用户注册 API
 */
export async function registerUser(req: RegisterRequest): Promise<ApiResponse<AuthResponse>> {
  try {
    const res = await apiFetch(apiUrl('/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(6000),
    });
    const json = await safeParseApiResponse<AuthResponse>(res);
    if (res.ok && json.success && json.data) {
      setSession(json.data);
    }
    return json;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || '网络连接异常，注册失败',
    };
  }
}

/**
 * 用户登录 API
 */
export async function loginUser(req: LoginRequest): Promise<ApiResponse<AuthResponse>> {
  try {
    const res = await apiFetch(apiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(6000),
    });
    const json = await safeParseApiResponse<AuthResponse>(res);
    if (res.ok && json.success && json.data) {
      setSession(json.data);
    }
    return json;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || '网络连接异常，登录失败',
    };
  }
}

/**
 * 获取当前登录用户信息 (验证 Token 有效性)
 */
export async function fetchCurrentUser(): Promise<ApiResponse<AuthUser>> {
  const token = getStoredToken();
  if (!token) {
    return { success: false, error: '未登录' };
  }

  try {
    const res = await apiFetch(apiUrl('/auth/me'), {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(4000),
    });
    const json = await safeParseApiResponse<AuthUser>(res);
    if (!res.ok || !json.success) {
      clearSession();
    } else if (json.data) {
      localStorage.setItem(USER_KEY, JSON.stringify(json.data));
    }
    return json;
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

/**
 * 获取服务端注册模式与认证配置
 */
export async function getAuthConfig(): Promise<ApiResponse<AuthConfig>> {
  try {
    const res = await apiFetch(apiUrl('/auth/config'), {
      signal: AbortSignal.timeout(3000),
    });
    const json = await safeParseApiResponse<AuthConfig>(res);
    if (json.success && json.data) {
      return json;
    }
    return {
      success: true,
      data: {
        reg_mode: 1,
        turnstile_site_key: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TURNSTILE_SITE_KEY) || null,
        turnstile_enabled: Boolean(typeof import.meta !== 'undefined' && import.meta.env?.VITE_TURNSTILE_SITE_KEY),
      },
    };
  } catch {
    return {
      success: true,
      data: {
        reg_mode: 1,
        turnstile_site_key: (typeof import.meta !== 'undefined' && import.meta.env?.VITE_TURNSTILE_SITE_KEY) || null,
        turnstile_enabled: Boolean(typeof import.meta !== 'undefined' && import.meta.env?.VITE_TURNSTILE_SITE_KEY),
      },
    };
  }
}

/**
 * 获取当前登录用户的邀请码信息与获取资格
 */
export async function getInviteCodes(): Promise<ApiResponse<InviteEligibilityInfo>> {
  try {
    const res = await apiFetch(apiUrl('/auth/invite-codes'), {
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(4000),
    });
    return await safeParseApiResponse<InviteEligibilityInfo>(res);
  } catch (err: any) {
    return {
      success: false,
      error: err.message || '获取邀请码信息失败',
    };
  }
}

/**
 * 领取/生成新的邀请码
 */
export async function claimInviteCode(): Promise<ApiResponse<InviteCode>> {
  try {
    const res = await apiFetch(apiUrl('/auth/invite-codes'), {
      method: 'POST',
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(4000),
    });
    return await safeParseApiResponse<InviteCode>(res);
  } catch (err: any) {
    return {
      success: false,
      error: err.message || '生成邀请码失败',
    };
  }
}

/**
 * 找回密码 (凭 8 位密码恢复码重置密码)
 */
export async function resetPassword(req: ResetPasswordRequest): Promise<ApiResponse<void>> {
  try {
    const res = await apiFetch(apiUrl('/auth/reset-password'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(6000),
    });
    return await safeParseApiResponse<void>(res);
  } catch (err: any) {
    return {
      success: false,
      error: err.message || '网络连接异常，重置密码失败',
    };
  }
}

/**
 * 用户注销账户
 */
export async function deleteAccount(): Promise<ApiResponse<void>> {
  try {
    const res = await apiFetch(apiUrl('/auth/account'), {
      method: 'DELETE',
      headers: getAuthHeaders(),
      signal: AbortSignal.timeout(8000),
    });
    const json = await safeParseApiResponse<void>(res);
    if (res.ok && json.success) {
      clearSession();
    }
    return json;
  } catch (err: any) {
    return {
      success: false,
      error: err.message || '网络连接异常，注销账户失败',
    };
  }
}

/**
 * 触发服务端执行到期周期规则
 */
export async function executeDueRecurringRules(
  asOfDate?: string
): Promise<ApiResponse<ExecuteDueRecurringResult>> {
  const token = getStoredToken();
  if (!token || !isCloudSyncEnabled()) {
    return {
      success: false,
      error: '离线或未启用云同步模式，在本地执行周期规则',
    };
  }
  try {
    const res = await apiFetch(apiUrl('/recurring/execute-due'), {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ as_of_date: asOfDate }),
      signal: AbortSignal.timeout(6000),
    });

    return await safeParseApiResponse<ExecuteDueRecurringResult>(res);
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || '网络请求错误，无法执行到期周期规则',
    };
  }
}
