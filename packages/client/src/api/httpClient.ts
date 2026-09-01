/**
 * 账盾 - 统一 HTTP 客户端与网络请求底层封装 (HTTP Client)
 * 遵循《白皮书 2.0 & 7.3 弱网/无网与统一认证》规范：
 * - 安全解析服务端响应 (杜绝 HTML 404/502 SPA 回退引发 JSON 解析异常)
 * - 统一 401/403 会话失效与未授权事件广播
 * - 集中化 API 地址构造与连通性测试
 */

import { ApiResponse } from '@ledger/shared';
import {
  API_URL_STORAGE_KEY,
  saveSyncConfig,
  TOKEN_KEY,
} from '../sync/syncAdapter';

export const USER_KEY = 'serverless_ledger_user';

/**
 * 获取用户手动配置的自定义 API 地址 (若无则返回空字符串)
 */
export function getCustomApiUrl(): string {
  if (typeof localStorage === 'undefined') return '';
  return (localStorage.getItem(API_URL_STORAGE_KEY) || '').trim();
}

/**
 * 设置或清除用户自定义 API 地址
 */
export function setCustomApiUrl(url: string) {
  if (typeof localStorage === 'undefined') return;
  const trimmed = url.trim().replace(/\/+$/, '');
  if (!trimmed) {
    localStorage.removeItem(API_URL_STORAGE_KEY);
  } else {
    localStorage.setItem(API_URL_STORAGE_KEY, trimmed);
  }
  saveSyncConfig({ serverUrl: trimmed });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('api:endpoint_changed', { detail: { url: trimmed } }));
  }
}

/**
 * 获取当前全局生效的 API Base URL (末尾不带斜杠，如 "https://domain.com/api" 或 "/api")
 */
export function getApiBase(): string {
  const custom = getCustomApiUrl();
  if (custom) {
    const cleanCustom = custom.replace(/\/+$/, '');
    return cleanCustom.endsWith('/api') ? cleanCustom : `${cleanCustom}/api`;
  }
  const envUrl = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
    ? import.meta.env.VITE_API_URL.replace(/\/+$/, '')
    : '';
  if (envUrl) {
    return envUrl.endsWith('/api') ? envUrl : `${envUrl}/api`;
  }
  return '/api';
}

/**
 * 构造标准 API 端点完整 URL
 */
export function apiUrl(path: string): string {
  const base = getApiBase();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * 获取当前使用的 API 主机展示名称
 */
export function getDisplayApiHost(): string {
  const base = getApiBase();
  if (base.startsWith('http://') || base.startsWith('https://')) {
    try {
      const u = new URL(base);
      return `${u.protocol}//${u.host}`;
    } catch {
      return base;
    }
  }
  return '同源相对路径 (/api)';
}

/**
 * 安全解析服务端响应，杜绝 HTML 404 / 502 / SPA fallback 导致 JSON.parse 崩溃
 */
export async function safeParseApiResponse<T = any>(res: Response): Promise<ApiResponse<T>> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  let text = '';
  try {
    text = await res.text();
  } catch (err: any) {
    return {
      success: false,
      error: `无法读取服务端响应: ${err?.message || '网络连接中断'}`,
    };
  }

  const trimmed = text.trim();

  // 空响应体处理
  if (!trimmed) {
    if (!res.ok) {
      return {
        success: false,
        error: `服务器响应异常 (HTTP ${res.status} ${res.statusText || ''})`.trim(),
      };
    }
    return { success: true } as ApiResponse<T>;
  }

  // 关键防御：如果返回内容以 '<' 开头，或者 Content-Type 包含 text/html / xml
  if (trimmed.startsWith('<') || contentType.includes('text/html') || contentType.includes('text/xml')) {
    if (res.status === 404) {
      return {
        success: false,
        error: `API 接口未找到 (HTTP 404)。请确认后端服务已部署且 API 服务器地址配置正确。`,
      };
    } else if (res.status === 502 || res.status === 503 || res.status === 504) {
      return {
        success: false,
        error: `后端网关或边缘服务异常 (HTTP ${res.status})，请稍后重试或检查 Cloudflare Workers / D1 状态。`,
      };
    } else if (res.status === 401 || res.status === 403) {
      return {
        success: false,
        error: `未授权访问或登录凭证已失效 (HTTP ${res.status})。`,
      };
    } else if (res.ok) {
      return {
        success: false,
        error: `API 服务端地址未正确配置 (服务端返回了 HTML 页面而非 API 数据)。如果您使用的是手机 App 或独立部署，请点击下方设置后端服务器地址。`,
      };
    } else {
      return {
        success: false,
        error: `服务端返回了非 JSON 格式的网页内容 (HTTP ${res.status})，请检查后端 API 服务地址。`,
      };
    }
  }

  try {
    const json = JSON.parse(text) as ApiResponse<T>;
    if (!res.ok && json && typeof json === 'object' && !json.error) {
      json.error = `请求失败 (HTTP ${res.status})`;
      json.success = false;
    }
    return json;
  } catch {
    return {
      success: false,
      error: `服务端数据解析异常: ${text.slice(0, 120)}`,
    };
  }
}

/**
 * 测试指定或当前 API 服务端地址的连通性与往返延迟
 */
export async function testApiConnection(customUrl?: string): Promise<{
  success: boolean;
  latencyMs?: number;
  message: string;
  error?: string;
  data?: any;
  targetBase?: string;
}> {
  let targetBase: string;
  if (customUrl !== undefined) {
    const clean = customUrl.trim().replace(/\/+$/, '');
    if (!clean) {
      targetBase = ((typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
        ? import.meta.env.VITE_API_URL.replace(/\/+$/, '')
        : '') + '/api';
      if (!targetBase.startsWith('http')) targetBase = '/api';
    } else {
      targetBase = clean.endsWith('/api') ? clean : `${clean}/api`;
    }
  } else {
    targetBase = getApiBase();
  }

  // 将相对路径解析为绝对完整路径，以便在 UI 给出清晰明确的真实路由反馈
  if (typeof window !== 'undefined' && !targetBase.startsWith('http')) {
    try {
      targetBase = new URL(targetBase, window.location.origin).href.replace(/\/+$/, '');
    } catch {}
  }

  const startTime = performance.now();
  try {
    const res = await fetch(`${targetBase}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    });

    const latency = Math.round(performance.now() - startTime);
    const parsed = await safeParseApiResponse<any>(res);

    if (res.ok && parsed.success) {
      return {
        success: true,
        latencyMs: latency,
        message: `连接成功 (延迟 ${latency}ms)`,
        data: parsed.data,
        targetBase,
      };
    } else {
      const errMsg = parsed.error || `服务端响应异常 (HTTP ${res.status})`;
      return {
        success: false,
        latencyMs: latency,
        message: errMsg,
        error: errMsg,
        targetBase,
      };
    }
  } catch (err: any) {
    const latency = Math.round(performance.now() - startTime);
    const isTimeout = err?.name === 'TimeoutError' || err?.message?.includes('timeout');
    const errMsg = isTimeout ? '连接超时 (5000ms)，请检查网络或后端地址' : (err?.message || '无法连接到服务器');
    return {
      success: false,
      latencyMs: latency,
      message: errMsg,
      error: errMsg,
      targetBase,
    };
  }
}

/**
 * 全局统一 401/403 会话失效与未授权处理器
 */
export function handleUnauthorizedResponse() {
  const hadToken = typeof localStorage !== 'undefined' && !!localStorage.getItem(TOKEN_KEY);
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
  saveSyncConfig({ authToken: '', provider: 'none' });
  if (hadToken && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }
}

/**
 * 带有统一 401/403 拦截与状态码分发的全局 API 请求封装
 */
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const hadToken = typeof localStorage !== 'undefined' && !!localStorage.getItem(TOKEN_KEY);
  const res = await fetch(input, init);
  if ((res.status === 401 || res.status === 403) && hadToken) {
    handleUnauthorizedResponse();
  }
  return res;
}

/**
 * 获取包含 Bearer Token 的标准请求头
 */
export function getAuthHeaders(customHeaders: Record<string, string> = {}): HeadersInit {
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}
