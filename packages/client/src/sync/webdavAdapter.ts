/**
 * 账盾 - WebDAV 同步适配器 (WebDAV Sync Adapter)
 * 遵循《账盾 v3 架构设计》与 RFC 4918 WebDAV 协议规范
 * 内置对浏览器跨域 (CORS) 代理中继及原生端直连的支持
 */

import { Capacitor, CapacitorHttp } from '@capacitor/core';
import {
  ISyncAdapter,
  SyncConfig,
  SyncProviderType,
  RemoteSnapshotMetadata,
  EncryptedBackupPackage,
} from '@ledger/shared';
import { getSyncConfig } from './syncConfig';

/**
 * 判断当前是否运行在原生移动端 App 环境 (Android / iOS)
 */
export function isNativeAppEnvironment(): boolean {
  try {
    return typeof Capacitor !== 'undefined' && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export class WebDavAdapter implements ISyncAdapter {
  readonly provider: SyncProviderType = 'webdav';
  private config: SyncConfig;

  constructor(config?: SyncConfig) {
    this.config = config || getSyncConfig();
  }

  /**
   * 构造 Basic Auth 认证头
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.config.webdavUsername && this.config.webdavPassword) {
      const token = btoa(
        unescape(
          encodeURIComponent(
            `${this.config.webdavUsername}:${this.config.webdavPassword}`
          )
        )
      );
      headers['Authorization'] = `Basic ${token}`;
    }
    return headers;
  }

  /**
   * 构建目标文件的完整 WebDAV URL (支持直连与 CORS 代理中继)
   */
  public resolveUrl(path: string, forceDirect: boolean = false): string {
    let baseUrl = (this.config.webdavUrl || '').trim();
    if (!baseUrl) {
      throw new Error('未配置 WebDAV 服务器地址');
    }
    // 去除末尾斜杠
    baseUrl = baseUrl.replace(/\/+$/, '');

    // 确保 path 以 / 开头
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const directUrl = `${baseUrl}${normalizedPath}`;

    // 原生 App (Capacitor/Android/iOS) 绝不使用相对路径的 CORS 代理，始终直连
    if (isNativeAppEnvironment()) {
      return directUrl;
    }

    if (!forceDirect && (this.config.useCorsProxy || this.config.corsProxyUrl)) {
      const proxyBase = (this.config.corsProxyUrl || '/api/webdav-proxy').trim();
      return `${proxyBase}?target=${encodeURIComponent(directUrl)}`;
    }

    return directUrl;
  }

  /**
   * 检测响应是否为 HTML 网页页面 (如误请求到了本地静态资源 index.html 或代理失效)
   */
  private isHtmlResponse(text: string): boolean {
    if (!text) return false;
    const trimmed = text.trimStart().toLowerCase();
    return (
      trimmed.startsWith('<!doctype') ||
      trimmed.startsWith('<html') ||
      trimmed.startsWith('<head')
    );
  }

  /**
   * 统一网络请求封装 (原生端走 CapacitorHttp 避开 CORS，网页端走标准 fetch)
   */
  private async executeRequest(
    url: string,
    options: {
      method: string;
      headers?: Record<string, string>;
      body?: string;
    }
  ): Promise<{
    status: number;
    statusText: string;
    ok: boolean;
    headers: {
      get: (name: string) => string | null;
    };
    text: () => Promise<string>;
  }> {
    const isNative = isNativeAppEnvironment();

    if (isNative) {
      try {
        const res = await CapacitorHttp.request({
          url,
          method: options.method,
          headers: options.headers || {},
          data: options.body,
          responseType: 'text',
        });

        const headerMap = new Map<string, string>();
        if (res.headers) {
          for (const [k, v] of Object.entries(res.headers)) {
            headerMap.set(k.toLowerCase(), String(v));
          }
        }

        const textData = typeof res.data === 'string' ? res.data : JSON.stringify(res.data ?? '');
        const ok = res.status >= 200 && res.status < 300;

        return {
          status: res.status,
          statusText: ok ? 'OK' : `HTTP ${res.status}`,
          ok,
          headers: {
            get: (name: string) => headerMap.get(name.toLowerCase()) || null,
          },
          text: async () => textData,
        };
      } catch (err: any) {
        throw new Error(`原生网络请求失败 (${options.method} ${url}): ${err?.message || '未知网络异常'}`);
      }
    } else {
      const fetchHeaders: HeadersInit = { ...(options.headers || {}) };
      const res = await fetch(url, {
        method: options.method,
        headers: fetchHeaders,
        body: options.body,
      });

      return {
        status: res.status,
        statusText: res.statusText,
        ok: res.ok,
        headers: {
          get: (name: string) => res.headers.get(name),
        },
        text: async () => await res.text(),
      };
    }
  }

  /**
   * 连通性测试 (发送 OPTIONS/HEAD 或 PROPFIND 请求验证鉴权与网络)
   */
  public async testConnection(): Promise<{
    success: boolean;
    message: string;
    latencyMs?: number;
    statusCode?: number;
    isCorsError?: boolean;
    suggestProxy?: boolean;
  }> {
    const startTime = Date.now();
    const isNative = isNativeAppEnvironment();

    try {
      const targetUrl = this.resolveUrl('/');
      let res;

      if (isNative) {
        // 在原生 App (Android / iOS) 环境中，底层 OkHttp 仅支持标准 HTTP 方法 [OPTIONS, GET, HEAD, POST, PUT, DELETE, TRACE, PATCH]
        // 优先使用 OPTIONS 测试 WebDAV 服务端连通性与 Basic Auth 鉴权
        res = await this.executeRequest(targetUrl, {
          method: 'OPTIONS',
          headers: this.getAuthHeaders(),
        });

        // 若部分 WebDAV 服务器对根路径的 OPTIONS 返回 404 或 405，退化使用 HEAD 测试
        if (res.status === 404 || res.status === 405) {
          res = await this.executeRequest(targetUrl, {
            method: 'HEAD',
            headers: this.getAuthHeaders(),
          });
        }
      } else {
        // 网页端优先发送 PROPFIND
        const headers: Record<string, string> = {
          ...this.getAuthHeaders(),
          Depth: '0',
        };

        res = await this.executeRequest(targetUrl, {
          method: 'PROPFIND',
          headers,
        });

        if (res.status === 405) {
          // 部分 WebDAV 服务器根路径不支持 PROPFIND，退化测试 OPTIONS
          res = await this.executeRequest(targetUrl, {
            method: 'OPTIONS',
            headers: this.getAuthHeaders(),
          });
        }
      }

      const responseText = await res.text();
      const latencyMs = Date.now() - startTime;

      // 检查是否返回了 HTML 页面（说明访问到了本地静态资源 index.html 或代理失效）
      if (this.isHtmlResponse(responseText)) {
        return {
          success: false,
          message: 'WebDAV 响应异常：服务端返回了 HTML 网页内容而非 WebDAV 协议响应。请检查 WebDAV 地址是否正确；若在手机 App 运行请务必关闭「CORS 跨域中继转发」。',
          latencyMs,
          statusCode: res.status,
        };
      }

      if (res.status === 207 || (res.status >= 200 && res.status < 300)) {
        return {
          success: true,
          message: `WebDAV 连接成功 (延迟 ${latencyMs}ms)`,
          latencyMs,
          statusCode: res.status,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          message: 'WebDAV 认证失败：用户名或应用专用密码错误 (401/403)',
          latencyMs,
          statusCode: res.status,
        };
      }

      return {
        success: false,
        message: `WebDAV 响应异常 (HTTP 状态码: ${res.status} ${res.statusText})`,
        latencyMs,
        statusCode: res.status,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - startTime;
      const isFailedToFetch = err?.message?.includes('Failed to fetch') || err?.name === 'TypeError';

      // 若当前未启用代理，且在网页端遇到了 Failed to fetch (典型的浏览器 CORS 拦截)，尝试探测内置 /api/webdav-proxy
      if (isFailedToFetch && !isNativeAppEnvironment() && !this.config.useCorsProxy && !this.config.corsProxyUrl) {
        try {
          const directUrl = this.resolveUrl('/', true);
          const proxyUrl = `/api/webdav-proxy?target=${encodeURIComponent(directUrl)}`;
          const proxyRes = await fetch(proxyUrl, {
            method: 'PROPFIND',
            headers: {
              ...this.getAuthHeaders(),
              Depth: '0',
            },
          });

          const proxyText = await proxyRes.text();
          if (!this.isHtmlResponse(proxyText) && (proxyRes.status === 207 || (proxyRes.status >= 200 && proxyRes.status < 300))) {
            return {
              success: true,
              message: `通过内置 CORS 跨域中继连接成功 (延迟 ${Date.now() - startTime}ms)`,
              latencyMs: Date.now() - startTime,
              statusCode: proxyRes.status,
              suggestProxy: true,
            };
          }

          if (proxyRes.status === 401 || proxyRes.status === 403) {
            return {
              success: false,
              message: 'WebDAV 认证失败：用户名或密码错误 (401/403)',
              latencyMs: Date.now() - startTime,
              statusCode: proxyRes.status,
            };
          }
        } catch {
          // 代理也无法连接时继续输出 CORS 诊断提示
        }
      }

      return {
        success: false,
        message: isFailedToFetch
          ? 'WebDAV 连接受阻：检测到浏览器同源策略 (CORS) 拦截。网页版请勾选「启用 CORS 跨域中继」，或直接使用 Android/iOS 手机客户端。'
          : `WebDAV 连接失败: ${err?.message || '网络连接异常'}`,
        latencyMs,
        isCorsError: isFailedToFetch,
        suggestProxy: isFailedToFetch && !isNativeAppEnvironment(),
      };
    }
  }

  /**
   * 查询远端快照文件的元数据 (HEAD / PROPFIND)
   */
  public async getRemoteMetadata(
    remotePath?: string
  ): Promise<RemoteSnapshotMetadata> {
    const path = remotePath || this.config.remotePath || '/ServerlessLedger/ledger-vault.enc.json';
    const targetUrl = this.resolveUrl(path);
    const isNative = isNativeAppEnvironment();

    try {
      let res;
      let isHead = false;

      if (isNative) {
        // 原生 App 端使用标准 HEAD 请求获取快照元数据 (避开 OkHttp 对 PROPFIND 的限制)
        res = await this.executeRequest(targetUrl, {
          method: 'HEAD',
          headers: this.getAuthHeaders(),
        });
        isHead = true;

        if (res.status === 405) {
          // 若不支持 HEAD，使用 GET 请求探测
          res = await this.executeRequest(targetUrl, {
            method: 'GET',
            headers: this.getAuthHeaders(),
          });
          isHead = false;
        }
      } else {
        const headers: Record<string, string> = {
          ...this.getAuthHeaders(),
          Depth: '0',
        };

        res = await this.executeRequest(targetUrl, {
          method: 'PROPFIND',
          headers,
        });

        if (res.status === 405) {
          res = await this.executeRequest(targetUrl, {
            method: 'HEAD',
            headers: this.getAuthHeaders(),
          });
          isHead = true;
        }
      }

      if (res.status === 404) {
        return {
          exists: false,
          remotePath: path,
        };
      }

      const text = isHead ? '' : await res.text();
      if (text && this.isHtmlResponse(text)) {
        throw new Error(
          'WebDAV 服务端返回了 HTML 网页而非有效快照元数据。若在手机 App 运行，请在设置中关闭「CORS 跨域中继转发」，并核对服务器地址。'
        );
      }

      if (!res.ok && res.status !== 207) {
        throw new Error(`WebDAV 响应异常 (HTTP ${res.status}: ${res.statusText})`);
      }

      // 从响应头解析 Last-Modified 与 ETag
      const lastModified = res.headers.get('last-modified');
      const etag = res.headers.get('etag');
      const contentLengthHeader = res.headers.get('content-length');
      const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : undefined;

      // 解析 XML Body 中的 getlastmodified 与 getcontentlength (若响应头未携带)
      let parsedLastModified = lastModified;
      let parsedContentLength = contentLength;
      let parsedETag = etag;

      try {
        if (text) {
          const lmMatch = text.match(/<(?:\w+:)?getlastmodified[^>]*>([^<]+)<\/(?:\w+:)?getlastmodified>/i);
          if (lmMatch && lmMatch[1]) {
            parsedLastModified = new Date(lmMatch[1]).toISOString();
          }

          const clMatch = text.match(/<(?:\w+:)?getcontentlength[^>]*>([^<]+)<\/(?:\w+:)?getcontentlength>/i);
          if (clMatch && clMatch[1]) {
            parsedContentLength = parseInt(clMatch[1], 10);
          }

          const etagMatch = text.match(/<(?:\w+:)?getetag[^>]*>([^<]+)<\/(?:\w+:)?getetag>/i);
          if (etagMatch && etagMatch[1]) {
            parsedETag = etagMatch[1];
          }
        }
      } catch {
        // XML 解析容错
      }

      return {
        exists: true,
        remotePath: path,
        lastModified: parsedLastModified ? new Date(parsedLastModified).toISOString() : null,
        etag: parsedETag || null,
        contentLength: parsedContentLength,
      };
    } catch (err: any) {
      if (err?.message?.includes('404')) {
        return { exists: false, remotePath: path };
      }
      throw err;
    }
  }

  /**
   * 自动确保远端父级目录存在 (递归发送 MKCOL)
   */
  public async ensureDirectoryExists(dirPath: string): Promise<boolean> {
    const cleanPath = dirPath.replace(/\/+$/, '').replace(/^\/+/, '');
    if (!cleanPath) return true;

    // 原生 App 端 (Capacitor/Android) 的 OkHttp 限制了自定义 MKCOL 请求，
    // 现代 WebDAV 服务端在客户端 PUT 文件时会自动建目录或允许 PUT 直写，原生端直接跳过 MKCOL
    const isNative = isNativeAppEnvironment();
    if (isNative) {
      return true;
    }

    const segments = cleanPath.split('/');
    let currentPath = '';

    for (const seg of segments) {
      currentPath += `/${seg}`;
      const folderUrl = this.resolveUrl(currentPath);

      try {
        // 尝试检测目录是否存在
        const checkRes = await this.executeRequest(folderUrl, {
          method: 'PROPFIND',
          headers: {
            ...this.getAuthHeaders(),
            Depth: '0',
          },
        });

        if (checkRes.status === 207 || (checkRes.status >= 200 && checkRes.status < 300)) {
          continue; // 目录已存在
        }

        if (checkRes.status === 404) {
          // 目录不存在，发起 MKCOL 创建
          const mkRes = await this.executeRequest(folderUrl, {
            method: 'MKCOL',
            headers: this.getAuthHeaders(),
          });
          if (mkRes.status !== 201 && mkRes.status !== 200 && mkRes.status !== 405) {
            console.warn(`[WebDAV] MKCOL ${currentPath} returned status ${mkRes.status}`);
          }
        }
      } catch (err) {
        console.warn(`[WebDAV] Error ensuring directory ${currentPath}:`, err);
      }
    }

    return true;
  }

  /**
   * 上传全量端到端加密快照至 WebDAV (PUT)
   */
  public async uploadSnapshot(
    encryptedPackage: EncryptedBackupPackage | string,
    remotePath?: string
  ): Promise<{ success: boolean; lastModified: string; etag?: string }> {
    const path = remotePath || this.config.remotePath || '/ServerlessLedger/ledger-vault.enc.json';

    // 1. 确保父级文件夹存在
    const lastSlashIdx = path.lastIndexOf('/');
    if (lastSlashIdx > 0) {
      const parentDir = path.slice(0, lastSlashIdx);
      await this.ensureDirectoryExists(parentDir);
    }

    // 2. 发起 PUT 上传
    const targetUrl = this.resolveUrl(path);
    const contentStr =
      typeof encryptedPackage === 'string'
        ? encryptedPackage
        : JSON.stringify(encryptedPackage, null, 2);

    const headers: Record<string, string> = {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json; charset=utf-8',
    };

    const res = await this.executeRequest(targetUrl, {
      method: 'PUT',
      headers,
      body: contentStr,
    });

    if (!res.ok && res.status !== 201 && res.status !== 204) {
      const errText = await res.text();
      if (this.isHtmlResponse(errText)) {
        throw new Error('WebDAV 快照上传失败：服务端返回了 HTML 页面。请检查 WebDAV 地址与路径是否正确。');
      }
      throw new Error(`WebDAV 快照上传失败 (HTTP ${res.status}: ${res.statusText})`);
    }

    const lastModified = res.headers.get('last-modified') || new Date().toISOString();
    const etag = res.headers.get('etag') || undefined;

    return {
      success: true,
      lastModified: new Date(lastModified).toISOString(),
      etag,
    };
  }

  /**
   * 从 WebDAV 下载全量端到端加密快照 (GET)
   */
  public async downloadSnapshot(
    remotePath?: string
  ): Promise<{
    success: boolean;
    data: EncryptedBackupPackage | string;
    lastModified?: string;
    etag?: string;
  }> {
    const path = remotePath || this.config.remotePath || '/ServerlessLedger/ledger-vault.enc.json';
    const targetUrl = this.resolveUrl(path);

    const headers: Record<string, string> = {
      ...this.getAuthHeaders(),
      Accept: 'application/json, text/plain, */*',
    };

    const res = await this.executeRequest(targetUrl, {
      method: 'GET',
      headers,
    });

    if (res.status === 404) {
      throw new Error(`远端 WebDAV 上未找到快照文件 [${path}]`);
    }

    if (!res.ok) {
      throw new Error(`WebDAV 快照下载失败 (HTTP ${res.status}: ${res.statusText})`);
    }

    const lastModified = res.headers.get('last-modified') || undefined;
    const etag = res.headers.get('etag') || undefined;
    const text = await res.text();

    if (this.isHtmlResponse(text)) {
      throw new Error(
        'WebDAV 服务端返回了 HTML 网页而非有效快照数据。若在手机 App 中运行，请在设置中关闭「CORS 跨域中继转发」，并核对 WebDAV 存储路径与服务器地址。'
      );
    }

    try {
      const parsed = JSON.parse(text);
      return {
        success: true,
        data: parsed,
        lastModified: lastModified ? new Date(lastModified).toISOString() : undefined,
        etag,
      };
    } catch {
      return {
        success: true,
        data: text,
        lastModified: lastModified ? new Date(lastModified).toISOString() : undefined,
        etag,
      };
    }
  }
}

/**
 * 获取 WebDavAdapter 单例或新实例
 */
export function getWebDavAdapter(config?: SyncConfig): WebDavAdapter {
  return new WebDavAdapter(config);
}

