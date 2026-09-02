/**
 * 账盾 - WebDAV 同步适配器 (WebDAV Sync Adapter)
 * 遵循《账盾 v3 架构设计》与 RFC 4918 WebDAV 协议规范
 * 内置对浏览器跨域 (CORS) 代理中继及原生端直连的支持
 */

import {
  ISyncAdapter,
  SyncConfig,
  SyncProviderType,
  RemoteSnapshotMetadata,
  EncryptedBackupPackage,
} from '@ledger/shared';
import { getSyncConfig } from './syncConfig';

export class WebDavAdapter implements ISyncAdapter {
  readonly provider: SyncProviderType = 'webdav';
  private config: SyncConfig;

  constructor(config?: SyncConfig) {
    this.config = config || getSyncConfig();
  }

  /**
   * 构造 Basic Auth 认证头
   */
  private getAuthHeaders(): HeadersInit {
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

    if (!forceDirect && (this.config.useCorsProxy || this.config.corsProxyUrl)) {
      const proxyBase = (this.config.corsProxyUrl || '/api/webdav-proxy').trim();
      return `${proxyBase}?target=${encodeURIComponent(directUrl)}`;
    }

    return directUrl;
  }

  /**
   * 连通性测试 (发送 PROPFIND 或 OPTIONS 请求验证鉴权与网络)
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
    try {
      const targetUrl = this.resolveUrl('/');
      const headers = {
        ...this.getAuthHeaders(),
        Depth: '0',
      };

      const res = await fetch(targetUrl, {
        method: 'PROPFIND',
        headers,
      });

      const latencyMs = Date.now() - startTime;

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

      if (res.status === 405) {
        // 部分 WebDAV 服务器根路径不支持 PROPFIND，退化测试 OPTIONS
        const optRes = await fetch(targetUrl, {
          method: 'OPTIONS',
          headers: this.getAuthHeaders(),
        });
        if (optRes.ok) {
          return {
            success: true,
            message: `WebDAV 连接成功 (OPTIONS 兼容模式，延迟 ${Date.now() - startTime}ms)`,
            latencyMs: Date.now() - startTime,
            statusCode: optRes.status,
          };
        }
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

      // 若当前未启用代理，且遇到了 Failed to fetch (典型的浏览器 CORS 拦截)，尝试探测内置 /api/webdav-proxy
      if (isFailedToFetch && !this.config.useCorsProxy && !this.config.corsProxyUrl) {
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

          if (proxyRes.status === 207 || (proxyRes.status >= 200 && proxyRes.status < 300)) {
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
          ? 'WebDAV 连接受阻：检测到浏览器同源策略 (CORS) 拦截。请勾选下方「启用 CORS 跨域中继」或在桌面/手机端原生运行。'
          : `WebDAV 连接失败: ${err?.message || '网络连接异常'}`,
        latencyMs,
        isCorsError: isFailedToFetch,
        suggestProxy: isFailedToFetch,
      };
    }
  }

  /**
   * 查询远端快照文件的元数据 (PROPFIND)
   */
  public async getRemoteMetadata(
    remotePath?: string
  ): Promise<RemoteSnapshotMetadata> {
    const path = remotePath || this.config.remotePath || '/ServerlessLedger/ledger-vault.enc.json';
    const targetUrl = this.resolveUrl(path);

    try {
      const headers = {
        ...this.getAuthHeaders(),
        Depth: '0',
      };

      const res = await fetch(targetUrl, {
        method: 'PROPFIND',
        headers,
      });

      if (res.status === 404) {
        return {
          exists: false,
          remotePath: path,
        };
      }

      if (!res.ok && res.status !== 207) {
        throw new Error(`PROPFIND 响应异常 (HTTP ${res.status})`);
      }

      // 从响应头解析 Last-Modified 与 ETag
      const lastModified = res.headers.get('last-modified') || res.headers.get('Last-Modified');
      const etag = res.headers.get('etag') || res.headers.get('ETag');
      const contentLengthHeader = res.headers.get('content-length');
      const contentLength = contentLengthHeader ? parseInt(contentLengthHeader, 10) : undefined;

      // 解析 XML Body 中的 getlastmodified 与 getcontentlength (若响应头未携带)
      let parsedLastModified = lastModified;
      let parsedContentLength = contentLength;
      let parsedETag = etag;

      try {
        const text = await res.text();
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

    const segments = cleanPath.split('/');
    let currentPath = '';

    for (const seg of segments) {
      currentPath += `/${seg}`;
      const folderUrl = this.resolveUrl(currentPath);

      try {
        // 尝试检测目录是否存在
        const checkRes = await fetch(folderUrl, {
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
          const mkRes = await fetch(folderUrl, {
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

    const headers: HeadersInit = {
      ...this.getAuthHeaders(),
      'Content-Type': 'application/json; charset=utf-8',
    };

    const res = await fetch(targetUrl, {
      method: 'PUT',
      headers,
      body: contentStr,
    });

    if (!res.ok && res.status !== 201 && res.status !== 204) {
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

    const headers: HeadersInit = {
      ...this.getAuthHeaders(),
      Accept: 'application/json, text/plain, */*',
    };

    const res = await fetch(targetUrl, {
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
