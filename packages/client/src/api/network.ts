/**
 * 账盾 - 实时网络感知与智能弱网探测系统
 * 践行《白皮书 2.0 & 7.3 弱网/无网无缝切换》规范
 * 采用缓和、非阻塞的健康心跳策略，避免高频轮询与网络拥塞
 */

export type NetworkState = 'online' | 'weak' | 'offline' | 'syncing';

export interface NetworkInfo {
  state: NetworkState;
  isOnline: boolean;
  latencyMs: number | null;
  lastChecked: string;
  error?: string;
}

const API_BASE = (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/$/, '') : '') + '/api';

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
    }
  }

  private handleBrowserOnline = () => {
    // 浏览器触发 online 事件时进行一次连通性与延迟探测
    this.checkHealth();
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
    // 页面切回前台时，且距离上次检测超过 15 秒才执行健康检查，避免频繁切换页面导致高频请求
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      if (now - this.lastHealthCheckTime > 15000) {
        this.checkHealth();
      }
    }
  };

  /**
   * 执行一次主动网络连通与往返延迟探测 (弱网判定)
   */
  public async checkHealth(): Promise<NetworkInfo> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      this.updateState({
        state: 'offline',
        isOnline: false,
        latencyMs: null,
        error: '设备处于离线状态',
      });
      return this.currentState;
    }

    if (this.isChecking) return this.currentState;
    this.isChecking = true;
    this.lastHealthCheckTime = Date.now();

    const startTime = performance.now();
    try {
      // 快速探测超时 (2500ms)
      const res = await fetch(`${API_BASE}/health`, {
        signal: AbortSignal.timeout(2500),
        cache: 'no-store',
      });

      const latency = Math.round(performance.now() - startTime);

      if (res.ok) {
        // 延迟大于 1200ms 判定为弱网环境，小于 1200ms 判定为良好在线
        const state: NetworkState = latency > 1200 ? 'weak' : 'online';
        this.updateState({
          state,
          isOnline: true,
          latencyMs: latency,
          error: undefined,
        });
      } else {
        // HTTP 状态非 200，判定为弱网或服务端异常
        this.updateState({
          state: 'weak',
          isOnline: true,
          latencyMs: latency,
          error: `服务端响应异常: ${res.status}`,
        });
      }
    } catch (err: any) {
      const latency = Math.round(performance.now() - startTime);
      // 若浏览器认为在线但 fetch 超时/失败，判定为弱网或离线
      const isTimeout = err?.name === 'TimeoutError' || err?.message?.includes('timeout');
      this.updateState({
        state: isTimeout ? 'weak' : 'offline',
        isOnline: isTimeout, // 超时说明可能在尝试连接弱网
        latencyMs: isTimeout ? latency : null,
        error: err?.message || '网络连接不可用',
      });
    } finally {
      this.isChecking = false;
    }

    return this.currentState;
  }

  /**
   * 启动后台周期性心跳探测 (默认 30 秒间隔，温和且平稳)
   */
  public start(intervalMs: number = 30000) {
    this.checkHealth();
    if (this.checkTimer) clearInterval(this.checkTimer);
    this.checkTimer = setInterval(() => {
      // 仅在页面处于前台时轮询心跳
      if (typeof document === 'undefined' || document.visibilityState === 'visible') {
        this.checkHealth();
      }
    }, intervalMs);
  }

  public stop() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * 设置外部同步状态 (开始同步/结束同步)
   * 结束同步时直接恢复对应网络状态，不触发额外网络请求，避免级联循环
   */
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

    const hasChanged = prevState !== this.currentState.state || prevOnline !== this.currentState.isOnline || partial.latencyMs !== undefined;
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
