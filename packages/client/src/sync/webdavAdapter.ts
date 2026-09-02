/**
 * 账盾 - WebDAV 同步适配器 (WebDAV Sync Adapter)
 * 遵循《账盾 v3 架构设计》与 RFC 4918 WebDAV 协议规范
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
   * 构建目标文件的完整 WebDAV URL
   */
  public resolveUrl(path: string): string {
    let baseUrl = (this.config.webdavUrl || '').trim();
    if (!baseUrl) {
      throw new Error('未配置 WebDAV 服务器地址');
    }
    // 去除末尾斜杠
    baseUrl = baseUrl.replace(/\/+$/, '');

    // 确保 path 以 / 开头
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${baseUrl}${normalizedPath}`;
  }

  /**
   * 连通性测试 (发送 PROPFIND 或 HEAD 请求验证鉴权与网络)
   */
  public async testConnection(): Promise<{
    success: boolean;
    message: string;
    latencyMs?: number;
    statusCode?: number;
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
          message: `连接成功 (延迟 ${latencyMs}ms)`,
          latencyMs,
          statusCode: res.status,
        };
      }

      if (res.status === 401 || res.status === 403) {
        return {
          success: false,
          message: 'WebDAV 认证失败：用户名或密码/应用密码错误 (401/403)',
          latencyMs,
          statusCode: res.status,
        };
      }

      if (res.status === 405) {
        // 部分服务器不支持根路径 PROPFIND，退化测试 OPTIONS 或 GET
        const optRes = await fetch(targetUrl, {
          method: 'OPTIONS',
          headers: this.getAuthHeaders(),
        });
        if (optRes.ok) {
          return {
            success: true,
            message: `连接成功 (OPTIONS 兼容模式，延迟 ${Date.now() - startTime}ms)`,
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
      return {
        success: false,
        message: `WebDAV 连接失败: ${err?.message || '网络连接异常或跨域受限(CORS)'}`,
        latencyMs,
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

      if (res.status === 207 || (res.status >= 200 && res.status < 300)) {
        const lastModified = res.headers.get('Last-Modified') || null;
        const etag = res.headers.get('ETag') || null;
        const contentLength = parseInt(res.headers.get('Content-Length') || '0', 10);

        return {
          exists: true,
          remotePath: path,
          lastModified,
          etag,
          contentLength: isNaN(contentLength) ? undefined : contentLength,
        };
      }

      // 如果 PROPFIND 被禁用，尝试 HEAD 请求
      const headRes = await fetch(targetUrl, {
        method: 'HEAD',
        headers: this.getAuthHeaders(),
      });

      if (headRes.ok) {
        return {
          exists: true,
          remotePath: path,
          lastModified: headRes.headers.get('Last-Modified') || null,
          etag: headRes.headers.get('ETag') || null,
        };
      }

      if (headRes.status === 404) {
        return { exists: false, remotePath: path };
      }

      return {
        exists: false,
        remotePath: path,
      };
    } catch (err) {
      return {
        exists: false,
        remotePath: path,
      };
    }
  }

  /**
   * 递归确保 WebDAV 目标目录存在 (MKCOL)
   */
  private async ensureParentDirectory(filePath: string): Promise<void> {
    const segments = filePath.split('/').filter(Boolean);
    if (segments.length <= 1) {
      return; // 在根目录下，无需创建父目录
    }

    segments.pop(); // 去除文件名，保留目录分段
    let currentPath = '';

    for (const segment of segments) {
      currentPath += `/${segment}`;
      const dirUrl = this.resolveUrl(currentPath);

      try {
        const checkRes = await fetch(dirUrl, {
          method: 'PROPFIND',
          headers: {
            ...this.getAuthHeaders(),
            Depth: '0',
          },
        });

        if (checkRes.status === 404) {
          // 目录不存在，执行 MKCOL 创建
          const mkRes = await fetch(dirUrl, {
            method: 'MKCOL',
            headers: this.getAuthHeaders(),
          });
          if (!mkRes.ok && mkRes.status !== 405 && mkRes.status !== 409) {
            console.warn(`[WebDAV] MKCOL ${currentPath} status: ${mkRes.status}`);
          }
        }
      } catch (e) {
        // 忽略检查异常，尝试继续上传
      }
    }
  }

  /**
   * 上传加密快照数据至 WebDAV (PUT)
   */
  public async uploadSnapshot(
    encryptedPackage: EncryptedBackupPackage | string,
    remotePath?: string
  ): Promise<{ success: boolean; lastModified: string; etag?: string }> {
    const path = remotePath || this.config.remotePath || '/ServerlessLedger/ledger-vault.enc.json';
    await this.ensureParentDirectory(path);

    const targetUrl = this.resolveUrl(path);
    const bodyContent =
      typeof encryptedPackage === 'string'
        ? encryptedPackage
        : JSON.stringify(encryptedPackage, null, 2);

    const headers: Record<string, string> = {
      ...(this.getAuthHeaders() as Record<string, string>),
      'Content-Type': 'application/json; charset=utf-8',
    };

    const res = await fetch(targetUrl, {
      method: 'PUT',
      headers,
      body: bodyContent,
    });

    if (!res.ok) {
      // 若因目录不存在导致 404/409，再次尝试创建目录并重试
      if (res.status === 404 || res.status === 409) {
        await this.ensureParentDirectory(path);
        const retryRes = await fetch(targetUrl, {
          method: 'PUT',
          headers,
          body: bodyContent,
        });
        if (!retryRes.ok) {
          throw new Error(`WebDAV 上传快照失败 (HTTP ${retryRes.status}: ${retryRes.statusText})`);
        }
        const lastMod = retryRes.headers.get('Last-Modified') || new Date().toISOString();
        const etag = retryRes.headers.get('ETag') || undefined;
        return { success: true, lastModified: lastMod, etag };
      }

      throw new Error(`WebDAV 上传快照失败 (HTTP ${res.status}: ${res.statusText})`);
    }

    const lastModified = res.headers.get('Last-Modified') || new Date().toISOString();
    const etag = res.headers.get('ETag') || undefined;

    return {
      success: true,
      lastModified,
      etag,
    };
  }

  /**
   * 从 WebDAV 下载加密快照数据 (GET)
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

    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: this.getAuthHeaders(),
    });

    if (!res.ok) {
      if (res.status === 404) {
        throw new Error('远端 WebDAV 服务器上未找到加密快照文件');
      }
      throw new Error(`WebDAV 下载快照失败 (HTTP ${res.status}: ${res.statusText})`);
    }

    const lastModified = res.headers.get('Last-Modified') || undefined;
    const etag = res.headers.get('ETag') || undefined;
    const textData = await res.text();

    try {
      const parsed = JSON.parse(textData);
      return {
        success: true,
        data: parsed as EncryptedBackupPackage,
        lastModified,
        etag,
      };
    } catch {
      return {
        success: true,
        data: textData,
        lastModified,
        etag,
      };
    }
  }
}

/**
 * 获取当前全局生效的 WebDAV 适配器实例
 */
export function getWebDavAdapter(config?: SyncConfig): WebDavAdapter {
  return new WebDavAdapter(config);
}
