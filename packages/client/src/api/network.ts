/**
 * 账盾 - 实时网络感知与智能弱网探测系统
 * 践行《白皮书 2.0 & 7.3 弱网/无网无缝切换》规范
 * 采用缓和、非阻塞的健康心跳策略；在云同步未配置/关闭时保持完全休眠 (Dormant)
 */

export type NetworkState = 'online' | 'weak' | 'offline' | 'syncing';

export interface NetworkInfo {
  state: NetworkState;
  isOnline: boolean;
  latencyMs: number | null;
  lastChecked: string;
  error?: string;
}

import { getApiBase, safeParseApiResponse } from './httpClient';
import { getSyncConfig, isCloudSyncEnabled } from '../sync/syncAdapter';

class NetworkMonitor {
  private currentState: NetworkInfo = {
    state: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online',
    isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    latencyMs: null,
    lastChecked: new Date().toISOString(),
  };

  private listeners: Set<(info: NetworkInfo) => void> = new Set();
  private checkTimer: any = null;
  private isChecking = false;
  private lastHealthCheckTime = 0;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleBrowserOnline);
      window.addEventListener('offline', this.handleBrowserOffline);
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      window.addEventListener('api:endpoint_changed', this.handleEndpointChanged);
      window.addEventListener('sync:config_changed', this.handleSyncConfigChanged);
    }
  }

  private handleSyncConfigChanged = () => {
    if (isCloudSyncEnabled()) {
      this.checkHealth();
      if (!this.checkTimer) {
        this.startHeartbeat(30000);
      }
    } else {
      this.stopHeartbeat();
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
      this.updateState({
        state: isOnline ? 'online' : 'offline',
        isOnline,
        latencyMs: null,
        error: undefined,
      });
    }
  };

  private handleEndpointChanged = () => {
    if (isCloudSyncEnabled()) {
      this.checkHealth();
    }
  };

  private handleBrowserOnline = () => {
    if (isCloudSyncEnabled()) {
      this.checkHealth();
    } else {
      this.updateState({
        state: 'online',
        isOnline: true,
        latencyMs: null,
        error: undefined,
      });
    }
  };

  private handleBrowserOffline = () => {
    this.updateState({
      state: 'offline',
      isOnline: false,
      latencyMs: null,
      error: '网络连接已中断',
    });
  };

  private handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && isCloudSyncEnabled()) {
      const now = Date.now();
      if (now - this.lastHealthCheckTime > 15000) {
        this.checkHealth();
      }
    }
  };

  /**
   * 执行一次网络连通探测
   * 若未启用云同步，则直接根据浏览器 online 状态返回，不发起后台网络调用
   */
  public async checkHealth(): Promise<NetworkInfo> {
    const isBrowserOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

    if (!isBrowserOnline) {
      this.updateState({
        state: 'offline',
        isOnline: false,
        latencyMs: null,
        error: '设备处于离线状态',
      });
      return this.currentState;
    }

    // 若云同步未配置或未开启 (provider === 'none')，保持休眠，不进行任何网络 ping
    if (!isCloudSyncEnabled()) {
      this.updateState({
        state: 'online',
        isOnline: true,
        latencyMs: null,
        error: undefined,
      });
      return this.currentState;
    }

    if (this.isChecking) return this.currentState;
    this.isChecking = true;
    this.lastHealthCheckTime = Date.now();

    const startTime = performance.now();
    try {
      const apiBase = getApiBase();
      const res = await fetch(`${apiBase}/health`, {
        signal: AbortSignal.timeout(3000),
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });

      const latency = Math.round(performance.now() - startTime);
      const parsed = await safeParseApiResponse<any>(res);

      if (res.ok && parsed.success) {
        const state: NetworkState = latency > 1200 ? 'weak' : 'online';
        this.updateState({
          state,
          isOnline: true,
          latencyMs: latency,
          error: undefined,
        });
      } else {
        this.updateState({
          state: 'weak',
          isOnline: true,
          latencyMs: latency,
          error: parsed.error || `服务端响应异常: ${res.status}`,
        });
      }
    } catch (err: any) {
      const latency = Math.round(performance.now() - startTime);
      const isTimeout = err?.name === 'TimeoutError' || err?.message?.includes('timeout');
      this.updateState({
        state: isTimeout ? 'weak' : 'offline',
        isOnline: isTimeout,
        latencyMs: isTimeout ? latency : null,
        error: err?.message || '网络连接不可用',
      });
    } finally {
      this.isChecking = false;
    }

    return this.currentState;
  }

  /**
   * 启动后台心跳探测 (仅在云同步启用时激活)
   */
  public start(intervalMs: number = 30000) {
    this.startHeartbeat(intervalMs);
  }

  public startHeartbeat(intervalMs: number = 30000) {
    if (!isCloudSyncEnabled()) {
      this.stopHeartbeat();
      return;
    }

    this.checkHealth();
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
    this.checkTimer = setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        if (isCloudSyncEnabled()) {
          this.checkHealth();
        } else {
          this.stopHeartbeat();
        }
      }
    }, intervalMs);
  }

  public stop() {
    this.stopHeartbeat();
  }

  public stopHeartbeat() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  public destroy() {
    this.stopHeartbeat();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleBrowserOnline);
      window.removeEventListener('offline', this.handleBrowserOffline);
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      window.removeEventListener('api:endpoint_changed', this.handleEndpointChanged);
      window.removeEventListener('sync:config_changed', this.handleSyncConfigChanged);
    }
    this.listeners.clear();
  }

  public setSyncing(isSyncing: boolean) {
    if (isSyncing) {
      this.updateState({ state: 'syncing' });
    } else {
      const targetState: NetworkState = !this.currentState.isOnline
        ? 'offline'
        : this.currentState.latencyMs && this.currentState.latencyMs > 1200
        ? 'weak'
        : 'online';
      this.updateState({ state: targetState });
    }
  }

  public getInfo(): NetworkInfo {
    return { ...this.currentState };
  }

  public subscribe(listener: (info: NetworkInfo) => void): () => void {
    this.listeners.add(listener);
    listener(this.getInfo());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private updateState(partial: Partial<NetworkInfo>) {
    const prevState = this.currentState.state;
    const prevOnline = this.currentState.isOnline;
    this.currentState = {
      ...this.currentState,
      ...partial,
      lastChecked: new Date().toISOString(),
    };

    const hasChanged =
      prevState !== this.currentState.state ||
      prevOnline !== this.currentState.isOnline ||
      partial.latencyMs !== undefined;
    if (hasChanged) {
      for (const listener of this.listeners) {
        try {
          listener(this.getInfo());
        } catch (e) {
          console.error('Error in network listener:', e);
        }
      }
    }
  }
}

export const networkMonitor = new NetworkMonitor();
